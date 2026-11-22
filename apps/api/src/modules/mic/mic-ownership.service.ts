import crypto from 'crypto';
import { ClientSession, Types, UpdateWithAggregationPipeline } from 'mongoose';
import {
  MicOwnershipChangeReason,
  MicOwnershipSnapshotDto,
  MicPendingRequestDto,
  MicRequestCancelledReason,
} from '@ktv/contracts';
import { RoomModel } from '../rooms/room.model.js';
import { IRoomDocument } from '../rooms/room.types.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import { IRoomMembershipDocument } from '../rooms/membership.types.js';
import { UserModel } from '../users/user.model.js';
import { isTransactionSupported, runInTransaction } from '../../database/transaction.js';
import { logger } from '../../utils/logger.js';
import {
  IMicOwnershipDocument,
  IMicPendingRequest,
  MAX_PENDING_MIC_REQUESTS,
  MicOwnershipModel,
  toMicOwnershipSnapshot,
  toPendingRequestDto,
} from './mic-ownership.model.js';

export type MicOwnershipErrorCode =
  | 'INVALID_ROOM_ID'
  | 'INVALID_USER_ID'
  | 'ROOM_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN_ROOM_CLOSED'
  | 'FORBIDDEN_NOT_MEMBER'
  | 'FORBIDDEN_KICKED'
  | 'FORBIDDEN_PRIVATE_ROOM'
  | 'FORBIDDEN_USER_MUTED'
  | 'FORBIDDEN_NOT_HOST'
  | 'FORBIDDEN_MIC_RELEASE'
  | 'USER_NOT_FOUND'
  | 'TARGET_NOT_ACTIVE_MEMBER'
  | 'TARGET_USER_MUTED'
  | 'TARGET_MEMBERSHIP_LOST'
  | 'ALREADY_CURRENT_SINGER'
  | 'MIC_REQUEST_QUEUE_FULL'
  | 'MIC_ALREADY_OCCUPIED'
  | 'REQUEST_NOT_FOUND'
  | 'MIC_NOT_OCCUPIED'
  | 'STALE_SINGER_SESSION'
  | 'STALE_OWNERSHIP_VERSION'
  | 'FORCE_RELEASE_FENCING_REQUIRED';

export class MicOwnershipError extends Error {
  public readonly code: MicOwnershipErrorCode;
  public readonly statusCode: number;

  constructor(code: MicOwnershipErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = 'MicOwnershipError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface MicRequestResult {
  changed: boolean;
  idempotent: boolean;
  request: MicPendingRequestDto;
  snapshot: MicOwnershipSnapshotDto;
}

export interface MicCancelResult {
  changed: boolean;
  removedRequest: MicPendingRequestDto;
  snapshot: MicOwnershipSnapshotDto;
}

export interface MicApproveResult {
  changed: boolean;
  previousSingerId: string | null;
  previousSingerSessionId: string | null;
  grantedSessionId: string;
  snapshot: MicOwnershipSnapshotDto;
}

export interface MicRejectResult {
  changed: boolean;
  rejectedRequest: MicPendingRequestDto;
  reason?: string;
  snapshot: MicOwnershipSnapshotDto;
}

export interface MicReleaseResult {
  changed: boolean;
  reason: 'released' | 'host_forced_release';
  previousSingerId: string;
  previousSingerSessionId: string;
  snapshot: MicOwnershipSnapshotDto;
}

export interface MicDepartureCleanupResult {
  changed: boolean;
  releasedSinger: boolean;
  previousSingerId: string | null;
  previousSingerSessionId: string | null;
  removedRequest: MicPendingRequestDto | null;
  ownershipReason: MicOwnershipChangeReason | null;
  requestCancelReason: MicRequestCancelledReason | null;
  snapshot: MicOwnershipSnapshotDto;
}

export interface MicRoomClosedCleanupResult {
  changed: boolean;
  previousSingerId: string | null;
  previousSingerSessionId: string | null;
  removedRequests: MicPendingRequestDto[];
  snapshot: MicOwnershipSnapshotDto;
}

/**
 * Authoritative Virtual Microphone Ownership service.
 *
 * Concurrency & Consistency Model:
 * - Single-document transitions on MicOwnershipModel use MongoDB atomic conditional
 *   `findOneAndUpdate` operations with aggregation-pipeline updates and `ownershipVersion`
 *   increments. Single-document invariants (at most 1 singer, bounded FIFO max 20,
 *   no duplicate pending user requests, session & version fencing) are strictly atomic
 *   in both replica-set and standalone MongoDB deployments.
 * - Cross-document checks (Room.status / Room.ownerId / RoomMembership.status / kickedAt / isMuted):
 *   When `isTransactionSupported()` is true, reads and ownership writes run inside a MongoDB
 *   transaction session. However, because external Room/Membership mutations (leaveRoom,
 *   kickMember, closeRoom) may execute outside this transaction—and in standalone deployments
 *   where `runInTransaction` falls back to `session = null` without cross-collection ACID
 *   atomicity—`approveRequest` ALWAYS performs post-write membership/room revalidation and a
 *   `currentSingerSessionId`-fenced compensating rollback if a concurrent kick/leave/mute/close
 *   occurred in the window.
 */
export class MicOwnershipService {
  /**
   * Ensures a MicOwnership document exists for the given room using idempotent upsert.
   */
  public async getOrCreateOwnership(
    roomId: string,
    session?: ClientSession | null
  ): Promise<IMicOwnershipDocument> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new MicOwnershipError('INVALID_ROOM_ID', 400, 'Invalid room ID format');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const existing = await MicOwnershipModel.findOne({ roomId: roomObjectId })
      .session(session || null)
      .exec();
    if (existing) {
      return existing;
    }

