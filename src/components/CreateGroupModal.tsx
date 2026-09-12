/**
 * NEXUS - Create Group Enclave Modal
 * Allows creating a new Zero-Knowledge group with creator access control.
 */

import React, { useState } from 'react';
import { Users, Shield, Lock, X, Check, Sparkles, UserPlus } from 'lucide-react';
import { groupAndDirectoryService } from '../services/groupAndDirectoryService';
import { UserAccount } from '../services/authService';
import { UserClientContext } from '../services/identityManager';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeContext: UserClientContext;
  account: UserAccount | null;
  onGroupCreated: (groupId: string) => void;
}

const DEFAULT_AVATARS = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=150&auto=format&fit=crop&q=80',
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  activeContext,
  account,
  onGroupCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_AVATARS[0]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentUserId = account?.id || activeContext.user.userId;
  const currentUsername = account?.email.split('@')[0] || activeContext.user.username;
  const currentDisplayName = account?.fullName || activeContext.user.displayName;
  const currentDeviceId = account?.activeDeviceId || activeContext.localIdentity.deviceId;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    try {
      const newGroup = groupAndDirectoryService.createGroup({
        name: name.trim(),
        description: description.trim(),
        avatar: selectedAvatar,
        creator: {
          userId: currentUserId,
          username: currentUsername,
          displayName: currentDisplayName,
          avatar: account?.avatarUrl || activeContext.user.avatar,
          deviceId: currentDeviceId,
        },
        requiresApproval,
      });

      setName('');
      setDescription('');
      setError(null);
      onGroupCreated(newGroup.groupId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0d1117] border border-white/10 rounded-2xl p-5 md:p-6 shadow-2xl relative select-none">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wide">Create Encrypted Group Enclave</h2>
            <p className="text-xs text-zinc-400">Multi-party ratcheting with creator access control</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Group Avatar Selection */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Enclave Avatar
            </label>
            <div className="flex items-center gap-3">
              {DEFAULT_AVATARS.map((url, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setSelectedAvatar(url)}
                  className={`relative rounded-xl overflow-hidden ring-2 transition-all ${
                    selectedAvatar === url ? 'ring-emerald-400 scale-105' : 'ring-white/10 hover:ring-white/30'
                  }`}
                >
                  <img src={url} alt={`Avatar ${idx + 1}`} className="w-11 h-11 object-cover" />
                  {selectedAvatar === url && (
                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-emerald-300 stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Group Name */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Group Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cryptography Enclave, Core Operations"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Description / Topic
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose and security clearance of this enclave..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
            />
          </div>

          {/* Access Control Toggle ("grop maker assept") */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-medium text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Creator Approval Access Control
                </span>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  Users can find this group via search, but can <strong>only join once you (the group maker) accept</strong> their join request.
                </p>
              </div>
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="mt-1 h-4 w-4 rounded accent-emerald-500 bg-black border-white/20 cursor-pointer"
              />
            </div>
          </div>

          {/* Group Maker Details Display */}
          <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[11px] font-mono text-zinc-300 flex items-center justify-between">
            <span className="text-zinc-400">Group Maker (Admin):</span>
            <span className="text-emerald-400 font-medium">@{currentUsername} ({currentDisplayName})</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Create Enclave</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
