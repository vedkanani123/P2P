/**
 * NEXUS - Zero-Knowledge Real-Time P2P Relay Service
 *
 * Connects directly to the platform's WebSocket server at /ws.
 * Enforces:
 * 1. ZERO-KNOWLEDGE: The relay server only routes opaque ciphertext blobs.
 * 2. NO PLAINTEXT: Server has NO access to private keys or plaintext.
 * 3. Real-Time Delivery: Instant push across all devices and browsers with 0ms latency.
 * 4. Ephemeral Store-and-Forward: Server purges envelopes upon confirmed delivery.
 */

import { PreKeyBundle, RelayEnvelope, WiretapLogEntry } from '../types';
import { verifyProofOfWork } from '../crypto/webCrypto';

type EnvelopeListener = (envelope: RelayEnvelope) => Promise<void> | void;
type WiretapListener = (log: WiretapLogEntry) => void;
type NetworkEventListener = (event: { type: string; [key: string]: any }) => void;

class ZeroKnowledgeRelayService {
  // Public directory of PreKeyBundles
  private preKeyDirectory = new Map<string, PreKeyBundle>();

  // In-memory cache for fast local lookup
  private encryptedMailboxes = new Map<string, RelayEnvelope[]>();
  private wiretapLogs: WiretapLogEntry[] = [];

  // Active listeners
  private envelopeListeners = new Set<EnvelopeListener>();
  private wiretapListeners = new Set<WiretapListener>();
  private networkEventListeners = new Set<NetworkEventListener>();

  // WebSocket Connection
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private currentDeviceId: string | null = null;
  private currentUserId: string | null = null;
  private reconnectTimer: any = null;

  constructor() {
    // Initial fetch of wiretap logs
    if (typeof window !== 'undefined') {
      fetch('/api/wiretap')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.logs)) {
            this.wiretapLogs = data.logs;
          }
        })
        .catch(() => {});
    }
  }

  // Connect device to the real-time WebSocket relay server
  public connect(deviceId: string, userId: string) {
    this.currentDeviceId = deviceId;
    this.currentUserId = userId;

    if (typeof window === 'undefined') return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'identify', deviceId, userId }));
      }
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        console.log('[NEXUS Relay] WebSocket connected to real-time relay:', wsUrl);

        if (this.currentDeviceId && this.currentUserId) {
          this.ws?.send(
            JSON.stringify({
              type: 'identify',
              deviceId: this.currentDeviceId,
              userId: this.currentUserId,
            })
          );
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'new_envelope': {
              const envelope: RelayEnvelope = data.envelope;
              // Add to local mailbox
              let mailbox = this.encryptedMailboxes.get(envelope.recipientDeviceId);
              if (!mailbox) {
                mailbox = [];
                this.encryptedMailboxes.set(envelope.recipientDeviceId, mailbox);
              }
              mailbox.push(envelope);

              // Notify listeners
              for (const listener of this.envelopeListeners) {
                try {
                  await listener(envelope);
                } catch (err) {
                  console.error('[NEXUS Relay] Error in envelope listener:', err);
                }
              }

              // Automatically send acknowledgment back to relay
              if (this.currentDeviceId) {
                this.acknowledgeAndPurge(this.currentDeviceId, envelope.envelopeId);
              }
              break;
            }

            case 'wiretap_entry': {
              const entry: WiretapLogEntry = data.entry;
              this.wiretapLogs.unshift(entry);
              if (this.wiretapLogs.length > 50) this.wiretapLogs.pop();
              this.wiretapListeners.forEach((l) => l(entry));
              break;
            }

            default: {
              // Dispatch to general network event listeners
              this.networkEventListeners.forEach((l) => l(data));
              break;
            }
          }
        } catch (err) {
          console.error('[NEXUS Relay] Message parsing error:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        // Auto-reconnect after 2 seconds
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.currentDeviceId && this.currentUserId) {
            this.connect(this.currentDeviceId, this.currentUserId);
          }
        }, 2000);
      };

      this.ws.onerror = (err) => {
        console.warn('[NEXUS Relay] WebSocket connection error:', err);
        this.isConnecting = false;
      };
    } catch (e) {
      this.isConnecting = false;
      console.error('[NEXUS Relay] Failed to initialize WebSocket:', e);
    }
  }

  // Register public keys on relay server & sync to backend
  public registerPreKeyBundle(bundle: PreKeyBundle) {
    this.preKeyDirectory.set(bundle.deviceId, bundle);

    // Sync to server API
    if (typeof window !== 'undefined') {
      fetch('/api/prekeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preKeyBundle: bundle }),
      }).catch(() => {});
    }
  }

  public getPreKeyBundle(deviceId: string): PreKeyBundle | undefined {
    return this.preKeyDirectory.get(deviceId);
  }

  public async fetchPreKeyBundleFromServer(deviceId: string): Promise<PreKeyBundle | null> {
    try {
      const res = await fetch(`/api/prekeys/${encodeURIComponent(deviceId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.preKeyBundle) {
          this.preKeyDirectory.set(deviceId, data.preKeyBundle);
          return data.preKeyBundle;
        }
      }
    } catch {
      // fallback
    }
    return this.preKeyDirectory.get(deviceId) || null;
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
      2
    );

    if (!isPowValid) {
      return { success: false, reason: 'INVALID_PROOF_OF_WORK' };
    }

    // 2. Dispatch through real-time WebSocket to recipient device
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'send_envelope', envelope }));
    } else {
      console.warn('[NEXUS Relay] WebSocket not connected; buffering envelope locally');
    }

    // 3. Store locally in memory
    let mailbox = this.encryptedMailboxes.get(envelope.recipientDeviceId);
    if (!mailbox) {
      mailbox = [];
      this.encryptedMailboxes.set(envelope.recipientDeviceId, mailbox);
    }
    mailbox.push(envelope);

    // 4. Log to Wiretap (Zero-Knowledge Audit)
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

    // Notify local listeners
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

  // Confirm receipt and purge from server
  public acknowledgeAndPurge(deviceId: string, envelopeId: string) {
    const mailbox = this.encryptedMailboxes.get(deviceId);
    if (mailbox) {
      const idx = mailbox.findIndex((e) => e.envelopeId === envelopeId);
      if (idx !== -1) {
        mailbox.splice(idx, 1);
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ack_envelope', deviceId, envelopeId }));
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

  // Subscribe to server broadcast events (user:registered, user:status_changed, etc.)
  public subscribeNetworkEvents(listener: NetworkEventListener): () => void {
    this.networkEventListeners.add(listener);
    return () => this.networkEventListeners.delete(listener);
  }

  // SIMULATE ATTACK: Tamper with an envelope in the relay store to demonstrate cryptographic failure
  public simulateServerTamperAttack(deviceId: string): { tamperedEnvelopeId?: string; originalCid?: string } {
    const mailbox = this.encryptedMailboxes.get(deviceId);
    if (!mailbox || mailbox.length === 0) {
      return {};
    }

    const target = mailbox[mailbox.length - 1];
    const chars = target.ciphertextHex.split('');
    const lastChar = chars[chars.length - 1];
    chars[chars.length - 1] = lastChar === 'a' ? 'b' : 'a';
    target.ciphertextHex = chars.join('');

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
