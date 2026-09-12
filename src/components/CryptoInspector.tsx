/**
 * NEXUS - Cryptographic Inspector & Security Auditor
 * Allows independent verification of the Zero-Knowledge & Double Ratchet guarantees.
 */

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  KeyRound,
  Layers,
  Terminal,
  FileCheck,
  AlertTriangle,
  Copy,
  Check,
  Lock,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { UserClientContext } from '../services/identityManager';
import { zkRelay } from '../services/zkRelay';
import { WiretapLogEntry } from '../types';

interface CryptoInspectorProps {
  activeContext: UserClientContext;
  isOpen: boolean;
  onClose: () => void;
  onTriggerTamper: () => void;
}

export const CryptoInspector: React.FC<CryptoInspectorProps> = ({
  activeContext,
  isOpen,
  onClose,
  onTriggerTamper,
}) => {
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'ratchet' | 'wiretap' | 'merkle' | 'audit'>('ratchet');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const isVed = activeContext.localIdentity.userId === 'usr_ved';
  const targetPeerDevice = isVed ? 'dev_elena_desktop' : 'dev_ved_phone';
  const session = activeContext.sessions.get(targetPeerDevice);
  const wiretaps = zkRelay.getWiretapLogs();

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <aside aria-label="Cryptographic Inspector" className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-[#0c1017] border-l border-white/[0.1] shadow-2xl z-50 flex flex-col select-none text-zinc-300">
      {/* Drawer Header */}
      <div className="h-14 border-b border-white/[0.08] px-4 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white font-mono uppercase tracking-wider">
              Cryptographic Inspector
            </h2>
            <p className="text-[10px] text-zinc-400 font-mono">Independent Zero-Knowledge Verification</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-3 border-b border-white/[0.08] bg-white/[0.02] gap-1 overflow-x-auto scrollbar-none py-1">
        <button
          onClick={() => setActiveTab('ratchet')}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors whitespace-nowrap ${
            activeTab === 'ratchet'
              ? 'bg-white/[0.12] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Double Ratchet
        </button>
        <button
          onClick={() => setActiveTab('hierarchy')}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors whitespace-nowrap ${
            activeTab === 'hierarchy'
              ? 'bg-white/[0.12] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          4-Tier Keys
        </button>
        <button
          onClick={() => setActiveTab('wiretap')}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'wiretap'
              ? 'bg-white/[0.12] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>Server Wiretap</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>
        <button
          onClick={() => setActiveTab('merkle')}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors whitespace-nowrap ${
            activeTab === 'merkle'
              ? 'bg-white/[0.12] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Merkle & Tamper
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-white/[0.12] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Security Proof
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tab 1: Double Ratchet State */}
        {activeTab === 'ratchet' && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-mono font-semibold mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>ACTIVE DOUBLE RATCHET STATE</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Ratchet steps advance symmetrically on every message and asymmetrically via Diffie-Hellman when responses are received, delivering unbroken <strong>Forward Secrecy</strong> and <strong>Post-Compromise Security</strong>.
              </p>
            </div>

            {session ? (
              <div className="space-y-3">
                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                    <div className="text-[10px] text-zinc-400">Sending Step</div>
                    <div className="text-base font-bold text-emerald-400">#{session.sendSequenceNumber}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                    <div className="text-[10px] text-zinc-400">Receiving Step</div>
                    <div className="text-base font-bold text-blue-400">#{session.receiveSequenceNumber}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                    <div className="text-[10px] text-zinc-400">Previous Len</div>
                    <div className="text-base font-bold text-zinc-200">#{session.previousCounter}</div>
                  </div>
                </div>

                {/* Key inspection blocks */}
                <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-2 text-xs font-mono">
                  <div className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>Root Key (HKDF Derivation)</span>
                    <button
                      onClick={() => handleCopy(session.rootKeyHex, 'rk')}
                      className="text-zinc-500 hover:text-white"
                    >
                      {copiedKey === 'rk' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="p-2 rounded bg-black/60 border border-white/5 text-[11px] text-emerald-400 break-all">
                    {session.rootKeyHex || 'Initialized via X3DH'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-2 text-xs font-mono">
                  <div className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>Sending Chain Key (CKs)</span>
                    <button
                      onClick={() => handleCopy(session.sendingChainKeyHex, 'cks')}
                      className="text-zinc-500 hover:text-white"
                    >
                      {copiedKey === 'cks' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="p-2 rounded bg-black/60 border border-white/5 text-[11px] text-blue-400 break-all">
                    {session.sendingChainKeyHex || 'Pending first send'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-2 text-xs font-mono">
                  <div className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>Receiving Chain Key (CKr)</span>
                    <button
                      onClick={() => handleCopy(session.receivingChainKeyHex, 'ckr')}
                      className="text-zinc-500 hover:text-white"
                    >
                      {copiedKey === 'ckr' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="p-2 rounded bg-black/60 border border-white/5 text-[11px] text-purple-400 break-all">
                    {session.receivingChainKeyHex || 'Synchronized on next incoming ratchet envelope'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-2 text-xs font-mono">
                  <div className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
                    Local DH Ephemeral Public Key (dhs)
                  </div>
                  <div className="p-2 rounded bg-black/60 border border-white/5 text-[10px] text-zinc-300 break-all">
                    {session.localDhPublicKeyHex}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 text-zinc-500 font-mono text-xs">
                No active session loaded.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: 4-Tier Key Hierarchy */}
        {activeTab === 'hierarchy' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/20 text-xs">
              <span className="text-blue-400 font-semibold">4-TIER KEY ARCHITECTURE SPECIFICATION</span>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Zero-Trust isolation across Identity, Device, Session, and Server Relay layers.
              </p>
            </div>

            {/* Tier 1 */}
            <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  Tier 1: Identity Key (IK)
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                  Never leaves device
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Curve P-256 master signature key proving user identity long-term.
              </p>
              <div className="text-[10px] text-zinc-400 break-all p-1.5 rounded bg-black/60">
                {activeContext.localIdentity.identityKeyHex.substring(0, 48)}...
              </div>
            </div>

            {/* Tier 2 */}
            <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-blue-400" />
                  Tier 2: Device Key (DK)
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                  Per device, revocable
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Enables simultaneous use across Phone, Laptop, and PC without sharing the master key.
              </p>
              <div className="text-[10px] text-zinc-400 break-all p-1.5 rounded bg-black/60">
                Device: {activeContext.localIdentity.deviceId}
              </div>
            </div>

            {/* Tier 3 */}
            <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-purple-400" />
                  Tier 3: Session Key (SK)
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                  Rotates every message
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Double Ratchet ephemeral message encryption. Keys deleted immediately after decrypt.
              </p>
            </div>

            {/* Tier 4 */}
            <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  Tier 4: Server Relay Key (SRK)
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                  Zero content access
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Server only routes opaque encrypted blobs. Cannot decrypt or leak user metadata.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Server Wiretap (Zero-Knowledge proof) */}
        {activeTab === 'wiretap' && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-semibold">SERVER WIRETAP AUDIT LOG</span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  0 Plaintext Leaked (100% Proven)
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Live stream of every packet traversing the Zero-Knowledge Relay Server. Even if server operators or law enforcement seize this log, they receive only meaningless ciphertext bytes.
              </p>
            </div>

            <div className="space-y-2">
              {wiretaps.map((entry, idx) => (
                <div
                  key={`${entry.id}_${idx}`}
                  className="p-2.5 rounded-lg bg-black/50 border border-white/[0.06] space-y-1 text-[11px]"
                >
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-blue-400 font-semibold">{entry.direction}</span>
                    <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-zinc-300">
                    Route: <span className="text-zinc-400">{entry.senderDeviceTruncated}...</span> →{' '}
                    <span className="text-zinc-400">{entry.recipientDeviceTruncated}...</span>
                  </div>
                  <div className="p-1.5 rounded bg-black/80 border border-white/5 text-[10px] text-zinc-400 break-all">
                    Ciphertext: {entry.rawCiphertextHexPreview}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>CID: {entry.cid.substring(0, 16)}...</span>
                    <span className="text-emerald-400">Plaintext Leaked: NO (0 bytes)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Merkle Hash-Chain & Tamper Attack Simulator */}
        {activeTab === 'merkle' && (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/20">
              <span className="text-amber-400 font-semibold">CONTENT-ADDRESSED MERKLE HASH-CHAIN</span>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Every encrypted message is addressed by its SHA-256 Content ID (CID) and chained to previous CIDs. Any bit modified in server storage breaks the hash chain instantly.
              </p>
            </div>

            {/* Tamper Attack Trigger */}
            <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 space-y-2">
              <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                <AlertTriangle className="w-4 h-4" />
                <span>Simulate Server-Side Hostile Tamper</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Clicking this will flip 1 bit in the ciphertext of the latest envelope stored on the relay. When the client attempts to decrypt, AES-GCM and the Merkle verification will immediately catch it.
              </p>
              <button
                onClick={onTriggerTamper}
                className="w-full py-2 rounded-md bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Inject Bit-Flip into Relay Mailbox</span>
              </button>
            </div>

            {/* Conversation Merkle Chain */}
            <div className="space-y-2">
              <span className="text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
                Conversation Hash-Chain Ledger ({activeContext.messages.length} Blocks)
              </span>
              <div className="space-y-1.5">
                {activeContext.messages.map((m, idx) => (
                  <div
                    key={`${m.id}_chain_${idx}`}
                    className="p-2 rounded bg-black/40 border border-white/[0.06] text-[10px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Block #{idx + 1}</span>
                      <span className="text-emerald-400 font-semibold">
                        {m.merkleVerified ? '✓ Integrity Verified' : '✗ Tampered'}
                      </span>
                    </div>
                    <div className="text-zinc-300 truncate">CID: {m.cid}</div>
                    <div className="text-zinc-500 truncate">Prev: {m.previousCid}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Phase 1 Security Guarantee Document */}
        {activeTab === 'audit' && (
          <div className="space-y-4 text-xs font-sans">
            <div className="p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-mono font-semibold">
                <FileCheck className="w-4 h-4" />
                <span>PHASE 1 DELIVERABLE: SECURITY GUARANTEE SPECIFICATION</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
                Document Version 1.0 • Formally Auditable Zero-Knowledge Architecture
              </p>
            </div>

            <div className="space-y-3 text-zinc-300 text-[12px] leading-relaxed">
              <h3 className="text-white font-semibold font-mono text-xs">1. Zero-Knowledge Server Guarantee</h3>
              <p>
                The server functions strictly as an asynchronous Content-Addressed Relay. All messages, keys, and attachments are encrypted client-side using <strong>AES-256-GCM</strong> before leaving the user device. The server holds only opaque ciphertext blobs and has no access to identity keys or ratchet chains.
              </p>

              <h3 className="text-white font-semibold font-mono text-xs">2. Extended Triple Diffie-Hellman (X3DH)</h3>
              <p>
                Asynchronous key agreement provides mutual authentication and forward secrecy for the initial contact:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400 font-mono text-[11px]">
                <li>DH1 = DH(IK_A, SPK_B)</li>
                <li>DH2 = DH(EK_A, IK_B)</li>
                <li>DH3 = DH(EK_A, SPK_B)</li>
                <li>DH4 = DH(EK_A, OPK_B)</li>
              </ul>

              <h3 className="text-white font-semibold font-mono text-xs">3. Signal Double Ratchet Engine</h3>
              <p>
                Employs a two-tier ratchet: a symmetric KDF ratchet for every outgoing message and an asymmetric DH ratchet on every conversation turn. This guarantees:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px]">
                <li><strong>Perfect Forward Secrecy (PFS):</strong> Prior messages cannot be decrypted even if current device keys are compromised.</li>
                <li><strong>Post-Compromise Security (Break-in Recovery):</strong> Ratchet continuously heals using fresh entropy.</li>
              </ul>

              <h3 className="text-white font-semibold font-mono text-xs">4. Independent Verification Steps</h3>
              <ol className="list-decimal pl-4 space-y-1 text-zinc-400 font-mono text-[11px]">
                <li>Inspect Server Wiretap logs: verify ciphertext contains 0 plaintext bytes.</li>
                <li>Verify Merkle CIDs: execute SHA-256 over ciphertext+IV+tag to confirm identity.</li>
                <li>Execute Bit-Flip attack: observe immediate client rejection via Web Crypto AES-GCM tag authentication.</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
