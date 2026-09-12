import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json({ limit: '15mb' }));

// File persistence paths
const DATA_DIR = path.join(process.cwd(), 'data');
const VAULT_FILE = path.join(DATA_DIR, 'nexus_vault.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface StoredUser {
  userId: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string;
  status: 'online' | 'offline' | 'idle';
  passwordHash?: string;
  pinHash?: string;
  phraseHash?: string;
  salt?: string;
  pinLength?: number;
  devices: Array<{
    deviceId: string;
    deviceName: string;
    deviceType: 'desktop' | 'mobile' | 'web';
    devicePublicKeyHex: string;
    isCurrent: boolean;
    status: 'active' | 'revoked';
    lastSeen: number;
    signedPreKeyHex?: string;
  }>;
  preKeyBundle?: {
    userId: string;
    deviceId: string;
    identityPublicKeyHex: string;
    signedPreKeyHex: string;
    signedPreKeySignature: string;
    oneTimePreKeyHex?: string;
  };
  createdAt: number;
}

export interface StoredGroupMember {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  deviceId: string;
  role: 'creator' | 'admin' | 'member';
  joinedAt: number;
}

export interface StoredGroupJoinRequest {
  requestId: string;
  groupId: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  deviceId: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface StoredGroup {
  groupId: string;
  name: string;
  description: string;
  avatar: string;
  creatorId: string;
  creatorName: string;
  requiresApproval: boolean;
  members: StoredGroupMember[];
  pendingRequests: StoredGroupJoinRequest[];
  createdAt: number;
  groupKeyFingerprint: string;
  lastMessage?: string;
  lastMessageTimestamp?: number;
}

interface VaultData {
  users: Record<string, StoredUser>;
  groups: Record<string, StoredGroup>;
  groupMessages: Record<string, any[]>;
  pendingEnvelopes: Record<string, any[]>;
}

// In-Memory Database with atomic persistence
let vault: VaultData = {
  users: {},
  groups: {},
  groupMessages: {},
  pendingEnvelopes: {},
};

// Load existing vault data
try {
  if (fs.existsSync(VAULT_FILE)) {
    const raw = fs.readFileSync(VAULT_FILE, 'utf-8');
    vault = JSON.parse(raw);
    console.log(`[NEXUS Server] Loaded ${Object.keys(vault.users).length} registered users and ${Object.keys(vault.groups).length} groups from vault.`);
  }
} catch (e) {
  console.warn('[NEXUS Server] Initializing fresh vault storage:', e);
}

// Debounced vault saving
let saveTimeout: NodeJS.Timeout | null = null;
function persistVault() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), 'utf-8');
    } catch (err) {
      console.error('[NEXUS Server] Error saving vault:', err);
    }
  }, 300);
}

// Active WebSocket connections mapped by deviceId
const activeDeviceSockets = new Map<string, Set<WebSocket>>();
// Active WebSocket connections mapped by userId
const activeUserSockets = new Map<string, Set<WebSocket>>();
// All connected clients for broadcast
const allClients = new Set<WebSocket>();

// Wiretap logs (server sees zero-knowledge metadata only)
const wiretapLogs: any[] = [];

function broadcast(event: { type: string; [key: string]: any }) {
  const payload = JSON.stringify(event);
  allClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

function sendToDevice(deviceId: string, event: { type: string; [key: string]: any }): boolean {
  const sockets = activeDeviceSockets.get(deviceId);
  if (!sockets || sockets.size === 0) return false;
  const payload = JSON.stringify(event);
  let sent = false;
  sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      sent = true;
    }
  });
  return sent;
}

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    usersCount: Object.keys(vault.users).length,
    groupsCount: Object.keys(vault.groups).length,
    activeSocketsCount: allClients.size,
  });
});

// Check if email or username is already taken across ALL devices
app.get('/api/check-email', (req, res) => {
  const queryEmail = String(req.query.email || '').trim().toLowerCase();
  if (!queryEmail) {
    return res.status(400).json({ error: 'Email parameter required' });
  }

  const userList = Object.values(vault.users);
  const exists = userList.some((u) => u.email.toLowerCase() === queryEmail);
  return res.json({ exists });
});

