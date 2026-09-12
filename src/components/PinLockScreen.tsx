/**
 * NEXUS - Security PIN Lock Screen (App Lock)
 * Displayed whenever user returns or locks the app.
 * Supports 4 or 6 digit PIN, numeric keypad, keyboard input,
 * and seamless fallback to password / 12-word recovery phrase.
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Delete, KeyRound, AlertTriangle, UserCheck, RefreshCw } from 'lucide-react';
import { authService, UserAccount } from '../services/authService';

interface PinLockScreenProps {
  account: UserAccount;
  onUnlocked: () => void;
  onOpenRecovery: () => void;
  onSwitchAccount: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  account,
  onUnlocked,
  onOpenRecovery,
  onSwitchAccount,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const pinLength = account.pinLength || 4;

  const currentDevice =
    account.devices.find((d) => d.deviceId === account.activeDeviceId) || account.devices[0];

  const handleDigit = (digit: string) => {
    if (pin.length < pinLength) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === pinLength) {
        verify(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const verify = async (pinToVerify: string) => {
    setIsVerifying(true);
    setError(null);
    try {
      const success = await authService.unlockWithPin(pinToVerify);
      if (success) {
        onUnlocked();
      } else {
        setError('Incorrect Security PIN. Please try again.');
        setPin('');
      }
    } catch {
      setError('Cryptographic verification failed.');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  };

  // Listen to physical keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, pinLength]);

  return (
    <div className="fixed inset-0 z-50 bg-[#090d14] flex items-center justify-center p-4 select-none">
      {/* Subtle atmospheric background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      <div className="relative w-full max-w-sm rounded-2xl bg-[#0e1420]/90 border border-white/[0.08] shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center">
        {/* Enclave Lock Icon */}
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
          <Lock className="w-7 h-7" />
        </div>

        {/* User Identity Banner */}
        <h2 className="text-lg font-semibold text-white tracking-wide">
          {account.fullName}
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">{account.email}</p>

        {/* Device & IP Telemetry Pill */}
        {currentDevice && (
          <div className="mt-3 px-3 py-1 rounded-full bg-black/40 border border-white/[0.06] text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-300">{currentDevice.deviceName}</span>
            <span className="text-zinc-500">•</span>
            <span className="text-emerald-400">{currentDevice.ipAddress}</span>
          </div>
        )}

        <div className="my-6">
          <p className="text-xs text-zinc-400 uppercase tracking-wider font-mono mb-3">
            Enter {pinLength}-Digit Security PIN
          </p>

          {/* PIN Dots Indicator */}
          <div className="flex items-center justify-center gap-3">
            {Array.from({ length: pinLength }).map((_, i) => {
              const filled = i < pin.length;
              return (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    filled
                      ? 'bg-emerald-400 shadow-md shadow-emerald-400/40 scale-110'
                      : 'bg-white/[0.1] border border-white/[0.15]'
                  }`}
                />
              );
            })}
          </div>

          {error && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-rose-400 animate-shake font-mono">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              disabled={isVerifying}
              className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-emerald-500/20 active:border-emerald-500/40 border border-white/[0.06] text-lg font-medium text-white transition-colors flex items-center justify-center"
            >
              {digit}
            </button>
          ))}

          {/* Bottom row: Clear, 0, Backspace */}
          <button
            onClick={handleClear}
            className="h-12 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-xs font-mono text-zinc-400 transition-colors flex items-center justify-center"
            title="Clear"
          >
            Clear
          </button>

          <button
            onClick={() => handleDigit('0')}
            disabled={isVerifying}
            className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-emerald-500/20 active:border-emerald-500/40 border border-white/[0.06] text-lg font-medium text-white transition-colors flex items-center justify-center"
          >
            0
          </button>

          <button
            onClick={handleDelete}
            className="h-12 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center"
            title="Backspace"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Footer Actions: Forgot PIN & Switch Account */}
        <div className="mt-6 pt-4 border-t border-white/[0.06] w-full flex flex-col gap-2">
          <button
            onClick={onOpenRecovery}
            className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors flex items-center justify-center gap-1.5 font-mono"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Forgot PIN? Recover with Password or Phrase</span>
          </button>

          <button
            onClick={onSwitchAccount}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <UserCheck className="w-3 h-3" />
            <span>Switch or Create New Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};
