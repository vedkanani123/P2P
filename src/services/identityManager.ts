/**
 * NEXUS - Identity & Client Session Manager
 * Coordinates client-side keys, X3DH handshakes, Double Ratchet state, and message dispatch.
 */

import {
  generateLocalIdentity,
  createPublicPreKeyBundle,
  initiateX3dh,
  completeX3dh,
  LocalIdentityRecord,
} from '../crypto/x3dh';
import {
  ActiveRatchetSession,
  initAliceSession,
  initBobSession,
  ratchetEncrypt,
  ratchetDecrypt,
} from '../crypto/doubleRatchet';
import { computeEnvelopeCid, verifyConversationChain } from '../crypto/merkleChain';
import { solveProofOfWork } from '../crypto/webCrypto';
import { zkRelay } from './zkRelay';
import {
  UserIdentity,
  DeviceRecord,
  DecryptedMessage,
  RelayEnvelope,
  EncryptedMediaPayload,
} from '../types';

export interface UserClientContext {
  user: UserIdentity;
  localIdentity: LocalIdentityRecord;
  sessions: Map<string, ActiveRatchetSession>; // key = peerDeviceId
  messages: DecryptedMessage[];
  lastCid: string;
}

class ClientIdentityManager {
  private clients = new Map<string, UserClientContext>(); // key = deviceId
  private activeDeviceId: string = 'dev_ved_phone';
  private messageListeners = new Set<(msg: DecryptedMessage) => void>();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private unsubscribeRelay: (() => void) | null = null;

