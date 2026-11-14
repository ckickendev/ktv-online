import { Types } from 'mongoose';
import {
  KaraokePerformanceDto,
  KaraokeSessionDto,
  PaginatedPerformancesResponse,
  PaginatedSessionsResponse,
  PerformanceOutcome,
  SessionRecapDto,
  UserKaraokeStatsDto,
} from '@ktv/contracts';
import { KaraokeSessionModel } from './session.model.js';
import { KaraokePerformanceModel } from './performance.model.js';
import { RoomModel } from '../rooms/room.model.js';
import { logger } from '../../utils/logger.js';

export interface PerformanceStartParams {
  queueItemId: string | Types.ObjectId;
  roomId: string | Types.ObjectId;
  songId: string | Types.ObjectId;
  songTitle: string;
  artist: string;
  thumbnailUrl?: string | null;
  genre: string;
  language: string;
  durationMs: number;
  singerId: string | Types.ObjectId;
  singerUsername: string;
  singerDisplayName?: string | null;
  singerAvatar?: string | null;
  requestedById: string | Types.ObjectId;
  roomName: string;
  startedAt?: Date;
}

export class KaraokeHistoryService {
  /**
   * Retrieves or creates an active session for a given room.
   */
  public async getOrCreateActiveSession(roomId: string | Types.ObjectId): Promise<any> {
    const roomObjectId = typeof roomId === 'string' ? new Types.ObjectId(roomId) : roomId;

    let session = await KaraokeSessionModel.findOne({
      roomId: roomObjectId,
      status: 'active',
    }).exec();

    if (!session) {
      const room = await RoomModel.findById(roomObjectId).populate('ownerId', 'username displayName avatar').exec();
      if (!room || room.status === 'closed') {
        return null;
      }

      const host = room.ownerId as any;
      const hostId = host?._id || room.ownerId;
      const hostUsername = host?.username || 'host';
      const hostDisplayName = host?.displayName || null;

      session = await KaraokeSessionModel.create({
        roomId: roomObjectId,
        roomName: room.name,
        hostId,
        hostUsername,
        hostDisplayName,
        visibility: room.visibility || 'public',
        roomType: room.roomType || 'standard',
        atmospherePreset: room.atmospherePreset || 'midnight_lounge',
        startedAt: new Date(),
        status: 'active',
        totalSongsPlayed: 0,
        totalParticipantsCount: 1,
        participants: [
          {
            userId: hostId,
            username: hostUsername,
            displayName: hostDisplayName,
            avatar: host?.avatar || null,
            role: 'host',
            joinedAt: new Date(),
            leftAt: null,
            songsPerformedCount: 0,
          },
        ],
      });

      logger.info({ roomId: roomObjectId.toString(), sessionId: session._id.toString() }, 'Created new active karaoke session');
    }

    return session;
  }

  /**
   * Records room creation / session start.
   */
  public async recordSessionStarted(
    room: any,
    owner: { id?: string; _id?: unknown; username: string; displayName?: string | null; avatar?: string | null }
  ): Promise<void> {
    try {
      const roomObjectId = room._id as Types.ObjectId;
      const hostId = new Types.ObjectId((owner.id || owner._id) as string);

      await KaraokeSessionModel.create({
        roomId: roomObjectId,
        roomName: room.name,
        hostId,
        hostUsername: owner.username,
        hostDisplayName: owner.displayName || null,
        visibility: room.visibility || 'public',
        roomType: room.roomType || 'standard',
        atmospherePreset: room.atmospherePreset || 'midnight_lounge',
        startedAt: new Date(),
        status: 'active',
        totalSongsPlayed: 0,
        totalParticipantsCount: 1,
        participants: [
          {
            userId: hostId,
            username: owner.username,
            displayName: owner.displayName || null,
            avatar: owner.avatar || null,
            role: 'host',
            joinedAt: new Date(),
            leftAt: null,
            songsPerformedCount: 0,
          },
        ],
      });

      logger.info({ roomId: roomObjectId.toString() }, 'Authoritative session created on room startup');
    } catch (err: unknown) {
      logger.error({ err, roomId: room._id }, 'Failed to record session started');
    }
  }