// Check username availability
app.get('/api/check-username', (req, res) => {
  const queryUsername = String(req.query.username || '').trim().toLowerCase();
  if (!queryUsername) {
    return res.status(400).json({ error: 'Username parameter required' });
  }

  const userList = Object.values(vault.users);
  const exists = userList.some((u) => u.username.toLowerCase() === queryUsername);
  return res.json({ exists });
});

// Register Account Across Devices
app.post('/api/register', (req, res) => {
  const {
    firstName,
    lastName,
    fullName,
    email,
    password,
    pin,
    pinLength,
    phrase,
    deviceId,
    deviceName,
    deviceType,
    preKeyBundle,
  } = req.body;

  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing required account fields' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingWithEmail = Object.values(vault.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  if (existingWithEmail) {
    return res.status(409).json({
      error: 'An account with this email address already exists on the network. Please choose a different email.',
    });
  }

  // Generate unique username based on first and second name
  let baseUsername = `${firstName}_${lastName}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!baseUsername) baseUsername = 'user';
  let candidateUsername = baseUsername;
  let counter = 1;
  while (Object.values(vault.users).some((u) => u.username === candidateUsername)) {
    candidateUsername = `${baseUsername}${counter++}`;
  }

  const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const defaultAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(userId)}`;

  const userRecord: StoredUser = {
    userId,
    email: normalizedEmail,
    username: candidateUsername,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    fullName: (fullName || `${firstName.trim()} ${lastName.trim()}`).trim(),
    avatarUrl: defaultAvatar,
    status: 'online',
    passwordHash: password, // client has derived or server stores auth token
    pinHash: pin,
    phraseHash: phrase,
    pinLength: pinLength || 4,
    createdAt: Date.now(),
    devices: [
      {
        deviceId: deviceId || `dev_${Date.now()}`,
        deviceName: deviceName || 'Web Client',
        deviceType: deviceType || 'web',
        devicePublicKeyHex: preKeyBundle?.identityPublicKeyHex || '',
        isCurrent: true,
        status: 'active',
        lastSeen: Date.now(),
        signedPreKeyHex: preKeyBundle?.signedPreKeyHex || '',
      },
    ],
    preKeyBundle: preKeyBundle || undefined,
  };

  vault.users[userId] = userRecord;
  persistVault();

  // Notify all connected devices of the newly registered user
  broadcast({
    type: 'user:registered',
    user: sanitizeUser(userRecord),
  });

  // Peer Discovery broadcast to all nodes immediately
  broadcast({
    type: 'peer:discovery_announce',
    handshakeId: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    senderDeviceId: deviceId || `dev_${userId}`,
    senderUserId: userId,
    directoryMetadata: sanitizeUser(userRecord),
    publicPreKeyBundle: userRecord.preKeyBundle || {
      userId,
      deviceId: deviceId || `dev_${userId}`,
      identityPublicKeyHex: userRecord.devices[0]?.devicePublicKeyHex || userId,
      signedPreKeyHex: userRecord.devices[0]?.signedPreKeyHex || '',
      signedPreKeySignature: '',
    },
    timestamp: Date.now(),
  });

  return res.json({
    success: true,
    user: sanitizeUser(userRecord),
    account: {
      id: userRecord.userId,
      firstName: userRecord.firstName,
      lastName: userRecord.lastName,
      fullName: userRecord.fullName,
      email: userRecord.email,
      avatarUrl: userRecord.avatarUrl,
      pinLength: userRecord.pinLength,
      devicesCount: userRecord.devices.length,
      createdAt: userRecord.createdAt,
      lastActive: Date.now(),
    },
  });
});

