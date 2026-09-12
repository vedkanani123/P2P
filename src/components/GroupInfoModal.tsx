/**
 * NEXUS - Group Information & Access Control Enclave Modal
 * Provides:
 * - Creator-controlled join request approvals & rejections
 * - Direct member additions via @username or user ID
 * - Group member directory & roles
 * - Group cryptographic key fingerprint
 */

import React, { useState } from 'react';
import {
  Users,
  Shield,
  Lock,
  X,
  Check,
  UserPlus,
  UserCheck,
  UserX,
  Search,
  Key,
  Clock,
  ShieldAlert,
  Crown,
} from 'lucide-react';
import { GroupChat, GroupJoinRequest, UserDirectoryItem } from '../types';
import { groupAndDirectoryService } from '../services/groupAndDirectoryService';
import { UserAccount } from '../services/authService';
import { UserClientContext } from '../services/identityManager';

interface GroupInfoModalProps {
  isOpen: boolean;
  groupId: string | null;
  onClose: () => void;
  activeContext: UserClientContext;
  account: UserAccount | null;
  onGroupUpdated: () => void;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  isOpen,
  groupId,
  onClose,
  activeContext,
  account,
  onGroupUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'members' | 'invite' | 'security'>('requests');
  const [inviteSearch, setInviteSearch] = useState('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  if (!isOpen || !groupId) return null;

  const group = groupAndDirectoryService.getGroup(groupId);
  if (!group) return null;

  const currentUserId = account?.id || activeContext.user.userId;
  const isCreator = group.creatorId === currentUserId;
  const isAdmin = isCreator || group.members.some((m) => m.userId === currentUserId && m.role === 'admin');

  const pendingRequests = group.pendingRequests.filter((r) => r.status === 'pending');

  const handleApprove = (requestId: string) => {
    const res = groupAndDirectoryService.approveJoinRequest(group.groupId, requestId, currentUserId);
    setActionFeedback(res.message);
    setTimeout(() => setActionFeedback(null), 3000);
    onGroupUpdated();
  };

  const handleReject = (requestId: string) => {
    const res = groupAndDirectoryService.rejectJoinRequest(group.groupId, requestId, currentUserId);
    setActionFeedback(res.message);
    setTimeout(() => setActionFeedback(null), 3000);
    onGroupUpdated();
  };

  const handleDirectAdd = (user: UserDirectoryItem) => {
    const res = groupAndDirectoryService.directAddMember(group.groupId, user, currentUserId);
    setActionFeedback(res.message);
    setTimeout(() => setActionFeedback(null), 3000);
    onGroupUpdated();
  };

  const handleRemoveMember = (targetUserId: string) => {
    const res = groupAndDirectoryService.removeMember(group.groupId, targetUserId, currentUserId);
    setActionFeedback(res.message);
    setTimeout(() => setActionFeedback(null), 3000);
    onGroupUpdated();
  };

  // Search users for direct add
  const { users: matchedInviteUsers } = groupAndDirectoryService.searchUsersAndGroups(inviteSearch, account);
  const eligibleUsersToAdd = matchedInviteUsers.filter((u) => !group.members.some((m) => m.userId === u.userId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0d1117] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative select-none flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <img src={group.avatar} alt={group.name} className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">{group.name}</h2>
                {isCreator && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5" /> Group Maker
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate max-w-xs">{group.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {actionFeedback && (
          <div className="mx-4 mt-3 p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Nav Tabs */}
        <div className="flex items-center border-b border-white/[0.08] px-4 bg-black/40 text-xs font-mono">
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'requests'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Join Requests</span>
            {pendingRequests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500 text-black text-[10px] font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'members'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members ({group.members.length})</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('invite')}
              className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'invite'
                  ? 'border-emerald-400 text-emerald-400 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Member</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('security')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'security'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Key & Enclave</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: PENDING JOIN REQUESTS ("if grop maker assept than only this user can join") */}
          {activeTab === 'requests' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs">
                <div className="flex items-center gap-1.5 font-medium text-white mb-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Creator Access Control Policy</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Only users accepted by the group maker (<strong>@{group.creatorName}</strong>) can join this enclave and decrypt messages.
                </p>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs font-mono space-y-1">
                  <UserCheck className="w-6 h-6 mx-auto text-zinc-600 mb-2" />
                  <p>No pending join requests</p>
                  <p className="text-[10px] text-zinc-600">
                    When users search for "{group.name}" and click Request Access, their request appears here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                    Pending Admission Requests ({pendingRequests.length})
                  </h3>
                  {pendingRequests.map((req) => (
                    <div
                      key={req.requestId}
                      className="p-3 rounded-xl bg-black/40 border border-white/[0.08] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={req.avatar} alt={req.displayName} className="w-9 h-9 rounded-full object-cover" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white truncate">{req.displayName}</span>
                            <span className="text-[10px] font-mono text-emerald-400">@{req.username}</span>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            <span>Requested {new Date(req.requestedAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>

                      {isAdmin ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleApprove(req.requestId)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-1 transition-colors"
                            title="Accept and admit user to group enclave"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={() => handleReject(req.requestId)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-1 transition-colors"
                            title="Reject join request"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-500 italic">
                          Awaiting group maker approval
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MEMBERS DIRECTORY */}
          {activeTab === 'members' && (
            <div className="space-y-2">
              <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                Approved Enclave Members ({group.members.length})
              </h3>
              <div className="space-y-1.5">
                {group.members.map((member) => {
                  const isMemberCreator = member.role === 'creator';
                  const isMemberAdmin = member.role === 'admin';
                  return (
                    <div
                      key={member.userId}
                      className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={member.avatar} alt={member.displayName} className="w-8 h-8 rounded-full object-cover" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white truncate">{member.displayName}</span>
                            <span className="text-[10px] font-mono text-zinc-400">@{member.username}</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500 truncate block">
                            Device: {member.deviceId}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isMemberCreator ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Crown className="w-2.5 h-2.5" /> Group Maker
                          </span>
                        ) : isMemberAdmin ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            Admin
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-zinc-400">
                            Member
                          </span>
                        )}

                        {isAdmin && !isMemberCreator && member.userId !== currentUserId && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-400 transition-colors"
                            title="Remove member from group"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: INVITE / ADD MEMBERS DIRECTLY BY USERNAME */}
          {activeTab === 'invite' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="Search user by @username or user ID (e.g. @ved, @sarah)..."
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500/50 font-mono transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                  Network Users Available ({eligibleUsersToAdd.length})
                </h4>
                {eligibleUsersToAdd.map((user) => (
                  <div
                    key={user.userId}
                    className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={user.avatar} alt={user.displayName} className="w-8 h-8 rounded-full object-cover" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-white truncate">{user.displayName}</span>
                          <span className="text-[10px] font-mono text-emerald-400">@{user.username}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono truncate block">{user.role}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDirectAdd(user)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-1 transition-colors shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add to Group</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: ENCLAVE KEY & SECURITY SPECS */}
          {activeTab === 'security' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] space-y-2">
                <span className="text-zinc-400 text-[10px] uppercase tracking-wider block">Group Key Fingerprint</span>
                <div className="p-2 rounded bg-black/60 border border-white/[0.06] text-emerald-400 font-mono text-xs tracking-wider break-all">
                  {group.groupKeyFingerprint}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] space-y-2">
                <div className="flex justify-between text-zinc-400 text-[11px]">
                  <span>Enclave ID:</span>
                  <span className="text-zinc-200">{group.groupId}</span>
                </div>
                <div className="flex justify-between text-zinc-400 text-[11px]">
                  <span>Creator (Group Maker):</span>
                  <span className="text-emerald-400">@{group.creatorName}</span>
                </div>
                <div className="flex justify-between text-zinc-400 text-[11px]">
                  <span>Access Control:</span>
                  <span className="text-zinc-200">
                    {group.requiresApproval ? 'Creator Approval Mandatory' : 'Open'}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400 text-[11px]">
                  <span>Created:</span>
                  <span className="text-zinc-200">{new Date(group.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
