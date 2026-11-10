import { Types } from 'mongoose';
import { RoomModel } from '../rooms/room.model.js';
import { RoomQueueItemModel } from './room-queue-item.model.js';
import { RoomPlaybackStateModel } from './room-playback-state.model.js';
import { karaokeService } from './karaoke.service.js';
import { logger } from '../../utils/logger.js';

export interface KaraokeReconcileResult {
  roomId: string;
  roomStatus: string;
  playbackStatus: string;
  playingItemCount: number;
  queuedItemCount: number;
  inconsistenciesDetected: string[];
  reconciled: boolean;
  actionTaken:
    | 'NONE'
    | 'CLOSED_ROOM_PURGED'
    | 'ORPHANED_PLAYBACK_RESET'
    | 'MULTIPLE_PLAYING_DEDUPLICATED'
    | 'OVERDUE_PLAYBACK_COMPLETED'
    | 'QUEUE_POSITIONS_REBALANCED';
}

export interface KaraokeReconcileSummary {
  dryRun: boolean;
  totalRoomsChecked: number;
  inconsistentRoomsCount: number;
  details: KaraokeReconcileResult[];
}

export class KaraokeReconciliationService {
  /**
   * Reconciles cross-collection queue and playback invariants for a single room.
   */
  public async reconcileRoom(roomId: string, dryRun = false): Promise<KaraokeReconcileResult | null> {
    if (!Types.ObjectId.isValid(roomId)) {
      return null;
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      return null;
    }

    const playbackState = await RoomPlaybackStateModel.findOne({ roomId: roomObjectId }).exec();
    const playingItems = await RoomQueueItemModel.find({ roomId: roomObjectId, status: 'playing' }).exec();
    const queuedItems = await RoomQueueItemModel.find({ roomId: roomObjectId, status: 'queued' })
      .sort({ position: 1, addedAt: 1 })
      .exec();

    const inconsistencies: string[] = [];
    let actionTaken: KaraokeReconcileResult['actionTaken'] = 'NONE';

    // 1. Closed Room Invariant: zero active queue items, playback idle, no playing items
    if (room.status === 'closed') {
      const activeQueueCount = playingItems.length + queuedItems.length;
      const isPlaybackActive = playbackState && playbackState.status !== 'idle';

      if (activeQueueCount > 0 || isPlaybackActive) {
        inconsistencies.push('CLOSED_ROOM_HAS_ACTIVE_KARAOKE_STATE');
        actionTaken = 'CLOSED_ROOM_PURGED';

        if (!dryRun) {
          await RoomQueueItemModel.updateMany(
            { roomId: roomObjectId, status: { $in: ['queued', 'playing'] } },
            { $set: { status: 'removed', position: 0, removedAt: new Date() } }
          ).exec();

          if (playbackState) {
            playbackState.currentQueueItemId = null;
            playbackState.status = 'idle';
            playbackState.positionMs = 0;
            playbackState.anchorStartedAt = null;
            playbackState.pausedAt = null;
            playbackState.playbackExpiresAt = null;
            playbackState.playbackVersion += 1;
            await playbackState.save();
          }

          if (room.currentSongTitle || room.currentSingerName) {
            room.currentSongTitle = null;
            room.currentSingerName = null;
            await room.save();
          }

          logger.info({ roomId }, '🛠️ Reconciled closed room: purged lingering queue and idle playback');
        }
      }

      return {
        roomId,
        roomStatus: room.status,
        playbackStatus: playbackState?.status || 'idle',
        playingItemCount: playingItems.length,
        queuedItemCount: queuedItems.length,
        inconsistenciesDetected: inconsistencies,
        reconciled: !dryRun && actionTaken !== 'NONE',
        actionTaken,
      };
    }

    // 2. Multiple Playing Items Invariant: at most one playing song per room
    if (playingItems.length > 1) {
      inconsistencies.push('MULTIPLE_PLAYING_ITEMS_DETECTED');
      actionTaken = 'MULTIPLE_PLAYING_DEDUPLICATED';

      if (!dryRun) {
        // Keep the item currently referenced by playbackState, or the earliest started item
        const keepId = playbackState?.currentQueueItemId
          ? playbackState.currentQueueItemId.toString()
          : playingItems[0]!._id.toString();

        for (const item of playingItems) {
          if (item._id.toString() !== keepId) {
            item.status = 'skipped';
            item.position = 0;
            item.completedAt = new Date();
            await item.save();
          }
        }

        logger.info(
          { roomId, keepId, duplicateCount: playingItems.length - 1 },
          '🛠️ Reconciled duplicate playing items in room'
        );
      }
    }

    // 3. Playback Reference Validity Invariant
    if (playbackState && playbackState.currentQueueItemId) {
      const referencedItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId).exec();

      if (!referencedItem) {
        inconsistencies.push('PLAYBACK_REFERENCES_MISSING_QUEUE_ITEM');
        actionTaken = 'ORPHANED_PLAYBACK_RESET';
        if (!dryRun) {
          playbackState.currentQueueItemId = null;
          playbackState.status = 'idle';
          playbackState.positionMs = 0;
          playbackState.anchorStartedAt = null;
          playbackState.pausedAt = null;
          playbackState.playbackExpiresAt = null;
          playbackState.playbackVersion += 1;
          await playbackState.save();
        }
      } else if (referencedItem.roomId.toString() !== roomId) {
        inconsistencies.push('PLAYBACK_REFERENCES_FOREIGN_ROOM_ITEM');
        actionTaken = 'ORPHANED_PLAYBACK_RESET';
        if (!dryRun) {
          playbackState.currentQueueItemId = null;
          playbackState.status = 'idle';
          playbackState.positionMs = 0;
          playbackState.anchorStartedAt = null;
          playbackState.pausedAt = null;
          playbackState.playbackExpiresAt = null;
          playbackState.playbackVersion += 1;
          await playbackState.save();
        }
      } else if (referencedItem.status !== 'playing') {
        inconsistencies.push('PLAYBACK_REFERENCES_NON_PLAYING_ITEM');
        actionTaken = 'ORPHANED_PLAYBACK_RESET';
        if (!dryRun) {
          // If playback status was playing but item is terminal, advance to next track
          await karaokeService.advanceToNextTrack(roomId, { reason: 'reconciliation' });
        }
      }
    } else if (playbackState && playbackState.status === 'playing' && playingItems.length === 0) {
      // Playback says playing but zero items are playing
      inconsistencies.push('PLAYBACK_PLAYING_WITHOUT_PLAYING_ITEM');
      actionTaken = 'ORPHANED_PLAYBACK_RESET';
      if (!dryRun) {
        playbackState.currentQueueItemId = null;
        playbackState.status = 'idle';
        playbackState.positionMs = 0;
        playbackState.anchorStartedAt = null;
        playbackState.pausedAt = null;
        playbackState.playbackExpiresAt = null;
        playbackState.playbackVersion += 1;
        await playbackState.save();
      }
    }

