/**
 * NEXUS - User Profile & Security Settings Modal
 * Allows user to:
 * - Upload & change profile photo (live preview, base64 FileReader, or preset avatar)
 * - View & update First Name & Second/Last Name with live initials calculation (e.g. "VK")
 * - Toggle live presence status (Online, Away, Offline)
 * - View Account ID and IP Telemetry
 * - Download 12-word master secret recovery phrase keyfile (.txt)
 */

import React, { useState, useRef } from 'react';
import {
  User,
  Camera,
  Upload,
  Check,
  X,
  Lock,
  Download,
  Shield,
  Trash2,
  Sparkles,
  Key,
  Radio,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { authService, UserAccount, getUserInitials, downloadRecoveryKeyFile } from '../services/authService';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: UserAccount | null;
  onAccountUpdated: () => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
];

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  account,
  onAccountUpdated,
}) => {
  const [firstName, setFirstName] = useState(account?.firstName || 'Ved');
  const [lastName, setLastName] = useState(account?.lastName || 'Kanani');
  const [avatarUrl, setAvatarUrl] = useState(account?.avatarUrl || '');
  const [status, setStatus] = useState<'online' | 'idle' | 'offline'>(account?.status || 'online');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !account) return null;

  const initials = getUserInitials(firstName, lastName);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback('Please select a valid image file (PNG, JPG, WEBP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAvatarUrl(dataUrl);
      authService.updateProfileAvatar(dataUrl);
      setFeedback('Profile picture updated successfully!');
      setTimeout(() => setFeedback(null), 3000);
      onAccountUpdated();
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    authService.updateProfileAvatar('');
    setFeedback('Profile picture removed. Using name initials.');
    setTimeout(() => setFeedback(null), 3000);
    onAccountUpdated();
  };

  const handleStatusChange = (newStatus: 'online' | 'idle' | 'offline') => {
    setStatus(newStatus);
    authService.updateUserStatus(newStatus);
    onAccountUpdated();
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      authService.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        avatarUrl,
      });
      authService.updateUserStatus(status);
      setFeedback('Profile details saved successfully!');
      setTimeout(() => setFeedback(null), 3000);
      onAccountUpdated();
    } catch (err: any) {
      setFeedback(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadKeyfile = () => {
    downloadRecoveryKeyFile({
      fullName: account.fullName,
      email: account.email,
      recoveryPhrase: account.secretRecoveryPhrase,
      accountId: account.id,
    });
    setFeedback('Recovery key file downloaded (.txt)');
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0d1117] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative select-none flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Profile & Account Settings</h2>
              <p className="text-[11px] text-zinc-400 font-mono">Manage identity, avatar & zero-knowledge security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {feedback && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Avatar Upload & Live Preview Section */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl bg-black/40 border border-white/[0.06]">
            {/* Avatar Circle */}
            <div className="relative group shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={account.fullName}
                  className="w-20 h-20 rounded-2xl object-cover ring-2 ring-emerald-500/50 shadow-md"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-600/30 to-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold font-mono text-2xl shadow-md">
                  {initials}
                </div>
              )}

              {/* Status Indicator Pip */}
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ring-2 ring-[#0d1117] ${
                  status === 'online'
                    ? 'bg-emerald-400'
                    : status === 'idle'
                    ? 'bg-amber-400'
                    : 'bg-zinc-500'
                }`}
                title={`Status: ${status}`}
              />

              {/* Upload Overlay Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-mono transition-opacity"
                title="Change Photo"
              >
                <Camera className="w-4 h-4 mb-1 text-emerald-400" />
                <span>Upload</span>
              </button>
            </div>

            {/* Avatar Actions */}
            <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
              <div>
                <h3 className="text-xs font-semibold text-white">Profile Photo</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {avatarUrl
                    ? 'Custom photo active across all zero-knowledge conversations.'
                    : `No photo uploaded. Using initials "${initials}" based on first and last name.`}
                </p>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-2 pt-1 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 border border-white/[0.08] text-zinc-400 text-xs font-mono flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {/* Preset Avatars */}
              <div className="pt-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                  Or select cryptographic preset:
                </span>
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  {PRESET_AVATARS.map((url, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        setAvatarUrl(url);
                        authService.updateProfileAvatar(url);
                        onAccountUpdated();
                      }}
                      className={`w-7 h-7 rounded-lg overflow-hidden ring-1 transition-all ${
                        avatarUrl === url ? 'ring-emerald-400 scale-110' : 'ring-white/10 hover:ring-white/30'
                      }`}
                    >
                      <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Live Online / Idle / Offline Status Selector */}
          <div className="space-y-2">
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              Presence Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('online')}
                className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-center gap-2 transition-all ${
                  status === 'online'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Online</span>
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('idle')}
                className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-center gap-2 transition-all ${
                  status === 'idle'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Away</span>
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('offline')}
                className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-center gap-2 transition-all ${
                  status === 'offline'
                    ? 'bg-zinc-700/30 border-zinc-500/50 text-zinc-200'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                <span>Invisible</span>
              </button>
            </div>
          </div>

          {/* First & Last Name Edit Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
                  First Name
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Ved"
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500/50 font-sans transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
                  Second / Last Name
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Kanani"
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500/50 font-sans transition-colors"
                />
              </div>
            </div>

            {/* Live Name & Initials Preview */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Live Full Name & Initials:</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{firstName} {lastName}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  {initials}
                </span>
              </div>
            </div>

            {/* Email (Readonly) */}
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
                Registered Account Email
              </label>
              <input
                type="text"
                disabled
                value={account.email}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-zinc-400 text-xs font-mono cursor-not-allowed"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>

          {/* Master Recovery Phrase Download Section */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>12-Word Master Secret Recovery Phrase</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                Zero-Knowledge
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Your 12-word phrase is your master cryptographic seed. Download the recovery keyfile to safely restore your account and Double Ratchet keys if you ever lose your PIN or password.
            </p>

            <button
              type="button"
              onClick={handleDownloadKeyfile}
              className="w-full py-2.5 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-zinc-200 text-xs font-mono font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Master Recovery Key (.txt)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
