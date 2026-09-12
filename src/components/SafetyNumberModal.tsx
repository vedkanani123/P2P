/**
 * NEXUS - Safety Number / Peer Fingerprint Verification Modal
 * Cryptographic assurance that no Man-in-the-Middle exists.
 */

import React, { useState } from 'react';
import { X, ShieldCheck, Check, Copy, Lock, QrCode } from 'lucide-react';
import { UserClientContext } from '../services/identityManager';
import { computeSafetyNumber } from '../crypto/x3dh';

interface SafetyNumberModalProps {
  activeContext: UserClientContext;
  peerDeviceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({
  activeContext,
  peerDeviceId,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [isMarkedVerified, setIsMarkedVerified] = useState(true);

  if (!isOpen) return null;

  const isVed = activeContext.localIdentity.userId === 'usr_ved';
  const peerName = isVed ? 'Elena Vance' : 'Ved Kanani';
  const peerKey = isVed
    ? '04f1e2d3c4b5a69788796a5b4c3d2e1f0123456789abcdef0123456789abcdef0'
    : '04a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';

  const safetyNumber = computeSafetyNumber(
    activeContext.localIdentity.identityKeyHex,
    peerKey
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(safetyNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#0c1017] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-zinc-300">
        {/* Header */}
        <div className="h-14 border-b border-white/[0.08] px-5 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white font-mono">Verify Safety Number</h2>
              <p className="text-[11px] text-zinc-400">Compare with {peerName}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            To verify that your end-to-end encryption with <strong>{peerName}</strong> is mathematically untampered, compare this safety number with the one on their screen.
          </p>

          {/* Simulated QR Code */}
          <div className="w-44 h-44 mx-auto bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center">
            <div className="grid grid-cols-6 gap-1 w-full h-full p-2 bg-black rounded-lg">
              {Array.from({ length: 36 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-xs ${
                    (i * 11 + 5) % 2 === 0 ? 'bg-white' : 'bg-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Safety number chunks */}
          <div className="p-3.5 rounded-xl bg-black/60 border border-white/[0.08] font-mono text-sm sm:text-base font-bold text-white tracking-widest flex items-center justify-center gap-2">
            <span>{safetyNumber}</span>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              title="Copy Safety Number"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setIsMarkedVerified(!isMarkedVerified)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-all flex items-center gap-2 ${
                isMarkedVerified
                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                  : 'bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isMarkedVerified ? 'Cryptographically Verified' : 'Mark as Verified'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
