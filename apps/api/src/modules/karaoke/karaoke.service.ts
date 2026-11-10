import crypto from 'crypto';
import { Types, ClientSession } from 'mongoose';
import {
  AddQueueItemDto,
  KaraokeSnapshotDto,
  PlaybackCommandDto,
  PlaybackStateDto,
  ReorderQueueDto,
  RoomQueueItemDto,
  RoomQueueSnapshotDto,
  SongDto,
} from '@ktv/contracts';
import { RoomModel } from '../rooms/room.model.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import { SongModel } from './song.model.js';
import { RoomQueueItemModel, IRoomQueueItemDocument } from './room-queue-item.model.js';
import { RoomPlaybackStateModel, IRoomPlaybackStateDocument } from './room-playback-state.model.js';
import {
  runInTransaction,
  isTransactionSupported,
  UnsupportedTopologyError,
} from '../../database/transaction.js';
import { logger } from '../../utils/logger.js';

export interface IPlaybackScheduler {
  schedule(
    roomId: string,
    expectedPlaybackVersion: number,
    expectedCurrentQueueItemId: string | null,
    delayMs: number
  ): void;
  cancel(roomId: string): void;
}

export interface AdvanceTrackOptions {
  expectedPlaybackVersion?: number;
  expectedCurrentQueueItemId?: string | null;
  leaseToken?: string | null;
  leaseWorkerInstanceId?: string | null;
  reason?: string;
}

export class KaraokeService {
  private scheduler: IPlaybackScheduler | null = null;

  /**
   * Plugs in a high-precision in-memory completion scheduler (avoids ESM circular dependencies).
   */
  public setScheduler(scheduler: IPlaybackScheduler): void {
    this.scheduler = scheduler;
  }

  /**
   * Helper to ensure an authoritative playback state document exists for a room.
   */
  public async getOrCreatePlaybackState(roomId: string): Promise<IRoomPlaybackStateDocument> {
    const roomObjectId = new Types.ObjectId(roomId);
    let state = await RoomPlaybackStateModel.findOne({ roomId: roomObjectId }).exec();
    if (!state) {
      try {
        state = await RoomPlaybackStateModel.create({
          roomId: roomObjectId,
          currentQueueItemId: null,
          status: 'idle',
          positionMs: 0,
          anchorStartedAt: null,
          pausedAt: null,
          playbackExpiresAt: null,
          playbackVersion: 1,
          queueVersion: 1,
        });
      } catch (err: unknown) {
        const mongoErr = err as { code?: number };
        if (mongoErr?.code === 11000) {
          state = await RoomPlaybackStateModel.findOne({ roomId: roomObjectId }).exec();
        } else {
          throw err;
        }
      }
    }
    return state!;
  }

  /**
   * Maps a populated RoomQueueItemDocument to the shared RoomQueueItemDto.
   */
  private mapQueueItem(item: any): RoomQueueItemDto {
    const songDoc = item.songId && typeof item.songId === 'object' && 'title' in item.songId
      ? item.songId
      : null;

    const userDoc = item.requestedBy && typeof item.requestedBy === 'object' && 'username' in item.requestedBy
      ? item.requestedBy
      : null;

    const songDto: SongDto = songDoc
      ? {
          id: (songDoc.id || songDoc._id).toString(),
          provider: songDoc.provider || 'fixture',
          providerSongId: songDoc.providerSongId || '',
          title: songDoc.title || 'Untitled',
          artist: songDoc.artist || 'Unknown Artist',
          thumbnailUrl: songDoc.thumbnailUrl || null,
          durationMs: songDoc.durationMs || 180000,
          language: songDoc.language || 'en',
          genre: songDoc.genre || 'pop',
          mediaAvailability: songDoc.mediaAvailability || 'fixture_mock',
          audioAvailability: songDoc.audioAvailability || 'metadata_only',
          lyricsAvailability: songDoc.lyricsAvailability || 'unavailable',
          licenseClassification: songDoc.licenseClassification || 'development_fixture',
          createdAt: songDoc.createdAt?.toISOString(),
          updatedAt: songDoc.updatedAt?.toISOString(),
        }
      : {
          id: item.songId?.toString() || '',
          provider: 'fixture',
          providerSongId: '',
          title: 'Selected Song',
          artist: 'Various Artists',
          thumbnailUrl: null,
          durationMs: 180000,
          language: 'en',
          genre: 'pop',
          mediaAvailability: 'fixture_mock',
          audioAvailability: 'metadata_only',
          lyricsAvailability: 'unavailable',
          licenseClassification: 'development_fixture',
        };

    const requesterDto = userDoc
      ? {
          id: (userDoc.id || userDoc._id).toString(),
          username: userDoc.username || 'Member',
          displayName: userDoc.displayName || userDoc.username || 'Member',
          avatar: userDoc.avatar || null,
        }
      : {
          id: item.requestedBy?.toString() || '',
          username: 'Member',
          displayName: 'Member',
          avatar: null,
        };

    return {
      id: item._id.toString(),
      roomId: item.roomId.toString(),
      songId: item.songId ? (item.songId._id ? item.songId._id.toString() : item.songId.toString()) : '',
      song: songDto,
      requestedBy: requesterDto,
      position: item.position ?? 0,
      status: item.status,
      queueVersion: item.queueVersion || 1,
      addedAt: item.addedAt ? item.addedAt.toISOString() : new Date().toISOString(),
      startedAt: item.startedAt ? item.startedAt.toISOString() : null,
      completedAt: item.completedAt ? item.completedAt.toISOString() : null,
      removedAt: item.removedAt ? item.removedAt.toISOString() : null,
    };
  }

