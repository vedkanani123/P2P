import React, { useState } from 'react';
import {
  ShieldAlert,
  KeyRound,
  Cpu,
  Globe,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowRight,
  LogOut,
  Eye,
  EyeOff,
} from 'lucide-react';
import { authService, UserAccount } from '../services/authService';

interface SessionVerificationModalProps {
  account: UserAccount;
  onVerified: () => void;
  onSwitchAccount: () => void;
}

export const SessionVerificationModal: React.FC<SessionVerificationModalProps> = ({
  account,
  onVerified,
  onSwitchAccount,
}) => {
  const [authMode, setAuthMode] = useState<'password' | 'phrase'>('password');
  const [credentialInput, setCredentialInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const detectedTelemetry = authService.getDetectedTelemetry();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentialInput.trim()) {
      setErrorMessage(
        authMode === 'password'
          ? 'Please enter your Master Account Password.'
          : 'Please enter your 12-Word Secret Recovery Phrase.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await authService.verifySessionWithCredentials(credentialInput.trim());
      if (result.success) {
        onVerified();
      } else {
        setErrorMessage(result.error || 'Verification failed: Invalid credentials.');
      }
    } catch {
      setErrorMessage('Verification failed due to an unexpected cryptographic error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="nexus-session-verification-overlay"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="nexus-session-verification-card"
        className="w-full max-w-lg bg-[#0d1117] border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-950/20 overflow-hidden flex flex-col my-auto"
      >
        {/* Security Warning Header Banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold font-mono tracking-wider text-amber-300 uppercase">
                Session Verification Required
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Hardware Enclave Check
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Unrecognized browser signature or altered hardware headers detected
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Detailed Security Notice */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 space-y-1.5 leading-relaxed">
            <div className="flex items-center gap-2 text-zinc-200 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Zero-Knowledge Session Guard Active</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              The cryptographic hardware fingerprint or network IP of this browser session does not match
              the registered metadata for <strong className="text-zinc-200">{account.fullName}</strong> ({account.email}).
              To prevent unauthorized cross-browser access, verify your credentials to decrypt the vault and authorize this device.
            </p>
          </div>

          {/* Telemetry Telemetry Breakdown */}
          {detectedTelemetry && (
            <div className="bg-black/40 border border-white/[0.06] rounded-xl p-3.5 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Detected Browser Environment</span>
                <span className="text-amber-400 font-mono text-[9px]">Unverified Enclave</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="text-zinc-500 text-[10px] flex items-center gap-1 mb-0.5">
                    <Globe className="w-3 h-3 text-zinc-400" />
                    <span>Public IP</span>
                  </div>
                  <div className="text-zinc-200 truncate">{detectedTelemetry.ipAddress}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="text-zinc-500 text-[10px] flex items-center gap-1 mb-0.5">
                    <Monitor className="w-3 h-3 text-zinc-400" />
                    <span>OS / Platform</span>
                  </div>
                  <div className="text-zinc-200 truncate">{detectedTelemetry.os}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] col-span-2">
                  <div className="text-zinc-500 text-[10px] flex items-center gap-1 mb-0.5">
                    <Cpu className="w-3 h-3 text-zinc-400" />
                    <span>Device Fingerprint</span>
                  </div>
                  <div className="text-emerald-400 font-mono text-[10px] truncate">
                    {detectedTelemetry.fingerprint}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Verification Method Switcher */}
          <div>
            <div className="flex border border-zinc-800 rounded-xl p-1 bg-black/40 mb-3">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('password');
                  setErrorMessage('');
                  setCredentialInput('');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono transition-all flex items-center justify-center gap-1.5 ${
                  authMode === 'password'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Master Password</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('phrase');
                  setErrorMessage('');
                  setCredentialInput('');
                }}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono transition-all flex items-center justify-center gap-1.5 ${
                  authMode === 'phrase'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>12-Word Recovery Phrase</span>
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleVerify} className="space-y-3">
              {authMode === 'password' ? (
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                    Account Master Password
                  </label>
                  <div className="relative">
                    <input
                      id="nexus-session-verify-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={credentialInput}
                      onChange={(e) => setCredentialInput(e.target.value)}
                      placeholder="Enter master password..."
                      autoFocus
                      className="w-full px-3 py-2.5 bg-black/60 border border-zinc-800 focus:border-amber-500/60 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 outline-none font-mono pr-10 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                    12-Word Secret Recovery Phrase
                  </label>
                  <textarea
                    id="nexus-session-verify-phrase-input"
                    rows={3}
                    value={credentialInput}
                    onChange={(e) => setCredentialInput(e.target.value)}
                    placeholder="abandon ability able about above absent absorb abstract access accident account accuse"
                    autoFocus
                    className="w-full px-3 py-2 bg-black/60 border border-zinc-800 focus:border-amber-500/60 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600 outline-none font-mono resize-none leading-relaxed transition-colors"
                  />
                </div>
              )}

              <button
                id="nexus-session-verify-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-[0.99] text-black font-semibold text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Cryptographic Credentials...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Authorize Hardware & Decrypt Vault</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-black/30 border-t border-zinc-800/80 px-6 py-3 flex items-center justify-between text-xs">
          <span className="text-[11px] font-mono text-zinc-500">
            Account: <strong className="text-zinc-400">{account.email}</strong>
          </span>
          <button
            type="button"
            onClick={onSwitchAccount}
            className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3 h-3 text-zinc-500" />
            <span>Switch Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};
