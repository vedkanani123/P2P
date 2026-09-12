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
import { SessionVerificationModal } from './components/SessionVerificationModal';
import { peerSyncManager } from './services/peerSyncManager';
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
        setActiveDeviceId(currentAcc.activeDeviceId);

        // Verify device hardware & IP fingerprint headers during initial account load
        const isDeviceVerified = await authService.verifyInitialDeviceFingerprint();
        if (isDeviceVerified) {
          // Auto-register current device hardware & IP
          await authService.ensureCurrentDeviceRegistered();

          // Initialize user's real cryptographic keys and WebSocket relay
          await identityManager.initForUser(currentAcc);

          const peers = identityManager.getNetworkUsers().filter((u) => u.userId !== currentAcc.id);
          if (peers.length > 0) {
            setPeerDeviceId(peers[0].primaryDeviceId);
          } else {
            setPeerDeviceId('');
          }
        }
      } else {
        setAccount(null);
        setIsLocked(false);
        setAuthModalInitialMode('login');
      }

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

    // High-performance batched synchronization using requestAnimationFrame
    // Wraps message subscriptions, group subscriptions, and directory updates
    // in a single atomic UI update cycle, completely eliminating redundant re-renders
    const unsubSync = peerSyncManager.subscribe(() => {
      setForceUpdate((prev) => prev + 1);
    });

    const unsubWiretap = zkRelay.subscribeWiretap(() => {
      setForceUpdate((prev) => prev + 1);
    });

    return () => {
      unsubAuth();
      unsubSync();
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

  // Sending messages for direct peer chat (relayed in real-time over WebSocket to recipient device)
  const handleSendMessage = useCallback(
    async (content: string, media?: EncryptedMediaPayload) => {
      if (!peerDeviceId) return;
      await identityManager.sendMessageFromDevice(
        activeDeviceId,
        peerDeviceId,
        content,
        media
      );
      setForceUpdate((prev) => prev + 1);
    },
    [activeDeviceId, peerDeviceId]
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

  const handleAuthSuccess = useCallback(async (newAcc: UserAccount) => {
    setAccount({ ...newAcc });
    setShowAuthModal(false);
    setIsLocked(false);
    setActiveDeviceId(newAcc.activeDeviceId);
    await identityManager.initForUser(newAcc);
    const peers = identityManager.getNetworkUsers().filter((u) => u.userId !== newAcc.id);
    if (peers.length > 0) {
      setPeerDeviceId(peers[0].primaryDeviceId);
    } else {
      setPeerDeviceId('');
    }
    setForceUpdate((prev) => prev + 1);
  }, []);

  const handleSessionVerified = useCallback(async () => {
    const currentAcc = authService.getAccount();
    if (currentAcc) {
      setAccount({ ...currentAcc });
      setIsLocked(authService.isAppLocked());
      setActiveDeviceId(currentAcc.activeDeviceId);
      await authService.ensureCurrentDeviceRegistered();
      await identityManager.initForUser(currentAcc);
      const peers = identityManager.getNetworkUsers().filter((u) => u.userId !== currentAcc.id);
      if (peers.length > 0) {
        setPeerDeviceId(peers[0].primaryDeviceId);
      } else {
        setPeerDeviceId('');
      }
      setForceUpdate((prev) => prev + 1);
    }
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

  // Ephemeral Session Verification: Hardware / IP signature mismatch detected
  if (account && authService.isSessionVerificationRequired()) {
    return (
      <div className="h-screen w-screen bg-[#07090e]">
        <SessionVerificationModal
          account={account}
          onVerified={handleSessionVerified}
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

      {/* Main Responsive Content Area with Defensive Container Checks */}
      <div
        id="nexus-main-layout-container"
        className="flex-1 flex overflow-hidden relative w-full h-full"
      >
        {/* Defensive Container Check: Sidebar is strictly rendered via CSS class conditionals */}
        <div
          id="nexus-sidebar-container"
          className={`h-full shrink-0 transition-all duration-150 ${
            showMobileChat
              ? 'hidden md:flex md:w-80 md:flex-col'
              : 'flex flex-col w-full md:w-80'
          }`}
          style={{ maxWidth: showMobileChat ? undefined : '100%' }}
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

        {/* Defensive Container Check: ChatArea is strictly rendered via CSS class conditionals, zero overlap */}
        <div
          id="nexus-chat-area-container"
          className={`h-full min-w-0 flex-1 transition-all duration-150 ${
            !showMobileChat
              ? 'hidden md:flex md:flex-col'
              : 'flex flex-col w-full'
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
