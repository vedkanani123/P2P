/**
 * NEXUS - Dual Device / Split Screen P2P Simulator
 * Allows user to test live 1:1 Double Ratchet encryption between Ved and Elena side-by-side.
 * Shows the encrypted packet traversing the Zero-Knowledge Relay Server in the center!
 */

import React, { useState } from 'react';
import {
  Smartphone,
  Laptop,
  ArrowRight,
  ShieldCheck,
  Send,
  Lock,
  Radio,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { UserClientContext, identityManager } from '../services/identityManager';
import { zkRelay } from '../services/zkRelay';

interface DualDeviceViewProps {
  vedContext: UserClientContext;
  elenaContext: UserClientContext;
  onRefresh: () => void;
}

export const DualDeviceView: React.FC<DualDeviceViewProps> = ({
  vedContext,
  elenaContext,
  onRefresh,
}) => {
  const [vedInput, setVedInput] = useState('');
  const [elenaInput, setElenaInput] = useState('');
  const [isRelaying, setIsRelaying] = useState(false);
  const [lastRelayedCiphertext, setLastRelayedCiphertext] = useState<string>('');

  const handleSendFromVed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vedInput.trim()) return;

    const text = vedInput;
    setVedInput('');
    setIsRelaying(true);

    try {
      await identityManager.sendMessageFromDevice(
        'dev_ved_phone',
        'dev_elena_desktop',
        text
      );
      const wiretaps = zkRelay.getWiretapLogs();
      if (wiretaps.length > 0) {
        setLastRelayedCiphertext(wiretaps[0].rawCiphertextHexPreview);
      }
      onRefresh();
    } finally {
      setTimeout(() => setIsRelaying(false), 300);
    }
  };

  const handleSendFromElena = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!elenaInput.trim()) return;

    const text = elenaInput;
    setElenaInput('');
    setIsRelaying(true);

    try {
      await identityManager.sendMessageFromDevice(
        'dev_elena_desktop',
        'dev_ved_phone',
        text
      );
      const wiretaps = zkRelay.getWiretapLogs();
      if (wiretaps.length > 0) {
        setLastRelayedCiphertext(wiretaps[0].rawCiphertextHexPreview);
      }
      onRefresh();
    } finally {
      setTimeout(() => setIsRelaying(false), 300);
    }
  };

  const vedSession = vedContext.sessions.get('dev_elena_desktop');
  const elenaSession = elenaContext.sessions.get('dev_ved_phone');

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07090e] overflow-hidden">
      {/* Simulator Header */}
      <div className="h-12 border-b border-white/[0.08] px-4 flex items-center justify-between bg-black/60 select-none">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-white font-mono uppercase tracking-wider">
            Live Dual P2P / Relay Simulator
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Real-Time Ratchet Synchronization
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
          <span>Ratchet Step: {vedSession?.sendSequenceNumber || 0}</span>
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
            title="Refresh View"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Real-time Relay Packet Animation Banner */}
      <div className="bg-[#0b0e14] border-b border-white/[0.06] p-2 px-4 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-zinc-400">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <span>Server Relay Wire:</span>
          <span className="text-zinc-300 truncate max-w-md">
            {isRelaying ? (
              <span className="text-amber-400 animate-pulse font-semibold">
                [Transmitting Opaque Encrypted Blob...]
              </span>
            ) : lastRelayedCiphertext ? (
              <span className="text-emerald-400">{lastRelayedCiphertext}</span>
            ) : (
              'Listening for encrypted envelopes...'
            )}
          </span>
        </div>
        <div className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          0 Plaintext Leaked
        </div>
      </div>

      {/* Split Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.08] overflow-hidden">
        {/* Left: Ved (Phone) */}
        <div className="flex flex-col h-full bg-[#0a0d14] overflow-hidden">
          {/* Peer Header */}
          <div className="p-3 border-b border-white/[0.06] bg-black/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Ved Kanani (iPhone 15 Pro)</div>
                <div className="text-[10px] font-mono text-zinc-400">dev_ved_phone • Alice</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              Sending Chain Active
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {vedContext.messages.map((msg, idx) => {
              const isMe = msg.senderDeviceId === 'dev_ved_phone';
              return (
                <div
                  key={`${msg.id}_ved_${idx}`}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl p-2.5 text-xs ${
                      isMe
                        ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-100'
                        : 'bg-[#151a24] border border-white/10 text-zinc-200'
                    }`}
                  >
                    <div className="text-[9px] font-mono text-zinc-400 mb-1 flex items-center justify-between gap-3">
                      <span>{isMe ? 'Ved' : 'Elena'}</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div>{msg.content}</div>
                    <div className="mt-1 text-[9px] font-mono text-zinc-400 flex items-center justify-between gap-2">
                      <span>CID: {msg.cid.substring(0, 8)}...</span>
                      <span className="text-emerald-400">Ratchet #{msg.ratchetStep}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <form onSubmit={handleSendFromVed} className="p-2 border-t border-white/[0.08] bg-black/40 flex gap-2">
            <input
              type="text"
              value={vedInput}
              onChange={(e) => setVedInput(e.target.value)}
              placeholder="Send from Ved..."
              className="flex-1 bg-[#121622] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-sans"
            />
            <button
              type="submit"
              className="p-2 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Right: Elena (Desktop) */}
        <div className="flex flex-col h-full bg-[#0a0d14] overflow-hidden">
          {/* Peer Header */}
          <div className="p-3 border-b border-white/[0.06] bg-black/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Elena Vance (ThinkPad X1)</div>
                <div className="text-[10px] font-mono text-zinc-400">dev_elena_desktop • Bob</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
              Receiving Chain Active
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {elenaContext.messages.map((msg, idx) => {
              const isMe = msg.senderDeviceId === 'dev_elena_desktop';
              return (
                <div
                  key={`${msg.id}_elena_${idx}`}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl p-2.5 text-xs ${
                      isMe
                        ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100'
                        : 'bg-[#151a24] border border-white/10 text-zinc-200'
                    }`}
                  >
                    <div className="text-[9px] font-mono text-zinc-400 mb-1 flex items-center justify-between gap-3">
                      <span>{isMe ? 'Elena' : 'Ved'}</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div>{msg.content}</div>
                    <div className="mt-1 text-[9px] font-mono text-zinc-400 flex items-center justify-between gap-2">
                      <span>CID: {msg.cid.substring(0, 8)}...</span>
                      <span className="text-indigo-400">Ratchet #{msg.ratchetStep}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <form onSubmit={handleSendFromElena} className="p-2 border-t border-white/[0.08] bg-black/40 flex gap-2">
            <input
              type="text"
              value={elenaInput}
              onChange={(e) => setElenaInput(e.target.value)}
              placeholder="Send from Elena..."
              className="flex-1 bg-[#121622] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
            />
            <button
              type="submit"
              className="p-2 rounded-lg bg-indigo-500 text-white font-semibold hover:bg-indigo-400 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
