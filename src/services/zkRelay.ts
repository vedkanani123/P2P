/**
 * NEXUS - Zero-Knowledge Relay Service
 *
 * Enforces:
 * 1. ZERO-KNOWLEDGE: The relay server only stores and routes opaque ciphertext blobs.
 * 2. It has NO access to session keys, identity private keys, or plaintext messages.
 * 3. Ephemeral Store-and-Forward: blobs can be dropped upon confirmed delivery.
 * 4. Transparent Wiretap: every packet is logged in hex so users can verify 0 plaintext leakage.
 */

import { PreKeyBundle, RelayEnvelope, WiretapLogEntry } from '../types';
import { verifyProofOfWork } from '../crypto/webCrypto';

type EnvelopeListener = (envelope: RelayEnvelope) => Promise<void> | void;
type WiretapListener = (log: WiretapLogEntry) => void;

class ZeroKnowledgeRelayService {
  // Public directory of PreKeyBundles (Public keys only)
  private preKeyDirectory = new Map<string, PreKeyBundle>(); // key = deviceId

  // Encrypted store-and-forward mailbox: recipientDeviceId -> RelayEnvelope[]
  private encryptedMailboxes = new Map<string, RelayEnvelope[]>();

  // Complete Relay Wiretap Audit Log
  private wiretapLogs: WiretapLogEntry[] = [];

  // Active listeners for real-time P2P/Relay push
  private envelopeListeners = new Set<EnvelopeListener>();
  private wiretapListeners = new Set<WiretapListener>();

  constructor() {
    // Initialize
  }

  // Register public keys on relay server
  public registerPreKeyBundle(bundle: PreKeyBundle) {
    this.preKeyDirectory.set(bundle.deviceId, bundle);
  }

  public getPreKeyBundle(deviceId: string): PreKeyBundle | undefined {
    return this.preKeyDirectory.get(deviceId);
  }

  public getAllRegisteredDevices(): PreKeyBundle[] {
    return Array.from(this.preKeyDirectory.values());
  }

  // Post an encrypted envelope through the relay server
  public async submitEnvelope(envelope: RelayEnvelope): Promise<{ success: boolean; reason?: string }> {
    // 1. Verify Anti-Bot Proof-of-Work
    const isPowValid = await verifyProofOfWork(
      `${envelope.senderDeviceId}:${envelope.cid}`,
      envelope.powNonce,
      2 // difficulty
    );

    if (!isPowValid) {
      return { success: false, reason: 'INVALID_PROOF_OF_WORK' };
    }

    // 2. Store encrypted envelope in recipient's mailbox
    let mailbox = this.encryptedMailboxes.get(envelope.recipientDeviceId);
    if (!mailbox) {
      mailbox = [];
      this.encryptedMailboxes.set(envelope.recipientDeviceId, mailbox);
    }
    mailbox.push(envelope);

    // 3. Log to Wiretap (Zero-Knowledge Audit)
    const wiretapEntry: WiretapLogEntry = {
      id: `wt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: envelope.timestamp,
      direction: 'RELAY',
      envelopeId: envelope.envelopeId,
      senderDeviceTruncated: envelope.senderDeviceId.substring(0, 10),
      recipientDeviceTruncated: envelope.recipientDeviceId.substring(0, 10),
      rawCiphertextHexPreview: `${envelope.ciphertextHex.substring(0, 24)}... (Total: ${envelope.ciphertextHex.length / 2} bytes)`,
      cid: envelope.cid,
      plaintextLeaked: false,
      sizeBytes: envelope.payloadSize,
    };

    this.wiretapLogs.unshift(wiretapEntry);
    if (this.wiretapLogs.length > 50) {
      this.wiretapLogs.pop();
    }

    // Notify listeners
    for (const listener of this.envelopeListeners) {
      try {
        await listener(envelope);
      } catch (err) {
        console.warn('Error in envelope listener:', err);
      }
    }
    this.wiretapListeners.forEach((listener) => listener(wiretapEntry));

    return { success: true };
  }

  // Fetch pending encrypted envelopes for a device
  public fetchMailbox(deviceId: string): RelayEnvelope[] {
    const list = this.encryptedMailboxes.get(deviceId) || [];
    return [...list];
  }

  // Confirm receipt and purge from server (Signal sealed-sender ephemeral storage)
  public acknowledgeAndPurge(deviceId: string, envelopeId: string) {
    const mailbox = this.encryptedMailboxes.get(deviceId);
    if (mailbox) {
      const idx = mailbox.findIndex((e) => e.envelopeId === envelopeId);
      if (idx !== -1) {
        mailbox.splice(idx, 1);
      }
    }
  }

  // Get wiretap logs
  public getWiretapLogs(): WiretapLogEntry[] {
    return [...this.wiretapLogs];
  }

  // Subscribe to live envelopes
  public subscribeEnvelopes(listener: EnvelopeListener): () => void {
    this.envelopeListeners.add(listener);
    return () => this.envelopeListeners.delete(listener);
  }

  // Subscribe to live wiretap entries
  public subscribeWiretap(listener: WiretapListener): () => void {
    this.wiretapListeners.add(listener);
    return () => this.wiretapListeners.delete(listener);
  }

  // SIMULATE ATTACK: Tamper with an envelope in the relay store to demonstrate cryptographic failure
  public simulateServerTamperAttack(deviceId: string): { tamperedEnvelopeId?: string; originalCid?: string } {
    const mailbox = this.encryptedMailboxes.get(deviceId);
    if (!mailbox || mailbox.length === 0) {
      return {};
    }

    const target = mailbox[mailbox.length - 1];
    // Flip a single character in the ciphertext hex
    const chars = target.ciphertextHex.split('');
    const lastChar = chars[chars.length - 1];
    chars[chars.length - 1] = lastChar === 'a' ? 'b' : 'a';
    target.ciphertextHex = chars.join('');

    // Tamper the wiretap log as well
    this.wiretapLogs.unshift({
      id: `wt_attack_${Date.now()}`,
      timestamp: Date.now(),
      direction: 'STORE',
      envelopeId: target.envelopeId,
      senderDeviceTruncated: 'HOSTILE_ACTOR',
      recipientDeviceTruncated: target.recipientDeviceId.substring(0, 10),
      rawCiphertextHexPreview: 'BIT_FLIP_INJECTED_INTO_CIPHERTEXT',
      cid: target.cid,
      plaintextLeaked: false,
      sizeBytes: target.payloadSize,
    });

    return {
      tamperedEnvelopeId: target.envelopeId,
      originalCid: target.cid,
    };
  }
}

export const zkRelay = new ZeroKnowledgeRelayService();
