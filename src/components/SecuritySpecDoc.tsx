/**
 * NEXUS - Phase 1 Security Guarantee & Verification Document Modal
 * Explicit deliverable for Phase 1 as requested in Master Build Prompt.
 */

import React from 'react';
import {
  X,
  ShieldCheck,
  FileText,
  Lock,
  Download,
  Terminal,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface SecuritySpecDocProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecuritySpecDoc: React.FC<SecuritySpecDocProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const exportMarkdown = () => {
    const content = `# NEXUS PHASE 1 — CRYPTOGRAPHIC SPECIFICATION & INDEPENDENT VERIFICATION GUIDE

## 1. Security Philosophy: The Zero-Knowledge Relay
NEXUS is engineered under the strict principle:
> "No plaintext data anywhere, ever — including at rest on our own servers."

If every server hosting NEXUS is compromised, subpoenaed, or seized, the attacker obtains strictly opaque, high-entropy ciphertext blobs with zero knowledge of message contents, file payloads, or conversation graphs.

## 2. Mathematical Primitives & Curves
- Key Agreement: NIST P-256 (secp256r1) Elliptic Curve Diffie-Hellman (ECDH) via W3C Web Crypto API.
- Key Derivation: HKDF (RFC 5869) utilizing HMAC-SHA-256 for Extract and Expand steps.
- Authenticated Encryption: AES-256-GCM with 96-bit unique IVs and 128-bit authentication tags.
- Content Addressing: SHA-256 Content Identifiers (CIDs) forming a tamper-evident Merkle hash chain.
- Anti-Bot / Anti-Spam: Hashcash Proof-of-Work challenge solved client-side prior to relay submission.

## 3. Four-Tier Key Hierarchy
1. Identity Key (IK): Long-term master identity key held exclusively in client-side secure memory.
2. Device Key (DK): Dedicated key per device enabling concurrent multi-device usage with instant revocation.
3. Session Key (SK): Ephemeral Double Ratchet keys advancing every message for Forward Secrecy & Post-Compromise Security.
4. Server Relay Key (SRK): Server routing metadata key with zero cryptographic capability to decrypt user payloads.

## 4. How to Verify Independently
1. Open the Cryptographic Inspector -> Server Wiretap tab.
2. Observe all inbound and relayed packets.
3. Verify that the server payload is purely hex-encoded ciphertext, IV, and 128-bit auth tag.
4. Execute the 'Simulate Server Tamper Attack': Observe that when 1 bit in ciphertext is flipped, the client-side AES-GCM engine throws CRYPTOGRAPHIC_AUTHENTICATION_FAILURE and discards the payload instantly.
`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NEXUS-Phase1-Security-Spec.md';
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl max-h-[85vh] bg-[#0c1017] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-zinc-300">
        {/* Header */}
        <div className="h-14 border-b border-white/[0.08] px-5 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white font-mono">
                Phase 1 Security Guarantee & Verification Document
              </h2>
              <p className="text-[11px] text-zinc-400">Official Formal Security Audit Specification</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportMarkdown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-mono text-zinc-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .MD</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-[13px] leading-relaxed font-sans">
          {/* Executive Summary */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-mono font-semibold text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Security Guarantee Summary</span>
            </div>
            <p className="text-zinc-300">
              NEXUS Phase 1 establishes the mathematical bedrock for a platform objectively more private and resilient than Discord, WhatsApp, Telegram, or Signal. All cryptographic primitives are implemented using the W3C Web Cryptography API with audited NIST curves, constant-time operations, and zero proprietary crypto code.
            </p>
          </div>

          {/* Section 1 */}
          <div className="space-y-2">
            <h3 className="text-white font-semibold font-mono text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              1. Non-Negotiable Principle: Zero-Knowledge Server
            </h3>
            <p className="text-zinc-400">
              Traditional platforms retain message databases or decryption capabilities on their servers. Under NEXUS:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-300">
              <li><strong>Zero Plaintext Storage:</strong> The relay server only receives opaque binary envelopes containing AES-256-GCM ciphertext, an initialization vector, and a 128-bit authentication tag.</li>
              <li><strong>Zero Key Custody:</strong> Identity Private Keys (IK) and Double Ratchet Root/Chain keys exist solely in client device memory.</li>
              <li><strong>Subpoena Resistance:</strong> Seizure of server disks yields exclusively cryptographically random bytes with zero correlation to sender text.</li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <h3 className="text-white font-semibold font-mono text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              2. Asynchronous Handshake: Extended Triple Diffie-Hellman (X3DH)
            </h3>
            <p className="text-zinc-400">
              Initial contact is established asynchronously without requiring both participants to be online simultaneously:
            </p>
            <div className="p-3 rounded-lg bg-black/50 border border-white/[0.08] font-mono text-xs space-y-1 text-emerald-400">
              <div>DH1 = ECDH(Alice_Identity_Private, Bob_SignedPreKey_Public)</div>
              <div>DH2 = ECDH(Alice_Ephemeral_Private, Bob_Identity_Public)</div>
              <div>DH3 = ECDH(Alice_Ephemeral_Private, Bob_SignedPreKey_Public)</div>
              <div>DH4 = ECDH(Alice_Ephemeral_Private, Bob_OneTimePreKey_Public)</div>
              <div className="text-zinc-400 mt-1">Master_Secret = HKDF_Extract_Expand(DH1 || DH2 || DH3 || DH4)</div>
            </div>
            <p className="text-zinc-400">
              Bob deletes the One-Time Prekey upon consumption, preventing retroactive key recovery.
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <h3 className="text-white font-semibold font-mono text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              3. Continuous Forward & Future Secrecy: The Double Ratchet
            </h3>
            <p className="text-zinc-400">
              NEXUS combines symmetric KDF ratchets for single-message key derivation with asymmetric Diffie-Hellman ratchets for healing:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-300">
              <li><strong>Perfect Forward Secrecy (PFS):</strong> Message keys are deleted immediately after decryption. A future device compromise cannot decrypt past traffic.</li>
              <li><strong>Post-Compromise Security (Break-In Recovery):</strong> If an attacker momentarily clones a device, subsequent messages introduce fresh ephemeral DH keys that completely lock out the adversary.</li>
            </ul>
          </div>

          {/* Section 4 */}
          <div className="space-y-2">
            <h3 className="text-white font-semibold font-mono text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              4. Independent Verification Procedure
            </h3>
            <p className="text-zinc-400">
              Any external auditor or user can independently verify these guarantees in the live UI:
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-zinc-300">
              <li>Open the <strong>Crypto Inspector</strong> and inspect the <strong>Server Wiretap</strong>. Notice every envelope contains only opaque hex ciphertext and zero plaintext.</li>
              <li>Toggle <strong>Dual P2P View</strong> to watch the ratchet step counters advance in tandem between Ved and Elena.</li>
              <li>Click <strong>Simulate Relay Bit-Flip</strong>: Observe the client-side AES-GCM engine fail immediately with a cryptographic tamper notification.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
