/**
 * NEXUS - Command Palette (Cmd/Ctrl + K)
 * Fast accessibility, keyboard-driven navigation, and instant audit operations.
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Terminal,
  Smartphone,
  Laptop,
  ShieldAlert,
  KeyRound,
  FileCheck,
  Columns,
  Lock,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchDevice: (deviceId: string) => void;
  onToggleInspector: () => void;
  onToggleDualView: () => void;
  onOpenDeviceManager: () => void;
  onOpenSecurityDoc: () => void;
  onOpenSettings?: () => void;
  onTriggerTamper: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSwitchDevice,
  onToggleInspector,
  onToggleDualView,
  onOpenDeviceManager,
  onOpenSecurityDoc,
  onOpenSettings,
  onTriggerTamper,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'open_profile',
      title: 'Open Profile & Photo Settings (Change Photo, Initials & Status)',
      category: 'Profile',
      icon: Terminal,
      action: () => {
        if (onOpenSettings) onOpenSettings();
        onClose();
      },
    },
    {
      id: 'switch_ved',
      title: 'Switch Persona to Ved Kanani (Phone)',
      category: 'Identity',
      icon: Smartphone,
      action: () => {
        onSwitchDevice('dev_ved_phone');
        onClose();
      },
    },
    {
      id: 'switch_elena',
      title: 'Switch Persona to Elena Vance (Desktop)',
      category: 'Identity',
      icon: Laptop,
      action: () => {
        onSwitchDevice('dev_elena_desktop');
        onClose();
      },
    },
    {
      id: 'toggle_dual',
      title: 'Toggle Dual P2P / Relay Simulator',
      category: 'View',
      icon: Columns,
      action: () => {
        onToggleDualView();
        onClose();
      },
    },
    {
      id: 'open_inspector',
      title: 'Open Cryptographic Inspector (Ratchet & Wiretap)',
      category: 'Audit',
      icon: Terminal,
      action: () => {
        onToggleInspector();
        onClose();
      },
    },
    {
      id: 'open_devices',
      title: 'Manage Multi-Device Keys & Linked Devices',
      category: 'Security',
      icon: KeyRound,
      action: () => {
        onOpenDeviceManager();
        onClose();
      },
    },
    {
      id: 'open_doc',
      title: 'View Phase 1 Security Guarantee & Verification Document',
      category: 'Documentation',
      icon: FileCheck,
      action: () => {
        onOpenSecurityDoc();
        onClose();
      },
    },
    {
      id: 'tamper_attack',
      title: 'Simulate Relay Server Bit-Flip Attack (Tamper Proof)',
      category: 'Attack Simulation',
      icon: ShieldAlert,
      action: () => {
        onTriggerTamper();
        onClose();
      },
    },
  ];

  const filtered = actions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-24 p-4 select-none">
      <div className="w-full max-w-xl bg-[#0c1017] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden flex flex-col text-zinc-300">
        {/* Input */}
        <div className="p-3 border-b border-white/[0.08] flex items-center gap-3 bg-black/40">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search actions..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none font-sans"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Action list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-500 font-mono">
              No matching actions found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  className="w-full p-2.5 rounded-lg hover:bg-white/[0.06] text-left flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-white/[0.04] group-hover:bg-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:text-white">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-medium text-zinc-200 group-hover:text-white">
                      {item.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 uppercase">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
