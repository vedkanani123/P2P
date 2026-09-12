/**
 * NEXUS - Types & Cryptographic Interfaces
 * Zero-Knowledge End-to-End Encrypted Architecture
 */

export interface KeyPairSerialized {
  publicKey: string; // Base64 or Hex
  privateKey?: string; // Optional, kept in client memory only
}

export interface UserIdentity {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  identityKey: {
    publicKeyHex: string;
    fingerprint: string; // Safety number / QR verification
  };
  devices: DeviceRecord[];
  createdAt: number;
}

export interface DeviceRecord {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'web';
  devicePublicKeyHex: string;
  isCurrent: boolean;
  status: 'active' | 'revoked';
  lastSeen: number;
  signedPreKeyHex: string;
  oneTimePreKeysCount: number;
}

// X3DH Prekey Bundle published to server (Public ONLY)
export interface PreKeyBundle {
  userId: string;
  deviceId: string;
  identityPublicKeyHex: string;
  signedPreKeyHex: string;
  signedPreKeySignature: string;
  oneTimePreKeyHex?: string; // Consumed upon initial handshake
}

// Double Ratchet Session State
export interface RatchetState {
  dhSenderPubKeyHex: string;
  dhReceiverPubKeyHex: string;
  rootKeyHex: string;
  sendingChainKeyHex: string;
  receivingChainKeyHex: string;
  sendStepCount: number;
  receiveStepCount: number;
  previousCounter: number;
  skippedMessageKeys: Record<string, string>; // { "pubKey:counter": messageKeyHex }
}

// Zero-Knowledge Relay Envelope - What the server actually sees and stores
export interface RelayEnvelope {
  envelopeId: string;
  recipientDeviceId: string;
  senderDeviceId: string;
  ephemeralDhPubKeyHex: string; // Ratchet public key
  sequenceNumber: number;
  previousChainLength: number;
  ivHex: string;
  ciphertextHex: string;
  authTagHex: string; // AES-GCM 128-bit authentication tag
  cid: string; // Content ID = SHA-256(ciphertext + iv)
  previousCid: string; // Merkle chain linkage
  timestamp: number;
  powNonce: number; // Proof-of-work nonce
  powHash: string; // Hash verifying computational cost
  payloadSize: number; // in bytes
}

// Decrypted Message Model (Client-Side Only)
export interface DecryptedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderDeviceId: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'relayed' | 'delivered' | 'verified';
  ratchetStep: number;
  cid: string;
  previousCid: string;
  merkleVerified: boolean;
  mediaAttachment?: EncryptedMediaPayload;
  groupId?: string; // Present when message is part of an encrypted group
}

// User Directory Item for Search & Discovery
export interface UserDirectoryItem {
  userId: string;
  username: string; // e.g. "ved", "elena_v", "marcus_v"
  displayName: string;
  role: string;
  avatar: string;
  primaryDeviceId: string;
  status: 'online' | 'offline' | 'idle';
  fingerprint: string;
  bio?: string;
  isRegisteredUser?: boolean;
}

// Encrypted Group Enclave Models
export interface GroupMember {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  deviceId: string;
  role: 'creator' | 'admin' | 'member';
  joinedAt: number;
}

export interface GroupJoinRequest {
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

export interface GroupChat {
  groupId: string;
  name: string;
  description: string;
  avatar: string;
  creatorId: string; // Group Maker ID
  creatorName: string;
  requiresApproval: boolean; // Access control: only creator approval lets users join
  members: GroupMember[];
  pendingRequests: GroupJoinRequest[];
  createdAt: number;
  groupKeyFingerprint: string;
  lastMessage?: string;
  lastMessageTimestamp?: number;
}

export interface EncryptedMediaPayload {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  cid: string;
  chunkCids: string[];
  clientThumbnailDataUrl?: string;
  decryptedDataUrl?: string;
}

export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  messageId?: string;
}

export interface WiretapLogEntry {
  id: string;
  timestamp: number;
  direction: 'INBOUND' | 'RELAY' | 'STORE';
  envelopeId: string;
  senderDeviceTruncated: string;
  recipientDeviceTruncated: string;
  rawCiphertextHexPreview: string;
  cid: string;
  plaintextLeaked: false; // Mathematically guaranteed 0
  sizeBytes: number;
}

export interface ProofOfWorkResult {
  nonce: number;
  hash: string;
  difficulty: number;
  timeMs: number;
}