// Login Account
app.post('/api/login', (req, res) => {
  const { email, password, deviceId, deviceName, deviceType, preKeyBundle } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = Object.values(vault.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  if (!user) {
    return res.status(404).json({ error: 'No account found with this email on the network.' });
  }

  if (password && user.passwordHash && user.passwordHash !== password) {
    return res.status(401).json({ error: 'Invalid master password.' });
  }

  // Register or update active device
  const currentDeviceId = deviceId || `dev_${Date.now()}`;
  let device = user.devices.find((d) => d.deviceId === currentDeviceId);
  if (!device) {
    device = {
      deviceId: currentDeviceId,
      deviceName: deviceName || 'Web Client',
      deviceType: deviceType || 'web',
      devicePublicKeyHex: preKeyBundle?.identityPublicKeyHex || '',
      isCurrent: true,
      status: 'active',
      lastSeen: Date.now(),
      signedPreKeyHex: preKeyBundle?.signedPreKeyHex || '',
    };
    user.devices.push(device);
  } else {
    device.lastSeen = Date.now();
    if (preKeyBundle?.signedPreKeyHex) {
      device.signedPreKeyHex = preKeyBundle.signedPreKeyHex;
    }
  }

  if (preKeyBundle) {
    user.preKeyBundle = preKeyBundle;
  }

  user.status = 'online';
  persistVault();

  broadcast({
    type: 'user:status_changed',
    userId: user.userId,
    status: 'online',
  });

  return res.json({
    success: true,
    user: sanitizeUser(user),
    account: {
      id: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      pinLength: user.pinLength,
      devicesCount: user.devices.length,
      createdAt: user.createdAt,
      lastActive: Date.now(),
    },
  });
});

// Get all registered users (Directory)
app.get('/api/users', (req, res) => {
  const users = Object.values(vault.users).map(sanitizeUser);
  return res.json({ users });
});

// Search Users
app.get('/api/users/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const all = Object.values(vault.users).map(sanitizeUser);
  if (!q) return res.json({ users: all });

  const filtered = all.filter(
    (u) =>
      u.fullName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
  );
  return res.json({ users: filtered });
});

// Update Profile
app.post('/api/users/update-profile', (req, res) => {
  const { userId, fullName, avatarUrl, status } = req.body;
  const user = vault.users[userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (fullName) user.fullName = fullName.trim();
  if (avatarUrl) user.avatarUrl = avatarUrl;
  if (status) user.status = status;

  persistVault();

  broadcast({
    type: 'user:profile_updated',
    user: sanitizeUser(user),
  });

  return res.json({ success: true, user: sanitizeUser(user) });
});

// ActiveDirectoryState Snapshot Endpoint
app.get('/api/directory-state', (req, res) => {
  const peers = Object.values(vault.users).map((u) => {
    const sanitized = sanitizeUser(u);
    const bundle = u.preKeyBundle || {
      userId: u.userId,
      deviceId: u.devices[0]?.deviceId || `dev_${u.userId}`,
      identityPublicKeyHex: u.devices[0]?.devicePublicKeyHex || u.userId,
      signedPreKeyHex: u.devices[0]?.signedPreKeyHex || '',
      signedPreKeySignature: '',
    };
    return {
      metadata: sanitized,
      preKeyBundle: bundle,
      deviceId: u.devices[0]?.deviceId || `dev_${u.userId}`,
      status: u.status || 'online',
    };
  });

  return res.json({
    type: 'ActiveDirectoryState',
    timestamp: Date.now(),
    peers,
    activeDeviceCount: peers.length,
  });
});

// PreKey Bundle Management for X3DH
app.post('/api/prekeys', (req, res) => {
  const { preKeyBundle } = req.body;
  if (!preKeyBundle || !preKeyBundle.deviceId || !preKeyBundle.userId) {
    return res.status(400).json({ error: 'Invalid prekey bundle' });
  }

  const user = vault.users[preKeyBundle.userId];
  if (user) {
    user.preKeyBundle = preKeyBundle;
    persistVault();
  }

  return res.json({ success: true });
});

app.get('/api/prekeys/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  for (const user of Object.values(vault.users)) {
    if (user.preKeyBundle?.deviceId === deviceId) {
      return res.json({ preKeyBundle: user.preKeyBundle });
    }
    const dev = user.devices.find((d) => d.deviceId === deviceId);
    if (dev) {
      return res.json({
        preKeyBundle: {
          userId: user.userId,
          deviceId: dev.deviceId,
          identityPublicKeyHex: dev.devicePublicKeyHex,
          signedPreKeyHex: dev.signedPreKeyHex,
          signedPreKeySignature: '',
        },
      });
    }
  }

  return res.status(404).json({ error: 'PreKey bundle not found for device' });
});