    // 4. Overdue Playback Invariant
    if (
      playbackState &&
      playbackState.status === 'playing' &&
      playbackState.anchorStartedAt &&
      playbackState.currentQueueItemId
    ) {
      const activeQueueItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId)
        .populate('songId')
        .exec();

      if (activeQueueItem && activeQueueItem.songId) {
        const songDurationMs = (activeQueueItem.songId as any).durationMs || 180000;
        const now = Date.now();
        const elapsed = now - playbackState.anchorStartedAt.getTime();
        const derivedMs = playbackState.positionMs + Math.max(0, elapsed);

        if (derivedMs >= songDurationMs) {
          inconsistencies.push('PLAYBACK_OVERDUE_FOR_NATURAL_COMPLETION');
          actionTaken = 'OVERDUE_PLAYBACK_COMPLETED';

          if (!dryRun) {
            logger.info({ roomId, songDurationMs, derivedMs }, '🛠️ Reconciling overdue playback track');
            await karaokeService.advanceToNextTrack(roomId, { reason: 'natural_completion' });
          }
        }
      }
    }

    // 5. Queue Position Gaps & Ordering Check
    let hasPositionGap = false;
    for (let i = 0; i < queuedItems.length; i++) {
      if (queuedItems[i]!.position !== i + 1) {
        hasPositionGap = true;
        break;
      }
    }

    if (hasPositionGap) {
      inconsistencies.push('QUEUE_POSITIONS_NOT_SEQUENTIAL');
      if (actionTaken === 'NONE') {
        actionTaken = 'QUEUE_POSITIONS_REBALANCED';
      }

      if (!dryRun) {
        await karaokeService.rebalanceQueuePositions(roomId);
      }
    }

    return {
      roomId,
      roomStatus: room.status,
      playbackStatus: playbackState?.status || 'idle',
      playingItemCount: playingItems.length,
      queuedItemCount: queuedItems.length,
      inconsistenciesDetected: inconsistencies,
      reconciled: !dryRun && actionTaken !== 'NONE',
      actionTaken,
    };
  }

  /**
   * Scans all rooms with active queue items or active playback and repairs inconsistencies.
   * Executed on server bootstrap and periodic health monitors.
   */
  public async reconcileAllActiveRooms(dryRun = false): Promise<KaraokeReconcileSummary> {
    // 1. Find all rooms with playback not idle OR with active items
    const [activePlaybackRooms, activeQueueRooms] = await Promise.all([
      RoomPlaybackStateModel.find({ status: { $ne: 'idle' } }).select('roomId').exec(),
      RoomQueueItemModel.distinct('roomId', { status: { $in: ['queued', 'playing'] } }).exec(),
    ]);

    const roomIdsSet = new Set<string>();
    activePlaybackRooms.forEach((p) => roomIdsSet.add(p.roomId.toString()));
    activeQueueRooms.forEach((r) => roomIdsSet.add(r.toString()));

    const details: KaraokeReconcileResult[] = [];
    let inconsistentCount = 0;

    for (const roomId of roomIdsSet) {
      try {
        const result = await this.reconcileRoom(roomId, dryRun);
        if (result) {
          details.push(result);
          if (result.inconsistenciesDetected.length > 0) {
            inconsistentCount++;
          }
        }
      } catch (err) {
        logger.error({ err, roomId }, 'Error reconciling room karaoke state');
      }
    }

    logger.info(
      { totalChecked: roomIdsSet.size, inconsistentCount, dryRun },
      'Karaoke reconciliation cycle completed'
    );

    return {
      dryRun,
      totalRoomsChecked: roomIdsSet.size,
      inconsistentRoomsCount: inconsistentCount,
      details,
    };
  }
}

export const karaokeReconciliationService = new KaraokeReconciliationService();
