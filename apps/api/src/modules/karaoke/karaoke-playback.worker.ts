import crypto from 'crypto';
import { RoomPlaybackStateModel } from './room-playback-state.model.js';
import { karaokeService } from './karaoke.service.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import {
  broadcastKaraokePlaybackUpdated,
  broadcastKaraokeQueueUpdated,
} from '../../realtime/karaoke.events.js';
import { logger } from '../../utils/logger.js';

export class KaraokePlaybackWorker {
  private readonly instanceId: string;
  private intervalTimer: NodeJS.Timeout | null = null;
  private precisionTimers: Map<string, NodeJS.Timeout> = new Map();
  private isProcessing = false;
  private isStopping = false;

  constructor() {
    this.instanceId = `karaoke_worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Starts the playback natural completion background worker.
   */
  public start(pollIntervalMs = 2000): void {
    if (this.intervalTimer) return;

    logger.info(
      { instanceId: this.instanceId, pollIntervalMs },
      '🚀 Starting Karaoke authoritative playback background worker'
    );

    this.intervalTimer = setInterval(() => {
      this.processDuePlaybacks().catch((err) => {
        logger.error({ instanceId: this.instanceId, err }, 'Unhandled error in playback worker cycle');
      });
    }, pollIntervalMs);

    // Initial sweep immediately upon startup
    this.processDuePlaybacks().catch((err) => {
      logger.error({ instanceId: this.instanceId, err }, 'Unhandled error in initial playback worker pass');
    });
  }

  /**
   * Gracefully stops the background worker.
   */
  public async stop(): Promise<void> {
    this.isStopping = true;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    // Clear all precision in-memory timers
    for (const [roomId, timer] of this.precisionTimers.entries()) {
      clearTimeout(timer);
      this.precisionTimers.delete(roomId);
    }

    logger.info({ instanceId: this.instanceId }, 'Stopping karaoke playback background worker...');

    // Wait if a cycle is currently executing (bounded to 4 seconds)
    const startTime = Date.now();
    while (this.isProcessing && Date.now() - startTime < 4000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info({ instanceId: this.instanceId }, 'Karaoke playback background worker stopped cleanly');
  }

  /**
   * Schedules a high-precision in-memory completion timer on this active node
   * for responsive sub-second track transitions.
   */
  public schedulePrecisionTimer(
    roomId: string,
    expectedPlaybackVersion: number,
    expectedCurrentQueueItemId: string | null,
    delayMs: number
  ): void {
    // Clear any existing timer for this room
    this.cancelPrecisionTimer(roomId);

    if (this.isStopping || delayMs < 0) return;

    const timer = setTimeout(async () => {
      this.precisionTimers.delete(roomId);
      try {
        await this.handleNaturalCompletion(
          roomId,
          expectedPlaybackVersion,
          expectedCurrentQueueItemId,
          null,
          'precision_timer'
        );
      } catch (err) {
        logger.warn({ roomId, err }, 'Precision timer completion execution aborted or failed');
      }
    }, Math.min(delayMs, 2147483647)); // Cap to max 32-bit integer ms

    this.precisionTimers.set(roomId, timer);
  }

  /**
   * Cancels any active in-memory precision timer for a room (e.g. on pause, skip, or stop).
   */
  public cancelPrecisionTimer(roomId: string): void {
    const existing = this.precisionTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.precisionTimers.delete(roomId);
    }
  }

  /**
   * Scans MongoDB for due playbacks and claims them atomically using distributed leases.
   */
  public async processDuePlaybacks(maxRoomsPerCycle = 10): Promise<number> {
    if (this.isProcessing || this.isStopping) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      while (processedCount < maxRoomsPerCycle && !this.isStopping) {
        const claimedState = await RoomPlaybackStateModel.claimDuePlayback(this.instanceId, 15000);
        if (!claimedState) {
          // No more overdue playbacks ready to claim
          break;
        }

        const roomId = claimedState.roomId.toString();
        const leaseToken = claimedState.leaseToken || '';
        const playbackVersion = claimedState.playbackVersion;
        const currentQueueItemId = claimedState.currentQueueItemId
          ? claimedState.currentQueueItemId.toString()
          : null;

        try {
          await this.handleNaturalCompletion(
            roomId,
            playbackVersion,
            currentQueueItemId,
            leaseToken,
            'lease_worker'
          );
        } finally {
          // Always release or clean up lease
          await RoomPlaybackStateModel.releasePlaybackLease(roomId, leaseToken);
        }

        processedCount++;
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Authoritatively completes the current track and advances the queue.
   */
  private async handleNaturalCompletion(
    roomId: string,
    expectedPlaybackVersion: number,
    expectedCurrentQueueItemId: string | null,
    leaseToken: string | null,
    source: 'precision_timer' | 'lease_worker'
  ): Promise<void> {
    logger.info(
      { roomId, expectedPlaybackVersion, expectedCurrentQueueItemId, leaseToken, source },
      'Executing server-authoritative natural playback completion'
    );

    const result = await karaokeService.advanceToNextTrack(roomId, {
      expectedPlaybackVersion,
      expectedCurrentQueueItemId,
      leaseToken,
      leaseWorkerInstanceId: this.instanceId,
      reason: 'natural_completion',
    });

    if (result) {
      const io = getSocketServer();
      if (io) {
        broadcastKaraokePlaybackUpdated(io, roomId, result.playback);
        broadcastKaraokeQueueUpdated(io, roomId, result.queue, 'status_changed');
      }
    }
  }
}

export const karaokePlaybackWorker = new KaraokePlaybackWorker();

// Connect scheduler to karaokeService
karaokeService.setScheduler({
  schedule: (roomId, version, currentQueueItemId, delayMs) =>
    karaokePlaybackWorker.schedulePrecisionTimer(roomId, version, currentQueueItemId, delayMs),
  cancel: (roomId) => karaokePlaybackWorker.cancelPrecisionTimer(roomId),
});
