/**
 * NEXUS - High-Performance Chat Interface
 * Supports both:
 * 1. Direct Peer E2EE (Double Ratchet + X3DH + Merkle Proofs)
 * 2. Group Enclaves (Creator Access Control + Multi-Party Encryption)
 * 3. Mobile responsiveness with back navigation
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Lock,
  CheckCheck,
  ShieldCheck,
  Paperclip,
  Image as ImageIcon,
  Hash,
  AlertCircle,
  Copy,
  Check,
  Info,
  Sparkles,
  Users,
  Crown,
  UserCheck,
  Clock,
  Shield,
  ChevronLeft,
  Settings,
  UserPlus,
} from 'lucide-react';
import { UserClientContext, identityManager } from '../services/identityManager';
import { groupAndDirectoryService } from '../services/groupAndDirectoryService';
import { UserAccount } from '../services/authService';
import { DecryptedMessage, EncryptedMediaPayload, GroupChat } from '../types';
import { encryptAndChunkFile } from '../crypto/mediaPipeline';

interface ChatAreaProps {
  activeContext: UserClientContext;
  account: UserAccount | null;
  peerDeviceId: string;
  activeGroupId: string | null;
  onSendMessage: (content: string, media?: EncryptedMediaPayload) => Promise<void>;
  onInspectMessage: (msg: DecryptedMessage) => void;
  onOpenSafetyNumber: () => void;
  onOpenGroupInfo?: (groupId: string) => void;
  onBackToSidebar?: () => void;
  onClearTamperAlerts?: () => void;
  onTriggerSimulatePeer?: (peerDeviceId: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeContext,
  account,
  peerDeviceId,
  activeGroupId,
  onSendMessage,
  onInspectMessage,
  onOpenSafetyNumber,
  onOpenGroupInfo,
  onBackToSidebar,
  onClearTamperAlerts,
  onTriggerSimulatePeer,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedCid, setCopiedCid] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [joinRequestMessage, setJoinRequestMessage] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe directly to message updates for instant 0ms latency rendering
  useEffect(() => {
    const unsub1 = identityManager.subscribeMessages(() => {
      setTick((t) => t + 1);
    });
    const unsub2 = groupAndDirectoryService.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const currentUserId = account?.id || activeContext.user.userId;
  const currentUsername = account?.email.split('@')[0] || activeContext.user.username;
  const currentDisplayName = account?.fullName || activeContext.user.displayName;
  const currentDeviceId = account?.activeDeviceId || activeContext.localIdentity.deviceId;

  // ---------------------------------------------------------------------------
  // 1. Resolve Group Mode vs DM Mode
  // ---------------------------------------------------------------------------
  const activeGroup: GroupChat | undefined = useMemo(() => {
    if (!activeGroupId) return undefined;
    return groupAndDirectoryService.getGroup(activeGroupId);
  }, [activeGroupId]);

  const isGroupMode = Boolean(activeGroup);

  // Group membership check
  const isApprovedGroupMember = useMemo(() => {
    if (!activeGroup) return false;
    return activeGroup.members.some((m) => m.userId === currentUserId);
  }, [activeGroup, currentUserId]);

  const isGroupCreator = activeGroup?.creatorId === currentUserId;

  const isJoinPending = useMemo(() => {
    if (!activeGroup) return false;
    return activeGroup.pendingRequests.some(
      (r) => r.userId === currentUserId && r.status === 'pending'
    );
  }, [activeGroup, currentUserId]);

  // Direct peer lookup when in DM mode
  const peerInfo = useMemo(() => {
    const networkUser = groupAndDirectoryService.getUserByDeviceId(peerDeviceId);
    if (networkUser) {
      return {
        name: networkUser.displayName,
        username: networkUser.username,
        role: networkUser.role,
        avatar: networkUser.avatar,
        status: networkUser.status,
        fingerprint: networkUser.fingerprint,
      };
    }

    // Check context clients
    const ctx = identityManager.getContextByDeviceId(peerDeviceId);
    if (ctx) {
      return {
        name: ctx.user.displayName,
        username: ctx.user.username,
        role: 'Authenticated Enclave Peer',
        avatar: ctx.user.avatar,
        status: 'online',
        fingerprint: ctx.user.identityKey.fingerprint,
      };
    }

    // Default fallback
    return {
      name: peerDeviceId === 'dev_elena_desktop' ? 'Elena Vance' : 'Dr. Marcus Vance',
      username: peerDeviceId === 'dev_elena_desktop' ? 'elena' : 'marcus',
      role: peerDeviceId === 'dev_elena_desktop' ? 'Security Auditor & Cryptographer' : 'Zero-Knowledge Relay Enclave',
      avatar: peerDeviceId === 'dev_elena_desktop'
        ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      status: 'online',
      fingerprint: '9182-3847-1928-3019-8472',
    };
  }, [peerDeviceId]);

  // ---------------------------------------------------------------------------
  // 2. Filter Messages: Isolated by Peer or Group with instant live reactivity!
  // ---------------------------------------------------------------------------
  const messages: DecryptedMessage[] = (() => {
    if (isGroupMode && activeGroup) {
      return groupAndDirectoryService.getGroupMessages(activeGroup.groupId);
    }

    // Filter messages for active peer only
    const currentDevice = activeContext.localIdentity.deviceId;
    const targetConvId = `conv_${[currentDevice, peerDeviceId].sort().join('_')}`;
    return activeContext.messages.filter((msg) => {
      // Exclude group messages in DM view
      if (msg.groupId) return false;
      return (
        msg.conversationId === targetConvId ||
        msg.senderDeviceId === peerDeviceId ||
        msg.senderId === 'SYSTEM_TAMPER_ALERT'
      );
    });
  })();

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ---------------------------------------------------------------------------
  // 3. Message Sending Handlers
  // ---------------------------------------------------------------------------
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;

    setInputText('');
    setIsSending(true);
    try {
      if (isGroupMode && activeGroup) {
        // Send to group enclave
        groupAndDirectoryService.sendGroupMessage(
          activeGroup.groupId,
          {
            userId: currentUserId,
            username: currentUsername,
            displayName: currentDisplayName,
            avatar: account?.avatarUrl || activeContext.user.avatar,
            deviceId: currentDeviceId,
          },
          text
        );
        setTick((t) => t + 1);
      } else {
        // Send to direct peer
        await onSendMessage(text);
        setTick((t) => t + 1);
      }
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyCid = (cid: string) => {
    navigator.clipboard.writeText(cid);
    setCopiedCid(cid);
    setTimeout(() => setCopiedCid(null), 2000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    try {
      const { payload } = await encryptAndChunkFile(file);
      const label = `[Encrypted Attachment: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`;

      if (isGroupMode && activeGroup) {
        groupAndDirectoryService.sendGroupMessage(
          activeGroup.groupId,
          {
            userId: currentUserId,
            username: currentUsername,
            displayName: currentDisplayName,
            avatar: account?.avatarUrl || activeContext.user.avatar,
            deviceId: currentDeviceId,
          },
          label,
          payload
        );
        setTick((t) => t + 1);
      } else {
        await onSendMessage(label, payload);
        setTick((t) => t + 1);
      }
    } catch (err) {
      console.error('Failed to chunk file:', err);
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Group join request action ("if grop maker assept than only this user can join")
  const handleRequestJoin = () => {
    if (!activeGroup) return;
    const res = groupAndDirectoryService.requestToJoinGroup(activeGroup.groupId, {
      userId: currentUserId,
      username: currentUsername,
      displayName: currentDisplayName,
      avatar: account?.avatarUrl || activeContext.user.avatar,
      deviceId: currentDeviceId,
    });
    setJoinRequestMessage(res.message);
  };

  return (
    <section className="flex-1 flex flex-col h-full bg-[#0a0d14] relative overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-14 border-b border-white/[0.08] px-3 sm:px-4 flex items-center justify-between bg-[#0e121a]/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Back Button */}
          {onBackToSidebar && (
            <button
              onClick={onBackToSidebar}
              className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
              title="Back to conversation list"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Avatar and Details */}
          {isGroupMode && activeGroup ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={activeGroup.avatar}
                  alt={activeGroup.name}
                  className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/20"
                />
                {isGroupCreator && (
                  <span className="absolute -top-1 -right-1 p-0.5 rounded bg-amber-500 text-black shadow">
                    <Crown className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-semibold text-white tracking-wide truncate">
                    {activeGroup.name}
                  </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hidden sm:inline-flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" />
                    Group Enclave
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  {activeGroup.members.length} members • Creator: @{activeGroup.creatorName}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={peerInfo.avatar}
                  alt={peerInfo.name}
                  className="w-9 h-9 rounded-full object-cover ring-1 ring-white/20"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0e121a]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-semibold text-white tracking-wide truncate">
                    {peerInfo.name}
                  </h2>
                  <span className="text-[10px] font-mono text-emerald-400 hidden sm:inline">
                    @{peerInfo.username}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">{peerInfo.role}</p>
              </div>
            </div>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Group Settings / Access Control Button */}
          {isGroupMode && activeGroup && onOpenGroupInfo && (
            <button
              onClick={() => onOpenGroupInfo(activeGroup.groupId)}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-mono text-zinc-200 transition-colors"
              title="Manage Group Members & Access Control"
            >
              <Settings className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Enclave Access</span>
              {isGroupCreator && activeGroup.pendingRequests.filter((r) => r.status === 'pending').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[9px] font-bold">
                  {activeGroup.pendingRequests.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </button>
          )}

          {/* DM Peer Simulation Button */}
          {!isGroupMode && onTriggerSimulatePeer && (
            <button
              onClick={() => onTriggerSimulatePeer(peerDeviceId)}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-mono text-zinc-300 transition-colors"
              title={`Simulate response from ${peerInfo.name}`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Reply as {peerInfo.username}</span>
            </button>
          )}

          {/* Fingerprint / Safety Number */}
          <button
            onClick={onOpenSafetyNumber}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-mono text-emerald-300 transition-colors"
            title="Verify Safety Number & QR"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Safety Number</span>
          </button>
        </div>
      </div>

      {/* -----------------------------------------------------------------------
          ACCESS GATE: If in Group Mode but user is NOT an approved member!
          ("if grop maker assept than only this user can join")
      ------------------------------------------------------------------------- */}
      {isGroupMode && activeGroup && !isApprovedGroupMember ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-white tracking-wide">
              {activeGroup.name}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {activeGroup.description}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-black/50 border border-white/[0.08] text-xs text-left space-y-2 w-full">
            <div className="flex items-center gap-2 text-amber-400 font-mono font-medium text-[11px]">
              <Shield className="w-3.5 h-3.5" />
              <span>Restricted Enclave • Creator Access Control</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              This group enclave is guarded by creator-controlled access. In accordance with zero-knowledge protocol,
              only the group maker (<strong>@{activeGroup.creatorName}</strong>) can accept your join request.
            </p>
            <div className="pt-1 text-[10px] font-mono text-zinc-500 flex justify-between">
              <span>Group Maker: @{activeGroup.creatorName}</span>
              <span>Enclave Members: {activeGroup.members.length}</span>
            </div>
          </div>

          {joinRequestMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
              {joinRequestMessage}
            </div>
          )}

          {isJoinPending ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2">
              <Clock className="w-4 h-4 animate-spin shrink-0" />
              <span>Join request pending! Awaiting approval from @{activeGroup.creatorName}.</span>
            </div>
          ) : (
            <button
              onClick={handleRequestJoin}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Request to Join Group Enclave</span>
            </button>
          )}
        </div>
      ) : (
        /* -----------------------------------------------------------------------
           APPROVED CHAT STREAM: Direct Messages or Approved Group Messages
        ------------------------------------------------------------------------- */
        <>
          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
            {/* Zero-Knowledge Protocol Guarantee Banner */}
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-center max-w-xl mx-auto my-1 shadow-sm">
              <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs font-semibold font-mono mb-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {isGroupMode
                    ? `GROUP ENCLAVE ENCRYPTED: ${activeGroup?.name.toUpperCase()}`
                    : 'NEXUS ZERO-KNOWLEDGE PROTOCOL ENFORCED'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {isGroupMode
                  ? `Multi-party zero-knowledge encryption active. All payloads are signed and verified by approved enclave members.`
                  : `Messages and media are encrypted client-side using X3DH and ratcheted with AES-256-GCM. The server relay only processes opaque ciphertext.`}
              </p>
            </div>

            {/* Message Bubbles */}
            {messages.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 font-mono text-xs space-y-2">
                <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500/40" />
                <p>No messages exchanged in this enclave yet.</p>
                <p className="text-[10px] text-zinc-600">Send an encrypted message below to initiate cryptographic ratcheting.</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isSender = msg.senderDeviceId === activeContext.localIdentity.deviceId || msg.senderId === currentUserId;
                const isTamperAlert = msg.senderId === 'SYSTEM_TAMPER_ALERT';
                const isSystemNotice = msg.senderId === 'SYSTEM';

                if (isTamperAlert) {
                  return (
                    <div
                      key={`${msg.id}_alert_${idx}`}
                      className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-200 max-w-xl mx-auto my-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <span className="text-xs font-semibold font-mono uppercase tracking-wider text-rose-400">
                              Cryptographic Authentication Guard
                            </span>
                            <p className="text-xs text-rose-200/90 leading-relaxed">
                              Forged payload detected and rejected! The relay server or an attacker modified ciphertext bits in transit. AES-256-GCM authentication tag prevented tampering.
                            </p>
                          </div>
                        </div>
                        {onClearTamperAlerts && (
                          <button
                            onClick={onClearTamperAlerts}
                            className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-[10px] font-mono text-rose-300 transition-colors shrink-0"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                if (isSystemNotice) {
                  return (
                    <div
                      key={`${msg.id}_sys_${idx}`}
                      className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center max-w-md mx-auto my-1.5"
                    >
                      <span className="text-[11px] font-mono text-zinc-400">{msg.content}</span>
                    </div>
                  );
                }

                const senderDisplayName = isSender
                  ? 'You'
                  : isGroupMode
                  ? msg.senderName || 'Enclave Member'
                  : peerInfo.name;

                return (
                  <div
                    key={`${msg.id}_${idx}`}
                    className={`flex flex-col ${isSender ? 'items-end' : 'items-start'} group transition-opacity`}
                  >
                    <div
                      className={`max-w-[88%] sm:max-w-[70%] rounded-2xl p-3 sm:p-3.5 shadow-md ${
                        isSender
                          ? 'bg-emerald-600/15 border border-emerald-500/30 text-emerald-50 rounded-br-sm'
                          : 'bg-[#121722] border border-white/[0.08] text-zinc-100 rounded-bl-sm'
                      }`}
                    >
                      {/* Message Header info */}
                      <div className="flex items-center justify-between gap-4 mb-1 text-[10px] font-mono opacity-70">
                        <span className="font-semibold text-zinc-300 truncate">
                          {senderDisplayName}
                        </span>
                        <span className="text-zinc-400 shrink-0">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Message Body */}
                      <p className="text-xs sm:text-[13px] leading-relaxed break-words whitespace-pre-wrap select-text">
                        {msg.content}
                      </p>

                      {/* Media Attachment if present */}
                      {msg.mediaAttachment && (
                        <div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/10 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                            <ImageIcon className="w-4 h-4 text-emerald-400" />
                            <span className="truncate">{msg.mediaAttachment.fileName}</span>
                            <span className="text-[10px] text-zinc-400">
                              ({(msg.mediaAttachment.fileSize / 1024).toFixed(1)} KB)
                            </span>
                          </div>

                          {msg.mediaAttachment.clientThumbnailDataUrl && (
                            <div className="rounded-md overflow-hidden max-h-48 bg-black/60 flex items-center justify-center">
                              <img
                                src={msg.mediaAttachment.clientThumbnailDataUrl}
                                alt="Decrypted attachment"
                                className="max-h-48 w-auto object-contain rounded"
                              />
                            </div>
                          )}

                          <div className="text-[9px] font-mono text-zinc-400 flex items-center justify-between">
                            <span>Decrypted Client-Side</span>
                            <span>{msg.mediaAttachment.chunkCids.length} CIDs</span>
                          </div>
                        </div>
                      )}

                      {/* Cryptographic Badges Footer */}
                      <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          {/* Content ID (CID) */}
                          <button
                            onClick={() => handleCopyCid(msg.cid)}
                            className="flex items-center gap-1 hover:text-white transition-colors bg-black/30 px-1.5 py-0.5 rounded border border-white/[0.04]"
                            title="Copy Content ID (CID)"
                          >
                            <Hash className="w-2.5 h-2.5 text-blue-400" />
                            <span>{msg.cid.substring(0, 10)}...</span>
                            {copiedCid === msg.cid ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 text-zinc-500" />
                            )}
                          </button>

                          <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-300">
                            Step #{msg.ratchetStep}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 text-emerald-400 text-[10px]" title="Merkle Hash-Chain Verified">
                            <CheckCheck className="w-3 h-3" />
                            <span>Verified</span>
                          </span>

                          <button
                            onClick={() => onInspectMessage(msg)}
                            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                            title="Inspect Raw Ciphertext Envelope"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-2.5 sm:p-3 border-t border-white/[0.08] bg-[#0c1017]">
            {/* Input Bar */}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,.txt,.json"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMedia}
                className="p-2 sm:p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                title="Send Encrypted Media"
              >
                {uploadingMedia ? (
                  <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin block" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
              </button>

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    isGroupMode
                      ? `Message ${activeGroup?.name}... (Enter to send)`
                      : `Message ${peerInfo.name}... (Enter to send)`
                  }
                  className="w-full bg-[#141924] border border-white/[0.08] focus:border-emerald-500/50 rounded-lg px-3 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none transition-all pr-10 font-sans"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                  <Lock className="w-3 h-3 text-emerald-400" />
                </div>
              </div>

              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-black font-semibold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>

            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {isGroupMode ? 'Multi-Party Enclave' : 'AES-256-GCM Double Ratchet'}
                </span>
              </div>
              <div className="text-zinc-500">
                End-to-End Encrypted
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