  /**
   * Records a participant joining a session.
   * Keyed on userId to prevent multi-tab / reconnect duplication.
   */
  public async recordParticipantJoined(
    roomId: string | Types.ObjectId,
    user: { id?: string; _id?: unknown; username: string; displayName?: string | null; avatar?: string | null },
    role: 'host' | 'moderator' | 'member' = 'member'
  ): Promise<void> {
    try {
      const session = await this.getOrCreateActiveSession(roomId);
      if (!session) return;

      const userObjectId = new Types.ObjectId((user.id || user._id) as string);

      const existingIndex = session.participants.findIndex((p: any) =>
        p.userId.equals(userObjectId)
      );

      if (existingIndex >= 0) {
        // User is rejoining or opening a secondary tab; clear leftAt
        session.participants[existingIndex].leftAt = null;
        if (role === 'host') {
          session.participants[existingIndex].role = 'host';
        }
      } else {
        // Newly joining participant
        session.participants.push({
          userId: userObjectId,
          username: user.username,
          displayName: user.displayName || null,
          avatar: user.avatar || null,
          role,
          joinedAt: new Date(),
          leftAt: null,
          songsPerformedCount: 0,
        });
        session.totalParticipantsCount = session.participants.length;
      }

      await session.save();
    } catch (err: unknown) {
      logger.error({ err, roomId }, 'Failed to record participant joined');
    }
  }

  /**
   * Records a participant leaving a session.
   */
  public async recordParticipantLeft(
    roomId: string | Types.ObjectId,
    userId: string | Types.ObjectId
  ): Promise<void> {
    try {
      const roomObjectId = typeof roomId === 'string' ? new Types.ObjectId(roomId) : roomId;
      const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

      const session = await KaraokeSessionModel.findOne({
        roomId: roomObjectId,
        status: 'active',
      }).exec();

      if (!session) return;

      const participant = session.participants.find((p: any) =>
        p.userId.equals(userObjectId)
      );

      if (participant) {
        participant.leftAt = new Date();
        await session.save();
      }
    } catch (err: unknown) {
      logger.error({ err, roomId, userId }, 'Failed to record participant left');
    }
  }

  /**
   * Records session closure when room is closed.
   */
  public async recordSessionClosed(
    roomId: string | Types.ObjectId,
    reason: 'host_closed' | 'room_abandoned' | 'manual' = 'host_closed'
  ): Promise<void> {
    try {
      const roomObjectId = typeof roomId === 'string' ? new Types.ObjectId(roomId) : roomId;
      const now = new Date();

      const session = await KaraokeSessionModel.findOne({
        roomId: roomObjectId,
        status: 'active',
      }).exec();

      if (!session) return;

      const startedAtTime = session.startedAt instanceof Date ? session.startedAt.getTime() : now.getTime();
      const durationMs = Math.max(0, now.getTime() - startedAtTime);

      session.status = 'completed';
      session.endedAt = now;
      session.endedReason = reason;
      session.durationMs = durationMs;

      // Close all remaining open participant intervals
      session.participants.forEach((p: any) => {
        if (!p.leftAt) {
          p.leftAt = now;
        }
      });

      await session.save();
      logger.info({ roomId: roomObjectId.toString(), sessionId: session._id.toString() }, 'Recorded karaoke session completion');
    } catch (err: unknown) {
      logger.error({ err, roomId }, 'Failed to record session closed');
    }
  }