// Group Management
app.get('/api/groups', (req, res) => {
  const groups = Object.values(vault.groups);
  return res.json({ groups });
});

app.post('/api/groups', (req, res) => {
  const { name, description, avatar, creatorId, creatorName, requiresApproval, creatorDeviceId } = req.body;
  if (!name || !creatorId) {
    return res.status(400).json({ error: 'Name and creatorId required' });
  }

  const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const creatorUser = vault.users[creatorId];

  const group: StoredGroup = {
    groupId,
    name: name.trim(),
    description: (description || '').trim(),
    avatar: avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(groupId)}`,
    creatorId,
    creatorName: creatorName || creatorUser?.fullName || 'Network Peer',
    requiresApproval: Boolean(requiresApproval),
    createdAt: Date.now(),
    groupKeyFingerprint: `GK-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    members: [
      {
        userId: creatorId,
        username: creatorUser?.username || 'peer',
        displayName: creatorUser?.fullName || 'Group Creator',
        avatar: creatorUser?.avatarUrl || '',
        deviceId: creatorDeviceId || `dev_${creatorId}`,
        role: 'creator',
        joinedAt: Date.now(),
      },
    ],
    pendingRequests: [],
  };

  vault.groups[groupId] = group;
  vault.groupMessages[groupId] = [];
  persistVault();

  broadcast({ type: 'group:created', group });
  return res.json({ success: true, group });
});

app.post('/api/groups/join', (req, res) => {
  const { groupId, userId, deviceId } = req.body;
  const group = vault.groups[groupId];
  const user = vault.users[userId];
  if (!group || !user) {
    return res.status(404).json({ error: 'Group or user not found' });
  }

  // If already member
  if (group.members.some((m) => m.userId === userId)) {
    return res.json({ success: true, group, status: 'already_member' });
  }

  if (group.requiresApproval) {
    // Add to pending
    const existingReq = group.pendingRequests.find((r) => r.userId === userId);
    if (!existingReq) {
      group.pendingRequests.push({
        requestId: `req_${Date.now()}`,
        groupId,
        userId,
        username: user.username,
        displayName: user.fullName,
        avatar: user.avatarUrl,
        deviceId: deviceId || `dev_${userId}`,
        requestedAt: Date.now(),
        status: 'pending',
      });
      persistVault();
      broadcast({ type: 'group:updated', group });
    }
    return res.json({ success: true, group, status: 'pending_approval' });
  } else {
    // Direct join
    group.members.push({
      userId,
      username: user.username,
      displayName: user.fullName,
      avatar: user.avatarUrl,
      deviceId: deviceId || `dev_${userId}`,
      role: 'member',
      joinedAt: Date.now(),
    });
    persistVault();
    broadcast({ type: 'group:updated', group });
    return res.json({ success: true, group, status: 'joined' });
  }
});

