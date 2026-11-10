import { Types } from 'mongoose';
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
import { logger } from '../../utils/logger.js';

export class KaraokeService {
  /**
   * Helper to ensure an authoritative playback state document exists for a room.
   */
  public async getOrCreatePlaybackState(roomId: string): Promise<IRoomPlaybackStateDocument> {
    const roomObjectId = new Types.ObjectId(roomId);
    let state = await RoomPlaybackStateModel.findOne({ roomId: roomObjectId }).exec();
    if (!state) {
      state = await RoomPlaybackStateModel.create({
        roomId: roomObjectId,
        currentQueueItemId: null,
        status: 'idle',
        positionMs: 0,
        anchorStartedAt: null,
        pausedAt: null,
        playbackVersion: 1,
      });
    }
    return state;
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
    const activeItems = await RoomQueueItemModel.find({
      roomId: roomObjectId,
      status: { $in: ['playing', 'queued'] },
    })
      .sort({ position: 1, addedAt: 1 })
      .populate('songId')
      .populate('requestedBy', 'username displayName avatar')
      .exec();

    const maxQueueVersion = activeItems.reduce((max, i) => Math.max(max, i.queueVersion || 1), 1);
    const itemsDto = activeItems.map((i) => this.mapQueueItem(i));

    return {
      roomId,
      items: itemsDto,
      queueVersion: maxQueueVersion,
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

          // Check if track naturally completed based on duration
          if (derivedPositionMs >= songDurationMs) {
            logger.info({ roomId, songId: currentItemDto.songId }, 'Track naturally completed duration; advancing queue');
            // Auto-advance track to next item
            await this.advanceToNextTrack(roomId);
            return this.getPlaybackSnapshot(roomId);
          }
        }
      } else {
        // If current item is missing or not in playing status, self-heal playback state
        playbackState.currentQueueItemId = null;
        playbackState.status = 'idle';
        playbackState.positionMs = 0;
        playbackState.anchorStartedAt = null;
        playbackState.pausedAt = null;
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
   * If room playback is currently idle, automatically transitions the song to 'playing'
   * and initializes authoritative playback.
   */
  public async addToQueue(
    roomId: string,
    userId: string,
    dto: AddQueueItemDto
  ): Promise<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto; addedItem: RoomQueueItemDto }> {
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

    let queueItem: IRoomQueueItemDocument;

    // Next queue version
    const latestItem = await RoomQueueItemModel.findOne({ roomId: roomObjectId })
      .sort({ queueVersion: -1 })
      .select('queueVersion')
      .exec();
    const nextQueueVersion = (latestItem?.queueVersion || 0) + 1;

    if (!hasActivePlaying && playbackState.status === 'idle') {
      // Direct stage activation: start playing immediately
      queueItem = await RoomQueueItemModel.create({
        roomId: roomObjectId,
        songId: songObjectId,
        requestedBy: userObjectId,
        position: 0,
        status: 'playing',
        queueVersion: nextQueueVersion,
        addedAt: new Date(),
        startedAt: new Date(),
      });

      playbackState.currentQueueItemId = queueItem._id as Types.ObjectId;
      playbackState.status = 'playing';
      playbackState.positionMs = 0;
      playbackState.anchorStartedAt = new Date();
      playbackState.pausedAt = null;
      playbackState.playbackVersion += 1;
      await playbackState.save();

      // Update room stage metadata for display
      room.currentSongTitle = song.title;
      room.currentSingerName = membership.role === 'host' ? 'Host' : 'Singer';
      await room.save();
    } else {
      // Add to upcoming queue: calculate next position
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
        addedAt: new Date(),
      });
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
      { roomId, userId, songId: dto.songId, queueItemId: queueItem._id.toString(), status: queueItem.status },
      'Added song to room karaoke queue'
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

    // 4. Mark item removed
    item.status = 'removed';
    item.position = 0;
    item.removedAt = new Date();
    await item.save();

    // 5. If removing active playing track, advance playback
    if (wasPlaying) {
      await this.advanceToNextTrack(roomId);
    } else {
      // Rebalance remaining queued items
      await this.rebalanceQueuePositions(roomId);
    }

    const [queue, playback] = await Promise.all([
      this.getQueueSnapshot(roomId),
      this.getPlaybackSnapshot(roomId),
    ]);

    logger.info({ roomId, userId, itemId, wasPlaying }, 'Removed item from room karaoke queue');

