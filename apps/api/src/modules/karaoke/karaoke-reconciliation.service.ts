import { Types } from 'mongoose';
import { RoomModel } from '../rooms/room.model.js';
import { RoomQueueItemModel } from './room-queue-item.model.js';
import { RoomPlaybackStateModel } from './room-playback-state.model.js';
import { karaokeService } from './karaoke.service.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import {
  broadcastKaraokePlaybackUpdated,
  broadcastKaraokeQueueUpdated,
} from '../../realtime/karaoke.events.js';
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
    | 'ORPHANED_PLAYING_ITEM_CLEARED'
    | 'OVERDUE_PLAYBACK_COMPLETED'
    | 'QUEUE_POSITIONS_REBALANCED'
    | 'EXPIRED_LEASE_CLEARED';
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
   * Uses CAS updates and version checks to prevent overwriting concurrent mutations.
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
      const isPlaybackActive = playbackState && (playbackState.status !== 'idle' || playbackState.currentQueueItemId !== null);

      if (activeQueueCount > 0 || isPlaybackActive) {
        inconsistencies.push('CLOSED_ROOM_HAS_ACTIVE_KARAOKE_STATE');
        actionTaken = 'CLOSED_ROOM_PURGED';

        if (!dryRun) {
          await RoomQueueItemModel.updateMany(
            { roomId: roomObjectId, status: { $in: ['queued', 'playing'] } },
            { $set: { status: 'removed', position: 0, removedAt: new Date() } }
          ).exec();

          if (playbackState) {
            await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
              roomId,
              playbackState.playbackVersion,
              {
                currentQueueItemId: null,
                status: 'idle',
                positionMs: 0,
                anchorStartedAt: null,
                pausedAt: null,
                playbackExpiresAt: null,
              }
            );
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

      if (!dryRun) {
        // Keep the item currently referenced by playbackState, or the earliest started item
        const keepId = playbackState?.currentQueueItemId
          ? playbackState.currentQueueItemId.toString()
          : playingItems[0]!._id.toString();

        const duplicateIds = playingItems
          .filter((item) => item._id.toString() !== keepId)
          .map((item) => item._id);

        if (duplicateIds.length > 0) {
          const res = await RoomQueueItemModel.updateMany(
            { roomId: roomObjectId, _id: { $in: duplicateIds }, status: 'playing' },
            { $set: { status: 'skipped', position: 0, completedAt: new Date() } }
          ).exec();

          if (res.modifiedCount > 0 && actionTaken === 'NONE') {
            actionTaken = 'MULTIPLE_PLAYING_DEDUPLICATED';
          }

          logger.info(
            { roomId, keepId, duplicateCount: duplicateIds.length, modified: res.modifiedCount },
            '🛠️ Reconciled duplicate playing items in room'
          );
        }
      } else {
        if (actionTaken === 'NONE') {
          actionTaken = 'MULTIPLE_PLAYING_DEDUPLICATED';
        }
      }
    }

    // 3. Queue Playing Item with Idle Playback Invariant
    if (playbackState && playbackState.status === 'idle' && playingItems.length > 0) {
      inconsistencies.push('QUEUE_PLAYING_ITEM_WITH_IDLE_PLAYBACK');

      if (!dryRun) {
        const orphanIds = playingItems.map((item) => item._id);

        // CAS Fence: Verify that playbackState is STILL idle and matches expected version
        // If a valid play or enqueue command activated the stage concurrently, abort safely.
        const fencedPlayback = await RoomPlaybackStateModel.findOneAndUpdate(
          {
            roomId: roomObjectId,
            playbackVersion: playbackState.playbackVersion,
            status: 'idle',
          },
          {
            $inc: { queueVersion: 1 },
            $set: { lastTransitionId: crypto.randomUUID() },
          },
          { new: true }
        ).exec();

        if (fencedPlayback) {
          // Re-verify and complete ONLY the specific orphaned item IDs captured in the read snapshot
          const updateResult = await RoomQueueItemModel.updateMany(
            { roomId: roomObjectId, _id: { $in: orphanIds }, status: 'playing' },
            { $set: { status: 'completed', position: 0, completedAt: new Date() } }
          ).exec();

          if (actionTaken === 'NONE') {
            actionTaken = 'ORPHANED_PLAYING_ITEM_CLEARED';
          }

          logger.info(
            { roomId, clearedCount: updateResult.modifiedCount, orphanIds: orphanIds.map((id) => id.toString()) },
            '🛠️ Reconciled orphaned playing items under CAS fencing for idle playback'
          );
        } else {
          logger.warn(
            { roomId, expectedPlaybackVersion: playbackState.playbackVersion },
            'Aborting orphaned playing item cleanup: playback state changed concurrently (new track started)'
          );
        }
      } else {
        if (actionTaken === 'NONE') {
          actionTaken = 'ORPHANED_PLAYING_ITEM_CLEARED';
        }
      }
    }

    // 4. Playback Reference Validity Invariant
    if (playbackState && playbackState.currentQueueItemId) {
      const referencedItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId).exec();

      if (!referencedItem) {
        inconsistencies.push('PLAYBACK_REFERENCES_MISSING_QUEUE_ITEM');
        if (!dryRun) {
          const reset = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
            roomId,
            playbackState.playbackVersion,
            {
              currentQueueItemId: null,
              status: 'idle',
              positionMs: 0,
              anchorStartedAt: null,
              pausedAt: null,
              playbackExpiresAt: null,
            }
          );
          if (reset && actionTaken === 'NONE') {
            actionTaken = 'ORPHANED_PLAYBACK_RESET';
          }
        } else {
          if (actionTaken === 'NONE') actionTaken = 'ORPHANED_PLAYBACK_RESET';
        }
      } else if (referencedItem.roomId.toString() !== roomId) {
        inconsistencies.push('PLAYBACK_REFERENCES_FOREIGN_ROOM_ITEM');
        if (!dryRun) {
          const reset = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
            roomId,
            playbackState.playbackVersion,
            {
              currentQueueItemId: null,
              status: 'idle',
              positionMs: 0,
              anchorStartedAt: null,
              pausedAt: null,
              playbackExpiresAt: null,
            }
          );
          if (reset && actionTaken === 'NONE') {
            actionTaken = 'ORPHANED_PLAYBACK_RESET';
          }
        } else {
          if (actionTaken === 'NONE') actionTaken = 'ORPHANED_PLAYBACK_RESET';
        }
      } else if (referencedItem.status !== 'playing') {
        inconsistencies.push('PLAYBACK_REFERENCES_NON_PLAYING_ITEM');
        if (!dryRun) {
          // If playback status was playing but item is terminal, advance to next track
          const advanced = await karaokeService.advanceToNextTrack(roomId, {
            expectedPlaybackVersion: playbackState.playbackVersion,
            reason: 'reconciliation',
          });
          if (advanced && actionTaken === 'NONE') {
            actionTaken = 'ORPHANED_PLAYBACK_RESET';
          }
        } else {
          if (actionTaken === 'NONE') actionTaken = 'ORPHANED_PLAYBACK_RESET';
        }
      }
    } else if (playbackState && playbackState.status === 'playing' && playingItems.length === 0) {
      // Playback says playing but zero items are playing
      inconsistencies.push('PLAYBACK_PLAYING_WITHOUT_PLAYING_ITEM');
      if (!dryRun) {
        const reset = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
          roomId,
          playbackState.playbackVersion,
          {
            currentQueueItemId: null,
            status: 'idle',
            positionMs: 0,
            anchorStartedAt: null,
            pausedAt: null,
            playbackExpiresAt: null,
          }
        );
        if (reset && actionTaken === 'NONE') {
          actionTaken = 'ORPHANED_PLAYBACK_RESET';
        }
      } else {
        if (actionTaken === 'NONE') actionTaken = 'ORPHANED_PLAYBACK_RESET';
      }
    }

    // 5. Expired Worker Lease Invariant
    if (
      playbackState &&
      playbackState.leaseExpiresAt &&
      playbackState.leaseExpiresAt <= new Date() &&
      playbackState.leaseToken !== null
    ) {
      inconsistencies.push('EXPIRED_WORKER_LEASE_DETECTED');

      if (!dryRun && playbackState.leaseToken) {
        const released = await RoomPlaybackStateModel.releasePlaybackLease(roomId, playbackState.leaseToken);
        if (released && actionTaken === 'NONE') {
          actionTaken = 'EXPIRED_LEASE_CLEARED';
        }
        logger.info({ roomId, expiredLeaseToken: playbackState.leaseToken, released }, '🛠️ Reconciled expired worker lease');
      } else {
        if (actionTaken === 'NONE') {
          actionTaken = 'EXPIRED_LEASE_CLEARED';
        }
      }
    }

    // 6. Overdue Playback Invariant
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

          if (!dryRun) {
            logger.info({ roomId, songDurationMs, derivedMs }, '🛠️ Reconciling overdue playback track');
            const adv = await karaokeService.advanceToNextTrack(roomId, {
              expectedPlaybackVersion: playbackState.playbackVersion,
              expectedCurrentQueueItemId: playbackState.currentQueueItemId.toString(),
              reason: 'natural_completion',
            });
            if (adv && actionTaken === 'NONE') {
              actionTaken = 'OVERDUE_PLAYBACK_COMPLETED';
            }
          } else {
            if (actionTaken === 'NONE') {
              actionTaken = 'OVERDUE_PLAYBACK_COMPLETED';
            }
          }
        }
      }
    }

    // 7. Queue Position Gaps & Ordering Check
    const uniquePositions = new Set(queuedItems.map((i) => i.position));
    const hasPositionGap =
      uniquePositions.size !== queuedItems.length ||
      queuedItems.some((item, i) => item.position !== i + 1);

    if (hasPositionGap) {
      inconsistencies.push('QUEUE_POSITIONS_NOT_SEQUENTIAL');

      if (!dryRun) {
        await karaokeService.rebalanceQueuePositions(roomId);
        await RoomPlaybackStateModel.findOneAndUpdate(
          { roomId: roomObjectId },
          { $inc: { queueVersion: 1 } }
        ).exec();

        if (actionTaken === 'NONE') {
          actionTaken = 'QUEUE_POSITIONS_REBALANCED';
        }
      } else {
        if (actionTaken === 'NONE') {
          actionTaken = 'QUEUE_POSITIONS_REBALANCED';
        }
      }
    }

    // 8. Realtime Publication of Committed Reconciled State
    if (!dryRun && actionTaken !== 'NONE') {
      try {
        const io = getSocketServer();
        if (io) {
          const [reconciledPlayback, reconciledQueue] = await Promise.all([
            karaokeService.getPlaybackSnapshot(roomId),
            karaokeService.getQueueSnapshot(roomId),
          ]);
          broadcastKaraokePlaybackUpdated(io, roomId, reconciledPlayback);
          broadcastKaraokeQueueUpdated(io, roomId, reconciledQueue, 'status_changed');
        }
      } catch (err) {
        logger.warn({ err, roomId }, 'Could not broadcast reconciled state to socket channel');
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
   * Also cleans up any expired leases across the database.
   */
  public async reconcileAllActiveRooms(dryRun = false): Promise<KaraokeReconcileSummary> {
    if (!dryRun) {
      // First clean up any expired leases database-wide
      await RoomPlaybackStateModel.releaseExpiredLeases();
    }

    // Find all rooms with playback not idle OR with active items
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