app.post('/api/groups/approve', (req, res) => {
  const { groupId, requestId, creatorId } = req.body;
  const group = vault.groups[groupId];
  if (!group || group.creatorId !== creatorId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const reqIndex = group.pendingRequests.findIndex((r) => r.requestId === requestId);
  if (reqIndex === -1) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const joinReq = group.pendingRequests[reqIndex];
  group.pendingRequests.splice(reqIndex, 1);

  group.members.push({
    userId: joinReq.userId,
    username: joinReq.username,
    displayName: joinReq.displayName,
    avatar: joinReq.avatar,
    deviceId: joinReq.deviceId,
    role: 'member',
    joinedAt: Date.now(),
  });

  persistVault();
  broadcast({ type: 'group:updated', group });
  return res.json({ success: true, group });
});

// Group Messages
app.get('/api/groups/:groupId/messages', (req, res) => {
  const { groupId } = req.params;
  const messages = vault.groupMessages[groupId] || [];
  return res.json({ messages });
});

app.post('/api/groups/message', (req, res) => {
  const { message } = req.body;
  if (!message || !message.groupId) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  if (!vault.groupMessages[message.groupId]) {
    vault.groupMessages[message.groupId] = [];
  }

  vault.groupMessages[message.groupId].push(message);
  const group = vault.groups[message.groupId];
  if (group) {
    group.lastMessage = message.content;
    group.lastMessageTimestamp = message.timestamp;
  }

  persistVault();
  broadcast({ type: 'group:message', message });
  return res.json({ success: true, message });
});

// Wiretap audit logs
app.get('/api/wiretap', (req, res) => {
  res.json({ logs: wiretapLogs.slice(-100) });
});

function sanitizeUser(u: StoredUser) {
  return {
    userId: u.userId,
    username: u.username,
    displayName: u.fullName,
    fullName: u.fullName,
    email: u.email,
    avatar: u.avatarUrl,
    avatarUrl: u.avatarUrl,
    status: u.status,
    role: 'Zero-Knowledge Network Peer',
    primaryDeviceId: u.devices[0]?.deviceId || '',
    fingerprint: u.devices[0]?.devicePublicKeyHex?.slice(0, 16) || u.userId,
    devices: u.devices,
    createdAt: u.createdAt,
    isRegisteredUser: true,
  };
}

// WebSocket Event Handling
wss.on('connection', (ws: WebSocket) => {
  allClients.add(ws);
  let currentDeviceId: string | null = null;
  let currentUserId: string | null = null;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      switch (data.type) {
        case 'identify': {
          currentDeviceId = data.deviceId;
          currentUserId = data.userId;

          if (currentDeviceId) {
            if (!activeDeviceSockets.has(currentDeviceId)) {
              activeDeviceSockets.set(currentDeviceId, new Set());
            }
            activeDeviceSockets.get(currentDeviceId)!.add(ws);

            // Deliver any pending zero-knowledge envelopes buffered while this device was offline
            const pending = vault.pendingEnvelopes[currentDeviceId] || [];
            if (pending.length > 0) {
              pending.forEach((env) => {
                ws.send(JSON.stringify({ type: 'new_envelope', envelope: env }));
              });
            }
          }

          if (currentUserId) {
            if (!activeUserSockets.has(currentUserId)) {
              activeUserSockets.set(currentUserId, new Set());
            }
            activeUserSockets.get(currentUserId)!.add(ws);

            if (vault.users[currentUserId]) {
              vault.users[currentUserId].status = 'online';
              broadcast({
                type: 'user:status_changed',
                userId: currentUserId,
                status: 'online',
              });
            }
          }

          ws.send(JSON.stringify({ type: 'identified', success: true }));
          break;
        }

        case 'send_envelope': {
          const { envelope } = data;
          if (!envelope || !envelope.recipientDeviceId) return;

          // Record wiretap entry (metadata only, zero-knowledge: no plaintext available)
          const wiretapEntry = {
            id: `wt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            direction: 'RELAY',
            envelopeId: envelope.envelopeId,
            senderDeviceTruncated: envelope.senderDeviceId?.slice(0, 14) || 'unknown',
            recipientDeviceTruncated: envelope.recipientDeviceId?.slice(0, 14) || 'unknown',
            rawCiphertextHexPreview: envelope.ciphertextHex ? envelope.ciphertextHex.slice(0, 24) + '...' : '',
            cid: envelope.cid,
            plaintextLeaked: false,
            sizeBytes: envelope.payloadSize || (envelope.ciphertextHex ? envelope.ciphertextHex.length / 2 : 0),
          };
          wiretapLogs.push(wiretapEntry);
          if (wiretapLogs.length > 200) wiretapLogs.shift();
          broadcast({ type: 'wiretap_entry', entry: wiretapEntry });

          // Forward to recipient device if online
          const delivered = sendToDevice(envelope.recipientDeviceId, {
            type: 'new_envelope',
            envelope,
          });

          // Buffer in pending store-and-forward queue
          if (!vault.pendingEnvelopes[envelope.recipientDeviceId]) {
            vault.pendingEnvelopes[envelope.recipientDeviceId] = [];
          }

          if (!delivered) {
            vault.pendingEnvelopes[envelope.recipientDeviceId].push(envelope);
            persistVault();
          }

          // Acknowledge back to sender
          ws.send(
            JSON.stringify({
              type: 'envelope_relayed',
              envelopeId: envelope.envelopeId,
              delivered,
            })
          );
          break;
        }

        case 'ack_envelope': {
          const { envelopeId, deviceId } = data;
          if (deviceId && vault.pendingEnvelopes[deviceId]) {
            vault.pendingEnvelopes[deviceId] = vault.pendingEnvelopes[deviceId].filter(
              (env) => env.envelopeId !== envelopeId
            );
            persistVault();
          }
          break;
        }

        case 'peer:discovery_request': {
          const { senderDeviceId, senderUserId, directoryMetadata, publicPreKeyBundle, handshakeId } = data;

          // Update vault record for sender if present
          if (senderUserId && vault.users[senderUserId]) {
            const user = vault.users[senderUserId];
            user.status = 'online';
            if (publicPreKeyBundle) {
              user.preKeyBundle = publicPreKeyBundle;
            }
            if (directoryMetadata?.displayName) {
              user.fullName = directoryMetadata.displayName;
            }
            if (directoryMetadata?.avatar) {
              user.avatarUrl = directoryMetadata.avatar;
            }
            persistVault();
          }

          // Broadcast discovery request to all other connected active nodes in real-time
          const broadcastPayload = JSON.stringify(data);
          allClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(broadcastPayload);
            }
          });

          // Immediate response to requester with all currently known active nodes and public keys
          const knownPeers = Object.values(vault.users).map((u) => {
            const sanitized = sanitizeUser(u);
            const bundle = u.preKeyBundle || {
              userId: u.userId,
              deviceId: u.devices[0]?.deviceId || `dev_${u.userId}`,
              identityPublicKeyHex: u.devices[0]?.devicePublicKeyHex || u.userId,
              signedPreKeyHex: u.devices[0]?.signedPreKeyHex || '',
              signedPreKeySignature: '',
            };
            return {
              metadata: sanitized,
              preKeyBundle: bundle,
            };
          });

          ws.send(
            JSON.stringify({
              type: 'peer:discovery_initial_sync',
              handshakeId,
              peers: knownPeers,
              timestamp: Date.now(),
            })
          );
          break;
        }

        case 'peer:discovery_response': {
          const { targetDeviceId } = data;
          if (targetDeviceId) {
            const delivered = sendToDevice(targetDeviceId, data);
            if (!delivered) {
              const payload = JSON.stringify(data);
              allClients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(payload);
                }
              });
            }
          } else {
            const payload = JSON.stringify(data);
            allClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(payload);
              }
            });
          }
          break;
        }

        case 'get_active_directory_state':
        case 'poll:active_directory_state': {
          const peers = Object.values(vault.users).map((u) => {
            const sanitized = sanitizeUser(u);
            const bundle = u.preKeyBundle || {
              userId: u.userId,
              deviceId: u.devices[0]?.deviceId || `dev_${u.userId}`,
              identityPublicKeyHex: u.devices[0]?.devicePublicKeyHex || u.userId,
              signedPreKeyHex: u.devices[0]?.signedPreKeyHex || '',
              signedPreKeySignature: '',
            };
            return {
              metadata: sanitized,
              preKeyBundle: bundle,
              deviceId: u.devices[0]?.deviceId || `dev_${u.userId}`,
              status: u.status || 'online',
            };
          });

          ws.send(
            JSON.stringify({
              type: 'ActiveDirectoryState',
              timestamp: Date.now(),
              peers,
              activeDeviceCount: peers.length,
            })
          );
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }
      }
    } catch (err) {
      console.error('[NEXUS WebSocket] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    allClients.delete(ws);
    if (currentDeviceId && activeDeviceSockets.has(currentDeviceId)) {
      const devSet = activeDeviceSockets.get(currentDeviceId)!;
      devSet.delete(ws);
      if (devSet.size === 0) activeDeviceSockets.delete(currentDeviceId);
    }

    if (currentUserId && activeUserSockets.has(currentUserId)) {
      const userSet = activeUserSockets.get(currentUserId)!;
      userSet.delete(ws);
      if (userSet.size === 0) {
        activeUserSockets.delete(currentUserId);
        if (vault.users[currentUserId]) {
          vault.users[currentUserId].status = 'offline';
          broadcast({
            type: 'user:status_changed',
            userId: currentUserId,
            status: 'offline',
          });
        }
      }
    }
  });
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[NEXUS Server] Full-Stack P2P Relay operational on http://0.0.0.0:${PORT}`);
  });
}

start();