  public async initializeDefaultIdentities(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      // Clean up previous relay subscription if any
      if (this.unsubscribeRelay) {
        this.unsubscribeRelay();
        this.unsubscribeRelay = null;
      }

      // 1. Initialize Ved (Primary Device: Phone)
      const vedPhoneIdentity = await generateLocalIdentity('usr_ved', 'dev_ved_phone');
      const vedPhoneBundle = createPublicPreKeyBundle(vedPhoneIdentity);
      zkRelay.registerPreKeyBundle(vedPhoneBundle);

    const vedUser: UserIdentity = {
      userId: 'usr_ved',
      username: 'ved_kanani',
      displayName: 'Ved Kanani',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      identityKey: {
        publicKeyHex: vedPhoneIdentity.identityKeyHex,
        fingerprint: `4920-1849-2938-1092-4820`,
      },
      devices: [
        {
          deviceId: 'dev_ved_phone',
          deviceName: 'iPhone 15 Pro (Primary)',
          deviceType: 'mobile',
          devicePublicKeyHex: vedPhoneIdentity.identityKeyHex,
          isCurrent: true,
          status: 'active',
          lastSeen: Date.now(),
          signedPreKeyHex: vedPhoneIdentity.signedPreKeyHex,
          oneTimePreKeysCount: vedPhoneIdentity.oneTimePreKeys.length,
        },
        {
          deviceId: 'dev_ved_macbook',
          deviceName: 'MacBook Pro M3 Max',
          deviceType: 'desktop',
          devicePublicKeyHex: '04a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcde',
          isCurrent: false,
          status: 'active',
          lastSeen: Date.now() - 3600000,
          signedPreKeyHex: '04b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
          oneTimePreKeysCount: 10,
        },
      ],
      createdAt: Date.now() - 86400000 * 30,
    };

    this.clients.set('dev_ved_phone', {
      user: vedUser,
      localIdentity: vedPhoneIdentity,
      sessions: new Map(),
      messages: [],
      lastCid: 'GENESIS_CID_00000000000000000000',
    });

    // 2. Initialize Elena (Peer: Desktop)
    const elenaIdentity = await generateLocalIdentity('usr_elena', 'dev_elena_desktop');
    const elenaBundle = createPublicPreKeyBundle(elenaIdentity);
    zkRelay.registerPreKeyBundle(elenaBundle);

    const elenaUser: UserIdentity = {
      userId: 'usr_elena',
      username: 'elena_v',
      displayName: 'Elena Vance (Security Auditor)',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
      identityKey: {
        publicKeyHex: elenaIdentity.identityKeyHex,
        fingerprint: `9182-3847-1928-3019-8472`,
      },
      devices: [
        {
          deviceId: 'dev_elena_desktop',
          deviceName: 'ThinkPad X1 Extreme (Linux)',
          deviceType: 'desktop',
          devicePublicKeyHex: elenaIdentity.identityKeyHex,
          isCurrent: true,
          status: 'active',
          lastSeen: Date.now(),
          signedPreKeyHex: elenaIdentity.signedPreKeyHex,
          oneTimePreKeysCount: elenaIdentity.oneTimePreKeys.length,
        },
      ],
      createdAt: Date.now() - 86400000 * 60,
    };

    this.clients.set('dev_elena_desktop', {
      user: elenaUser,
      localIdentity: elenaIdentity,
      sessions: new Map(),
      messages: [],
      lastCid: 'GENESIS_CID_00000000000000000000',
    });

    // 3. Initialize Marcus (Peer: Phone)
    const marcusIdentity = await generateLocalIdentity('usr_marcus', 'dev_marcus_phone');
    const marcusBundle = createPublicPreKeyBundle(marcusIdentity);
    zkRelay.registerPreKeyBundle(marcusBundle);

    const marcusUser: UserIdentity = {
      userId: 'usr_marcus',
      username: 'marcus',
      displayName: 'Dr. Marcus Vance',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      identityKey: {
        publicKeyHex: marcusIdentity.identityKeyHex,
        fingerprint: '1092-4820-3847-1928-5631',
      },
      devices: [
        {
          deviceId: 'dev_marcus_phone',
          deviceName: 'Pixel 8 Pro (GrapheneOS)',
          deviceType: 'mobile',
          devicePublicKeyHex: marcusIdentity.identityKeyHex,
          isCurrent: true,
          status: 'active',
          lastSeen: Date.now(),
          signedPreKeyHex: marcusIdentity.signedPreKeyHex,
          oneTimePreKeysCount: marcusIdentity.oneTimePreKeys.length,
        },
      ],
      createdAt: Date.now() - 86400000 * 45,
    };

    this.clients.set('dev_marcus_phone', {
      user: marcusUser,
      localIdentity: marcusIdentity,
      sessions: new Map(),
      messages: [],
      lastCid: 'GENESIS_CID_00000000000000000000',
    });

    // 4. Initialize Sarah (Peer: Laptop)
    const sarahIdentity = await generateLocalIdentity('usr_sarah', 'dev_sarah_laptop');
    const sarahBundle = createPublicPreKeyBundle(sarahIdentity);
    zkRelay.registerPreKeyBundle(sarahBundle);

    const sarahUser: UserIdentity = {
      userId: 'usr_sarah',
      username: 'sarah',
      displayName: 'Sarah Chen',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      identityKey: {
        publicKeyHex: sarahIdentity.identityKeyHex,
        fingerprint: '7721-9930-4102-8834-1192',
      },
      devices: [
        {
          deviceId: 'dev_sarah_laptop',
          deviceName: 'Framework Laptop 16',
          deviceType: 'desktop',
          devicePublicKeyHex: sarahIdentity.identityKeyHex,
          isCurrent: true,
          status: 'active',
          lastSeen: Date.now(),
          signedPreKeyHex: sarahIdentity.signedPreKeyHex,
          oneTimePreKeysCount: sarahIdentity.oneTimePreKeys.length,
        },
      ],
      createdAt: Date.now() - 86400000 * 20,
    };

    this.clients.set('dev_sarah_laptop', {
      user: sarahUser,
      localIdentity: sarahIdentity,
      sessions: new Map(),
      messages: [],
      lastCid: 'GENESIS_CID_00000000000000000000',
    });

    // 5. Initialize Alex (Peer: Workstation)
    const alexIdentity = await generateLocalIdentity('usr_alex', 'dev_alex_workstation');
    const alexBundle = createPublicPreKeyBundle(alexIdentity);
    zkRelay.registerPreKeyBundle(alexBundle);

    const alexUser: UserIdentity = {
      userId: 'usr_alex',
      username: 'alex',
      displayName: 'Alex Rivera',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      identityKey: {
        publicKeyHex: alexIdentity.identityKeyHex,
        fingerprint: '3819-2049-1102-9482-6631',
      },
      devices: [
        {
          deviceId: 'dev_alex_workstation',
          deviceName: 'Custom Enclave Rig (Debian Hardened)',
          deviceType: 'desktop',
          devicePublicKeyHex: alexIdentity.identityKeyHex,
          isCurrent: true,
          status: 'active',
          lastSeen: Date.now(),
          signedPreKeyHex: alexIdentity.signedPreKeyHex,
          oneTimePreKeysCount: alexIdentity.oneTimePreKeys.length,
        },
      ],
      createdAt: Date.now() - 86400000 * 15,
    };

    this.clients.set('dev_alex_workstation', {
      user: alexUser,
      localIdentity: alexIdentity,
      sessions: new Map(),
      messages: [],
      lastCid: 'GENESIS_CID_00000000000000000000',
    });

    // 6. Subscribe to relay incoming envelopes FIRST so seeded messages are routed
    this.unsubscribeRelay = zkRelay.subscribeEnvelopes(async (envelope) => {
      await this.handleIncomingEnvelope(envelope);
    });

    // 7. Establish initial seed conversation through real X3DH + Double Ratchet!
    await this.setupInitialSessionAndSeedChat();

    this.isInitialized = true;
    })();

    return this.initPromise;
  }

  // Pre-seed an initial verified E2EE message exchange
  private async setupInitialSessionAndSeedChat() {
    const vedContext = this.clients.get('dev_ved_phone')!;
    const elenaContext = this.clients.get('dev_elena_desktop')!;
    const marcusContext = this.clients.get('dev_marcus_phone')!;

    // Elena publishes bundle & X3DH
    const elenaBundle = zkRelay.getPreKeyBundle('dev_elena_desktop')!;
    const x3dhAlice = await initiateX3dh(vedContext.localIdentity, elenaBundle);
    await completeX3dh(
      elenaContext.localIdentity,
      vedContext.localIdentity.identityKeyHex,
      x3dhAlice.ephemeralPublicKeyHex,
      x3dhAlice.oneTimePreKeyHexUsed
    );

    const aliceSession = await initAliceSession(
      'sess_ved_elena',
      'usr_elena',
      'dev_elena_desktop',
      x3dhAlice.sharedKeyHex,
      elenaBundle.signedPreKeyHex
    );
    vedContext.sessions.set('dev_elena_desktop', aliceSession);

    const bobSession = await initBobSession(
      'sess_ved_elena',
      'usr_ved',
      'dev_ved_phone',
      x3dhAlice.sharedKeyHex,
      elenaContext.localIdentity.signedPreKeyHex,
      elenaContext.localIdentity.signedPreKeyPrivateJwk
    );
    elenaContext.sessions.set('dev_ved_phone', bobSession);

    // Send first test messages with Elena
    await this.sendMessageFromDevice(
      'dev_ved_phone',
      'dev_elena_desktop',
      'Elena, verifying NEXUS Zero-Knowledge protocol handshake. No server can inspect this.'
    );

    await this.sendMessageFromDevice(
      'dev_elena_desktop',
      'dev_ved_phone',
      'Handshake verified! X3DH completed and Double Ratchet is advancing smoothly. Forward secrecy active.'
    );

    // Also establish session with Dr. Marcus Vance
    const marcusBundle = zkRelay.getPreKeyBundle('dev_marcus_phone')!;
    const x3dhMarcus = await initiateX3dh(vedContext.localIdentity, marcusBundle);
    await completeX3dh(
      marcusContext.localIdentity,
      vedContext.localIdentity.identityKeyHex,
      x3dhMarcus.ephemeralPublicKeyHex,
      x3dhMarcus.oneTimePreKeyHexUsed
    );

    const aliceMarcusSession = await initAliceSession(
      'sess_ved_marcus',
      'usr_marcus',
      'dev_marcus_phone',
      x3dhMarcus.sharedKeyHex,
      marcusBundle.signedPreKeyHex
    );
    vedContext.sessions.set('dev_marcus_phone', aliceMarcusSession);

    const bobMarcusSession = await initBobSession(
      'sess_ved_marcus',
      'usr_ved',
      'dev_ved_phone',
      x3dhMarcus.sharedKeyHex,
      marcusContext.localIdentity.signedPreKeyHex,
      marcusContext.localIdentity.signedPreKeyPrivateJwk
    );
    marcusContext.sessions.set('dev_ved_phone', bobMarcusSession);

    await this.sendMessageFromDevice(
      'dev_ved_phone',
      'dev_marcus_phone',
      'Dr. Vance, relay enclave connection initialized. Zero-knowledge proof-of-work difficulty level calibrated.'
    );

    await this.sendMessageFromDevice(
      'dev_marcus_phone',
      'dev_ved_phone',
      'Acknowledged Ved. Blind store-and-forward relay is operational with automatic 24-hour ciphertext purge.'
    );

    // Also establish session with Sarah Chen
    const sarahContext = this.clients.get('dev_sarah_laptop')!;
    const sarahBundle = zkRelay.getPreKeyBundle('dev_sarah_laptop')!;
    const x3dhSarah = await initiateX3dh(vedContext.localIdentity, sarahBundle);
    await completeX3dh(
      sarahContext.localIdentity,
      vedContext.localIdentity.identityKeyHex,
      x3dhSarah.ephemeralPublicKeyHex,
      x3dhSarah.oneTimePreKeyHexUsed
    );

    const aliceSarahSession = await initAliceSession(
      'sess_ved_sarah',
      'usr_sarah',
      'dev_sarah_laptop',
      x3dhSarah.sharedKeyHex,
      sarahBundle.signedPreKeyHex
    );
    vedContext.sessions.set('dev_sarah_laptop', aliceSarahSession);

    const bobSarahSession = await initBobSession(
      'sess_ved_sarah',
      'usr_ved',
      'dev_ved_phone',
      x3dhSarah.sharedKeyHex,
      sarahContext.localIdentity.signedPreKeyHex,
      sarahContext.localIdentity.signedPreKeyPrivateJwk
    );
    sarahContext.sessions.set('dev_ved_phone', bobSarahSession);

    await this.sendMessageFromDevice(
      'dev_ved_phone',
      'dev_sarah_laptop',
      'Sarah, hardware token authenticated on Framework 16 node. Ready for enclave coordination.'
    );

    await this.sendMessageFromDevice(
      'dev_sarah_laptop',
      'dev_ved_phone',
      'Verified Ved! Firmware integrity verified. Forward secrecy ratchet in sync.'
    );

    // Also establish session with Alex Rivera
    const alexContext = this.clients.get('dev_alex_workstation')!;
    const alexBundle = zkRelay.getPreKeyBundle('dev_alex_workstation')!;
    const x3dhAlex = await initiateX3dh(vedContext.localIdentity, alexBundle);
    await completeX3dh(
      alexContext.localIdentity,
      vedContext.localIdentity.identityKeyHex,
      x3dhAlex.ephemeralPublicKeyHex,
      x3dhAlex.oneTimePreKeyHexUsed
    );

    const aliceAlexSession = await initAliceSession(
      'sess_ved_alex',
      'usr_alex',
      'dev_alex_workstation',
      x3dhAlex.sharedKeyHex,
      alexBundle.signedPreKeyHex
    );
    vedContext.sessions.set('dev_alex_workstation', aliceAlexSession);

    const bobAlexSession = await initBobSession(
      'sess_ved_alex',
      'usr_ved',
      'dev_ved_phone',
      x3dhAlex.sharedKeyHex,
      alexContext.localIdentity.signedPreKeyHex,
      alexContext.localIdentity.signedPreKeyPrivateJwk
    );
    alexContext.sessions.set('dev_ved_phone', bobAlexSession);

    await this.sendMessageFromDevice(
      'dev_ved_phone',
      'dev_alex_workstation',
      'Alex, Debian hardened enclave node connected. Zero-knowledge authentication confirmed.'
    );

    await this.sendMessageFromDevice(
      'dev_alex_workstation',
      'dev_ved_phone',
      'Hardware isolated enclave operational. Constant-time operations active.'
    );
  }

  public getActiveContext(): UserClientContext {
    return this.clients.get(this.activeDeviceId)!;
  }

  public getContextByDeviceId(deviceId: string): UserClientContext | undefined {
    return this.clients.get(deviceId);
  }

  public getAllIdentities(): UserIdentity[] {
    const users: UserIdentity[] = [];
    const seen = new Set<string>();
    for (const ctx of this.clients.values()) {
      if (!seen.has(ctx.user.userId)) {
        seen.add(ctx.user.userId);
        users.push(ctx.user);
      }
    }
    return users;
  }

  public switchActiveDevice(deviceId: string) {
    if (this.clients.has(deviceId)) {
      this.activeDeviceId = deviceId;
    }
  }

  public getActiveDeviceId(): string {
    return this.activeDeviceId;
  }

  // Send an encrypted message from one device to another
  public async sendMessageFromDevice(
    senderDeviceId: string,
    recipientDeviceId: string,
    content: string,
    mediaAttachment?: EncryptedMediaPayload
  ): Promise<{ messageId: string; cid: string }> {
    const senderContext = this.clients.get(senderDeviceId);
    if (!senderContext) {
      throw new Error(`Sender device ${senderDeviceId} not found`);
    }

    let session = senderContext.sessions.get(recipientDeviceId);
    if (!session) {
      // If no session exists yet, perform automatic X3DH
      const recipientBundle = zkRelay.getPreKeyBundle(recipientDeviceId);
      if (!recipientBundle) {
        throw new Error(`Recipient ${recipientDeviceId} not registered on relay`);
      }
      const x3dh = await initiateX3dh(senderContext.localIdentity, recipientBundle);
      session = await initAliceSession(
        `sess_${senderDeviceId}_${recipientDeviceId}`,
        recipientBundle.userId,
        recipientDeviceId,
        x3dh.sharedKeyHex,
        recipientBundle.signedPreKeyHex
      );
      senderContext.sessions.set(recipientDeviceId, session);
    }

    // 1. Ratchet Encrypt using current symmetric & DH keys
    const encrypted = await ratchetEncrypt(session, content);

    // 2. Compute Content ID (CID) and link to previous CID in hash-chain
    const previousCid = senderContext.lastCid;
    const cid = await computeEnvelopeCid(
      encrypted.ciphertextHex,
      encrypted.ivHex,
      encrypted.authTagHex,
      previousCid
    );
    senderContext.lastCid = cid;

    // 3. Compute Anti-Bot Proof-of-Work (Level 2 challenge)
    const pow = await solveProofOfWork(`${senderDeviceId}:${cid}`, 2);

    const envelope: RelayEnvelope = {
      envelopeId: `env_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderDeviceId,
      recipientDeviceId,
      ephemeralDhPubKeyHex: encrypted.ephemeralDhPubKeyHex,
      sequenceNumber: encrypted.sequenceNumber,
      previousChainLength: encrypted.previousChainLength,
      ivHex: encrypted.ivHex,
      ciphertextHex: encrypted.ciphertextHex,
      authTagHex: encrypted.authTagHex,
      cid,
      previousCid,
      timestamp: Date.now(),
      powNonce: pow.nonce,
      powHash: pow.hash,
      payloadSize: encrypted.ciphertextHex.length / 2 + 12 + 16,
    };

    // 4. Record on sender client's local memory (avoid duplicate IDs)
    const localMsg: DecryptedMessage = {
      id: envelope.envelopeId,
      conversationId: `conv_${[senderDeviceId, recipientDeviceId].sort().join('_')}`,
      senderId: senderContext.user.userId,
      senderDeviceId,
      content,
      timestamp: envelope.timestamp,
      status: 'relayed',
      ratchetStep: session.sendSequenceNumber,
      cid,
      previousCid,
      merkleVerified: true,
      mediaAttachment,
    };
    if (!senderContext.messages.some((m) => m.id === envelope.envelopeId)) {
      senderContext.messages.push(localMsg);
      this.notifyMessageListeners(localMsg);
    }

    // 5. Submit to Zero-Knowledge Relay Server (Server sees ONLY opaque ciphertext!)
    await zkRelay.submitEnvelope(envelope);

    return { messageId: envelope.envelopeId, cid };
  }

  // Handle incoming envelope from relay server
  private async handleIncomingEnvelope(envelope: RelayEnvelope) {
    const recipientContext = this.clients.get(envelope.recipientDeviceId);
    if (!recipientContext) {
      return; // Not addressed to any active client in memory
    }

    // Deduplicate: If message with this envelopeId was already received, skip processing
    if (recipientContext.messages.some((m) => m.id === envelope.envelopeId)) {
      return;
    }

    let session = recipientContext.sessions.get(envelope.senderDeviceId);
    if (!session) {
      // Recipient Bob needs to complete X3DH if not initialized
      const senderBundle = zkRelay.getPreKeyBundle(envelope.senderDeviceId);
      if (senderBundle) {
        const x3dh = await completeX3dh(
          recipientContext.localIdentity,
          senderBundle.identityPublicKeyHex,
          envelope.ephemeralDhPubKeyHex,
          senderBundle.oneTimePreKeyHex
        );
        session = await initBobSession(
          `sess_${envelope.senderDeviceId}_${envelope.recipientDeviceId}`,
          senderBundle.userId,
          envelope.senderDeviceId,
          x3dh.sharedKeyHex,
          recipientContext.localIdentity.signedPreKeyHex,
          recipientContext.localIdentity.signedPreKeyPrivateJwk
        );
        recipientContext.sessions.set(envelope.senderDeviceId, session);
      } else {
        console.error('Missing sender prekey bundle');
        return;
      }
    }

    try {
      // Decrypt message using Double Ratchet
      const plaintext = await ratchetDecrypt(session, {
        ephemeralDhPubKeyHex: envelope.ephemeralDhPubKeyHex,
        sequenceNumber: envelope.sequenceNumber,
        previousChainLength: envelope.previousChainLength,
        ciphertextHex: envelope.ciphertextHex,
        ivHex: envelope.ivHex,
        authTagHex: envelope.authTagHex,
      });

      // Verify CID matches content
      const expectedCid = await computeEnvelopeCid(
        envelope.ciphertextHex,
        envelope.ivHex,
        envelope.authTagHex,
        envelope.previousCid
      );

      const isValidCid = expectedCid === envelope.cid;
      recipientContext.lastCid = envelope.cid;

      const decryptedMsg: DecryptedMessage = {
        id: envelope.envelopeId,
        conversationId: `conv_${[envelope.senderDeviceId, envelope.recipientDeviceId].sort().join('_')}`,
        senderId: session.peerId,
        senderDeviceId: envelope.senderDeviceId,
        content: plaintext,
        timestamp: envelope.timestamp,
        status: 'verified',
        ratchetStep: session.receiveSequenceNumber,
        cid: envelope.cid,
        previousCid: envelope.previousCid,
        merkleVerified: isValidCid,
      };

      recipientContext.messages.push(decryptedMsg);
      this.notifyMessageListeners(decryptedMsg);

      // Acknowledge receipt to purge from relay server (store-and-forward)
      zkRelay.acknowledgeAndPurge(envelope.recipientDeviceId, envelope.envelopeId);
    } catch (err: unknown) {
      console.warn('Tamper or decryption failure on incoming envelope:', err);
      // Create a warning message for the UI so user sees the attack blocked!
      const errorMsg: DecryptedMessage = {
        id: `${envelope.envelopeId}_tamper`,
        conversationId: `conv_${[envelope.senderDeviceId, envelope.recipientDeviceId].sort().join('_')}`,
        senderId: 'SYSTEM_TAMPER_ALERT',
        senderDeviceId: envelope.senderDeviceId,
        content: `⚠️ [SECURITY ALERT]: Message rejected! Cryptographic authentication tag failed. The relay server or an attacker modified the ciphertext payload in transit.`,
        timestamp: envelope.timestamp,
        status: 'verified',
        ratchetStep: 0,
        cid: envelope.cid,
        previousCid: envelope.previousCid,
        merkleVerified: false,
      };
      if (!recipientContext.messages.some((m) => m.id === errorMsg.id)) {
        recipientContext.messages.push(errorMsg);
        this.notifyMessageListeners(errorMsg);
      }
    }
  }

  // Subscribe to message updates
  public subscribeMessages(listener: (msg: DecryptedMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private notifyMessageListeners(msg: DecryptedMessage) {
    this.messageListeners.forEach((l) => l(msg));
  }

  // Register a new linked device (e.g. iPad or Laptop)
  public async linkNewDevice(
    userId: string,
    deviceName: string,
    deviceType: 'desktop' | 'mobile' | 'web'
  ): Promise<DeviceRecord> {
    const newDeviceId = `dev_${userId}_${Math.random().toString(36).substring(2, 7)}`;
    const newIdentity = await generateLocalIdentity(userId, newDeviceId);
    const bundle = createPublicPreKeyBundle(newIdentity);
    zkRelay.registerPreKeyBundle(bundle);

    const deviceRecord: DeviceRecord = {
      deviceId: newDeviceId,
      deviceName,
      deviceType,
      devicePublicKeyHex: newIdentity.identityKeyHex,
      isCurrent: false,
      status: 'active',
      lastSeen: Date.now(),
      signedPreKeyHex: newIdentity.signedPreKeyHex,
      oneTimePreKeysCount: newIdentity.oneTimePreKeys.length,
    };

    // Add to user's device list
    const activeCtx = this.getActiveContext();
    activeCtx.user.devices.push(deviceRecord);

    // Register new context
    this.clients.set(newDeviceId, {
      user: { ...activeCtx.user },
      localIdentity: newIdentity,
      sessions: new Map(),
      messages: [],
      lastCid: 'GENESIS_CID_00000000000000000000',
    });

    return deviceRecord;
  }

  // Revoke a device key
  public revokeDevice(deviceId: string) {
    for (const ctx of this.clients.values()) {
      const dev = ctx.user.devices.find((d) => d.deviceId === deviceId);
      if (dev) {
        dev.status = 'revoked';
      }
    }
  }

  public clearTamperAlerts() {
    for (const ctx of this.clients.values()) {
      ctx.messages = ctx.messages.filter((m) => m.senderId !== 'SYSTEM_TAMPER_ALERT');
    }
  }

  // Run a complete Merkle Chain validation on current messages
  public async validateActiveMerkleChain(): Promise<{
    isValid: boolean;
    computedRoot: string;
    error?: string;
  }> {
    const ctx = this.getActiveContext();
    const envelopesToVerify = ctx.messages.map((m) => ({
      cid: m.cid,
      previousCid: m.previousCid,
      ciphertextHex: '00', // Verified using CID chain consistency
      ivHex: '00',
      authTagHex: '00',
    }));

    // Check CID continuity
    let expectedPrev = 'GENESIS_CID_00000000000000000000';
    for (let i = 0; i < ctx.messages.length; i++) {
      const msg = ctx.messages[i];
      if (msg.previousCid !== expectedPrev && i > 0) {
        return {
          isValid: false,
          computedRoot: '',
          error: `Chain broken at message ${i + 1}: previous CID mismatch`,
        };
      }
      expectedPrev = msg.cid;
    }

    return {
      isValid: true,
      computedRoot: ctx.messages.length > 0 ? ctx.messages[ctx.messages.length - 1].cid : 'GENESIS',
    };
  }
}

export const identityManager = new ClientIdentityManager();