  /**
   * Records performance start when a song authoritatively becomes 'playing'.
   * Uses unique index on queueItemId for idempotency.
   */
  public async recordPerformanceStarted(params: PerformanceStartParams): Promise<void> {
    try {
      const session = await this.getOrCreateActiveSession(params.roomId);
      const queueItemObjectId = typeof params.queueItemId === 'string' ? new Types.ObjectId(params.queueItemId) : params.queueItemId;
      const roomObjectId = typeof params.roomId === 'string' ? new Types.ObjectId(params.roomId) : params.roomId;
      const songObjectId = typeof params.songId === 'string' ? new Types.ObjectId(params.songId) : params.songId;
      const singerObjectId = typeof params.singerId === 'string' ? new Types.ObjectId(params.singerId) : params.singerId;
      const requestedByObjectId = typeof params.requestedById === 'string' ? new Types.ObjectId(params.requestedById) : params.requestedById;
      const now = params.startedAt || new Date();

      // Upsert using unique queueItemId to avoid duplicate inserts on retries
      await KaraokePerformanceModel.updateOne(
        { queueItemId: queueItemObjectId },
        {
          $setOnInsert: {
            sessionId: session ? session._id : new Types.ObjectId(),
            roomId: roomObjectId,
            queueItemId: queueItemObjectId,
            songId: songObjectId,
            songTitle: params.songTitle,
            artist: params.artist,
            thumbnailUrl: params.thumbnailUrl || null,
            genre: params.genre,
            language: params.language,
            durationMs: params.durationMs,
            singerId: singerObjectId,
            singerUsername: params.singerUsername,
            singerDisplayName: params.singerDisplayName || null,
            singerAvatar: params.singerAvatar || null,
            requestedById: requestedByObjectId,
            roomName: params.roomName,
            startedAt: now,
            outcome: 'playing',
            durationPerformedMs: 0,
          },
        },
        { upsert: true }
      ).exec();

      if (session) {
        // Increment session performance count
        session.totalSongsPlayed = (session.totalSongsPlayed || 0) + 1;

        // Increment singer's performed count in session
        const participant = session.participants.find((p: any) => p.userId.equals(singerObjectId));
        if (participant) {
          participant.songsPerformedCount = (participant.songsPerformedCount || 0) + 1;
        }

        await session.save();
      }

      logger.info({ queueItemId: queueItemObjectId.toString(), songTitle: params.songTitle }, 'Authoritative performance record started');
    } catch (err: any) {
      if (err?.code === 11000) {
        // Duplicate key: performance already recorded
        return;
      }
      logger.error({ err, queueItemId: params.queueItemId }, 'Failed to record performance started');
    }
  }

  /**
   * Records performance outcome (completed, skipped, failed, interrupted).
   */
  public async recordPerformanceFinished(
    queueItemId: string | Types.ObjectId,
    outcome: PerformanceOutcome
  ): Promise<void> {
    try {
      const queueItemObjectId = typeof queueItemId === 'string' ? new Types.ObjectId(queueItemId) : queueItemId;
      const now = new Date();

      const performance = await KaraokePerformanceModel.findOne({
        queueItemId: queueItemObjectId,
      }).exec();

      if (!performance) {
        return;
      }

      const startedTime = performance.startedAt instanceof Date ? performance.startedAt.getTime() : now.getTime();
      const rawPerformedMs = Math.max(0, now.getTime() - startedTime);
      const performedMs = Math.min(rawPerformedMs, performance.durationMs);

      performance.completedAt = now;
      performance.outcome = outcome;
      performance.durationPerformedMs = outcome === 'completed' ? performance.durationMs : performedMs;

      await performance.save();
      logger.info({ queueItemId: queueItemObjectId.toString(), outcome, durationPerformedMs: performance.durationPerformedMs }, 'Performance outcome concluded');
    } catch (err: unknown) {
      logger.error({ err, queueItemId }, 'Failed to record performance finished');
    }
  }

  /**
   * Retrieves paginated performances for a given singer.
   */
  public async getUserPerformances(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedPerformancesResponse> {
    if (!Types.ObjectId.isValid(userId)) {
      return { items: [], total: 0, page, limit, totalPages: 0 };
    }

    const userObjectId = new Types.ObjectId(userId);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      KaraokePerformanceModel.find({ singerId: userObjectId })
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      KaraokePerformanceModel.countDocuments({ singerId: userObjectId }).exec(),
    ]);

    const dtos: KaraokePerformanceDto[] = items.map((p) => p.toJSON() as unknown as KaraokePerformanceDto);
    const totalPages = Math.ceil(total / limit);