  /**
   * Retrieves the current room queue snapshot.
   */
  public async getQueueSnapshot(roomId: string): Promise<RoomQueueSnapshotDto> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ROOM_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const [activeItems, playbackState] = await Promise.all([
      RoomQueueItemModel.find({
        roomId: roomObjectId,
        status: { $in: ['playing', 'queued'] },
      })
        .sort({ position: 1, addedAt: 1 })
        .populate('songId')
        .populate('requestedBy', 'username displayName avatar')
        .exec(),
      this.getOrCreatePlaybackState(roomId),
    ]);

    const itemsDto = activeItems.map((i) => this.mapQueueItem(i));

    return {
      roomId,
      items: itemsDto,
      queueVersion: playbackState.queueVersion || 1,
      totalCount: itemsDto.length,
      maxQueueSize: 50,
    };
  }

  /**
   * Retrieves the current authoritative playback state for a room, deriving the effective
   * playback position from the server time anchor without relying on periodic database writes.
   */
  public async getPlaybackSnapshot(roomId: string): Promise<PlaybackStateDto> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ROOM_ID');
    }

    const playbackState = await this.getOrCreatePlaybackState(roomId);
    let currentItemDto: RoomQueueItemDto | null = null;
    let derivedPositionMs = playbackState.positionMs;

    if (playbackState.currentQueueItemId) {
      const queueItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId)
        .populate('songId')
        .populate('requestedBy', 'username displayName avatar')
        .exec();

      if (queueItem && queueItem.status === 'playing') {
        currentItemDto = this.mapQueueItem(queueItem);
        const songDurationMs = currentItemDto.song.durationMs;

        // If playing, derive position from elapsed server time
        if (playbackState.status === 'playing' && playbackState.anchorStartedAt) {
          const now = Date.now();
          const elapsed = now - playbackState.anchorStartedAt.getTime();
          derivedPositionMs = Math.min(songDurationMs, playbackState.positionMs + Math.max(0, elapsed));

          // If track has passed duration and is overdue for completion, auto-advance
          if (derivedPositionMs >= songDurationMs) {
            logger.info(
              { roomId, songId: currentItemDto.songId, derivedPositionMs, songDurationMs },
              'Track naturally completed during snapshot fetch; advancing queue'
            );
            const advanceResult = await this.advanceToNextTrack(roomId, {
              expectedPlaybackVersion: playbackState.playbackVersion,
              reason: 'natural_completion',
            });
            if (advanceResult) {
              return advanceResult.playback;
            }
          }
        }
      } else {
        // Self-heal: referenced item is missing or not playing
        logger.warn({ roomId, currentQueueItemId: playbackState.currentQueueItemId }, 'Orphaned playback reference detected; self-healing to idle');
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

    return {
      roomId,
      currentQueueItemId: playbackState.currentQueueItemId ? playbackState.currentQueueItemId.toString() : null,
      currentItem: currentItemDto,
      status: playbackState.status,
      positionMs: derivedPositionMs,
      anchorStartedAt: playbackState.anchorStartedAt ? playbackState.anchorStartedAt.toISOString() : null,
      pausedAt: playbackState.pausedAt ? playbackState.pausedAt.toISOString() : null,
      playbackVersion: playbackState.playbackVersion,
      updatedAt: playbackState.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves unified karaoke snapshot (both queue and playback).
   */
  public async getKaraokeSnapshot(roomId: string): Promise<KaraokeSnapshotDto> {
    const [queue, playback] = await Promise.all([
      this.getQueueSnapshot(roomId),
      this.getPlaybackSnapshot(roomId),
    ]);

    return {
      roomId,
      playback,
      queue,
      serverTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Adds a song to the persistent room queue.
   * If stage is idle, activates song directly to 'playing'.
   * Gracefully handles concurrent idle-activation collisions by falling back to queue append.
   */
  public async addToQueue(
    roomId: string,
    userId: string,
    dto: AddQueueItemDto
  ): Promise<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto; addedItem: RoomQueueItemDto }> {
    const transitionId = crypto.randomUUID();

    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(dto.songId)) {
      throw new Error('INVALID_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const songObjectId = new Types.ObjectId(dto.songId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Verify room exists and is not closed
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }
    if (room.status === 'closed') {
      throw new Error('FORBIDDEN_ROOM_CLOSED');
    }

    // 2. Verify active room membership
    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
      kickedAt: null,
    }).exec();

    if (!membership) {
      throw new Error('FORBIDDEN_NOT_MEMBER');
    }

    // 3. Verify song exists in catalog
    const song = await SongModel.findById(songObjectId).exec();
    if (!song) {
      throw new Error('SONG_NOT_FOUND');
    }

    // 4. Enforce maximum queue size limit (50 items)
    const activeQueueCount = await RoomQueueItemModel.countDocuments({
      roomId: roomObjectId,
      status: { $in: ['queued', 'playing'] },
    }).exec();

    if (activeQueueCount >= 50) {
      throw new Error('MAX_QUEUE_SIZE_EXCEEDED');
    }

    // 5. Check authoritative playback state
    const playbackState = await this.getOrCreatePlaybackState(roomId);
    const hasActivePlaying = await RoomQueueItemModel.exists({
      roomId: roomObjectId,
      status: 'playing',
    });

    const now = new Date();
    const nextQueueVersion = (playbackState.queueVersion || 1) + 1;
    let queueItem: IRoomQueueItemDocument | null = null;
    let activatedImmediately = false;

    // Direct stage activation if room playback is idle, no item is playing, and song has available audio
    if (!hasActivePlaying && playbackState.status === 'idle' && song.audioAvailability === 'audio_available') {
      try {
        queueItem = await RoomQueueItemModel.create({
          roomId: roomObjectId,
          songId: songObjectId,
          requestedBy: userObjectId,
          position: 0,
          status: 'playing',
          queueVersion: nextQueueVersion,
          addedAt: now,
          startedAt: now,
        });

        const songDurationMs = song.durationMs || 180000;
        playbackState.currentQueueItemId = queueItem._id as Types.ObjectId;
        playbackState.status = 'playing';
        playbackState.positionMs = 0;
        playbackState.anchorStartedAt = now;
        playbackState.pausedAt = null;
        playbackState.playbackExpiresAt = new Date(now.getTime() + songDurationMs);
        playbackState.playbackVersion += 1;
        playbackState.queueVersion = nextQueueVersion;
        playbackState.lastTransitionId = transitionId;
        await playbackState.save();

        activatedImmediately = true;

        // Update room stage metadata for display
        room.currentSongTitle = song.title;
        room.currentSingerName = membership.role === 'host' ? 'Host' : 'Singer';
        await room.save();

        // Schedule precision completion timer
        this.scheduler?.schedule(
          roomId,
          playbackState.playbackVersion,
          queueItem._id.toString(),
          songDurationMs
        );
      } catch (err: any) {
        // If duplicate key error (11000) on { roomId: 1, status: 'playing' },
        // another concurrent request claimed stage activation during this exact tick.
        if (err?.code === 11000) {
          logger.info(
            { roomId, userId, transitionId },
            'Concurrent direct activation collision; cleanly falling back to append as queued item'
          );
          queueItem = null; // Will trigger fallback below
        } else {
          throw err;
        }
      }
    }

    // Standard queue append if stage was active OR if direct activation collided
    if (!queueItem) {
      const lastQueued = await RoomQueueItemModel.findOne({
        roomId: roomObjectId,
        status: 'queued',
      })
        .sort({ position: -1 })
        .select('position')
        .exec();

      const nextPosition = (lastQueued?.position || 0) + 1;

      queueItem = await RoomQueueItemModel.create({
        roomId: roomObjectId,
        songId: songObjectId,
        requestedBy: userObjectId,
        position: nextPosition,
        status: 'queued',
        queueVersion: nextQueueVersion,
        addedAt: now,
      });

      playbackState.queueVersion = nextQueueVersion;
      playbackState.lastTransitionId = transitionId;
      await playbackState.save();
    }

    const populated = await RoomQueueItemModel.findById(queueItem._id)
      .populate('songId')
      .populate('requestedBy', 'username displayName avatar')
      .exec();

    const addedItemDto = this.mapQueueItem(populated);
    const [queue, playback] = await Promise.all([
      this.getQueueSnapshot(roomId),
      this.getPlaybackSnapshot(roomId),
    ]);

    logger.info(
      {
        roomId,
        userId,
        songId: dto.songId,
        queueItemId: queueItem._id.toString(),
        status: queueItem.status,
        activatedImmediately,
        queueVersion: nextQueueVersion,
        transitionId,
      },
      'Song enqueued in room karaoke queue'
    );

    return { queue, playback, addedItem: addedItemDto };
  }

  /**
   * Removes an item from the queue.
   * Allowed if the user is the original requester OR the room host.
   * If removing the currently playing song, cleanly advances to the next track.
   */
  public async removeFromQueue(
    roomId: string,
    userId: string,
    itemId: string
  ): Promise<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto }> {
    const transitionId = crypto.randomUUID();

    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(itemId)) {
      throw new Error('INVALID_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const itemObjectId = new Types.ObjectId(itemId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Verify active membership and role
    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
      kickedAt: null,
    }).exec();

    if (!membership) {
      throw new Error('FORBIDDEN_NOT_MEMBER');
    }

    // 2. Find target queue item
    const item = await RoomQueueItemModel.findOne({
      _id: itemObjectId,
      roomId: roomObjectId,
      status: { $in: ['queued', 'playing'] },
    }).exec();

    if (!item) {
      throw new Error('QUEUE_ITEM_NOT_FOUND');
    }

    // 3. Authorization: requester or host
    const isRequester = item.requestedBy.toString() === userId;
    const isHost = membership.role === 'host';
    if (!isRequester && !isHost) {
      throw new Error('FORBIDDEN_UNAUTHORIZED_REMOVE');
    }

    const wasPlaying = item.status === 'playing';

    // 4. If removing active playing track, advance playback
    if (wasPlaying) {
      this.scheduler?.cancel(roomId);
      item.status = 'removed';
      item.position = 0;
      item.removedAt = new Date();
      await item.save();
      await this.advanceToNextTrack(roomId, { reason: 'manual_removal' });
    } else {
      // Execute removal, rebalance, and queueVersion advancement inside transaction boundary
      await runInTransaction(async (session: ClientSession | null) => {
        item.status = 'removed';
        item.position = 0;
        item.removedAt = new Date();
        await item.save({ session: session || undefined });

        await this.rebalanceQueuePositions(roomId, session);

        await RoomPlaybackStateModel.findOneAndUpdate(
          { roomId: roomObjectId },
          {
            $inc: { queueVersion: 1 },
            $set: { lastTransitionId: transitionId },
          },
          { session: session || undefined }
        ).exec();
      });
    }

    const [queue, playback] = await Promise.all([
      this.getQueueSnapshot(roomId),
      this.getPlaybackSnapshot(roomId),
    ]);

    logger.info({ roomId, userId, itemId, wasPlaying, transitionId }, 'Removed item from room karaoke queue');

    return { queue, playback };
  }

  /**
   * Reorders queued items. Restricted strictly to the room host.
   * Atomic batch execution prevents race conditions and position corruption.
   */
  public async reorderQueue(
    roomId: string,
    userId: string,
    dto: ReorderQueueDto
  ): Promise<RoomQueueSnapshotDto> {
    const transitionId = crypto.randomUUID();

    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Verify room is not closed
    const room = await RoomModel.findById(roomObjectId).select('status').exec();
    if (!room || room.status === 'closed') {
      throw new Error('FORBIDDEN_ROOM_CLOSED');
    }

    // 2. Verify host role
    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
      role: 'host',
      kickedAt: null,
    }).exec();

    if (!membership) {
      throw new Error('FORBIDDEN_HOST_ONLY');
    }

    // 3. Topology Guard (Option A): Standalone MongoDB cannot guarantee multi-document atomicity for reorder
    if (!isTransactionSupported()) {
      logger.warn(
        { roomId, userId, transitionId },
        'Rejected queue reorder command: MongoDB deployment is standalone. Queue reorder requires replica set multi-document transactions.'
      );
      throw new UnsupportedTopologyError(
        'Queue reordering requires MongoDB replica set transactions and is not supported on standalone MongoDB instances. Configure a MongoDB replica set to enable queue reordering.'
      );
    }

    // 4. Execute reorder inside transaction boundary
    return runInTransaction(async (session: ClientSession | null) => {
      if (!session) {
        throw new UnsupportedTopologyError(
          'Queue reordering requires an active transaction session. Standalone mode cannot execute atomic multi-document reorder.'
        );
      }

      const playbackState = await RoomPlaybackStateModel.findOne({ roomId: roomObjectId })
        .session(session || null)
        .exec();

      if (!playbackState) {
        throw new Error('PLAYBACK_STATE_NOT_FOUND');
      }

      if (
        dto.expectedQueueVersion !== undefined &&
        dto.expectedQueueVersion !== playbackState.queueVersion
      ) {
        logger.warn(
          { roomId, expected: dto.expectedQueueVersion, current: playbackState.queueVersion, transitionId },
          'Rejected stale queue reorder command due to queueVersion mismatch'
        );
        throw new Error('STALE_QUEUE_VERSION');
      }

      // 4. Fetch all currently queued items within transaction session
      const queuedItems = await RoomQueueItemModel.find({
        roomId: roomObjectId,
        status: 'queued',
      })
        .session(session || null)
        .exec();

      // Full coverage check: reorder must account for EVERY active queued item and contain no duplicates
      if (
        dto.itemIds.length !== queuedItems.length ||
        new Set(dto.itemIds).size !== dto.itemIds.length
      ) {
        throw new Error('INVALID_REORDER_ITEM_COUNT');
      }

      const existingIds = new Set(queuedItems.map((i) => i._id.toString()));
      for (const id of dto.itemIds) {
        if (!existingIds.has(id)) {
          throw new Error('INVALID_REORDER_ITEM_ID');
        }
      }

      const nextQueueVersion = (playbackState.queueVersion || 1) + 1;

      // 5. Execute bulk write with session
      const bulkOps = dto.itemIds.map((id, index) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(id), roomId: roomObjectId, status: 'queued' },
          update: { $set: { position: index + 1, queueVersion: nextQueueVersion } },
        },
      }));

      if (bulkOps.length > 0) {
        await RoomQueueItemModel.bulkWrite(bulkOps, { session: session || undefined });
      }

      // 6. Advance queueVersion using CAS condition
      const updatedPlayback = await RoomPlaybackStateModel.findOneAndUpdate(
        {
          roomId: roomObjectId,
          queueVersion: playbackState.queueVersion,
        },
        {
          $set: {
            queueVersion: nextQueueVersion,
            lastTransitionId: transitionId,
          },
        },
        { new: true, session: session || undefined }
      ).exec();

      if (!updatedPlayback) {
        throw new Error('STALE_QUEUE_VERSION');
      }

      logger.info(
        { roomId, userId, reorderedCount: dto.itemIds.length, queueVersion: nextQueueVersion, transitionId },
        'Atomically reordered karaoke queue positions'
      );

      return this.getQueueSnapshot(roomId);
    });
  }

  /**
   * Executes an authoritative playback control command (play, pause, seek, skip, stop).
   * Verified against active room membership, host role (or singer for own song),
   * and expected playback version fencing.
   */
  public async executePlaybackCommand(
    roomId: string,
    userId: string,
    dto: PlaybackCommandDto
  ): Promise<{ playback: PlaybackStateDto; queue: RoomQueueSnapshotDto }> {
    const transitionId = crypto.randomUUID();

    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Verify room is open
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room || room.status === 'closed') {
      throw new Error('FORBIDDEN_ROOM_CLOSED');
    }

    // 2. Verify active membership
    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
      kickedAt: null,
    }).exec();

    if (!membership) {
      throw new Error('FORBIDDEN_NOT_MEMBER');
    }

    // 3. Load playback state
    const playbackState = await this.getOrCreatePlaybackState(roomId);

    // 4. Version fencing check
    if (
      dto.expectedPlaybackVersion !== undefined &&
      dto.expectedPlaybackVersion !== playbackState.playbackVersion
    ) {
      logger.warn(
        { roomId, expected: dto.expectedPlaybackVersion, current: playbackState.playbackVersion, transitionId },
        'Rejected stale playback command due to playbackVersion conflict'
      );
      throw new Error('STALE_PLAYBACK_VERSION');
    }

    // 5. Role authorization: host has full control; current singer may control their own active track
    let isAuthorized = membership.role === 'host';
    if (!isAuthorized && playbackState.currentQueueItemId) {
      const currentItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId).exec();
      if (currentItem && currentItem.requestedBy.toString() === userId) {
        // Singer can control their own performance
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new Error('FORBIDDEN_PLAYBACK_CONTROL');
    }

    // 6. Execute command state transition
    const now = new Date();

    // Resolve duration of current song if active
    let songDurationMs = 180000;
    if (playbackState.currentQueueItemId) {
      const currentItemDoc = await RoomQueueItemModel.findById(playbackState.currentQueueItemId)
        .populate('songId')
        .exec();
      if (currentItemDoc && currentItemDoc.songId) {
        const songDoc = currentItemDoc.songId as any;
        songDurationMs = songDoc.durationMs || 180000;
        if (dto.command === 'play' && songDoc.audioAvailability && songDoc.audioAvailability !== 'audio_available') {
          throw new Error('SONG_AUDIO_UNAVAILABLE');
        }
      }
    }

    switch (dto.command) {
      case 'play': {
        if (playbackState.status === 'paused') {
          const remainingMs = Math.max(0, songDurationMs - playbackState.positionMs);
          const updated = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
            roomId,
            playbackState.playbackVersion,
            {
              status: 'playing',
              anchorStartedAt: now,
              pausedAt: null,
              playbackExpiresAt: new Date(now.getTime() + remainingMs),
              lastTransitionId: transitionId,
            }
          );
          if (!updated) {
            throw new Error('STALE_PLAYBACK_VERSION');
          }

          this.scheduler?.schedule(
            roomId,
            updated.playbackVersion,
            playbackState.currentQueueItemId?.toString() || null,
            remainingMs
          );
        } else if (playbackState.status === 'idle') {
          const adv = await this.advanceToNextTrack(roomId, {
            expectedPlaybackVersion: playbackState.playbackVersion,
            reason: 'play_idle',
          });
          if (adv) return adv;
        }
        break;
      }

      case 'pause': {
        if (playbackState.status === 'playing' && playbackState.anchorStartedAt) {
          const elapsed = now.getTime() - playbackState.anchorStartedAt.getTime();
          const derivedMs = Math.min(songDurationMs, playbackState.positionMs + Math.max(0, elapsed));
          const updated = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
            roomId,
            playbackState.playbackVersion,
            {
              positionMs: derivedMs,
              status: 'paused',
              anchorStartedAt: null,
              pausedAt: now,
              playbackExpiresAt: null,
              lastTransitionId: transitionId,
            }
          );
          if (!updated) {
            throw new Error('STALE_PLAYBACK_VERSION');
          }

          this.scheduler?.cancel(roomId);
        }
        break;
      }

      case 'seek': {
        const targetMs = Math.min(songDurationMs, Math.max(0, dto.positionMs || 0));
        const isPlaying = playbackState.status === 'playing';
        const remainingMs = Math.max(0, songDurationMs - targetMs);

        const updatePayload: Partial<IRoomPlaybackStateDocument> = {
          positionMs: targetMs,
          lastTransitionId: transitionId,
        };

        if (isPlaying) {
          updatePayload.anchorStartedAt = now;
          updatePayload.playbackExpiresAt = new Date(now.getTime() + remainingMs);
        }

        const updated = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
          roomId,
          playbackState.playbackVersion,
          updatePayload
        );

        if (!updated) {
          throw new Error('STALE_PLAYBACK_VERSION');
        }

        if (isPlaying) {
          this.scheduler?.schedule(
            roomId,
            updated.playbackVersion,
            playbackState.currentQueueItemId?.toString() || null,
            remainingMs
          );
        }
        break;
      }

      case 'skip': {
        this.scheduler?.cancel(roomId);
        const adv = await this.advanceToNextTrack(roomId, {
          expectedPlaybackVersion: playbackState.playbackVersion,
          expectedCurrentQueueItemId: playbackState.currentQueueItemId?.toString() || null,
          reason: membership.role === 'host' ? 'host_skip' : 'singer_skip',
        });
        if (adv) return adv;
        break;
      }

      case 'stop': {
        this.scheduler?.cancel(roomId);
        await runInTransaction(async (session: ClientSession | null) => {
          if (playbackState.currentQueueItemId) {
            await RoomQueueItemModel.updateOne(
              { _id: playbackState.currentQueueItemId, roomId: roomObjectId, status: 'playing' },
              { $set: { status: 'skipped', position: 0, completedAt: now } },
              { session: session || undefined }
            ).exec();
          }

          const nextQueueVer = (playbackState.queueVersion || 1) + 1;
          const updated = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
            roomId,
            playbackState.playbackVersion,
            {
              currentQueueItemId: null,
              status: 'idle',
              positionMs: 0,
              anchorStartedAt: null,
              pausedAt: null,
              playbackExpiresAt: null,
              queueVersion: nextQueueVer,
              lastTransitionId: transitionId,
            },
            {
              session,
            }
          );

          if (!updated) {
            throw new Error('STALE_PLAYBACK_VERSION');
          }

          if (room) {
            room.currentSongTitle = null;
            room.currentSingerName = null;
            await room.save({ session: session || undefined });
          }
        });
        break;
      }

      default:
        throw new Error('UNKNOWN_PLAYBACK_COMMAND');
    }

    const [playback, queue] = await Promise.all([
      this.getPlaybackSnapshot(roomId),
      this.getQueueSnapshot(roomId),
    ]);

    logger.info(
      { roomId, userId, command: dto.command, newStatus: playback.status, playbackVersion: playback.playbackVersion, transitionId },
      'Executed playback command'
    );

    return { playback, queue };
  }

  /**
   * Internal helper: authoritatively advances playback to the next available queued song,
   * or transitions to idle if the queue is empty.
   * Protects against concurrent transition races and verifies next track requester eligibility.
   */
  public async advanceToNextTrack(
    roomId: string,
    options?: AdvanceTrackOptions
  ): Promise<{ playback: PlaybackStateDto; queue: RoomQueueSnapshotDto } | null> {
    const transitionId = crypto.randomUUID();
    const roomObjectId = new Types.ObjectId(roomId);

    return runInTransaction(async (session: ClientSession | null) => {
      // 1. Load room and playback state within session
      const [playbackState, room] = await Promise.all([
        RoomPlaybackStateModel.findOne({ roomId: roomObjectId }).session(session || null).exec(),
        RoomModel.findById(roomObjectId).session(session || null).exec(),
      ]);

      if (!playbackState) {
        return null;
      }

      if (!room || room.status === 'closed') {
        logger.info({ roomId, transitionId }, 'Aborting track advance: room is closed');
        await this.handleRoomClosed(roomId);
        return null;
      }

      // Version fencing: if caller specified expected version and state changed, abort safely
      if (
        options?.expectedPlaybackVersion !== undefined &&
        options.expectedPlaybackVersion !== playbackState.playbackVersion
      ) {
        logger.info(
          { roomId, expected: options.expectedPlaybackVersion, current: playbackState.playbackVersion, transitionId },
          'Aborting track advance: expected playbackVersion mismatch'
        );
        return null;
      }

      // Expected current queue item fencing
      if (options?.expectedCurrentQueueItemId !== undefined) {
        const currentItemIdStr = playbackState.currentQueueItemId?.toString() || null;
        if (currentItemIdStr !== (options.expectedCurrentQueueItemId || null)) {
          logger.info(
            { roomId, expectedItem: options.expectedCurrentQueueItemId, currentItem: currentItemIdStr, transitionId },
            'Aborting track advance: expected currentQueueItemId mismatch'
          );
          return null;
        }
      }

      const now = new Date();

      // Worker lease validation: if a leaseToken is passed, worker MUST still hold the lease
      if (options?.leaseToken) {
        if (
          playbackState.leaseToken !== options.leaseToken ||
          !playbackState.leaseExpiresAt ||
          playbackState.leaseExpiresAt <= now
        ) {
          logger.warn(
            { roomId, leaseToken: options.leaseToken, currentLeaseToken: playbackState.leaseToken, transitionId },
            'Aborting track advance: worker lease has expired or was claimed by another worker'
          );
          return null;
        }
      }

      const nextQueueVersion = (playbackState.queueVersion || 1) + 1;
      const isSkip = options?.reason === 'host_skip' || options?.reason === 'singer_skip';

      // 2. Mark existing playing item completed or skipped
      if (playbackState.currentQueueItemId) {
        await RoomQueueItemModel.updateOne(
          { _id: playbackState.currentQueueItemId, roomId: roomObjectId, status: 'playing' },
          { $set: { status: isSkip ? 'skipped' : 'completed', position: 0, completedAt: now } },
          { session: session || undefined }
        ).exec();
      }

      // 3. Selection loop: find earliest valid queued item whose requester is still an active member
      let claimedItem: IRoomQueueItemDocument | null = null;
      let selectedSong: any = null;

      while (!claimedItem) {
        const candidate = await RoomQueueItemModel.findOne({
          roomId: roomObjectId,
          status: 'queued',
        })
          .sort({ position: 1, addedAt: 1 })
          .populate('songId')
          .populate('requestedBy', 'username displayName')
          .session(session || null)
          .exec();

        if (!candidate) {
          break;
        }

        // Verify active membership of candidate requester
        const activeMember = await RoomMembershipModel.findOne({
          roomId: roomObjectId,
          userId: candidate.requestedBy,
          status: 'active',
          kickedAt: null,
        })
          .session(session || null)
          .exec();

        if (!activeMember) {
          logger.info(
            { roomId, candidateId: candidate._id.toString(), requesterId: candidate.requestedBy.toString(), transitionId },
            'Skipping queued song: requester is no longer an active member'
          );
          candidate.status = 'removed';
          candidate.position = 0;
          candidate.removedAt = now;
          await candidate.save({ session: session || undefined });
          continue;
        }

        // Verify audio availability for candidate track
        const candidateSong = candidate.songId as any;
        if (candidateSong && candidateSong.audioAvailability && candidateSong.audioAvailability !== 'audio_available') {
          if (options?.reason === 'play_idle') {
            logger.warn(
              { roomId, candidateId: candidate._id.toString(), title: candidateSong.title },
              'Host attempted to play track with unavailable audio'
            );
            throw new Error('SONG_AUDIO_UNAVAILABLE');
          }
          logger.warn(
            { roomId, candidateId: candidate._id.toString(), title: candidateSong.title, transitionId },
            'Marking queued song as failed: audio source is unavailable'
          );
          candidate.status = 'failed';
          candidate.position = 0;
          candidate.completedAt = now;
          await candidate.save({ session: session || undefined });
          continue;
        }

        // Atomically claim candidate from 'queued' to 'playing'
        const claimed = await RoomQueueItemModel.findOneAndUpdate(
          { _id: candidate._id, roomId: roomObjectId, status: 'queued' },
          {
            $set: {
              status: 'playing',
              position: 0,
              startedAt: now,
              queueVersion: nextQueueVersion,
            },
          },
          { new: true, session: session || undefined }
        )
          .populate('songId')
          .populate('requestedBy', 'username displayName')
          .exec();

        if (claimed) {
          claimedItem = claimed;
          selectedSong = candidate.songId;
          break;
        }
      }

      let updatedPlaybackState: IRoomPlaybackStateDocument | null = null;

      if (claimedItem && selectedSong) {
        const songDurationMs = selectedSong.durationMs || 180000;

        updatedPlaybackState = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
          roomId,
          playbackState.playbackVersion,
          {
            currentQueueItemId: claimedItem._id as Types.ObjectId,
            status: 'playing',
            positionMs: 0,
            anchorStartedAt: now,
            pausedAt: null,
            playbackExpiresAt: new Date(now.getTime() + songDurationMs),
            queueVersion: nextQueueVersion,
            lastTransitionId: transitionId,
          },
          {
            expectedCurrentQueueItemId: playbackState.currentQueueItemId?.toString() || null,
            leaseToken: options?.leaseToken || null,
            session,
          }
        );

        if (!updatedPlaybackState) {
          // Conditional write failed (version conflict or lease expired). Rollback claimed item if standalone
          await RoomQueueItemModel.updateOne(
            { _id: claimedItem._id, status: 'playing' },
            { $set: { status: 'queued' } },
            { session: session || undefined }
          ).exec();
          return null;
        }

        // Rebalance remaining queued items
        await this.rebalanceQueuePositions(roomId, session);

        // Update room stage metadata
        const userDoc = claimedItem.requestedBy as any;
        room.currentSongTitle = selectedSong.title || 'Sing Along';
        room.currentSingerName = userDoc?.displayName || userDoc?.username || 'Singer';
        await room.save({ session: session || undefined });

        // Schedule precision completion timer
        this.scheduler?.schedule(
          roomId,
          updatedPlaybackState.playbackVersion,
          claimedItem._id.toString(),
          songDurationMs
        );

        logger.info(
          {
            roomId,
            nextItemId: claimedItem._id.toString(),
            songTitle: selectedSong.title,
            playbackVersion: updatedPlaybackState.playbackVersion,
            queueVersion: nextQueueVersion,
            reason: options?.reason,
            transitionId,
          },
          'Advanced karaoke playback to next track'
        );
      } else {
        // No more items: return to idle
        this.scheduler?.cancel(roomId);

        updatedPlaybackState = await RoomPlaybackStateModel.commitConditionalPlaybackTransition(
          roomId,
          playbackState.playbackVersion,
          {
            currentQueueItemId: null,
            status: 'idle',
            positionMs: 0,
            anchorStartedAt: null,
            pausedAt: null,
            playbackExpiresAt: null,
            queueVersion: nextQueueVersion,
            lastTransitionId: transitionId,
          },
          {
            expectedCurrentQueueItemId: playbackState.currentQueueItemId?.toString() || null,
            leaseToken: options?.leaseToken || null,
            session,
          }
        );

        if (!updatedPlaybackState) {
          return null;
        }

        room.currentSongTitle = null;
        room.currentSingerName = null;
        await room.save({ session: session || undefined });

        logger.info(
          { roomId, playbackVersion: updatedPlaybackState.playbackVersion, queueVersion: nextQueueVersion, transitionId },
          'No queued tracks remaining; karaoke playback returned to idle'
        );
      }

      const [playback, queue] = await Promise.all([
        this.getPlaybackSnapshot(roomId),
        this.getQueueSnapshot(roomId),
      ]);

      return { playback, queue };
    });
  }

  /**
   * Internal helper: rebalances positions of all active queued items (1 ... N) using atomic bulkWrite.
   */
  public async rebalanceQueuePositions(
    roomId: string,
    session?: ClientSession | null
  ): Promise<void> {
    const roomObjectId = new Types.ObjectId(roomId);
    const queuedItems = await RoomQueueItemModel.find({
      roomId: roomObjectId,
      status: 'queued',
    })
      .sort({ position: 1, addedAt: 1 })
      .session(session || null)
      .exec();

    // Check if rebalancing is actually needed
    let needsRebalance = false;
    for (let i = 0; i < queuedItems.length; i++) {
      if (queuedItems[i]!.position !== i + 1) {
        needsRebalance = true;
        break;
      }
    }

    if (!needsRebalance) return;

    const bulkOps = queuedItems.map((item, index) => ({
      updateOne: {
        filter: { _id: item._id, roomId: roomObjectId, status: 'queued' },
        update: { $set: { position: index + 1 } },
      },
    }));

    if (bulkOps.length > 0) {
      await RoomQueueItemModel.bulkWrite(bulkOps, { session: session || undefined });
    }
  }

  /**
   * Lifecycle cleanup: called when a room is closed.
   */
  public async handleRoomClosed(roomId: string): Promise<void> {
    const roomObjectId = new Types.ObjectId(roomId);
    this.scheduler?.cancel(roomId);

    await runInTransaction(async (session: ClientSession | null) => {
      // Stop playback and advance versions
      await RoomPlaybackStateModel.updateOne(
        { roomId: roomObjectId },
        {
          $set: {
            currentQueueItemId: null,
            status: 'idle',
            positionMs: 0,
            anchorStartedAt: null,
            pausedAt: null,
            playbackExpiresAt: null,
            claimedBy: null,
            claimedAt: null,
            leaseExpiresAt: null,
            leaseToken: null,
          },
          $inc: { playbackVersion: 1, queueVersion: 1 },
        },
        { session: session || undefined }
      ).exec();

      // Mark all active queue items removed
      await RoomQueueItemModel.updateMany(
        { roomId: roomObjectId, status: { $in: ['queued', 'playing'] } },
        { $set: { status: 'removed', position: 0, removedAt: new Date() } },
        { session: session || undefined }
      ).exec();
    });

    logger.info({ roomId }, 'Cleaned up room karaoke queue and playback on room closure');
  }

  /**
   * Lifecycle cleanup: called when a member leaves or is kicked from a room.
   * Removes pending songs requested by the user and advances playback if their song was playing.
   */
  public async handleMemberDeparted(
    roomId: string,
    userId: string
  ): Promise<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto } | null> {
    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    let removedCount = 0;
    let playbackChanged = false;

    await runInTransaction(async (session: ClientSession | null) => {
      // 1. Remove user's queued songs
      const removeResult = await RoomQueueItemModel.updateMany(
        { roomId: roomObjectId, requestedBy: userObjectId, status: 'queued' },
        { $set: { status: 'removed', position: 0, removedAt: new Date() } },
        { session: session || undefined }
      ).exec();

      removedCount = removeResult.modifiedCount;

      // 2. Rebalance remaining queue positions and advance queueVersion
      if (removedCount > 0) {
        await this.rebalanceQueuePositions(roomId, session);
        await RoomPlaybackStateModel.findOneAndUpdate(
          { roomId: roomObjectId },
          { $inc: { queueVersion: 1 } },
          { session: session || undefined }
        ).exec();
      }
    });

    // 3. If currently playing song belonged to departed user, advance playback
    const playbackState = await RoomPlaybackStateModel.findOne({ roomId: roomObjectId }).exec();
    if (playbackState && playbackState.currentQueueItemId) {
      const currentItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId).exec();
      if (currentItem && currentItem.requestedBy.toString() === userId) {
        logger.info({ roomId, userId }, 'Departed member was active singer; advancing to next track');
        await this.advanceToNextTrack(roomId, {
          expectedCurrentQueueItemId: currentItem._id.toString(),
          reason: 'singer_departed',
        });
        playbackChanged = true;
      }
    }

    if (removedCount > 0 || playbackChanged) {
      const [queue, playback] = await Promise.all([
        this.getQueueSnapshot(roomId),
        this.getPlaybackSnapshot(roomId),
      ]);
      return { queue, playback };
    }

    return null;
  }
}

export const karaokeService = new KaraokeService();
