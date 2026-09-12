/**
 * NEXUS - Complete Authentication, Onboarding & Recovery Flow
 * 1. Create Account: Name, Second Name, Full Name, Email, Password, Confirm Password
 * 2. Create Security PIN: 4 or 6 Digits choice
 * 3. Secret Recovery Phrase: 12-word mnemonic with Download TXT backup & Copy
 * 4. Sign In: Password or PIN
 * 5. Account Recovery: Password + PIN reset OR Master 12-Word Secret Phrase
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Download,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Smartphone,
  Laptop,
  KeyRound,
  FileText,
  User,
  RefreshCw,
  X,
  Fingerprint,
} from 'lucide-react';
import {
  authService,
  generate12WordRecoveryPhrase,
  downloadRecoveryKeyFile,
  UserAccount,
} from '../services/authService';
import { collectCurrentDeviceTelemetry, DeviceTelemetry } from '../services/deviceDetector';

type AuthViewMode = 'login' | 'register_details' | 'register_pin' | 'register_phrase' | 'recovery';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess: (account: UserAccount) => void;
  initialMode?: 'login' | 'register' | 'recovery';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
}) => {
  const [viewMode, setViewMode] = useState<AuthViewMode>(
    initialMode === 'register' ? 'register_details' : initialMode === 'recovery' ? 'recovery' : 'login'
  );

  // Form State: Register Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form State: Register Step 2 (PIN)
  const [pinLength, setPinLength] = useState<4 | 6>(4);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Form State: Register Step 3 (12-Word Secret Phrase)
  const [generatedPhrase, setGeneratedPhrase] = useState('');
  const [hasCopiedPhrase, setHasCopiedPhrase] = useState(false);
  const [hasDownloadedFile, setHasDownloadedFile] = useState(false);
  const [userConfirmedPhraseSaved, setUserConfirmedPhraseSaved] = useState(false);

  // Form State: Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Form State: Recovery
  const [recoveryMode, setRecoveryMode] = useState<'phrase' | 'password'>('phrase');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhraseInput, setRecoveryPhraseInput] = useState('');
  const [recoveryCurrentPassword, setRecoveryCurrentPassword] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryNewPin, setRecoveryNewPin] = useState('');
  const [recoveryNewPinLength, setRecoveryNewPinLength] = useState<4 | 6>(4);

  // Device Telemetry preview
  const [deviceTelemetry, setDeviceTelemetry] = useState<DeviceTelemetry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-fill full name when first and last name change
  useEffect(() => {
    if (firstName || lastName) {
      setFullName(`${firstName.trim()} ${lastName.trim()}`.trim());
    }
  }, [firstName, lastName]);

  // Fetch telemetry on mount
  useEffect(() => {
    collectCurrentDeviceTelemetry().then((t) => setDeviceTelemetry(t));
  }, []);

  // Sync mode if changed from outside
  useEffect(() => {
    if (initialMode === 'register') setViewMode('register_details');
    else if (initialMode === 'recovery') setViewMode('recovery');
    else setViewMode('login');
  }, [initialMode]);

  if (!isOpen) return null;

  // Handle Step 1: Validate details and check email availability on server
  const handleProceedToPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }
    if (!lastName.trim()) {
      setError('Please enter your second/last name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Master password must be at least 8 characters for zero-knowledge key derivation.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your confirmation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isAvailable = await authService.checkEmailAvailability(email.trim());
      if (!isAvailable) {
        setError('This email address is already registered on the network. Please choose a different email or sign in.');
        setIsSubmitting(false);
        return;
      }
    } catch {
      // offline fallback
    } finally {
      setIsSubmitting(false);
    }

    // Advance to Step 2
    setViewMode('register_pin');
  };

  // Handle Step 2: Validate PIN and generate 12-word recovery phrase
  const handleProceedToPhrase = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length !== pinLength || !/^\d+$/.test(pin)) {
      setError(`Please enter a valid ${pinLength}-digit numeric PIN.`);
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }

    // Generate fresh 12 words
    const phrase = generate12WordRecoveryPhrase();
    setGeneratedPhrase(phrase);
    setViewMode('register_phrase');
  };

  // Handle Copy Phrase
  const handleCopyPhrase = () => {
    navigator.clipboard.writeText(generatedPhrase);
    setHasCopiedPhrase(true);
    setTimeout(() => setHasCopiedPhrase(false), 3000);
  };

  // Handle Download File
  const handleDownloadFile = () => {
    downloadRecoveryKeyFile({
      fullName: fullName || `${firstName} ${lastName}`,
      email,
      recoveryPhrase: generatedPhrase,
      accountId: 'usr_init',
    });
    setHasDownloadedFile(true);
  };

  // Handle Final Registration Submit
  const handleFinalRegister = async () => {
    setError(null);
    if (!userConfirmedPhraseSaved && !hasDownloadedFile) {
      setError('Please download or confirm you have securely stored your recovery phrase.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newAcc = await authService.registerAccount({
        firstName,
        lastName,
        fullName,
        email,
        password,
        pin,
        pinLength,
        phrase: generatedPhrase,
      });
      onSuccess(newAcc);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const success = await authService.loginWithPassword(loginEmail, loginPassword);
      if (success) {
        const acc = authService.getAccount();
        if (acc) onSuccess(acc);
      } else {
        setError('Invalid email or password. You can also recover your account using your secret phrase.');
      }
    } catch {
      setError('Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Recovery Submit
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (recoveryMode === 'phrase') {
        if (!recoveryPhraseInput.trim()) {
          setError('Please provide your 12-word secret recovery phrase.');
          setIsSubmitting(false);
          return;
        }
        if (recoveryNewPassword.length < 8) {
          setError('New password must be at least 8 characters.');
          setIsSubmitting(false);
          return;
        }
        if (recoveryNewPin.length !== recoveryNewPinLength) {
          setError(`New PIN must be exactly ${recoveryNewPinLength} digits.`);
          setIsSubmitting(false);
          return;
        }

        const res = await authService.recoverWithPhrase({
          email: recoveryEmail,
          recoveryPhrase: recoveryPhraseInput,
          newPassword: recoveryNewPassword,
          newPin: recoveryNewPin,
          newPinLength: recoveryNewPinLength,
        });

        if (res.success) {
          const acc = authService.getAccount();
          if (acc) onSuccess(acc);
        } else {
          setError(res.error || 'Recovery failed.');
        }
      } else {
        // Recover with current password
        const res = await authService.resetPinWithPassword({
          password: recoveryCurrentPassword,
          newPin: recoveryNewPin,
          newPinLength: recoveryNewPinLength,
        });

        if (res.success) {
          const acc = authService.getAccount();
          if (acc) onSuccess(acc);
        } else {
          setError(res.error || 'PIN reset failed.');
        }
      }
    } catch {
      setError('An unexpected error occurred during account recovery.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0e1420] border border-white/[0.08] shadow-2xl p-6 sm:p-8 my-6 text-zinc-200">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Top Branding Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-wide flex items-center gap-2 font-mono">
              NEXUS IDENTITY VAULT
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                E2EE Production
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Zero-Knowledge End-to-End Cryptographic Enclave
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 font-mono">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* VIEW 1: SIGN IN */}
        {viewMode === 'login' && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Sign In to Your Enclave</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Unlock your device-bound cryptographic keys and private messaging.
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1">
                  Registered Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@nexus.sec"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1">
                  Master Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your master password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60 transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isSubmitting ? 'Verifying & Unlocking...' : 'Sign In to Account'}</span>
                </button>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setError(null);
                  setViewMode('recovery');
                }}
                className="text-zinc-400 hover:text-emerald-400 transition-colors font-mono"
              >
                Forgot Password or PIN?
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setViewMode('register_details');
                }}
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Create New Account →
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: REGISTER - STEP 1 (DETAILS) */}
        {viewMode === 'register_details' && (
          <div>
            <div className="mb-4">
              <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400 mb-1">
                <span>STEP 1 OF 3</span>
                <span>•</span>
                <span>ACCOUNT CREDENTIALS</span>
              </div>
              <h2 className="text-lg font-semibold text-white">Create Cryptographic Account</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                All credentials stay in your browser. We never transmit plaintext passwords.
              </p>
            </div>

            <form onSubmit={handleProceedToPin} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-zinc-300 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Ved"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-300 mb-1">Second Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Kanani"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1">
                  Full Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ved Kanani"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="vedkanani34@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-zinc-300 mb-1">Master Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-300 mb-1">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPassword ? 'Hide Passwords' : 'Show Passwords'}</span>
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <span>Next: Create Security PIN</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            <div className="mt-5 pt-3 border-t border-white/[0.06] text-center">
              <button
                onClick={() => {
                  setError(null);
                  setViewMode('login');
                }}
                className="text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Already have an account? <span className="text-emerald-400">Sign In</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: REGISTER - STEP 2 (PIN SETUP) */}
        {viewMode === 'register_pin' && (
          <div>
            <div className="mb-4">
              <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400 mb-1">
                <span>STEP 2 OF 3</span>
                <span>•</span>
                <span>APP LOCK SECURITY PIN</span>
              </div>
              <h2 className="text-lg font-semibold text-white">Set Up App Lock PIN</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Every time you return to the app, you will be prompted for this PIN to unlock your vault.
              </p>
            </div>

            <form onSubmit={handleProceedToPhrase} className="space-y-4">
              {/* Digit Length Selection */}
              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1.5">
                  Choose PIN Complexity
                </label>
                <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      setPinLength(4);
                      setPin('');
                      setConfirmPin('');
                    }}
                    className={`py-2 rounded-lg text-xs font-medium font-mono transition-colors ${
                      pinLength === 4
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    4-Digit Quick PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinLength(6);
                      setPin('');
                      setConfirmPin('');
                    }}
                    className={`py-2 rounded-lg text-xs font-medium font-mono transition-colors ${
                      pinLength === 6
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    6-Digit Ultra PIN
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1">
                  Enter {pinLength}-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={pinLength}
                  pattern="[0-9]*"
                  required
                  placeholder={`••••${pinLength === 6 ? '••' : ''}`}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-center text-lg tracking-widest text-white focus:outline-none focus:border-emerald-500/60 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1">
                  Confirm {pinLength}-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={pinLength}
                  pattern="[0-9]*"
                  required
                  placeholder={`••••${pinLength === 6 ? '••' : ''}`}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/[0.08] text-center text-lg tracking-widest text-white focus:outline-none focus:border-emerald-500/60 font-mono"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode('register_details')}
                  className="w-1/3 py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-mono transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <span>Next: Secret Recovery Key</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VIEW 2: REGISTER - STEP 3 (12-WORD SECRET PHRASE) */}
        {viewMode === 'register_phrase' && (
          <div>
            <div className="mb-4">
              <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400 mb-1">
                <span>STEP 3 OF 3</span>
                <span>•</span>
                <span>MASTER RECOVERY PHRASE</span>
              </div>
              <h2 className="text-lg font-semibold text-white">Backup Your Secret Recovery Phrase</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                This 12-word cryptographic seed is your <strong className="text-amber-300">ONLY</strong> way to recover your account if you forget your password or PIN.
              </p>
            </div>

            {/* Critical Loss Warning Box */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs mb-4 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Permanent Loss Warning:</strong> NEXUS has no customer service backdoor. If you lose this 12-word phrase, your account, encryption keys, and all messages will be permanently lost!
              </p>
            </div>

            {/* 12-Word Chip Grid */}
            <div className="p-3.5 rounded-xl bg-black/60 border border-white/[0.08] grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4 font-mono text-xs select-all">
              {generatedPhrase.split(' ').map((word, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-zinc-200"
                >
                  <span className="text-[10px] text-zinc-500">{idx + 1}.</span>
                  <span className="font-semibold text-emerald-300">{word}</span>
                </div>
              ))}
            </div>

            {/* Action buttons: Download file & Copy */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <button
                type="button"
                onClick={handleDownloadFile}
                className={`py-2.5 px-3 rounded-xl border text-xs font-mono transition-all flex items-center justify-center gap-2 ${
                  hasDownloadedFile
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-white border-white/[0.08]'
                }`}
              >
                {hasDownloadedFile ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4 text-emerald-400" />}
                <span>{hasDownloadedFile ? 'Key File Saved' : 'Download Key (.txt)'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyPhrase}
                className="py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-white transition-colors flex items-center justify-center gap-2"
              >
                {hasCopiedPhrase ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{hasCopiedPhrase ? 'Copied to Clipboard' : 'Copy All 12 Words'}</span>
              </button>
            </div>

            {/* Confirmation Checkbox */}
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-300 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={userConfirmedPhraseSaved}
                onChange={(e) => setUserConfirmedPhraseSaved(e.target.checked)}
                className="mt-0.5 rounded border-white/20 text-emerald-500 focus:ring-0 focus:outline-none"
              />
              <span>
                I have written down or downloaded my 12-word recovery phrase in a secure offline location. I understand that without this phrase, recovery is impossible.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setViewMode('register_pin')}
                className="w-1/3 py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-mono transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleFinalRegister}
                disabled={isSubmitting || (!userConfirmedPhraseSaved && !hasDownloadedFile)}
                className="w-2/3 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-black font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSubmitting ? 'Provisioning Keys...' : 'Finish & Activate Account'}</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: RECOVERY */}
        {viewMode === 'recovery' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Account & Vault Recovery</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Regain access to your encrypted communications using your recovery credentials.
              </p>
            </div>

            {/* Mode switch */}
            <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/[0.06] mb-4">
              <button
                type="button"
                onClick={() => setRecoveryMode('phrase')}
                className={`py-2 rounded-lg text-xs font-medium font-mono transition-colors ${
                  recoveryMode === 'phrase'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                12-Word Secret Phrase
              </button>
              <button
                type="button"
                onClick={() => setRecoveryMode('password')}
                className={`py-2 rounded-lg text-xs font-medium font-mono transition-colors ${
                  recoveryMode === 'password'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Reset PIN via Password
              </button>
            </div>

            <form onSubmit={handleRecoverySubmit} className="space-y-3.5">
              {recoveryMode === 'phrase' ? (
                <>
                  <div>
                    <label className="block text-xs font-mono text-zinc-300 mb-1">
                      Account Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="vedkanani34@gmail.com"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-300 mb-1">
                      12-Word Secret Recovery Phrase
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Paste your 12 recovery words separated by spaces..."
                      value={recoveryPhraseInput}
                      onChange={(e) => setRecoveryPhraseInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono text-zinc-300 mb-1">New Password</label>
                      <input
                        type="password"
                        required
                        placeholder="Min 8 chars"
                        value={recoveryNewPassword}
                        onChange={(e) => setRecoveryNewPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-zinc-300 mb-1">
                        New PIN ({recoveryNewPinLength} digits)
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={recoveryNewPinLength}
                        placeholder="New PIN"
                        value={recoveryNewPin}
                        onChange={(e) => setRecoveryNewPin(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white text-center font-mono focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-mono text-zinc-300 mb-1">
                      Current Master Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Enter your current password"
                      value={recoveryCurrentPassword}
                      onChange={(e) => setRecoveryCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white focus:outline-none focus:border-emerald-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-300 mb-1">
                      Set New Security PIN ({recoveryNewPinLength} digits)
                    </label>
                    <input
                      type="password"
                      required
                      maxLength={recoveryNewPinLength}
                      placeholder="New PIN"
                      value={recoveryNewPin}
                      onChange={(e) => setRecoveryNewPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08] text-sm text-white text-center font-mono focus:outline-none focus:border-emerald-500/60"
                    />
                  </div>
                </>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode('login')}
                  className="w-1/3 py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-mono transition-colors"
                >
                  ← Sign In
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-2/3 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{isSubmitting ? 'Verifying...' : 'Restore & Unlock Vault'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Auto-detected Device Telemetry Footer */}
        {deviceTelemetry && (
          <div className="mt-6 pt-4 border-t border-white/[0.06] bg-black/30 -mx-6 -mb-6 sm:-mx-8 sm:-mb-8 p-4 rounded-b-2xl">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                <span>Device Telemetry:</span>
                <span className="text-zinc-200">{deviceTelemetry.deviceName}</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>IP: {deviceTelemetry.ipAddress}</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-zinc-500 mt-1 flex flex-wrap gap-x-2">
              <span>OS: {deviceTelemetry.os}</span>
              <span>•</span>
              <span>Browser: {deviceTelemetry.browser}</span>
              <span>•</span>
              <span>Res: {deviceTelemetry.screenResolution}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
