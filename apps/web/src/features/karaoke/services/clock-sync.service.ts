'use client';

import { ClockSyncResponse, SOCKET_EVENTS } from '@ktv/contracts';
import { karaokeApi } from '../api/karaoke-api';
import { socketManager } from '@/lib/socket/socket-client';

export interface ClockSample {
  rtt: number;
  offset: number;
  timestamp: number;
}

const MAX_SAMPLES = 8;
const MAX_VALID_RTT_MS = 3000;
const PERIODIC_SYNC_INTERVAL_MS = 60000;

export class ClockSyncService {
  private samples: ClockSample[] = [];
  private offsetMs = 0;
  private estimatedRttMs = 0;
  private syncTimer: NodeJS.Timeout | null = null;
  private listeners: Set<(offset: number) => void> = new Set();
  private isSyncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // Setup periodic synchronization
      this.syncTimer = setInterval(() => {
        this.sampleHttp().catch(() => {});
      }, PERIODIC_SYNC_INTERVAL_MS);

      // Handle visibility changes: resync immediately when user returns to tab
      document.addEventListener('visibilitychange', this.handleVisibilityChange);

      // Listen for socket connection to synchronize immediately over socket
      const socket = socketManager.getSocket();
      if (socket) {
        socket.on('connect', this.handleSocketConnect);
        socket.on(
          SOCKET_EVENTS.SERVER.KARAOKE_CLOCK_SYNC_RESPONSE,
          this.handleSocketClockResponse
        );
      }
    }
  }

  private handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.sync(2).catch(() => {});
    }
  };

  private handleSocketConnect = () => {
    this.sync(3).catch(() => {});
  };

  private handleSocketClockResponse = (payload: ClockSyncResponse) => {
    const t2 = Date.now();
    const t0 = payload.clientSendTime;
    const t1 = payload.serverTime;
    const rtt = t2 - t0;

    if (rtt >= 0 && rtt <= MAX_VALID_RTT_MS) {
      const offset = Math.round(t1 - (t0 + t2) / 2);
      this.addSample({ rtt, offset, timestamp: t2 });
    }
  };

  /**
   * Adds a valid clock measurement sample and recomputes the stable median offset.
   */
  public addSample(sample: ClockSample): void {
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }

    // Sort by lowest RTT to prefer samples with minimal network queuing jitter
    const sortedByRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    
    // Select top half lowest-RTT samples
    const bestCount = Math.max(1, Math.ceil(sortedByRtt.length / 2));
    const bestSamples = sortedByRtt.slice(0, bestCount);

    // Compute median offset from the best samples
    const offsets = bestSamples.map((s) => s.offset).sort((a, b) => a - b);
    const mid = Math.floor(offsets.length / 2);
    const medianOffset =
      offsets.length % 2 !== 0
        ? offsets[mid]!
        : Math.round((offsets[mid - 1]! + offsets[mid]!) / 2);

    const avgRtt = Math.round(
      bestSamples.reduce((sum, s) => sum + s.rtt, 0) / bestSamples.length
    );

    this.offsetMs = medianOffset;
    this.estimatedRttMs = avgRtt;

    this.notifyListeners();
  }

  /**
   * Perform an HTTP-based NTP clock sample.
   */
  public async sampleHttp(): Promise<ClockSample | null> {
    const t0 = Date.now();
    try {
      const res = await karaokeApi.getServerTime();
      const t2 = Date.now();
      const t1 = res.serverTime;
      const rtt = t2 - t0;

      if (rtt >= 0 && rtt <= MAX_VALID_RTT_MS) {
        const offset = Math.round(t1 - (t0 + t2) / 2);
        const sample: ClockSample = { rtt, offset, timestamp: t2 };
        this.addSample(sample);
        return sample;
      }
    } catch {
      // Ignore network failures for clock samples
    }
    return null;
  }

  /**
   * Perform a Socket.IO-based NTP clock sample if socket is connected.
   */
  public async sampleSocket(): Promise<ClockSample | null> {
    const socket = socketManager.getSocket();
    if (!socket || !socket.connected) {
      return this.sampleHttp();
    }

    return new Promise<ClockSample | null>((resolve) => {
      const t0 = Date.now();
      const timeout = setTimeout(() => {
        resolve(null);
      }, 2000);

      socket.emit(
        SOCKET_EVENTS.CLIENT.KARAOKE_CLOCK_SYNC,
        { clientSendTime: t0 },
        (res: { success: boolean; data?: ClockSyncResponse }) => {
          clearTimeout(timeout);
          if (res?.success && res.data) {
            const t2 = Date.now();
            const t1 = res.data.serverTime;
            const rtt = t2 - t0;
            if (rtt >= 0 && rtt <= MAX_VALID_RTT_MS) {
              const offset = Math.round(t1 - (t0 + t2) / 2);
              const sample: ClockSample = { rtt, offset, timestamp: t2 };
              this.addSample(sample);
              resolve(sample);
              return;
            }
          }
          resolve(null);
        }
      );
    });
  }

  /**
   * Runs a burst of N samples for rapid initial convergence.
   */
  public async sync(burstCount = 3): Promise<number> {
    if (this.isSyncing) return this.offsetMs;
    this.isSyncing = true;

    try {
      for (let i = 0; i < burstCount; i++) {
        await this.sampleSocket();
        if (i < burstCount - 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return this.offsetMs;
  }

  /**
   * Get estimated authoritative server time in milliseconds.
   */
  public now(): number {
    return Date.now() + this.offsetMs;
  }

  /**
   * Get current clock offset theta in milliseconds.
   */
  public getOffsetMs(): number {
    return this.offsetMs;
  }

  /**
   * Get estimated RTT in milliseconds.
   */
  public getEstimatedRttMs(): number {
    return this.estimatedRttMs;
  }

  public addListener(cb: (offset: number) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.offsetMs);
      } catch {
        // Suppress listener error
      }
    }
  }

  public destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    const socket = socketManager.getSocket();
    if (socket) {
      socket.off('connect', this.handleSocketConnect);
      socket.off(
        SOCKET_EVENTS.SERVER.KARAOKE_CLOCK_SYNC_RESPONSE,
        this.handleSocketClockResponse
      );
    }
    this.listeners.clear();
  }
}

export const clockSyncService = new ClockSyncService();