    try {
      const created = await MicOwnershipModel.findOneAndUpdate(
        { roomId: roomObjectId },
        {
          $setOnInsert: {
            roomId: roomObjectId,
            state: 'AVAILABLE',
            currentSingerId: null,
            currentSingerSessionId: null,
            currentSingerUsername: null,
            currentSingerDisplayName: null,
            currentSingerAvatar: null,
            pendingRequests: [],
            ownershipVersion: 1,
            grantedAt: null,
            expiresAt: null,
          },
        },
        {
          upsert: true,
          new: true,
          session: session || undefined,
        }
      ).exec();

      if (created) {
        return created;
      }
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code !== 11000) {
        throw err;
      }
    }

    const retry = await MicOwnershipModel.findOne({ roomId: roomObjectId })
      .session(session || null)
      .exec();
    if (!retry) {
      throw new Error('FAILED_TO_INITIALIZE_MIC_OWNERSHIP');
    }
    return retry;
  }

  /**
   * Retrieves the authoritative MicOwnership snapshot for a room.
   * Public rooms allow authenticated or unauthenticated read access;
   * private rooms require active non-kicked membership or host ownership.
   */
  public async getSnapshot(
    roomId: string,
    requestingUserId?: string
  ): Promise<MicOwnershipSnapshotDto> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new MicOwnershipError('INVALID_ROOM_ID', 400, 'Invalid room ID format');
    }
    if (requestingUserId !== undefined && !Types.ObjectId.isValid(requestingUserId)) {
      throw new MicOwnershipError('INVALID_USER_ID', 400, 'Invalid user ID format');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const room = await RoomModel.findById(roomObjectId)
      .select('status visibility ownerId')
      .exec();
    if (!room) {
      throw new MicOwnershipError('ROOM_NOT_FOUND', 404, 'Room not found');
    }

    const isOwner = Boolean(requestingUserId && room.ownerId.toString() === requestingUserId);

    if (room.visibility === 'private' && !isOwner) {
      if (!requestingUserId) {
        throw new MicOwnershipError(
          'UNAUTHORIZED',
          401,
          'Authentication required to view private room mic state'
        );
      }

      const userObjectId = new Types.ObjectId(requestingUserId);
      const kickedRecord = await RoomMembershipModel.exists({
        roomId: roomObjectId,
        userId: userObjectId,
        status: 'left',
        kickedAt: { $ne: null },
      });
      if (kickedRecord) {
        throw new MicOwnershipError(
          'FORBIDDEN_KICKED',
          403,
          'You have been removed from this room by the host'
        );
      }

      const isActiveMember = await RoomMembershipModel.exists({
        roomId: roomObjectId,
        userId: userObjectId,
        status: 'active',
        kickedAt: null,
      });
      if (!isActiveMember) {
        throw new MicOwnershipError(
          'FORBIDDEN_PRIVATE_ROOM',
          403,
          'Active room membership required to view private room mic state'
        );
      }
    }

    const existing = await MicOwnershipModel.findOne({ roomId: roomObjectId }).exec();
    if (existing) {
      return toMicOwnershipSnapshot(existing);
    }

    if (room.status === 'closed') {
      const nowIso = new Date().toISOString();
      return {
        roomId,
        state: 'AVAILABLE',
        currentSinger: null,
        currentSingerId: null,
        currentSingerSessionId: null,
        pendingRequests: [],
        ownershipVersion: 1,
        grantedAt: null,
        expiresAt: null,
        updatedAt: nowIso,
      };
    }

    const doc = await this.getOrCreateOwnership(roomId);
    return toMicOwnershipSnapshot(doc);
  }

  /**
   * Internal server helper to read the latest authoritative MicOwnership snapshot
   * for room-channel broadcasts without repeating caller privacy checks.
   */
  public async getAuthoritativeSnapshot(
    roomId: string
  ): Promise<MicOwnershipSnapshotDto | null> {
    if (!Types.ObjectId.isValid(roomId)) {
      return null;
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const existing = await MicOwnershipModel.findOne({ roomId: roomObjectId }).exec();
    if (existing) {
      return toMicOwnershipSnapshot(existing);
    }

    const room = await RoomModel.findById(roomObjectId).select('status').exec();
    if (!room) {
      return null;
    }

    if (room.status === 'closed') {
      return {
        roomId,
        state: 'AVAILABLE',
        currentSinger: null,
        currentSingerId: null,
        currentSingerSessionId: null,
        pendingRequests: [],
        ownershipVersion: 1,
        grantedAt: null,
        expiresAt: null,
        updatedAt: new Date().toISOString(),
      };
    }

    const created = await this.getOrCreateOwnership(roomId);
    return toMicOwnershipSnapshot(created);
  }

  /**
   * Active non-kicked, unmuted room member requests stage mic ownership.
   * Duplicate requests from the same user are idempotent (no duplicate queue entry, no version bump).
   */
  public async requestMic(roomId: string, userId: string): Promise<MicRequestResult> {
    const { roomObjectId, userObjectId } = this.parseIds(roomId, userId);

    const { room, membership } = await this.assertOpenRoomAndActiveMember(
      roomObjectId,
      userObjectId,
      { disallowMuted: true }
    );

    // Ensure host also passes active check cleanly (assertOpenRoomAndActiveMember checks membership)
    void room;
    void membership;

    const user = await UserModel.findById(userObjectId)
      .select('username displayName avatar status')
      .exec();
    if (!user || user.status === 'suspended') {
      throw new MicOwnershipError('USER_NOT_FOUND', 403, 'Active user account required');
    }

    const ownershipDoc = await this.getOrCreateOwnership(roomId);

    if (ownershipDoc.currentSingerId?.toString() === userId) {
      throw new MicOwnershipError(
        'ALREADY_CURRENT_SINGER',
        409,
        'You already hold the stage microphone'
      );
    }

    const existingReq = ownershipDoc.pendingRequests.find((r) => r.userId.toString() === userId);
    if (existingReq) {
      return {
        changed: false,
        idempotent: true,
        request: toPendingRequestDto(existingReq),
        snapshot: toMicOwnershipSnapshot(ownershipDoc),
      };
    }

    const now = new Date();
    const newRequest: IMicPendingRequest = {
      requestId: crypto.randomUUID(),
      userId: userObjectId,
      username: user.username,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      requestedAt: now,
    };

    const updatePipeline: UpdateWithAggregationPipeline = [
      {
        $set: {
          pendingRequests: {
            $concatArrays: ['$pendingRequests', [newRequest]],
          },
          state: {
            $cond: [{ $eq: ['$currentSingerId', null] }, 'REQUEST_PENDING', '$state'],
          },
          ownershipVersion: { $add: ['$ownershipVersion', 1] },
          updatedAt: now,
        },
      },
    ];

    const updated = await MicOwnershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        currentSingerId: { $ne: userObjectId },
        'pendingRequests.userId': { $ne: userObjectId },
        $expr: { $lt: [{ $size: '$pendingRequests' }, MAX_PENDING_MIC_REQUESTS] },
      },
      updatePipeline,
      { new: true }
    ).exec();

    if (updated) {
      const createdReq = updated.pendingRequests.find((r) => r.userId.toString() === userId);
      return {
        changed: true,
        idempotent: false,
        request: createdReq ? toPendingRequestDto(createdReq) : toPendingRequestDto(newRequest),
        snapshot: toMicOwnershipSnapshot(updated),
      };
    }

    // Re-read to distinguish concurrency race outcome deterministically
    const latest = await this.getOrCreateOwnership(roomId);
    if (latest.currentSingerId?.toString() === userId) {
      throw new MicOwnershipError(
        'ALREADY_CURRENT_SINGER',
        409,
        'You already hold the stage microphone'
      );
    }

    const racedExisting = latest.pendingRequests.find((r) => r.userId.toString() === userId);
    if (racedExisting) {
      return {
        changed: false,
        idempotent: true,
        request: toPendingRequestDto(racedExisting),
        snapshot: toMicOwnershipSnapshot(latest),
      };
    }

    if (latest.pendingRequests.length >= MAX_PENDING_MIC_REQUESTS) {
      throw new MicOwnershipError(
        'MIC_REQUEST_QUEUE_FULL',
        409,
        `Mic request queue has reached the maximum of ${MAX_PENDING_MIC_REQUESTS} pending requests`
      );
    }

    throw new MicOwnershipError(
      'MIC_REQUEST_QUEUE_FULL',
      409,
      'Unable to enqueue mic request due to concurrent update'
    );
  }

  /**
   * Requester cancels their own pending mic request.
   */
  public async cancelRequest(
    roomId: string,
    actorUserId: string,
    options?: {
      requestId?: string;
      expectedOwnershipVersion?: number;
    }
  ): Promise<MicCancelResult> {
    const { roomObjectId, userObjectId } = this.parseIds(roomId, actorUserId);

    await this.assertOpenRoomAndActiveMember(roomObjectId, userObjectId, {
      disallowMuted: false,
    });

    const current = await this.getOrCreateOwnership(roomId);
    if (
      options?.expectedOwnershipVersion !== undefined &&
      current.ownershipVersion !== options.expectedOwnershipVersion
    ) {
      throw new MicOwnershipError(
        'STALE_OWNERSHIP_VERSION',
        409,
        'Mic ownership state has changed; please refresh and retry'
      );
    }

    const matchingReq = current.pendingRequests.find(
      (r) =>
        r.userId.toString() === actorUserId &&
        (!options?.requestId || r.requestId === options.requestId)
    );
    if (!matchingReq) {
      throw new MicOwnershipError(
        'REQUEST_NOT_FOUND',
        404,
        'No matching pending mic request found for this user'
      );
    }

    const removedDto = toPendingRequestDto(matchingReq);
    const updated = await this.atomicRemovePendingRequest(roomObjectId, userObjectId, {
      requestId: options?.requestId,
      expectedOwnershipVersion: options?.expectedOwnershipVersion,
    });

    if (!updated) {
      const latest = await this.getOrCreateOwnership(roomId);
      if (
        options?.expectedOwnershipVersion !== undefined &&
        latest.ownershipVersion !== options.expectedOwnershipVersion
      ) {
        throw new MicOwnershipError(
          'STALE_OWNERSHIP_VERSION',
          409,
          'Mic ownership state changed concurrently'
        );
      }
      throw new MicOwnershipError(
        'REQUEST_NOT_FOUND',
        404,
        'Pending mic request is no longer present'
      );
    }

    return {
      changed: true,
      removedRequest: removedDto,
      snapshot: toMicOwnershipSnapshot(updated),
    };
  }

  /**
   * Host approves a pending requester, granting official stage mic ownership.
   * Uses atomic single-document CAS (`currentSingerId: null`, `state: 'REQUEST_PENDING'`)
   * plus MongoDB transaction (when supported) and post-write membership revalidation +
   * session-fenced compensating rollback for concurrent kick/leave/mute/close races.
   */
  public async approveRequest(
    roomId: string,
    hostUserId: string,
    targetUserId: string,
    options?: {
      requestId?: string;
      expectedOwnershipVersion?: number;
    }
  ): Promise<MicApproveResult> {
    const { roomObjectId, userObjectId: hostObjectId } = this.parseIds(roomId, hostUserId);
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new MicOwnershipError('INVALID_USER_ID', 400, 'Invalid target user ID format');
    }
    const targetObjectId = new Types.ObjectId(targetUserId);

    let resultPayload: MicApproveResult | null = null;
    const grantedSessionId = crypto.randomUUID();
    const txSupported = isTransactionSupported();

    await runInTransaction(async (session: ClientSession | null) => {
      // 1. Verify open room & authoritative host ownership
      await this.assertRoomHost(roomObjectId, hostObjectId, session);

      // 2. Verify target is currently an active, non-kicked, unmuted room member
      await this.assertTargetEligibleMember(roomObjectId, targetObjectId, session);

      const targetUser = await UserModel.findById(targetObjectId)
        .select('username displayName avatar status')
        .session(session || null)
        .exec();
      if (!targetUser || targetUser.status === 'suspended') {
        throw new MicOwnershipError(
          'TARGET_NOT_ACTIVE_MEMBER',
          409,
          'Target user account is inactive'
        );
      }

      // 3. Ensure MicOwnership document exists & inspect pre-conditions for crisp error messages
      const current = await this.getOrCreateOwnership(roomId, session);

      if (
        options?.expectedOwnershipVersion !== undefined &&
        current.ownershipVersion !== options.expectedOwnershipVersion
      ) {
        throw new MicOwnershipError(
          'STALE_OWNERSHIP_VERSION',
          409,
          'Mic ownership version changed concurrently'
        );
      }

      if (current.currentSingerId !== null || current.state === 'OCCUPIED') {
        throw new MicOwnershipError(
          'MIC_ALREADY_OCCUPIED',
          409,
          'Stage microphone is currently occupied; release current singer first'
        );
      }

      const targetPending = current.pendingRequests.find(
        (r) =>
          r.userId.toString() === targetUserId &&
          (!options?.requestId || r.requestId === options.requestId)
      );
      if (!targetPending) {
        throw new MicOwnershipError(
          'REQUEST_NOT_FOUND',
          404,
          'Target user does not have a matching pending mic request'
        );
      }

      // 4. Single-document atomic CAS transition: REQUEST_PENDING -> OCCUPIED
      const now = new Date();
      const filter: Record<string, unknown> = {
        roomId: roomObjectId,
        currentSingerId: null,
        state: 'REQUEST_PENDING',
        pendingRequests: options?.requestId
          ? { $elemMatch: { userId: targetObjectId, requestId: options.requestId } }
          : { $elemMatch: { userId: targetObjectId } },
      };
      if (options?.expectedOwnershipVersion !== undefined) {
        filter.ownershipVersion = options.expectedOwnershipVersion;
      }

      const updatePipeline: UpdateWithAggregationPipeline = [
        {
          $set: {
            pendingRequests: {
              $filter: {
                input: '$pendingRequests',
                as: 'req',
                cond: { $ne: ['$$req.userId', targetObjectId] },
              },
            },
            state: 'OCCUPIED',
            currentSingerId: targetObjectId,
            currentSingerSessionId: grantedSessionId,
            currentSingerUsername: targetUser.username,
            currentSingerDisplayName: targetUser.displayName ?? null,
            currentSingerAvatar: targetUser.avatar ?? null,
            grantedAt: now,
            expiresAt: null,
            ownershipVersion: { $add: ['$ownershipVersion', 1] },
            updatedAt: now,
          },
        },
      ];

      const updated = await MicOwnershipModel.findOneAndUpdate(filter, updatePipeline, {
        new: true,
        session: session || undefined,
      }).exec();

      if (!updated) {
        // Re-inspect to emit precise conflict error
        const latest = await MicOwnershipModel.findOne({ roomId: roomObjectId })
          .session(session || null)
          .exec();
        if (
          options?.expectedOwnershipVersion !== undefined &&
          latest &&
          latest.ownershipVersion !== options.expectedOwnershipVersion
        ) {
          throw new MicOwnershipError(
            'STALE_OWNERSHIP_VERSION',
            409,
            'Mic ownership version changed concurrently'
          );
        }
        if (latest && (latest.currentSingerId !== null || latest.state === 'OCCUPIED')) {
          throw new MicOwnershipError(
            'MIC_ALREADY_OCCUPIED',
            409,
            'Stage microphone was claimed concurrently by another approval'
          );
        }
        throw new MicOwnershipError(
          'REQUEST_NOT_FOUND',
          404,
          'Pending mic request is no longer available for approval'
        );
      }

      resultPayload = {
        changed: true,
        previousSingerId: null,
        previousSingerSessionId: null,
        grantedSessionId,
        snapshot: toMicOwnershipSnapshot(updated),
      };
    });

    if (!resultPayload) {
      throw new MicOwnershipError(
        'MIC_ALREADY_OCCUPIED',
        409,
        'Unable to grant mic ownership'
      );
    }

    // 5. Post-write cross-document revalidation & session-fenced compensation.
    // Necessary in standalone fallback (where cross-collection transactions are unavailable)
    // AND when external Room/Membership mutations (leaveRoom/kickMember/closeRoom) run
    // outside MicOwnership's transaction under MongoDB snapshot isolation.
    const revalidationError = await this.checkPostApproveInvariants(
      roomObjectId,
      hostObjectId,
      targetObjectId
    );
    if (revalidationError) {
      logger.warn(
        {
          roomId,
          hostUserId,
          targetUserId,
          grantedSessionId,
          txSupported,
          revalidationError,
        },
        'Concurrent room/membership change invalidated mic approval; executing session-fenced rollback'
      );
      await this.compensateInvalidGrant(roomObjectId, targetObjectId, grantedSessionId);
      throw revalidationError;
    }

    return resultPayload;
  }

  /**
   * Host rejects/removes a user's pending mic request.
   */
  public async rejectRequest(
    roomId: string,
    hostUserId: string,
    targetUserId: string,
    options?: {
      requestId?: string;
      reason?: string;
      expectedOwnershipVersion?: number;
    }
  ): Promise<MicRejectResult> {
    const { roomObjectId, userObjectId: hostObjectId } = this.parseIds(roomId, hostUserId);
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new MicOwnershipError('INVALID_USER_ID', 400, 'Invalid target user ID format');
    }
    const targetObjectId = new Types.ObjectId(targetUserId);

    await this.assertRoomHost(roomObjectId, hostObjectId);

    const current = await this.getOrCreateOwnership(roomId);
    if (
      options?.expectedOwnershipVersion !== undefined &&
      current.ownershipVersion !== options.expectedOwnershipVersion
    ) {
      throw new MicOwnershipError(
        'STALE_OWNERSHIP_VERSION',
        409,
        'Mic ownership state has changed; please refresh and retry'
      );
    }

    const matchingReq = current.pendingRequests.find(
      (r) =>
        r.userId.toString() === targetUserId &&
        (!options?.requestId || r.requestId === options.requestId)
    );
    if (!matchingReq) {
      throw new MicOwnershipError(
        'REQUEST_NOT_FOUND',
        404,
        'Target user does not have a matching pending mic request'
      );
    }

    const rejectedDto = toPendingRequestDto(matchingReq);
    const updated = await this.atomicRemovePendingRequest(roomObjectId, targetObjectId, {
      requestId: options?.requestId,
      expectedOwnershipVersion: options?.expectedOwnershipVersion,
    });

    if (!updated) {
      const latest = await this.getOrCreateOwnership(roomId);
      if (
        options?.expectedOwnershipVersion !== undefined &&
        latest.ownershipVersion !== options.expectedOwnershipVersion
      ) {
        throw new MicOwnershipError(
          'STALE_OWNERSHIP_VERSION',
          409,
          'Mic ownership version changed concurrently'
        );
      }
      throw new MicOwnershipError(
        'REQUEST_NOT_FOUND',
        404,
        'Pending mic request is no longer present'
      );
    }

    return {
      changed: true,
      rejectedRequest: rejectedDto,
      reason: options?.reason,
      snapshot: toMicOwnershipSnapshot(updated),
    };
  }

  /**
   * Releases active mic ownership.
   * - Current singer voluntary release: fenced by currentSingerId and currentSingerSessionId
   *   (and optional expectedOwnershipVersion).
   * - Host force-release: requires exact observed fencing (expectedOwnershipVersion or
   *   expectedSessionId) so a stale force-release cannot evict a newer singer.
   */
  public async releaseMic(
    roomId: string,
    actorUserId: string,
    options?: {
      expectedOwnershipVersion?: number;
      expectedSessionId?: string;
    }
  ): Promise<MicReleaseResult> {
    const { roomObjectId, userObjectId: actorObjectId } = this.parseIds(roomId, actorUserId);

    const { room } = await this.assertOpenRoomAndActiveMember(roomObjectId, actorObjectId, {
      disallowMuted: false,
    });

    const current = await this.getOrCreateOwnership(roomId);

    const observedSingerId = current.currentSingerId ? current.currentSingerId.toString() : null;
    const observedSessionId = current.currentSingerSessionId;

    // Check explicit session & version fences before/regardless of occupied state so stale
    // duplicate releases or stale host commands receive explicit fencing rejection.
    if (
      options?.expectedSessionId !== undefined &&
      observedSessionId !== options.expectedSessionId
    ) {
      throw new MicOwnershipError(
        'STALE_SINGER_SESSION',
        409,
        'Singer session has already changed or ended'
      );
    }

    if (
      options?.expectedOwnershipVersion !== undefined &&
      current.ownershipVersion !== options.expectedOwnershipVersion
    ) {
      throw new MicOwnershipError(
        'STALE_OWNERSHIP_VERSION',
        409,
        'Mic ownership state has changed; release rejected'
      );
    }

    if (current.state !== 'OCCUPIED' || !observedSingerId || !observedSessionId) {
      throw new MicOwnershipError(
        'MIC_NOT_OCCUPIED',
        409,
        'Stage microphone is not currently occupied'
      );
    }

    const isHost = room.ownerId.toString() === actorUserId;
    const isCurrentSinger = observedSingerId === actorUserId;

    if (!isHost && !isCurrentSinger) {
      throw new MicOwnershipError(
        'FORBIDDEN_MIC_RELEASE',
        403,
        'Only the current singer or room host can release the microphone'
      );
    }

    // Host force-release of another singer MUST include exact observed fencing
    if (!isCurrentSinger && isHost) {
      if (
        options?.expectedOwnershipVersion === undefined &&
        options?.expectedSessionId === undefined
      ) {
        throw new MicOwnershipError(
          'FORCE_RELEASE_FENCING_REQUIRED',
          400,
          'Host force-release requires expectedOwnershipVersion or expectedSessionId'
        );
      }
    }

    const observedSingerObjectId = new Types.ObjectId(observedSingerId);
    const now = new Date();
    const filter: Record<string, unknown> = {
      roomId: roomObjectId,
      state: 'OCCUPIED',
      currentSingerId: observedSingerObjectId,
      currentSingerSessionId: observedSessionId,
      ownershipVersion: current.ownershipVersion,
    };

    const updatePipeline: UpdateWithAggregationPipeline = [
      {
        $set: {
          currentSingerId: null,
          currentSingerSessionId: null,
          currentSingerUsername: null,
          currentSingerDisplayName: null,
          currentSingerAvatar: null,
          grantedAt: null,
          expiresAt: null,
          state: {
            $cond: [{ $gt: [{ $size: '$pendingRequests' }, 0] }, 'REQUEST_PENDING', 'AVAILABLE'],
          },
          ownershipVersion: { $add: ['$ownershipVersion', 1] },
          updatedAt: now,
        },
      },
    ];

    const updated = await MicOwnershipModel.findOneAndUpdate(filter, updatePipeline, {
      new: true,
    }).exec();

    if (!updated) {
      const latest = await this.getOrCreateOwnership(roomId);
      if (latest.currentSingerSessionId !== observedSessionId) {
        throw new MicOwnershipError(
          'STALE_SINGER_SESSION',
          409,
          'Singer session changed concurrently before release committed'
        );
      }
      throw new MicOwnershipError(
        'STALE_OWNERSHIP_VERSION',
        409,
        'Mic ownership state changed concurrently'
      );
    }

    return {
      changed: true,
      reason: isCurrentSinger ? 'released' : 'host_forced_release',
      previousSingerId: observedSingerId,
      previousSingerSessionId: observedSessionId,
      snapshot: toMicOwnershipSnapshot(updated),
    };
  }

  /**
   * Lifecycle hook for S3.3: Cleans up singer ownership and/or pending request
   * when a room member leaves, is kicked, or exceeds disconnect grace timeout.
   * Performs a single atomic document update if and only if the user currently
   * holds the mic or has a pending request.
   */
  public async handleMemberDeparted(
    roomId: string,
    userId: string,
    departureType: 'left' | 'kicked' | 'disconnected',
    options?: { expectedSessionId?: string }
  ): Promise<MicDepartureCleanupResult | null> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(userId)) {
      return null;
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    return this.atomicSweepUserFromMic(roomObjectId, userObjectId, departureType, options);
  }

  /**
   * Lifecycle hook for S3.3: Releases mic and/or removes pending request when a member is room-muted.
   */
  public async handleMemberMuted(
    roomId: string,
    userId: string
  ): Promise<MicDepartureCleanupResult | null> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(userId)) {
      return null;
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(userId);

    return this.atomicSweepUserFromMic(roomObjectId, userObjectId, 'muted');
  }

  /**
   * Lifecycle hook for S3.3: Force-clears all active mic ownership and pending requests
   * when a room is closed.
   */
  public async handleRoomClosed(roomId: string): Promise<MicRoomClosedCleanupResult | null> {
    if (!Types.ObjectId.isValid(roomId)) {
      return null;
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const before = await MicOwnershipModel.findOne({ roomId: roomObjectId }).exec();
    if (!before) {
      return null;
    }

    const updated = await MicOwnershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        $or: [
          { currentSingerId: { $ne: null } },
          { 'pendingRequests.0': { $exists: true } },
          { state: { $ne: 'AVAILABLE' } },
        ],
      },
      {
        $set: {
          state: 'AVAILABLE',
          currentSingerId: null,
          currentSingerSessionId: null,
          currentSingerUsername: null,
          currentSingerDisplayName: null,
          currentSingerAvatar: null,
          pendingRequests: [],
          grantedAt: null,
          expiresAt: null,
        },
        $inc: { ownershipVersion: 1 },
      },
      { new: true }
    ).exec();

    if (!updated) {
      return null;
    }

    return {
      changed: true,
      previousSingerId: before.currentSingerId ? before.currentSingerId.toString() : null,
      previousSingerSessionId: before.currentSingerSessionId ?? null,
      removedRequests: (before.pendingRequests || []).map(toPendingRequestDto),
      snapshot: toMicOwnershipSnapshot(updated),
    };
  }

  // ==========================================
  // INTERNAL HELPERS
  // ==========================================

  private parseIds(roomId: string, userId: string): {
    roomObjectId: Types.ObjectId;
    userObjectId: Types.ObjectId;
  } {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new MicOwnershipError('INVALID_ROOM_ID', 400, 'Invalid room ID format');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new MicOwnershipError('INVALID_USER_ID', 400, 'Invalid user ID format');
    }
    return {
      roomObjectId: new Types.ObjectId(roomId),
      userObjectId: new Types.ObjectId(userId),
    };
  }

  private async assertOpenRoomAndActiveMember(
    roomObjectId: Types.ObjectId,
    userObjectId: Types.ObjectId,
    options: { disallowMuted: boolean }
  ): Promise<{ room: IRoomDocument; membership: IRoomMembershipDocument | null }> {
    const room = await RoomModel.findById(roomObjectId).exec();
    if (!room) {
      throw new MicOwnershipError('ROOM_NOT_FOUND', 404, 'Room not found');
    }
    if (room.status === 'closed') {
      throw new MicOwnershipError('FORBIDDEN_ROOM_CLOSED', 409, 'Room is closed');
    }

    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
    }).exec();

    const isOwner = room.ownerId.toString() === userObjectId.toString();

    if (!membership || membership.kickedAt != null) {
      if (isOwner && !membership) {
        // Guard against legacy rooms missing explicit host membership doc while verifying kicked status
        return { room, membership: null };
      }
      if (membership?.kickedAt != null) {
        throw new MicOwnershipError(
          'FORBIDDEN_KICKED',
          403,
          'You have been removed from this room by the host'
        );
      }
      const kickedRecord = await RoomMembershipModel.exists({
        roomId: roomObjectId,
        userId: userObjectId,
        status: 'left',
        kickedAt: { $ne: null },
      });
      if (kickedRecord) {
        throw new MicOwnershipError(
          'FORBIDDEN_KICKED',
          403,
          'You have been removed from this room by the host'
        );
      }
      throw new MicOwnershipError(
        'FORBIDDEN_NOT_MEMBER',
        403,
        'Active room membership is required'
      );
    }

    if (options.disallowMuted && membership.isMuted) {
      throw new MicOwnershipError(
        'FORBIDDEN_USER_MUTED',
        403,
        'You cannot request the stage microphone while muted by room moderation'
      );
    }

    return { room, membership };
  }

  private async assertRoomHost(
    roomObjectId: Types.ObjectId,
    hostObjectId: Types.ObjectId,
    session?: ClientSession | null
  ): Promise<IRoomDocument> {
    const room = await RoomModel.findById(roomObjectId)
      .session(session || null)
      .exec();
    if (!room) {
      throw new MicOwnershipError('ROOM_NOT_FOUND', 404, 'Room not found');
    }
    if (room.status === 'closed') {
      throw new MicOwnershipError('FORBIDDEN_ROOM_CLOSED', 409, 'Room is closed');
    }

    if (room.ownerId.toString() !== hostObjectId.toString()) {
      throw new MicOwnershipError(
        'FORBIDDEN_NOT_HOST',
        403,
        'Only the current room host can manage mic requests'
      );
    }

    const hostMembership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: hostObjectId,
      status: 'active',
      kickedAt: null,
    })
      .session(session || null)
      .exec();

    if (hostMembership && hostMembership.role !== 'host') {
      throw new MicOwnershipError(
        'FORBIDDEN_NOT_HOST',
        403,
        'Host membership role required to manage mic requests'
      );
    }

    return room;
  }

  private async assertTargetEligibleMember(
    roomObjectId: Types.ObjectId,
    targetObjectId: Types.ObjectId,
    session?: ClientSession | null
  ): Promise<IRoomMembershipDocument> {
    const membership = await RoomMembershipModel.findOne({
      roomId: roomObjectId,
      userId: targetObjectId,
      status: 'active',
      kickedAt: null,
    })
      .session(session || null)
      .exec();

    if (!membership) {
      throw new MicOwnershipError(
        'TARGET_NOT_ACTIVE_MEMBER',
        409,
        'Target user is no longer an active member of this room'
      );
    }

    if (membership.isMuted) {
      throw new MicOwnershipError(
        'TARGET_USER_MUTED',
        409,
        'Target user is currently muted by room moderation'
      );
    }

    return membership;
  }

  private async checkPostApproveInvariants(
    roomObjectId: Types.ObjectId,
    hostObjectId: Types.ObjectId,
    targetObjectId: Types.ObjectId
  ): Promise<MicOwnershipError | null> {
    const [latestRoom, latestTargetMembership] = await Promise.all([
      RoomModel.findById(roomObjectId).select('status ownerId').exec(),
      RoomMembershipModel.findOne({
        roomId: roomObjectId,
        userId: targetObjectId,
        status: 'active',
        kickedAt: null,
      })
        .select('status kickedAt isMuted')
        .exec(),
    ]);

    if (!latestRoom || latestRoom.status === 'closed') {
      return new MicOwnershipError('FORBIDDEN_ROOM_CLOSED', 409, 'Room closed during approval');
    }
    if (latestRoom.ownerId.toString() !== hostObjectId.toString()) {
      return new MicOwnershipError(
        'FORBIDDEN_NOT_HOST',
        403,
        'Host ownership changed during approval'
      );
    }
    if (!latestTargetMembership) {
      return new MicOwnershipError(
        'TARGET_MEMBERSHIP_LOST',
        409,
        'Target user left or was kicked from the room concurrently'
      );
    }
    if (latestTargetMembership.isMuted) {
      return new MicOwnershipError(
        'TARGET_USER_MUTED',
        409,
        'Target user was muted concurrently during approval'
      );
    }

    return null;
  }

  private async compensateInvalidGrant(
    roomObjectId: Types.ObjectId,
    targetObjectId: Types.ObjectId,
    grantedSessionId: string
  ): Promise<void> {
    const now = new Date();
    const pipeline: UpdateWithAggregationPipeline = [
      {
        $set: {
          currentSingerId: null,
          currentSingerSessionId: null,
          currentSingerUsername: null,
          currentSingerDisplayName: null,
          currentSingerAvatar: null,
          grantedAt: null,
          expiresAt: null,
          state: {
            $cond: [{ $gt: [{ $size: '$pendingRequests' }, 0] }, 'REQUEST_PENDING', 'AVAILABLE'],
          },
          ownershipVersion: { $add: ['$ownershipVersion', 1] },
          updatedAt: now,
        },
      },
    ];

    await MicOwnershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        currentSingerId: targetObjectId,
        currentSingerSessionId: grantedSessionId,
      },
      pipeline,
      { new: true }
    ).exec();
  }

  private async atomicRemovePendingRequest(
    roomObjectId: Types.ObjectId,
    userObjectId: Types.ObjectId,
    options?: {
      requestId?: string;
      expectedOwnershipVersion?: number;
    }
  ): Promise<IMicOwnershipDocument | null> {
    const now = new Date();
    const filter: Record<string, unknown> = {
      roomId: roomObjectId,
      pendingRequests: options?.requestId
        ? { $elemMatch: { userId: userObjectId, requestId: options.requestId } }
        : { $elemMatch: { userId: userObjectId } },
    };

    if (options?.expectedOwnershipVersion !== undefined) {
      filter.ownershipVersion = options.expectedOwnershipVersion;
    }

    const pipeline: UpdateWithAggregationPipeline = [
      {
        $set: {
          pendingRequests: {
            $filter: {
              input: '$pendingRequests',
              as: 'req',
              cond: options?.requestId
                ? {
                    $not: {
                      $and: [
                        { $eq: ['$$req.userId', userObjectId] },
                        { $eq: ['$$req.requestId', options.requestId] },
                      ],
                    },
                  }
                : { $ne: ['$$req.userId', userObjectId] },
            },
          },
        },
      },
      {
        $set: {
          state: {
            $cond: [
              { $ne: ['$currentSingerId', null] },
              'OCCUPIED',
              {
                $cond: [
                  { $gt: [{ $size: '$pendingRequests' }, 0] },
                  'REQUEST_PENDING',
                  'AVAILABLE',
                ],
              },
            ],
          },
          ownershipVersion: { $add: ['$ownershipVersion', 1] },
          updatedAt: now,
        },
      },
    ];

    return MicOwnershipModel.findOneAndUpdate(filter, pipeline, { new: true }).exec();
  }

  private async atomicSweepUserFromMic(
    roomObjectId: Types.ObjectId,
    userObjectId: Types.ObjectId,
    sweepReason: 'left' | 'kicked' | 'disconnected' | 'muted',
    options?: { expectedSessionId?: string }
  ): Promise<MicDepartureCleanupResult | null> {
    const before = await MicOwnershipModel.findOne({
      roomId: roomObjectId,
      $or: [{ currentSingerId: userObjectId }, { 'pendingRequests.userId': userObjectId }],
    }).exec();

    if (!before) {
      return null;
    }

    const removedReqDoc = before.pendingRequests.find((r) => r.userId.equals(userObjectId));
    const holdsMic = Boolean(before.currentSingerId?.equals(userObjectId));
    const matchesExpectedSession =
      !options?.expectedSessionId ||
      before.currentSingerSessionId === options.expectedSessionId;
    const wasCurrentSinger = holdsMic && matchesExpectedSession;

    if (!wasCurrentSinger && !removedReqDoc) {
      // Stale cleanup observed an old sessionId after a newer singer session took over
      return null;
    }

    const prevSingerId = wasCurrentSinger ? userObjectId.toString() : null;
    const prevSingerSessionId = wasCurrentSinger ? before.currentSingerSessionId : null;

    const now = new Date();
    const pipeline: UpdateWithAggregationPipeline = [
      {
        $set: {
          pendingRequests: {
            $filter: {
              input: '$pendingRequests',
              as: 'req',
              cond: { $ne: ['$$req.userId', userObjectId] },
            },
          },
          ...(wasCurrentSinger
            ? {
                currentSingerId: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$currentSingerId', userObjectId] },
                        { $eq: ['$currentSingerSessionId', prevSingerSessionId] },
                      ],
                    },
                    null,
                    '$currentSingerId',
                  ],
                },
                currentSingerSessionId: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$currentSingerId', userObjectId] },
                        { $eq: ['$currentSingerSessionId', prevSingerSessionId] },
                      ],
                    },
                    null,
                    '$currentSingerSessionId',
                  ],
                },
                currentSingerUsername: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$currentSingerId', userObjectId] },
                        { $eq: ['$currentSingerSessionId', prevSingerSessionId] },
                      ],
                    },
                    null,
                    '$currentSingerUsername',
                  ],
                },
                currentSingerDisplayName: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$currentSingerId', userObjectId] },
                        { $eq: ['$currentSingerSessionId', prevSingerSessionId] },
                      ],
                    },
                    null,
                    '$currentSingerDisplayName',
                  ],
                },
                currentSingerAvatar: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$currentSingerId', userObjectId] },
                        { $eq: ['$currentSingerSessionId', prevSingerSessionId] },
                      ],
                    },
                    null,
                    '$currentSingerAvatar',
                  ],
                },
                grantedAt: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$currentSingerId', userObjectId] },
                        { $eq: ['$currentSingerSessionId', prevSingerSessionId] },
                      ],
                    },
                    null,
                    '$grantedAt',
                  ],
                },
                expiresAt: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$currentSingerId', userObjectId] },
                        { $eq: ['$currentSingerSessionId', prevSingerSessionId] },
                      ],
                    },
                    null,
                    '$expiresAt',
                  ],
                },
              }
            : {}),
        },
      },
      {
        $set: {
          state: {
            $cond: [
              { $ne: ['$currentSingerId', null] },
              'OCCUPIED',
              {
                $cond: [
                  { $gt: [{ $size: '$pendingRequests' }, 0] },
                  'REQUEST_PENDING',
                  'AVAILABLE',
                ],
              },
            ],
          },
          ownershipVersion: { $add: ['$ownershipVersion', 1] },
          updatedAt: now,
        },
      },
    ];

    const matchConditions: Record<string, unknown>[] = [];
    if (wasCurrentSinger) {
      matchConditions.push({
        currentSingerId: userObjectId,
        currentSingerSessionId: prevSingerSessionId,
      });
    }
    if (removedReqDoc) {
      matchConditions.push({
        pendingRequests: {
          $elemMatch: { userId: userObjectId, requestId: removedReqDoc.requestId },
        },
      });
    }

    const updated = await MicOwnershipModel.findOneAndUpdate(
      {
        roomId: roomObjectId,
        ...(matchConditions.length === 1 ? matchConditions[0] : { $or: matchConditions }),
      },
      pipeline,
      { new: true }
    ).exec();

    if (!updated) {
      return null;
    }

    const ownershipReason: MicOwnershipChangeReason | null = wasCurrentSinger
      ? sweepReason === 'left'
        ? 'singer_left'
        : sweepReason === 'kicked'
          ? 'singer_kicked'
          : sweepReason === 'muted'
            ? 'singer_muted'
            : 'singer_disconnected'
      : null;

    const requestCancelReason: MicRequestCancelledReason | null = removedReqDoc
      ? sweepReason === 'left'
        ? 'departed'
        : sweepReason
      : null;

    return {
      changed: true,
      releasedSinger: wasCurrentSinger,
      previousSingerId: prevSingerId,
      previousSingerSessionId: prevSingerSessionId,
      removedRequest: removedReqDoc ? toPendingRequestDto(removedReqDoc) : null,
      ownershipReason,
      requestCancelReason,
      snapshot: toMicOwnershipSnapshot(updated),
    };
  }
}

export const micOwnershipService = new MicOwnershipService();
