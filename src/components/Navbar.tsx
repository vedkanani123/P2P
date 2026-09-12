/**
 * NEXUS - Production Top Navigation Bar
 * Ultra-clean, production-ready interface with live encryption status,
 * IP & Device telemetry indicator, App Lock trigger, and user account controls.
 */

import React from 'react';
import {
  ShieldCheck,
  Smartphone,
  Laptop,
  Search,
  KeyRound,
  Lock,
  LogOut,
  User,
  Shield,
  Wifi,
} from 'lucide-react';
import { UserClientContext } from '../services/identityManager';
import { UserAccount, getUserInitials } from '../services/authService';

interface NavbarProps {
  activeContext: UserClientContext;
  account: UserAccount | null;
  onOpenDeviceManager: () => void;
  onOpenSecurityDoc: () => void;
  onOpenCommandPalette: () => void;
  onLockApp: () => void;
  onOpenAuthModal: () => void;
  onOpenSettings?: () => void;
  onToggleAudit: () => void;
  isAuditOpen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeContext,
  account,
  onOpenDeviceManager,
  onOpenSecurityDoc,
  onOpenCommandPalette,
  onLockApp,
  onOpenAuthModal,
  onOpenSettings,
  onToggleAudit,
  isAuditOpen,
}) => {
  const currentDevice = account?.devices?.find(
    (d) => d.deviceId === account.activeDeviceId
  ) || account?.devices?.[0];

  const initials = getUserInitials(account?.firstName, account?.lastName, account?.fullName);
  const status = account?.status || 'online';

  return (
    <header className="h-14 border-b border-white/[0.08] bg-[#0c1017]/95 backdrop-blur-md px-4 flex items-center justify-between z-20 select-none">
      {/* Brand & Security Guarantee */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/10">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-sm text-white font-mono">NEXUS</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                Zero-Knowledge E2EE
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:flex items-center gap-1.5">
              <span>Hardware Enclave Active</span>
              {currentDevice?.ipAddress && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-emerald-400 font-mono text-[10px]">
                    IP: {currentDevice.ipAddress}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Global Search / Quick Navigation */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 text-xs transition-colors ml-4"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search encrypted messages or verify keys...</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-zinc-400">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Devices Manager Button */}
        <button
          onClick={onOpenDeviceManager}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] border border-white/[0.06] text-xs font-mono transition-colors"
          title="Manage Authorized Devices & IP Telemetry"
        >
          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
          <span>Devices</span>
          <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
            {account?.devices?.length || 1}
          </span>
        </button>

        {/* Security Audit & Verification */}
        <button
          onClick={onToggleAudit}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
            isAuditOpen
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] border-white/[0.06]'
          }`}
          title="Open Cryptographic Audit & Relay Proof"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Audit</span>
        </button>

        {/* App Lock Button */}
        <button
          onClick={onLockApp}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-medium transition-all shadow-sm"
          title="Lock App with PIN"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Lock App</span>
        </button>

        {/* User Account / Profile Pill */}
        {account ? (
          <div className="flex items-center gap-2 pl-2 border-l border-white/[0.08]">
            <button
              onClick={onOpenSettings || onOpenAuthModal}
              className="flex items-center gap-2 py-1 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors group"
              title="Profile, Avatar & Security Settings"
            >
              <div className="relative">
                {account.avatarUrl ? (
                  <img
                    src={account.avatarUrl}
                    alt={account.fullName}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-emerald-500/50"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-[10px] font-bold font-mono">
                    {initials}
                  </div>
                )}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-[#0c1017] ${
                    status === 'online'
                      ? 'bg-emerald-400'
                      : status === 'idle'
                      ? 'bg-amber-400'
                      : 'bg-zinc-500'
                  }`}
                />
              </div>
              <span className="text-xs font-medium text-zinc-200 hidden lg:inline truncate max-w-[120px] group-hover:text-white">
                {account.fullName}
              </span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold font-mono transition-colors"
          >
            <User className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
