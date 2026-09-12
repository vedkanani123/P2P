/**
 * NEXUS - Production Sidebar & Search Navigation
 * Features:
 * - Real-time user search by @username (e.g. @ved, @elena), user ID, or display name
 * - Encrypted Group Enclaves with creator access control & pending join request badges
 * - Instant peer switching across all network identities (Elena, Marcus, Sarah, Alex, Ved)
 * - Live hardware enclave & IP telemetry
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  Radio,
  Plus,
  MessageSquare,
  Search,
  Users,
  X,
  Crown,
  UserPlus,
  Shield,
  Clock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { UserClientContext } from '../services/identityManager';
import { UserAccount, getUserInitials } from '../services/authService';
import { groupAndDirectoryService } from '../services/groupAndDirectoryService';
import { UserDirectoryItem, GroupChat } from '../types';

interface SidebarProps {
  activeContext: UserClientContext;
  account: UserAccount | null;
  peerDeviceId: string;
  activeGroupId: string | null;
  onSelectPeer: (peerDeviceId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onOpenCreateGroup: () => void;
  onOpenGroupInfo: (groupId: string) => void;
  onOpenDeviceManager: () => void;
  onOpenSafetyNumber: () => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeContext,
  account,
  peerDeviceId,
  activeGroupId,
  onSelectPeer,
  onSelectGroup,
  onOpenCreateGroup,
  onOpenGroupInfo,
  onOpenDeviceManager,
  onOpenSafetyNumber,
  onOpenSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'dms' | 'groups'>('all');

  const currentUserId = account?.id || activeContext.user.userId;
  const displayName = account?.fullName || activeContext.user.displayName;
  const username = account?.email.split('@')[0] || activeContext.user.username;
  const userInitials = getUserInitials(account?.firstName, account?.lastName, displayName);
  const myStatus = account?.status || 'online';

  const currentDevice =
    account?.devices?.find((d) => d.deviceId === account.activeDeviceId) || account?.devices?.[0];

  // Fetch all users & groups from the service
  const allUsers = useMemo(() => {
    return groupAndDirectoryService.getNetworkUsers(account).filter((u) => u.userId !== currentUserId);
  }, [account, currentUserId]);

  const allGroups = groupAndDirectoryService.getGroups();

  // Search filtering
  const { users: searchUsers, groups: searchGroups } = useMemo(() => {
    return groupAndDirectoryService.searchUsersAndGroups(searchQuery, account);
  }, [searchQuery, account]);

  const filteredUsers = searchUsers.filter((u) => u.userId !== currentUserId);

  return (
    <aside className="w-full md:w-80 bg-[#080b10] border-r border-white/[0.08] flex flex-col h-full select-none text-zinc-300">
      {/* Current User Profile Header */}
      <div className="p-3.5 border-b border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div
            onClick={onOpenSettings}
            className="relative shrink-0 cursor-pointer group"
            title="Click to open Profile & Photo Settings"
          >
            {account?.avatarUrl ? (
              <img
                src={account.avatarUrl}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/40 group-hover:ring-emerald-400 transition-all"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold font-mono text-xs group-hover:bg-emerald-500/30 transition-all">
                {userInitials}
              </div>
            )}
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#080b10] ${
                myStatus === 'online'
                  ? 'bg-emerald-400'
                  : myStatus === 'idle'
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
              }`}
              title={`Status: ${myStatus}`}
            />
          </div>

          <div
            onClick={onOpenSettings}
            className="flex-1 min-w-0 cursor-pointer group"
            title="Click to manage profile and status"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white truncate group-hover:text-emerald-300 transition-colors">
                {displayName}
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                {myStatus}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-[11px] text-zinc-400 font-mono truncate">@{username}</p>
              <span className="text-[10px] text-zinc-500 font-mono">Initials: {userInitials}</span>
            </div>
          </div>
        </div>

        {/* Live Device Hardware & IP Status */}
        {currentDevice && (
          <div
            onClick={onOpenDeviceManager}
            className="mt-2.5 p-2 rounded-lg bg-black/40 border border-white/[0.06] flex items-center justify-between cursor-pointer hover:border-white/[0.12] transition-colors"
            title="Click to view all registered devices & IP telemetry"
          >
            <div className="flex items-center gap-1.5 min-w-0 text-[10px] font-mono text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-zinc-300 truncate">{currentDevice.deviceName}</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 shrink-0 ml-1">
              {currentDevice.ipAddress}
            </span>
          </div>
        )}
      </div>

      {/* Global Real-Time Search Bar */}
      <div className="p-2.5 border-b border-white/[0.06] space-y-2 bg-black/20">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search @username (e.g. @ved), user ID, groups..."
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500/50 font-mono transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-zinc-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 text-[10px] font-mono">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              categoryFilter === 'all'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setCategoryFilter('dms')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              categoryFilter === 'dms'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            Direct ({filteredUsers.length})
          </button>
          <button
            onClick={() => setCategoryFilter('groups')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              categoryFilter === 'groups'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            Groups ({searchGroups.length})
          </button>

          <div className="flex-1" />

          {/* Quick Create Group Button */}
          <button
            onClick={onOpenCreateGroup}
            className="p-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 transition-colors"
            title="Create Encrypted Group Enclave"
          >
            <Plus className="w-3 h-3" />
            <span>New Group</span>
          </button>
        </div>
      </div>

      {/* Main Channel & User List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* GROUPS SECTION */}
        {(categoryFilter === 'all' || categoryFilter === 'groups') && (
          <div>
            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold tracking-wider text-zinc-400 uppercase font-mono">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                Group Enclaves ({searchGroups.length})
              </span>
              <button
                onClick={onOpenCreateGroup}
                className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 font-normal lowercase"
              >
                + create
              </button>
            </div>

            <div className="mt-1 space-y-1">
              {searchGroups.map((group) => {
                const isSelected = activeGroupId === group.groupId;
                const isMember = group.members.some((m) => m.userId === currentUserId);
                const isCreator = group.creatorId === currentUserId;
                const pendingCount = group.pendingRequests.filter((r) => r.status === 'pending').length;
                const isPendingForMe = group.pendingRequests.some(
                  (r) => r.userId === currentUserId && r.status === 'pending'
                );

                return (
                  <div
                    key={group.groupId}
                    className={`w-full rounded-xl transition-all border ${
                      isSelected
                        ? 'bg-white/[0.08] text-white border-white/[0.14] shadow-sm'
                        : 'hover:bg-white/[0.03] text-zinc-300 border-transparent hover:border-white/[0.05]'
                    }`}
                  >
                    <button
                      onClick={() => onSelectGroup(group.groupId)}
                      className="w-full text-left p-2.5 flex items-center gap-3"
                    >
                      <div className="relative shrink-0">
                        <img
                          src={group.avatar}
                          alt={group.name}
                          className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/10"
                        />
                        {isCreator && (
                          <span
                            className="absolute -top-1 -right-1 p-0.5 rounded bg-amber-500 text-black shadow"
                            title="You are the Group Maker"
                          >
                            <Crown className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white truncate">{group.name}</span>
                          <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-1">
                            {group.members.length} members
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
                          <span className="truncate">{group.lastMessage || group.description}</span>
                          {/* Badges */}
                          {isCreator && pendingCount > 0 && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenGroupInfo(group.groupId);
                              }}
                              className="shrink-0 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold"
                              title="Pending Join Requests waiting for creator approval"
                            >
                              {pendingCount} Request{pendingCount > 1 ? 's' : ''}
                            </span>
                          )}
                          {!isMember && (
                            <span className="shrink-0 px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-300 text-[9px]">
                              {isPendingForMe ? 'Pending' : 'Restricted'}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DIRECT CHATS / USERS SECTION */}
        {(categoryFilter === 'all' || categoryFilter === 'dms') && (
          <div>
            <div className="px-2 py-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase font-mono flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Direct Enclaves ({filteredUsers.length})
              </span>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> Live
              </span>
            </div>

            <div className="mt-1 space-y-1">
              {filteredUsers.map((user) => {
                const isSelected = !activeGroupId && peerDeviceId === user.primaryDeviceId;
                return (
                  <button
                    key={user.userId}
                    onClick={() => onSelectPeer(user.primaryDeviceId)}
                    className={`w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all border ${
                      isSelected
                        ? 'bg-white/[0.08] text-white border-white/[0.14] shadow-sm'
                        : 'hover:bg-white/[0.03] text-zinc-400 hover:text-zinc-200 border-transparent hover:border-white/[0.05]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={user.avatar}
                        alt={user.displayName}
                        className="w-9 h-9 rounded-full object-cover ring-1 ring-white/10"
                      />
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#080b10] ${
                          user.status === 'online'
                            ? 'bg-emerald-400'
                            : user.status === 'idle'
                            ? 'bg-amber-400'
                            : 'bg-zinc-500'
                        }`}
                        title={`Status: ${user.status || 'online'}`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white truncate">{user.displayName}</span>
                        <span className="text-[10px] font-mono text-emerald-400">@{user.username}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate">{user.role}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Security Summary Panel */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] space-y-2 text-[11px]">
          <div className="flex items-center justify-between text-zinc-300 font-mono font-medium">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Zero-Knowledge Shield</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Active
            </span>
          </div>

          <div className="space-y-1 font-mono text-[10px] text-zinc-400">
            <div className="flex justify-between">
              <span>Relay Cipher:</span>
              <span className="text-zinc-200">AES-256-GCM</span>
            </div>
            <div className="flex justify-between">
              <span>Forward Secrecy:</span>
              <span className="text-emerald-400">Double Ratchet</span>
            </div>
            <div className="flex justify-between">
              <span>Access Control:</span>
              <span className="text-zinc-200">Group Maker Approval</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Identity Fingerprint */}
      <div className="p-3 border-t border-white/[0.08] bg-black/40 text-[11px] text-zinc-400 flex items-center justify-between font-mono">
        <button
          onClick={onOpenSafetyNumber}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-emerald-400 transition-colors truncate"
          title="Verify Cryptographic Safety Fingerprint"
        >
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Safety Fingerprint</span>
        </button>
        <span className="text-emerald-400 text-[10px] shrink-0">Secured</span>
      </div>
    </aside>
  );
};
