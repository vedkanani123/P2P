/**
 * NEXUS - PeerSyncManager
 * Wraps identityManager.subscribeMessages, groupAndDirectoryService.subscribe,
 * and identityManager.subscribeDirectory with a high-performance batching mechanism
 * using requestAnimationFrame to eliminate redundant UI re-renders and ensure
 * message delivery happens in a single atomic UI update cycle.
 */

import { identityManager } from './identityManager';
import { groupAndDirectoryService } from './groupAndDirectoryService';

export interface PeerSyncBatchPayload {
  cycleId: number;
  timestamp: number;
  messageCount: number;
  groupCount: number;
  peerCount: number;
  sources: {
    messages: boolean;
    groups: boolean;
    directory: boolean;
  };
}

export type PeerSyncListener = (payload: PeerSyncBatchPayload) => void;

class PeerSyncManager {
  private listeners: Set<PeerSyncListener> = new Set();
  private scheduledFrameId: number | null = null;
  private cycleCounter: number = 0;
  private pendingSources = {
    messages: false,
    groups: false,
    directory: false,
  };

  private unsubMessages: (() => void) | null = null;
  private unsubGroups: (() => void) | null = null;
  private unsubDirectory: (() => void) | null = null;

  constructor() {
    this.bindUnderlyingServices();
  }

  private bindUnderlyingServices(): void {
    // 1. Wrap identityManager.subscribeMessages
    this.unsubMessages = identityManager.subscribeMessages(() => {
      this.pendingSources.messages = true;
      this.scheduleBatch();
    });

    // 2. Wrap groupAndDirectoryService.subscribe
    this.unsubGroups = groupAndDirectoryService.subscribe(() => {
      this.pendingSources.groups = true;
      this.scheduleBatch();
    });

    // 3. Wrap identityManager.subscribeDirectory
    this.unsubDirectory = identityManager.subscribeDirectory(() => {
      this.pendingSources.directory = true;
      this.scheduleBatch();
    });
  }

  /**
   * Schedules a batch dispatch on the next requestAnimationFrame.
   * If a frame is already scheduled, subsequent events in the same frame
   * are automatically batched without triggering additional frames.
   */
  public scheduleBatch(): void {
    if (this.scheduledFrameId !== null) {
      return;
    }

    this.scheduledFrameId = window.requestAnimationFrame(() => {
      this.scheduledFrameId = null;
      this.dispatchBatchCycle();
    });
  }

  /**
   * Executes atomic dispatch to all registered listeners.
   */
  public flush(): void {
    if (this.scheduledFrameId !== null) {
      cancelAnimationFrame(this.scheduledFrameId);
      this.scheduledFrameId = null;
    }
    this.dispatchBatchCycle();
  }

  private dispatchBatchCycle(): void {
    this.cycleCounter++;

    let currentMsgCount = 0;
    try {
      const activeCtx = identityManager.getActiveContext();
      if (activeCtx && Array.isArray(activeCtx.messages)) {
        currentMsgCount = activeCtx.messages.length;
      }
    } catch {
      // Identity context not ready yet
    }

    const payload: PeerSyncBatchPayload = {
      cycleId: this.cycleCounter,
      timestamp: Date.now(),
      messageCount: currentMsgCount,
      groupCount: groupAndDirectoryService.getGroups().length,
      peerCount: identityManager.getNetworkUsers().length,
      sources: { ...this.pendingSources },
    };

    // Reset pending flags for next cycle
    this.pendingSources = {
      messages: false,
      groups: false,
      directory: false,
    };

    // Notify all listeners in a single atomic update cycle
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error('[PeerSyncManager] Error in listener execution:', err);
      }
    });
  }

  /**
   * Subscribe to atomic batched state cycles.
   */
  public subscribe(listener: PeerSyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getCycleCount(): number {
    return this.cycleCounter;
  }

  public destroy(): void {
    if (this.scheduledFrameId !== null) {
      cancelAnimationFrame(this.scheduledFrameId);
      this.scheduledFrameId = null;
    }
    if (this.unsubMessages) this.unsubMessages();
    if (this.unsubGroups) this.unsubGroups();
    if (this.unsubDirectory) this.unsubDirectory();
    this.listeners.clear();
  }
}

export const peerSyncManager = new PeerSyncManager();
