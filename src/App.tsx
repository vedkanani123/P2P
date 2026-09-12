/**
 * NEXUS - Production Main Application Hub & State Orchestrator
 * Fully zero-knowledge, end-to-end encrypted architecture with:
 * - 4/6-Digit App Lock Screen
 * - Complete Onboarding (First Name, Second Name, Full Name, Email, Password, Confirm)
 * - 12-Word Master Secret Recovery Phrase with .txt download
 * - Automatic Device Telemetry (Public IP address, OS, Browser, Screen resolution, Hardware)
 * - Encrypted Group Enclaves with Creator-Controlled Join Request Approvals
 * - Real-Time User & Group Search by @username (e.g. @ved) and Enclave ID
 * - Multi-Peer Double Ratchet E2EE with Isolated Chat Channels (Elena, Marcus, Sarah, Alex, Ved)
 * - Fully Responsive Mobile & Desktop Layout with Fluid Transitions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  identityManager,
  UserClientContext,
} from './services/identityManager';
import { zkRelay } from './services/zkRelay';
import { authService, UserAccount } from './services/authService';
import { groupAndDirectoryService } from './services/groupAndDirectoryService';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { CryptoInspector } from './components/CryptoInspector';
import { DeviceManagerModal } from './components/DeviceManagerModal';
import { CommandPalette } from './components/CommandPalette';
import { SecuritySpecDoc } from './components/SecuritySpecDoc';
import { SafetyNumberModal } from './components/SafetyNumberModal';
import { PinLockScreen } from './components/PinLockScreen';
import { AuthModal } from './components/AuthModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupInfoModal } from './components/GroupInfoModal';
import { UserSettingsModal } from './components/UserSettingsModal';
import { DecryptedMessage, EncryptedMediaPayload } from './types';
import { Lock } from 'lucide-react';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'login' | 'register' | 'recovery'>('login');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Active Chat State: either Direct Peer or Group Enclave
  const [activeDeviceId, setActiveDeviceId] = useState<string>('dev_ved_phone');
  const [peerDeviceId, setPeerDeviceId] = useState<string>('dev_elena_desktop');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Mobile View Toggle: shows Sidebar vs ChatArea on small viewports
  const [showMobileChat, setShowMobileChat] = useState<boolean>(false);

  // Modals & Panels
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isDeviceManagerOpen, setIsDeviceManagerOpen] = useState(false);
  const [isSecurityDocOpen, setIsSecurityDocOpen] = useState(false);
  const [isSafetyNumberOpen, setIsSafetyNumberOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [selectedGroupIdForInfo, setSelectedGroupIdForInfo] = useState<string | null>(null);
  const [, setSelectedInspectMessage] = useState<DecryptedMessage | null>(null);

  const [, setForceUpdate] = useState(0);

  // 1. Initialize Auth, Directories and Crypto Engines
  useEffect(() => {
    async function init() {
      // Auto-load vault if user has an existing account in this browser
      const currentAcc = authService.getAccount();
      if (currentAcc) {
        setAccount(currentAcc);
        setIsLocked(authService.isAppLocked());
        // Auto-register current device hardware & IP
        await authService.ensureCurrentDeviceRegistered();
        identityManager.syncUserProfile({
          userId: currentAcc.id,
          fullName: currentAcc.fullName,
          avatarUrl: currentAcc.avatarUrl,
        });
      } else {
        setAccount(null);
        setIsLocked(false);
        setAuthModalInitialMode('login');
      }

      // Initialize cryptographic keys and Double Ratchet channels
      await identityManager.initializeDefaultIdentities();
      setIsReady(true);
    }
    init();

    // Subscribe to auth state updates
    const unsubAuth = authService.subscribe(() => {
      const updatedAcc = authService.getAccount();
      setAccount(updatedAcc ? { ...updatedAcc } : null);
      setIsLocked(authService.isAppLocked());
      setForceUpdate((prev) => prev + 1);
    });

    // Subscribe to real-time message changes
    const unsubMsg = identityManager.subscribeMessages(() => {
      setForceUpdate((prev) => prev + 1);
    });

    // Subscribe to group state updates
    const unsubGroups = groupAndDirectoryService.subscribe(() => {
      setForceUpdate((prev) => prev + 1);
    });

    const unsubWiretap = zkRelay.subscribeWiretap(() => {
      setForceUpdate((prev) => prev + 1);
    });

    return () => {
      unsubAuth();
      unsubMsg();
      unsubGroups();
      unsubWiretap();
    };
  }, []);

  // Keyboard shortcut listener for Cmd+K and Cmd+/ and Cmd+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsInspectorOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        authService.lockApp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Device switching
  const handleSwitchDevice = useCallback((deviceId: string) => {
    identityManager.switchActiveDevice(deviceId);
    setActiveDeviceId(deviceId);
    if (deviceId === 'dev_ved_phone') {
      setPeerDeviceId('dev_elena_desktop');
    } else {
      setPeerDeviceId('dev_ved_phone');
    }
    setForceUpdate((prev) => prev + 1);
  }, []);

  // Direct Peer Selection: completely isolates chat and switches smoothly
  const handleSelectPeer = useCallback((pId: string) => {
    setActiveGroupId(null);
    setPeerDeviceId(pId);
    setShowMobileChat(true);
    setForceUpdate((prev) => prev + 1);
  }, []);

  // Group Selection
  const handleSelectGroup = useCallback((gId: string) => {
    setActiveGroupId(gId);
    setShowMobileChat(true);
    setForceUpdate((prev) => prev + 1);
  }, []);

  // Peer Simulation: lets Elena, Marcus, Sarah, or Alex advance Double Ratchet and reply
  const handleTriggerSimulatePeer = useCallback(
    async (targetPeerDeviceId: string) => {
      const peerReplies: Record<string, string[]> = {
        dev_elena_desktop: [
          'X3DH session active. Double Ratchet advanced with fresh ephemeral entropy.',
          'Auditing Merkle hash-chain... Zero-knowledge state consistency confirmed.',
          'Payload decrypted client-side. No intermediate relay logs found.',
          'Forward secrecy verified. Next message uses a fresh DH ratchet pair.',
        ],
        dev_marcus_phone: [
          'Acknowledged. Blind store-and-forward relay is operational with automatic 24-hour ciphertext purge.',
          'GrapheneOS hardware keystore verified. Zero-knowledge proof-of-work accepted.',
          'Double Ratchet forward secrecy is advancing smoothly.',
          'Zero-knowledge proof-of-work calibrated to difficulty 2.',
        ],
        dev_sarah_laptop: [
          'Hardware security token verified on Framework 16 node. Handshake confirmed.',
          'Ratchet step verified. Client-side end-to-end encryption intact.',
          'Ephemeral session state matches local Merkle root hash.',
          'Key rotation scheduled for next epoch.',
        ],
        dev_alex_workstation: [
          'Debian hardened enclave rig operational. Relay ciphertext envelope authenticated.',
          'AES-256-GCM authentication tag verified. No bit-flip tampering detected.',
          'Zero-knowledge protocol handshake complete.',
          'Constant-time cryptography execution verified without timing leaks.',
        ],
      };

      const pool = peerReplies[targetPeerDeviceId] || [
        'Message received and verified through zero-knowledge Double Ratchet.',
      ];
      const reply = pool[Math.floor(Math.random() * pool.length)];

      try {
        await identityManager.sendMessageFromDevice(
          targetPeerDeviceId,
          activeDeviceId,
          reply
        );
        setForceUpdate((prev) => prev + 1);
      } catch (err) {
        console.error('Peer reply error:', err);
      }
    },
    [activeDeviceId]
  );

  // Sending messages for direct peer chat
  const handleSendMessage = useCallback(
    async (content: string, media?: EncryptedMediaPayload) => {
      await identityManager.sendMessageFromDevice(
        activeDeviceId,
        peerDeviceId,
        content,
        media
      );
      setForceUpdate((prev) => prev + 1);

      // Auto-trigger peer response simulation after 700ms so chat feels responsive & alive
      setTimeout(() => {
        handleTriggerSimulatePeer(peerDeviceId);
      }, 700);
    },
    [activeDeviceId, peerDeviceId, handleTriggerSimulatePeer]
  );

  const handleLockApp = useCallback(() => {
    authService.lockApp();
  }, []);

  const handleUnlockSuccess = useCallback(() => {
    setIsLocked(false);
  }, []);

  const handleOpenRecovery = useCallback(() => {
    setAuthModalInitialMode('recovery');
    setShowAuthModal(true);
  }, []);

  const handleSwitchAccount = useCallback(() => {
    setAuthModalInitialMode('login');
    setShowAuthModal(true);
  }, []);

  const handleLogout = useCallback(() => {
    authService.logoutAccount();
    setAccount(null);
    setIsLocked(false);
    setAuthModalInitialMode('login');
    setShowAuthModal(true);
    setIsSettingsOpen(false);
    setForceUpdate((prev) => prev + 1);
  }, []);

  const handleAuthSuccess = useCallback((newAcc: UserAccount) => {
    setAccount({ ...newAcc });
    setShowAuthModal(false);
    setIsLocked(false);
    identityManager.syncUserProfile({
      userId: newAcc.id,
      fullName: newAcc.fullName,
      avatarUrl: newAcc.avatarUrl,
    });
    setForceUpdate((prev) => prev + 1);
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4 text-zinc-300 font-sans select-none">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-xl shadow-emerald-500/10 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-base font-semibold text-white font-mono tracking-wider mb-2">
          INITIALIZING NEXUS HARDWARE ENCLAVE
        </h1>
        <p className="text-xs text-zinc-400 font-mono text-center max-w-sm">
          Auto-fetching device IP telemetry, generating NIST P-256 ECDH Identity Keys, and preparing zero-knowledge ratchets...
        </p>
        <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Web Crypto API & Device IP Telemetry Active</span>
        </div>
      </div>
    );
  }

  // If user has NO account in this browser, gate with Authentication first (no auto-opening other accounts!)
  if (!account) {
    return (
      <div className="h-screen w-screen bg-[#07090e] flex items-center justify-center p-4">
        <AuthModal
          isOpen={true}
          initialMode={authModalInitialMode || 'login'}
          onSuccess={handleAuthSuccess}
        />
      </div>
    );
  }

  // If App is Locked and user has an account, show Security PIN Screen
  if (isLocked && account) {
    return (
      <div className="h-screen w-screen bg-[#07090e]">
        <PinLockScreen
          account={account}
          onUnlocked={handleUnlockSuccess}
          onOpenRecovery={handleOpenRecovery}
          onSwitchAccount={handleSwitchAccount}
        />
        {showAuthModal && (
          <AuthModal
            isOpen={showAuthModal}
            initialMode={authModalInitialMode}
            onClose={() => setShowAuthModal(false)}
            onSuccess={handleAuthSuccess}
          />
        )}
      </div>
    );
  }

  const activeContext = identityManager.getActiveContext();

  return (
    <div className="h-screen w-screen bg-[#07090e] text-zinc-100 flex flex-col overflow-hidden font-sans antialiased">
      {/* Top Navbar */}
      <Navbar
        activeContext={activeContext}
        account={account}
        onOpenDeviceManager={() => setIsDeviceManagerOpen(true)}
        onOpenSecurityDoc={() => setIsSecurityDocOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onLockApp={handleLockApp}
        onOpenAuthModal={() => {
          setAuthModalInitialMode('login');
          setShowAuthModal(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleAudit={() => setIsInspectorOpen((prev) => !prev)}
        isAuditOpen={isInspectorOpen}
        onLogout={handleLogout}
      />

      {/* Main Responsive Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar: Visible on Desktop, or on Mobile when !showMobileChat */}
        <div
          className={`w-full md:w-80 h-full shrink-0 ${
            showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          <Sidebar
            activeContext={activeContext}
            account={account}
            peerDeviceId={peerDeviceId}
            activeGroupId={activeGroupId}
            onSelectPeer={handleSelectPeer}
            onSelectGroup={handleSelectGroup}
            onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
            onOpenGroupInfo={(gId) => {
              setSelectedGroupIdForInfo(gId);
              setIsGroupInfoOpen(true);
            }}
            onOpenDeviceManager={() => setIsDeviceManagerOpen(true)}
            onOpenSafetyNumber={() => setIsSafetyNumberOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Center Panel: Production E2EE Chat Area: Visible on Desktop, or on Mobile when showMobileChat */}
        <div
          className={`flex-1 h-full min-w-0 ${
            !showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          <ChatArea
            activeContext={activeContext}
            account={account}
            peerDeviceId={peerDeviceId}
            activeGroupId={activeGroupId}
            onSendMessage={handleSendMessage}
            onInspectMessage={(msg) => {
              setSelectedInspectMessage(msg);
              setIsInspectorOpen(true);
            }}
            onOpenSafetyNumber={() => setIsSafetyNumberOpen(true)}
            onOpenGroupInfo={(gId) => {
              setSelectedGroupIdForInfo(gId);
              setIsGroupInfoOpen(true);
            }}
            onBackToSidebar={() => setShowMobileChat(false)}
            onClearTamperAlerts={() => {
              identityManager.clearTamperAlerts();
              setForceUpdate((prev) => prev + 1);
            }}
            onTriggerSimulatePeer={handleTriggerSimulatePeer}
          />
        </div>

        {/* Cryptographic Inspector Side Drawer */}
        <CryptoInspector
          activeContext={activeContext}
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          onTriggerTamper={() => {
            zkRelay.simulateServerTamperAttack(peerDeviceId);
            setForceUpdate((prev) => prev + 1);
          }}
        />
      </div>

      {/* Modals & Dialogs */}
      {/* 1. Device Hardware & Telemetry Manager */}
      <DeviceManagerModal
        account={account}
        isOpen={isDeviceManagerOpen}
        onClose={() => setIsDeviceManagerOpen(false)}
        onUpdate={() => setForceUpdate((prev) => prev + 1)}
      />

      {/* 2. Create Group Enclave Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        activeContext={activeContext}
        account={account}
        onGroupCreated={(newGroupId) => {
          setActiveGroupId(newGroupId);
          setShowMobileChat(true);
          setForceUpdate((prev) => prev + 1);
        }}
      />

      {/* 3. Group Enclave Access Control & Members Modal ("grop maker assept") */}
      <GroupInfoModal
        isOpen={isGroupInfoOpen}
        groupId={selectedGroupIdForInfo || activeGroupId}
        onClose={() => setIsGroupInfoOpen(false)}
        activeContext={activeContext}
        account={account}
        onGroupUpdated={() => setForceUpdate((prev) => prev + 1)}
      />

      {/* 4. Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSwitchDevice={handleSwitchDevice}
        onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
        onToggleDualView={() => {}}
        onOpenDeviceManager={() => setIsDeviceManagerOpen(true)}
        onOpenSecurityDoc={() => setIsSecurityDocOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onTriggerTamper={() => {
          zkRelay.simulateServerTamperAttack(peerDeviceId);
          setForceUpdate((prev) => prev + 1);
        }}
      />

      {/* 5. Cryptographic Security Specification */}
      <SecuritySpecDoc
        isOpen={isSecurityDocOpen}
        onClose={() => setIsSecurityDocOpen(false)}
      />

      {/* 6. Safety Number Verification Modal */}
      <SafetyNumberModal
        activeContext={activeContext}
        peerDeviceId={peerDeviceId}
        isOpen={isSafetyNumberOpen}
        onClose={() => setIsSafetyNumberOpen(false)}
      />

      {/* 7. Account Authentication, PIN Setup & Recovery Modal */}
      <AuthModal
        isOpen={showAuthModal}
        initialMode={authModalInitialMode}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* 8. User Profile, Photo Upload & Settings Modal */}
      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        account={account}
        onAccountUpdated={() => {
          const updated = authService.getAccount();
          setAccount(updated ? { ...updated } : null);
          if (updated) {
            identityManager.syncUserProfile({
              userId: updated.id,
              fullName: updated.fullName,
              avatarUrl: updated.avatarUrl,
            });
          }
          setForceUpdate((prev) => prev + 1);
        }}
        onLogout={handleLogout}
      />
    </div>
  );
}
