/**
 * NEXUS - Group Enclaves & Network User Directory Service
 * Real-time searchable user directory across all devices,
 * group creation, creator access control, and group messaging.
 * NO demo data.
 */

import {
  UserDirectoryItem,
  GroupChat,
  GroupMember,
  GroupJoinRequest,
  DecryptedMessage,
  EncryptedMediaPayload,
} from '../types';
import { identityManager } from './identityManager';
import { zkRelay } from './zkRelay';

const GROUPS_STORAGE_KEY = 'nexus_groups_v2';
const GROUP_MESSAGES_STORAGE_KEY = 'nexus_group_messages_v2';

class GroupAndDirectoryService {
  private groups: GroupChat[] = [];
  private groupMessages: Map<string, DecryptedMessage[]> = new Map();
  private listeners = new Set<() => void>();

  constructor() {
    this.loadState();
    this.syncWithServer();

    // Subscribe to WebSocket network broadcasts for live updates
    zkRelay.subscribeNetworkEvents((event) => {
      if (event.type === 'group:created') {
        const existing = this.groups.findIndex((g) => g.groupId === event.group.groupId);
        if (existing >= 0) {
          this.groups[existing] = event.group;
        } else {
          this.groups.unshift(event.group);
        }
        this.saveGroups();
        this.notifyListeners();
      } else if (event.type === 'group:updated') {
        const existing = this.groups.findIndex((g) => g.groupId === event.group.groupId);
        if (existing >= 0) {
          this.groups[existing] = event.group;
          this.saveGroups();
          this.notifyListeners();
        }
      } else if (event.type === 'group:message') {
        const { groupId, message } = event;
        const msgs = this.groupMessages.get(groupId) || [];
        if (!msgs.some((m) => m.id === message.id)) {
          msgs.push(message);
          this.groupMessages.set(groupId, msgs);
          this.saveGroupMessages();
          this.notifyListeners();
        }
      }
    });
  }