    return { queue, playback };
  }

  /**
   * Reorders queued items. Restricted strictly to the room host.
   */
  public async reorderQueue(
    roomId: string,
    userId: string,
    dto: ReorderQueueDto
  ): Promise<RoomQueueSnapshotDto> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Verify host role
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

    // 2. Fetch all currently queued items
    const queuedItems = await RoomQueueItemModel.find({
      roomId: roomObjectId,
      status: 'queued',
    }).exec();

    const existingIds = new Set(queuedItems.map((i) => i._id.toString()));

    // Verify reorder payload covers valid items
    for (const id of dto.itemIds) {
      if (!existingIds.has(id)) {
        throw new Error('INVALID_REORDER_ITEM_ID');
      }
    }

    // Fetch next queueVersion
    const latestItem = await RoomQueueItemModel.findOne({ roomId: roomObjectId })
      .sort({ queueVersion: -1 })
      .select('queueVersion')
      .exec();
    const nextQueueVersion = (latestItem?.queueVersion || 0) + 1;

    // Apply new positions
    for (let index = 0; index < dto.itemIds.length; index++) {
      const id = dto.itemIds[index];
      await RoomQueueItemModel.updateOne(
        { _id: new Types.ObjectId(id), roomId: roomObjectId, status: 'queued' },
        { $set: { position: index + 1, queueVersion: nextQueueVersion } }
      ).exec();
    }

    logger.info({ roomId, userId, reorderedCount: dto.itemIds.length }, 'Reordered karaoke queue positions');

    return this.getQueueSnapshot(roomId);
  }

  /**
   * Executes a playback control command (play, pause, seek, skip, stop).
   * Verified against active room membership, host role (or singer for own song),
   * and expected playback version fencing.
   */
  public async executePlaybackCommand(
    roomId: string,
    userId: string,
    dto: PlaybackCommandDto
  ): Promise<{ playback: PlaybackStateDto; queue: RoomQueueSnapshotDto }> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Verify active membership
    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
      kickedAt: null,
    }).exec();

    if (!membership) {
      throw new Error('FORBIDDEN_NOT_MEMBER');
    }

    // 2. Load playback state
    const playbackState = await this.getOrCreatePlaybackState(roomId);

    // 3. Version fencing check
    if (
      dto.expectedPlaybackVersion !== undefined &&
      dto.expectedPlaybackVersion !== playbackState.playbackVersion
    ) {
      logger.warn(
        { roomId, expected: dto.expectedPlaybackVersion, current: playbackState.playbackVersion },
        'Rejected stale playback command due to version conflict'
      );
      throw new Error('STALE_PLAYBACK_VERSION');
    }

    // 4. Role authorization: host has full control; current singer may control their own active track
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

    // 5. Execute command state transition
    const now = new Date();

    switch (dto.command) {
      case 'play': {
        if (playbackState.status === 'paused') {
          playbackState.status = 'playing';
          playbackState.anchorStartedAt = now;
          playbackState.pausedAt = null;
          playbackState.playbackVersion += 1;
          await playbackState.save();
        } else if (playbackState.status === 'idle') {
          await this.advanceToNextTrack(roomId);
        }
        break;
      }

      case 'pause': {
        if (playbackState.status === 'playing' && playbackState.anchorStartedAt) {
          const elapsed = now.getTime() - playbackState.anchorStartedAt.getTime();
          playbackState.positionMs += Math.max(0, elapsed);
          playbackState.status = 'paused';
          playbackState.anchorStartedAt = null;
          playbackState.pausedAt = now;
          playbackState.playbackVersion += 1;
          await playbackState.save();
        }
        break;
      }

      case 'seek': {
        const targetMs = Math.max(0, dto.positionMs || 0);
        playbackState.positionMs = targetMs;
        if (playbackState.status === 'playing') {
          playbackState.anchorStartedAt = now;
        }
        playbackState.playbackVersion += 1;
        await playbackState.save();
        break;
      }

      case 'skip': {
        if (playbackState.currentQueueItemId) {
          await RoomQueueItemModel.updateOne(
            { _id: playbackState.currentQueueItemId },
            { $set: { status: 'skipped', position: 0, completedAt: now } }
          ).exec();
        }
        await this.advanceToNextTrack(roomId);
        break;
      }

      case 'stop': {
        if (playbackState.currentQueueItemId) {
          await RoomQueueItemModel.updateOne(
            { _id: playbackState.currentQueueItemId },
            { $set: { status: 'skipped', position: 0, completedAt: now } }
          ).exec();
        }
        playbackState.currentQueueItemId = null;
        playbackState.status = 'idle';
        playbackState.positionMs = 0;
        playbackState.anchorStartedAt = null;
        playbackState.pausedAt = null;
        playbackState.playbackVersion += 1;
        await playbackState.save();

        const room = await RoomModel.findById(roomObjectId).exec();
        if (room) {
          room.currentSongTitle = null;
          room.currentSingerName = null;
          await room.save();
        }
        break;
      }

      default:
        throw new Error('UNKNOWN_PLAYBACK_COMMAND');
    }

    const [playback, queue] = await Promise.all([
      this.getPlaybackSnapshot(roomId),
      this.getQueueSnapshot(roomId),
    ]);

    logger.info({ roomId, userId, command: dto.command, newStatus: playback.status }, 'Executed playback command');

    return { playback, queue };
  }

  /**
   * Internal helper: advances playback to the next available queued song,
   * or transitions to idle if the queue is empty.
   */
  private async advanceToNextTrack(roomId: string): Promise<void> {
    const roomObjectId = new Types.ObjectId(roomId);
    const playbackState = await this.getOrCreatePlaybackState(roomId);
    const room = await RoomModel.findById(roomObjectId).exec();

    // 1. Mark existing playing item completed if still playing
    if (playbackState.currentQueueItemId) {
      await RoomQueueItemModel.updateOne(
        { _id: playbackState.currentQueueItemId, status: 'playing' },
        { $set: { status: 'completed', position: 0, completedAt: new Date() } }
      ).exec();
    }

    // 2. Find next queued item
    const nextItem = await RoomQueueItemModel.findOne({
      roomId: roomObjectId,
      status: 'queued',
    })
      .sort({ position: 1, addedAt: 1 })
      .populate('songId')
      .populate('requestedBy', 'username displayName')
      .exec();

    if (nextItem) {
      // Transition next item to playing
      nextItem.status = 'playing';
      nextItem.position = 0;
      nextItem.startedAt = new Date();
      await nextItem.save();

      playbackState.currentQueueItemId = nextItem._id as Types.ObjectId;
      playbackState.status = 'playing';
      playbackState.positionMs = 0;
      playbackState.anchorStartedAt = new Date();
      playbackState.pausedAt = null;
      playbackState.playbackVersion += 1;
      await playbackState.save();

      // Rebalance remaining queued items
      await this.rebalanceQueuePositions(roomId);

      // Update room stage metadata
      if (room) {
        const songDoc = nextItem.songId as any;
        const userDoc = nextItem.requestedBy as any;
        room.currentSongTitle = songDoc?.title || 'Sing Along';
        room.currentSingerName = userDoc?.displayName || userDoc?.username || 'Singer';
        await room.save();
      }
    } else {
      // No more items in queue: return to idle
      playbackState.currentQueueItemId = null;
      playbackState.status = 'idle';
      playbackState.positionMs = 0;
      playbackState.anchorStartedAt = null;
      playbackState.pausedAt = null;
      playbackState.playbackVersion += 1;
      await playbackState.save();

      if (room) {
        room.currentSongTitle = null;
        room.currentSingerName = null;
        await room.save();
      }
    }
  }

  /**
   * Internal helper: rebalances positions of all active queued items (1 ... N).
   */
  private async rebalanceQueuePositions(roomId: string): Promise<void> {
    const roomObjectId = new Types.ObjectId(roomId);
    const queuedItems = await RoomQueueItemModel.find({
      roomId: roomObjectId,
      status: 'queued',
    })
      .sort({ position: 1, addedAt: 1 })
      .exec();

    for (let i = 0; i < queuedItems.length; i++) {
      const item = queuedItems[i];
      const targetPos = i + 1;
      if (item && item.position !== targetPos) {
        item.position = targetPos;
        await item.save();
      }
    }
  }

  /**
   * Lifecycle cleanup: called when a room is closed.
   */
  public async handleRoomClosed(roomId: string): Promise<void> {
    const roomObjectId = new Types.ObjectId(roomId);

    // Stop playback
    await RoomPlaybackStateModel.updateOne(
      { roomId: roomObjectId },
      {
        $set: {
          currentQueueItemId: null,
          status: 'idle',
          positionMs: 0,
          anchorStartedAt: null,
          pausedAt: null,
        },
        $inc: { playbackVersion: 1 },
      }
    ).exec();

    // Mark all active queue items removed
    await RoomQueueItemModel.updateMany(
      { roomId: roomObjectId, status: { $in: ['queued', 'playing'] } },
      { $set: { status: 'removed', position: 0, removedAt: new Date() } }
    ).exec();

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

    // 1. Remove user's queued songs
    const removeResult = await RoomQueueItemModel.updateMany(
      { roomId: roomObjectId, requestedBy: userObjectId, status: 'queued' },
      { $set: { status: 'removed', position: 0, removedAt: new Date() } }
    ).exec();

    // 2. Rebalance remaining queue positions
    if (removeResult.modifiedCount > 0) {
      await this.rebalanceQueuePositions(roomId);
    }

    // 3. If currently playing song belonged to departed user, advance playback
    let playbackChanged = false;
    const playbackState = await RoomPlaybackStateModel.findOne({ roomId: roomObjectId }).exec();
    if (playbackState && playbackState.currentQueueItemId) {
      const currentItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId).exec();
      if (currentItem && currentItem.requestedBy.toString() === userId) {
        logger.info({ roomId, userId }, 'Departed member was active singer; advancing to next track');
        await this.advanceToNextTrack(roomId);
        playbackChanged = true;
      }
    }

    if (removeResult.modifiedCount > 0 || playbackChanged) {
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