    return {
      items: dtos,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Retrieves paginated sessions for a given participant.
   */
  public async getUserSessions(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedSessionsResponse> {
    if (!Types.ObjectId.isValid(userId)) {
      return { items: [], total: 0, page, limit, totalPages: 0 };
    }

    const userObjectId = new Types.ObjectId(userId);
    const skip = (page - 1) * limit;

    const filter = {
      'participants.userId': userObjectId,
    };

    const [items, total] = await Promise.all([
      KaraokeSessionModel.find(filter)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      KaraokeSessionModel.countDocuments(filter).exec(),
    ]);

    const dtos: KaraokeSessionDto[] = items.map((s) => s.toJSON() as unknown as KaraokeSessionDto);
    const totalPages = Math.ceil(total / limit);

    return {
      items: dtos,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Computes authoritative singing statistics for a user.
   */
  public async getUserStats(userId: string): Promise<UserKaraokeStatsDto> {
    if (!Types.ObjectId.isValid(userId)) {
      return {
        totalSessionsJoined: 0,
        totalPerformancesStarted: 0,
        completedPerformances: 0,
        skippedPerformances: 0,
        uniqueSongsCount: 0,
        totalPerformanceDurationMs: 0,
        topGenres: [],
      };
    }

    const userObjectId = new Types.ObjectId(userId);

    const [totalSessionsJoined, performanceStats, uniqueSongs, genreAggregation] = await Promise.all([
      KaraokeSessionModel.countDocuments({ 'participants.userId': userObjectId }).exec(),
      KaraokePerformanceModel.aggregate([
        { $match: { singerId: userObjectId } },
        {
          $group: {
            _id: null,
            totalStarted: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$outcome', 'completed'] }, 1, 0] },
            },
            skippedCount: {
              $sum: { $cond: [{ $eq: ['$outcome', 'skipped'] }, 1, 0] },
            },
            totalDurationMs: { $sum: '$durationPerformedMs' },
          },
        },
      ]).exec(),
      KaraokePerformanceModel.distinct('songId', { singerId: userObjectId }).exec(),
      KaraokePerformanceModel.aggregate([
        { $match: { singerId: userObjectId } },
        { $group: { _id: '$genre', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]).exec(),
    ]);

    const stats = performanceStats[0] || {};
    const topGenres = genreAggregation.map((g: any) => ({
      genre: String(g._id || 'pop'),
      count: Number(g.count || 0),
    }));

    return {
      totalSessionsJoined,
      totalPerformancesStarted: stats.totalStarted || 0,
      completedPerformances: stats.completedCount || 0,
      skippedPerformances: stats.skippedCount || 0,
      uniqueSongsCount: uniqueSongs.length,
      totalPerformanceDurationMs: stats.totalDurationMs || 0,
      topGenres,
    };
  }

  /**
   * Retrieves complete session recap with private room security check.
   */
  public async getSessionRecap(
    sessionId: string,
    requestingUserId?: string
  ): Promise<SessionRecapDto> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const sessionObjectId = new Types.ObjectId(sessionId);
    const sessionDoc = await KaraokeSessionModel.findById(sessionObjectId).exec();

    if (!sessionDoc) {
      throw new Error('SESSION_NOT_FOUND');
    }

    // Enforce private room access control: only actual session participants may view private recaps
    if (sessionDoc.visibility === 'private') {
      if (!requestingUserId || !Types.ObjectId.isValid(requestingUserId)) {
        throw new Error('FORBIDDEN_PRIVATE_SESSION');
      }

      const requestingUserObjectId = new Types.ObjectId(requestingUserId);
      const isParticipant = sessionDoc.participants.some((p: any) =>
        p.userId.equals(requestingUserObjectId)
      );

      if (!isParticipant) {
        throw new Error('FORBIDDEN_PRIVATE_SESSION');
      }
    }

    const performanceDocs = await KaraokePerformanceModel.find({
      sessionId: sessionObjectId,
    })
      .sort({ startedAt: 1 })
      .exec();

    const sessionDto = sessionDoc.toJSON() as unknown as KaraokeSessionDto;
    const performanceDtos = performanceDocs.map((p) => p.toJSON() as unknown as KaraokePerformanceDto);

    return {
      session: sessionDto,
      performances: performanceDtos,
    };
  }
}

export const karaokeHistoryService = new KaraokeHistoryService();