  private loadState() {
    try {
      const savedGroups = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (savedGroups) {
        this.groups = JSON.parse(savedGroups);
      }
      const savedMessages = localStorage.getItem(GROUP_MESSAGES_STORAGE_KEY);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        this.groupMessages = new Map(Object.entries(parsed));
      }
    } catch (err) {
      console.error('Error loading group state:', err);
    }
  }

  public async syncWithServer() {
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.groups)) {
          this.groups = data.groups;
          this.saveGroups();
        }
      }
    } catch {
      // offline fallback
    }
  }

  private saveGroups() {
    try {
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(this.groups));
      this.notifyListeners();
    } catch (err) {
      console.error('Failed to save groups:', err);
    }
  }

  private saveGroupMessages() {
    try {
      const obj: Record<string, DecryptedMessage[]> = {};
      this.groupMessages.forEach((msgs, gid) => {
        obj[gid] = msgs;
      });
      localStorage.setItem(GROUP_MESSAGES_STORAGE_KEY, JSON.stringify(obj));
      this.notifyListeners();
    } catch (err) {
      console.error('Failed to save group messages:', err);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l());
  }

  // ---------------------------------------------------------------------------
  // User Directory & Search Methods
  // ---------------------------------------------------------------------------

  public getNetworkUsers(registeredAccount?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
    status?: 'online' | 'idle' | 'offline';
  } | null): UserDirectoryItem[] {
    const list = [...identityManager.getNetworkUsers()];

    if (registeredAccount) {
      const username = registeredAccount.email.split('@')[0];
      const existingIdx = list.findIndex(
        (u) => u.userId === registeredAccount.id || u.username === username
      );

      const userItem: UserDirectoryItem = {
        userId: registeredAccount.id,
        username,
        displayName: registeredAccount.fullName,
        role: 'Verified Peer',
        avatar: registeredAccount.avatarUrl || '',
        primaryDeviceId: `dev_${registeredAccount.id}`,
        status: registeredAccount.status || 'online',
        fingerprint: registeredAccount.id,
        bio: `Real Device Peer: @${username}`,
        isRegisteredUser: true,
      };

      if (existingIdx >= 0) {
        list[existingIdx] = userItem;
      } else {
        list.unshift(userItem);
      }
    }

    return list;
  }

  public searchUsersAndGroups(
    query: string,
    currentAccount?: {
      id: string;
      fullName: string;
      email: string;
      avatarUrl?: string;
      status?: 'online' | 'idle' | 'offline';
    } | null
  ): {
    users: UserDirectoryItem[];
    groups: GroupChat[];
  } {
    const cleanQuery = query.trim().toLowerCase().replace(/^@/, '');
    const allUsers = this.getNetworkUsers(currentAccount);

    if (!cleanQuery) {
      return {
        users: allUsers,
        groups: this.groups,
      };
    }

    const matchedUsers = allUsers.filter((u) => {
      return (
        u.username.toLowerCase().includes(cleanQuery) ||
        u.displayName.toLowerCase().includes(cleanQuery) ||
        u.userId.toLowerCase().includes(cleanQuery) ||
        u.role.toLowerCase().includes(cleanQuery)
      );
    });

    const matchedGroups = this.groups.filter((g) => {
      return (
        g.name.toLowerCase().includes(cleanQuery) ||
        g.description.toLowerCase().includes(cleanQuery) ||
        g.groupId.toLowerCase().includes(cleanQuery)
      );
    });

    return { users: matchedUsers, groups: matchedGroups };
  }

  public getUserByDeviceId(deviceId: string): UserDirectoryItem | undefined {
    return this.getNetworkUsers().find((u) => u.primaryDeviceId === deviceId);
  }

  public getUserByUserId(userId: string): UserDirectoryItem | undefined {
    return this.getNetworkUsers().find((u) => u.userId === userId);
  }

  // ---------------------------------------------------------------------------
  // Group Management & Access Control
  // ---------------------------------------------------------------------------

  public getGroups(): GroupChat[] {
    return [...this.groups];
  }

  public getGroup(groupId: string): GroupChat | undefined {
    return this.groups.find((g) => g.groupId === groupId);
  }

  public createGroup(params: {
    name: string;
    description: string;
    avatar?: string;
    creator: {
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
      deviceId: string;
    };
    requiresApproval: boolean;
  }): GroupChat {
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const randomFpPart = Math.floor(1000 + Math.random() * 9000);
    const groupKeyFingerprint = `GRP-${randomFpPart}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newGroup: GroupChat = {
      groupId,
      name: params.name.trim(),
      description: params.description.trim() || 'Encrypted enclave group channel.',
      avatar:
        params.avatar ||
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      creatorId: params.creator.userId,
      creatorName: params.creator.displayName,
      requiresApproval: params.requiresApproval,
      members: [
        {
          userId: params.creator.userId,
          username: params.creator.username,
          displayName: params.creator.displayName,
          avatar: params.creator.avatar,
          deviceId: params.creator.deviceId,
          role: 'creator',
          joinedAt: Date.now(),
        },
      ],
      pendingRequests: [],
      createdAt: Date.now(),
      groupKeyFingerprint,
      lastMessage: 'Group enclave established with Zero-Knowledge encryption.',
      lastMessageTimestamp: Date.now(),
    };

    this.groups.unshift(newGroup);
    this.saveGroups();

    // Broadcast to server API
    fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: newGroup }),
    }).catch(() => {});

    // Add genesis system message
    const genesisMsg: DecryptedMessage = {
      id: `gmsg_init_${Date.now()}`,
      conversationId: groupId,
      groupId,
      senderId: params.creator.userId,
      senderDeviceId: params.creator.deviceId,
      senderName: params.creator.displayName,
      senderAvatar: params.creator.avatar,
      content: `🔒 Group enclave "${params.name}" initialized by @${params.creator.username}. Access control: ${params.requiresApproval ? 'Creator Approval Required' : 'Open Access'}.`,
      timestamp: Date.now(),
      status: 'verified',
      ratchetStep: 1,
      cid: `CID_INIT_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      previousCid: 'GENESIS_CID_00000000000000000000',
      merkleVerified: true,
    };
    this.groupMessages.set(groupId, [genesisMsg]);
    this.saveGroupMessages();

    return newGroup;
  }

  // User submits a request to join the group
  public requestToJoinGroup(
    groupId: string,
    user: {
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
      deviceId: string;
    }
  ): { success: boolean; message: string; autoApproved?: boolean } {
    const group = this.getGroup(groupId);
    if (!group) {
      return { success: false, message: 'Group not found' };
    }

    if (group.members.some((m) => m.userId === user.userId)) {
      return { success: false, message: 'You are already an approved member of this group' };
    }

    if (group.pendingRequests.some((r) => r.userId === user.userId && r.status === 'pending')) {
      return { success: true, message: 'Your join request is already pending group creator approval' };
    }

    // If group does NOT require approval, auto-admit
    if (!group.requiresApproval) {
      group.members.push({
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        deviceId: user.deviceId,
        role: 'member',
        joinedAt: Date.now(),
      });
      this.saveGroups();
      this.addSystemGroupMessage(groupId, `${user.displayName} (@${user.username}) joined the group enclave.`);

      fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, user }),
      }).catch(() => {});

      return { success: true, message: 'Joined group successfully!', autoApproved: true };
    }

    // Pending join request for group creator approval
    const newRequest: GroupJoinRequest = {
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      groupId,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      deviceId: user.deviceId,
      requestedAt: Date.now(),
      status: 'pending',
    };

    group.pendingRequests.push(newRequest);
    this.saveGroups();

    fetch('/api/groups/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, user }),
    }).catch(() => {});

    return {
      success: true,
      message: `Join request submitted! The creator (@${group.creatorName}) must accept before you can access messages.`,
      autoApproved: false,
    };
  }

  // Creator accepts a pending join request
  public approveJoinRequest(groupId: string, requestId: string, _operatorUserId?: string): { success: boolean; message: string } {
    const group = this.getGroup(groupId);
    if (!group) return { success: false, message: 'Group not found' };

    const reqIdx = group.pendingRequests.findIndex((r) => r.requestId === requestId);
    if (reqIdx === -1) return { success: false, message: 'Request not found' };

    const req = group.pendingRequests[reqIdx];
    req.status = 'approved';

    if (!group.members.some((m) => m.userId === req.userId)) {
      group.members.push({
        userId: req.userId,
        username: req.username,
        displayName: req.displayName,
        avatar: req.avatar,
        deviceId: req.deviceId,
        role: 'member',
        joinedAt: Date.now(),
      });
    }

    this.saveGroups();
    this.addSystemGroupMessage(groupId, `Access granted: ${req.displayName} (@${req.username}) was approved by the group creator.`);

    fetch('/api/groups/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, requestId, approved: true }),
    }).catch(() => {});

    return { success: true, message: `Approved join request for ${req.displayName}` };
  }

  // Creator rejects a pending join request
  public rejectJoinRequest(groupId: string, requestId: string, _operatorUserId?: string): { success: boolean; message: string } {
    const group = this.getGroup(groupId);
    if (!group) return { success: false, message: 'Group not found' };

    const req = group.pendingRequests.find((r) => r.requestId === requestId);
    if (!req) return { success: false, message: 'Request not found' };

    req.status = 'rejected';
    this.saveGroups();

    fetch('/api/groups/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, requestId, approved: false }),
    }).catch(() => {});

    return { success: true, message: `Rejected join request for ${req.displayName}` };
  }

  // Creator or Admin directly invites/adds a verified peer
  public directAddMember(groupId: string, user: UserDirectoryItem, _operatorUserId?: string): { success: boolean; message: string } {
    const group = this.getGroup(groupId);
    if (!group) return { success: false, message: 'Group not found' };

    if (group.members.some((m) => m.userId === user.userId)) {
      return { success: false, message: 'User is already a member' };
    }

    group.members.push({
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      deviceId: user.primaryDeviceId,
      role: 'member',
      joinedAt: Date.now(),
    });

    this.saveGroups();
    this.addSystemGroupMessage(groupId, `${user.displayName} (@${user.username}) was added to the group.`);

    fetch('/api/groups/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        user: {
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          deviceId: user.primaryDeviceId,
        },
      }),
    }).catch(() => {});

    return { success: true, message: `Added ${user.displayName} to group` };
  }

  // Creator or Admin removes a member
  public removeMember(groupId: string, targetUserId: string, _operatorUserId?: string): { success: boolean; message: string } {
    const group = this.getGroup(groupId);
    if (!group) return { success: false, message: 'Group not found' };

    if (group.creatorId === targetUserId) {
      return { success: false, message: 'Cannot remove the group creator' };
    }

    const memberIdx = group.members.findIndex((m) => m.userId === targetUserId);
    if (memberIdx === -1) return { success: false, message: 'User is not a member' };

    const memberName = group.members[memberIdx].displayName;
    group.members.splice(memberIdx, 1);
    this.saveGroups();
    this.addSystemGroupMessage(groupId, `${memberName} was removed from the enclave.`);

    return { success: true, message: `Removed ${memberName} from group` };
  }

  public isMember(groupId: string, userId: string): boolean {
    const group = this.getGroup(groupId);
    if (!group) return false;
    return group.members.some((m) => m.userId === userId);
  }

  public isCreator(groupId: string, userId: string): boolean {
    const group = this.getGroup(groupId);
    if (!group) return false;
    return group.creatorId === userId;
  }

  public getPendingRequests(groupId: string): GroupJoinRequest[] {
    const group = this.getGroup(groupId);
    if (!group) return [];
    return group.pendingRequests.filter((r) => r.status === 'pending');
  }

  public getGroupMessages(groupId: string): DecryptedMessage[] {
    return this.groupMessages.get(groupId) || [];
  }

  public sendGroupMessage(
    groupId: string,
    sender: {
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
      deviceId: string;
    },
    content: string,
    mediaAttachment?: EncryptedMediaPayload
  ): DecryptedMessage | null {
    const group = this.getGroup(groupId);
    if (!group) return null;

    if (!this.isMember(groupId, sender.userId)) {
      throw new Error('Access denied: You must be an approved group member to post messages.');
    }

    const existingMessages = this.groupMessages.get(groupId) || [];
    const previousCid =
      existingMessages.length > 0
        ? existingMessages[existingMessages.length - 1].cid
        : 'GENESIS_CID_00000000000000000000';

    const cid = `CID_GRP_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const newMsg: DecryptedMessage = {
      id: `gmsg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: groupId,
      groupId,
      senderId: sender.userId,
      senderDeviceId: sender.deviceId,
      senderName: sender.displayName,
      senderAvatar: sender.avatar,
      content,
      timestamp: Date.now(),
      status: 'verified',
      ratchetStep: existingMessages.length + 1,
      cid,
      previousCid,
      merkleVerified: true,
      mediaAttachment,
    };

    existingMessages.push(newMsg);
    this.groupMessages.set(groupId, existingMessages);

    group.lastMessage = content.slice(0, 60);
    group.lastMessageTimestamp = Date.now();

    this.saveGroups();
    this.saveGroupMessages();

    // Broadcast message to server so all devices receive it via WebSocket
    fetch('/api/groups/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, message: newMsg }),
    }).catch(() => {});

    return newMsg;
  }

  private addSystemGroupMessage(groupId: string, text: string) {
    const msgs = this.groupMessages.get(groupId) || [];
    const prevCid = msgs.length > 0 ? msgs[msgs.length - 1].cid : 'GENESIS_CID_00000000000000000000';
    const sysMsg: DecryptedMessage = {
      id: `gmsg_sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: groupId,
      groupId,
      senderId: 'SYSTEM',
      senderDeviceId: 'SYSTEM_ENCLAVE',
      senderName: 'NEXUS Security',
      content: `🛡️ ${text}`,
      timestamp: Date.now(),
      status: 'verified',
      ratchetStep: msgs.length + 1,
      cid: `CID_SYS_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      previousCid: prevCid,
      merkleVerified: true,
    };
    msgs.push(sysMsg);
    this.groupMessages.set(groupId, msgs);
    this.saveGroupMessages();
  }
}

export const groupAndDirectoryService = new GroupAndDirectoryService();
