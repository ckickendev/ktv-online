import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import {
  MicApprovePayloadSchema,
  MicCancelPayloadSchema,
  MicOwnershipChangedPayload,
  MicOwnershipSnapshotDto,
  MicRejectPayloadSchema,
  MicReleasePayloadSchema,
  MicRequestCancelledPayload,
  MicRequestCreatedPayload,
  MicRequestPayloadSchema,
  MicStateRequestPayloadSchema,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import {
  MicDepartureCleanupResult,
  MicOwnershipError,
  micOwnershipService,
  MicRoomClosedCleanupResult,
} from './mic-ownership.service.js';
import { micRequestLimiter } from './mic-request.limiter.js';
import { getRoomChannel } from '../../realtime/room.events.js';
import { AuthenticatedSocketData } from '../../realtime/socket.auth.js';
import { logger } from '../../utils/logger.js';

/**
 * Per-room monotonic broadcast fence preventing concurrent handlers from
 * publishing an older `ownershipVersion` after a newer snapshot has already been emitted.
 */
const lastBroadcastVersionByRoom = new Map<string, number>();

export function resetMicBroadcastTracker(roomId?: string): void {
  if (roomId) {
    lastBroadcastVersionByRoom.delete(roomId);
  } else {
    lastBroadcastVersionByRoom.clear();
  }
}

function tryEmitAuthoritativeMicState(
  io: Server,
  roomId: string,
  snapshot: MicOwnershipSnapshotDto,
  correlationId?: string
): boolean {
  const lastVersion = lastBroadcastVersionByRoom.get(roomId) ?? 0;
  if (snapshot.ownershipVersion <= lastVersion) {
    return false;
  }

  lastBroadcastVersionByRoom.set(roomId, snapshot.ownershipVersion);
  const channel = getRoomChannel(roomId);
  io.to(channel).emit(SOCKET_EVENTS.SERVER.MIC_STATE, {
    ...snapshot,
    ...(correlationId ? { correlationId } : {}),
  });
  return true;
}

/**
 * Re-reads the latest committed MicOwnership snapshot and broadcasts it to the room channel
 * if its ownershipVersion exceeds the last emitted version for that room.
 */
export async function broadcastAuthoritativeMicSnapshot(
  io: Server,
  roomId: string,
  options?: { fallbackSnapshot?: MicOwnershipSnapshotDto; correlationId?: string }
): Promise<{ emitted: boolean; snapshot: MicOwnershipSnapshotDto | null }> {
  const latest =
    (await micOwnershipService.getAuthoritativeSnapshot(roomId)) ??
    options?.fallbackSnapshot ??
    null;

  if (!latest) {
    return { emitted: false, snapshot: null };
  }

  const emitted = tryEmitAuthoritativeMicState(io, roomId, latest, options?.correlationId);
  return { emitted, snapshot: latest };
}

/**
 * Broadcasts lifecycle departure/mute cleanup snapshot + auxiliary events when state changed.
 */
export async function broadcastMicLifecycleUpdate(
  io: Server | null,
  roomId: string,
  cleanup: MicDepartureCleanupResult | null
): Promise<void> {
  if (!io || !cleanup || !cleanup.changed) {
    return;
  }

  const channel = getRoomChannel(roomId);
  if (!io.sockets.adapter.rooms.has(channel)) {
    return;
  }

  const { emitted, snapshot } = await broadcastAuthoritativeMicSnapshot(io, roomId, {
    fallbackSnapshot: cleanup.snapshot,
  });

  if (!emitted || !snapshot) {
    return;
  }

  const occurredAt = new Date().toISOString();

  if (cleanup.releasedSinger && cleanup.ownershipReason) {
    const payload: MicOwnershipChangedPayload = {
      roomId,
      previousSingerId: cleanup.previousSingerId,
      previousSingerSessionId: cleanup.previousSingerSessionId,
      currentSinger: snapshot.currentSinger,
      currentSingerId: snapshot.currentSingerId,
      currentSingerSessionId: snapshot.currentSingerSessionId,
      pendingRequests: snapshot.pendingRequests,
      state: snapshot.state,
      reason: cleanup.ownershipReason,
      ownershipVersion: snapshot.ownershipVersion,
      grantedAt: snapshot.grantedAt,
      occurredAt,
    };
    io.to(channel).emit(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED, payload);
  }

  if (cleanup.removedRequest && cleanup.requestCancelReason) {
    const cancelPayload: MicRequestCancelledPayload = {
      roomId,
      userId: cleanup.removedRequest.userId,
      requestId: cleanup.removedRequest.requestId,
      reason: cleanup.requestCancelReason,
      state: snapshot.state,
      pendingRequests: snapshot.pendingRequests,
      ownershipVersion: snapshot.ownershipVersion,
      occurredAt,
    };
    io.to(channel).emit(SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED, cancelPayload);
  }
}

/**
 * Broadcasts cleared MicOwnership state when a room closes, only if the room channel
 * still exists and has not already been dismantled.
 */
export async function broadcastMicRoomClosed(
  io: Server | null,
  roomId: string,
  closedResult: MicRoomClosedCleanupResult | null
): Promise<void> {
  if (!io || !closedResult || !closedResult.changed) {
    return;
  }

  const channel = getRoomChannel(roomId);
  if (!io.sockets.adapter.rooms.has(channel)) {
    return;
  }

  const { emitted, snapshot } = await broadcastAuthoritativeMicSnapshot(io, roomId, {
    fallbackSnapshot: closedResult.snapshot,
  });

  if (!emitted || !snapshot) {
    return;
  }

  const occurredAt = new Date().toISOString();

  if (closedResult.previousSingerId) {
    const payload: MicOwnershipChangedPayload = {
      roomId,
      previousSingerId: closedResult.previousSingerId,
      previousSingerSessionId: closedResult.previousSingerSessionId,
      currentSinger: snapshot.currentSinger,
      currentSingerId: snapshot.currentSingerId,
      currentSingerSessionId: snapshot.currentSingerSessionId,
      pendingRequests: snapshot.pendingRequests,
      state: snapshot.state,
      reason: 'room_closed',
      ownershipVersion: snapshot.ownershipVersion,
      grantedAt: snapshot.grantedAt,
      occurredAt,
    };
    io.to(channel).emit(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED, payload);
  }

  for (const removedReq of closedResult.removedRequests) {
    const cancelPayload: MicRequestCancelledPayload = {
      roomId,
      userId: removedReq.userId,
      requestId: removedReq.requestId,
      reason: 'room_closed',
      state: snapshot.state,
      pendingRequests: snapshot.pendingRequests,
      ownershipVersion: snapshot.ownershipVersion,
      occurredAt,
    };
    io.to(channel).emit(SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED, cancelPayload);
  }
}

type MicAckFn = (res: SocketAckResponse<MicOwnershipSnapshotDto>) => void;

function sendMicAckError(
  ack: MicAckFn | undefined,
  err: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  correlationId?: string
): void {
  if (err instanceof MicOwnershipError) {
    ack?.({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        correlationId,
      },
      correlationId,
    });
    return;
  }

  const message = err instanceof Error ? err.message : fallbackMessage;
  ack?.({
    success: false,
    error: {
      code: fallbackCode,
      message,
      correlationId,
    },
    correlationId,
  });
}

function ensureJoinedSocketChannel(
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  roomId: string,
  ack?: MicAckFn,
  correlationId?: string
): boolean {
  if (!Types.ObjectId.isValid(roomId)) {
    ack?.({
      success: false,
      error: {
        code: 'INVALID_ROOM_ID',
        message: 'Invalid room ID format',
        correlationId,
      },
      correlationId,
    });
    return false;
  }

  const channel = getRoomChannel(roomId);
  if (!socket.rooms.has(channel)) {
    ack?.({
      success: false,
      error: {
        code: 'FORBIDDEN_NOT_IN_ROOM',
        message: 'You must join the room channel before modifying mic ownership',
        correlationId,
      },
      correlationId,
    });
    return false;
  }

  return true;
}

/**
 * Registers S3 Virtual Microphone Ownership Socket.IO handlers for an authenticated socket.
 */
export function registerMicEvents(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>
): void {
  const user = socket.data.user;

  // 1. mic:request -> MicOwnershipService.requestMic
  socket.on(
    SOCKET_EVENTS.CLIENT.MIC_REQUEST,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<MicOwnershipSnapshotDto>) => void
    ) => {
      const parsed = MicRequestPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid mic request payload',
          },
        });
        return;
      }

      const { roomId, correlationId } = parsed.data;
      if (!ensureJoinedSocketChannel(socket, roomId, ack, correlationId)) {
        return;
      }

      if (!micRequestLimiter.tryConsume(user.id)) {
        logger.warn({ roomId, userId: user.id }, 'Mic request rejected: rate limit exceeded');
        ack?.({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many mic requests. Please wait a moment.',
            correlationId,
          },
          correlationId,
        });
        return;
      }

      try {
        const result = await micOwnershipService.requestMic(roomId, user.id);

        if (result.changed) {
          const { emitted, snapshot } = await broadcastAuthoritativeMicSnapshot(io, roomId, {
            fallbackSnapshot: result.snapshot,
            correlationId,
          });

          if (emitted && snapshot) {
            const eventPayload: MicRequestCreatedPayload = {
              roomId,
              request: result.request,
              state: snapshot.state,
              pendingRequests: snapshot.pendingRequests,
              ownershipVersion: snapshot.ownershipVersion,
              occurredAt: new Date().toISOString(),
              correlationId,
            };
            io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED, eventPayload);
          }

          ack?.({
            success: true,
            data: snapshot ?? result.snapshot,
            correlationId,
          });
        } else {
          // Idempotent no-op: do not broadcast fabricated transition or bump version
          ack?.({
            success: true,
            data: result.snapshot,
            correlationId,
          });
        }
      } catch (err: unknown) {
        logger.warn({ err, roomId, userId: user.id }, 'mic:request rejected');
        sendMicAckError(ack, err, 'MIC_REQUEST_FAILED', 'Failed to request mic', correlationId);
      }
    }
  );

  // 2. mic:cancel -> MicOwnershipService.cancelRequest (not rate-limited)
  socket.on(
    SOCKET_EVENTS.CLIENT.MIC_CANCEL,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<MicOwnershipSnapshotDto>) => void
    ) => {
      const parsed = MicCancelPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid mic cancel payload',
          },
        });
        return;
      }

      const { roomId, requestId, expectedOwnershipVersion, correlationId } = parsed.data;
      if (!ensureJoinedSocketChannel(socket, roomId, ack, correlationId)) {
        return;
      }

      try {
        const result = await micOwnershipService.cancelRequest(roomId, user.id, {
          requestId,
          expectedOwnershipVersion,
        });

        const { emitted, snapshot } = await broadcastAuthoritativeMicSnapshot(io, roomId, {
          fallbackSnapshot: result.snapshot,
          correlationId,
        });

        if (emitted && snapshot) {
          const eventPayload: MicRequestCancelledPayload = {
            roomId,
            userId: result.removedRequest.userId,
            requestId: result.removedRequest.requestId,
            reason: 'cancelled',
            actorUserId: user.id,
            state: snapshot.state,
            pendingRequests: snapshot.pendingRequests,
            ownershipVersion: snapshot.ownershipVersion,
            occurredAt: new Date().toISOString(),
            correlationId,
          };
          io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED, eventPayload);
        }

        ack?.({
          success: true,
          data: snapshot ?? result.snapshot,
          correlationId,
        });
      } catch (err: unknown) {
        logger.warn({ err, roomId, userId: user.id }, 'mic:cancel rejected');
        sendMicAckError(ack, err, 'MIC_CANCEL_FAILED', 'Failed to cancel mic request', correlationId);
      }
    }
  );

  // 3. mic:approve -> MicOwnershipService.approveRequest
  socket.on(
    SOCKET_EVENTS.CLIENT.MIC_APPROVE,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<MicOwnershipSnapshotDto>) => void
    ) => {
      const parsed = MicApprovePayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid mic approve payload',
          },
        });
        return;
      }

      const { roomId, targetUserId, requestId, expectedOwnershipVersion, correlationId } =
        parsed.data;
      if (!ensureJoinedSocketChannel(socket, roomId, ack, correlationId)) {
        return;
      }

      try {
        const result = await micOwnershipService.approveRequest(roomId, user.id, targetUserId, {
          requestId,
          expectedOwnershipVersion,
        });

        const { emitted, snapshot } = await broadcastAuthoritativeMicSnapshot(io, roomId, {
          fallbackSnapshot: result.snapshot,
          correlationId,
        });

        if (emitted && snapshot) {
          const eventPayload: MicOwnershipChangedPayload = {
            roomId,
            previousSingerId: result.previousSingerId,
            previousSingerSessionId: result.previousSingerSessionId,
            currentSinger: snapshot.currentSinger,
            currentSingerId: snapshot.currentSingerId,
            currentSingerSessionId: snapshot.currentSingerSessionId,
            pendingRequests: snapshot.pendingRequests,
            state: snapshot.state,
            reason: 'approved',
            actorUserId: user.id,
            ownershipVersion: snapshot.ownershipVersion,
            grantedAt: snapshot.grantedAt,
            occurredAt: new Date().toISOString(),
            correlationId,
          };
          io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED, eventPayload);
        }

        ack?.({
          success: true,
          data: snapshot ?? result.snapshot,
          correlationId,
        });
      } catch (err: unknown) {
        logger.warn({ err, roomId, userId: user.id, targetUserId }, 'mic:approve rejected');
        sendMicAckError(ack, err, 'MIC_APPROVE_FAILED', 'Failed to approve mic request', correlationId);
      }
    }
  );

  // 4. mic:reject -> MicOwnershipService.rejectRequest
  socket.on(
    SOCKET_EVENTS.CLIENT.MIC_REJECT,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<MicOwnershipSnapshotDto>) => void
    ) => {
      const parsed = MicRejectPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid mic reject payload',
          },
        });
        return;
      }

      const {
        roomId,
        targetUserId,
        requestId,
        reason,
        expectedOwnershipVersion,
        correlationId,
      } = parsed.data;
      if (!ensureJoinedSocketChannel(socket, roomId, ack, correlationId)) {
        return;
      }

      try {
        const result = await micOwnershipService.rejectRequest(roomId, user.id, targetUserId, {
          requestId,
          reason,
          expectedOwnershipVersion,
        });

        const { emitted, snapshot } = await broadcastAuthoritativeMicSnapshot(io, roomId, {
          fallbackSnapshot: result.snapshot,
          correlationId,
        });

        if (emitted && snapshot) {
          const eventPayload: MicRequestCancelledPayload = {
            roomId,
            userId: result.rejectedRequest.userId,
            requestId: result.rejectedRequest.requestId,
            reason: 'rejected',
            actorUserId: user.id,
            rejectionReason: result.reason,
            state: snapshot.state,
            pendingRequests: snapshot.pendingRequests,
            ownershipVersion: snapshot.ownershipVersion,
            occurredAt: new Date().toISOString(),
            correlationId,
          };
          io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED, eventPayload);
        }

        ack?.({
          success: true,
          data: snapshot ?? result.snapshot,
          correlationId,
        });
      } catch (err: unknown) {
        logger.warn({ err, roomId, userId: user.id, targetUserId }, 'mic:reject rejected');
        sendMicAckError(ack, err, 'MIC_REJECT_FAILED', 'Failed to reject mic request', correlationId);
      }
    }
  );

  // 5. mic:release -> MicOwnershipService.releaseMic (not rate-limited)
  socket.on(
    SOCKET_EVENTS.CLIENT.MIC_RELEASE,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<MicOwnershipSnapshotDto>) => void
    ) => {
      const parsed = MicReleasePayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid mic release payload',
          },
        });
        return;
      }

      const { roomId, expectedOwnershipVersion, expectedSessionId, correlationId } = parsed.data;
      if (!ensureJoinedSocketChannel(socket, roomId, ack, correlationId)) {
        return;
      }

      try {
        const result = await micOwnershipService.releaseMic(roomId, user.id, {
          expectedOwnershipVersion,
          expectedSessionId,
        });

        const { emitted, snapshot } = await broadcastAuthoritativeMicSnapshot(io, roomId, {
          fallbackSnapshot: result.snapshot,
          correlationId,
        });

        if (emitted && snapshot) {
          const eventPayload: MicOwnershipChangedPayload = {
            roomId,
            previousSingerId: result.previousSingerId,
            previousSingerSessionId: result.previousSingerSessionId,
            currentSinger: snapshot.currentSinger,
            currentSingerId: snapshot.currentSingerId,
            currentSingerSessionId: snapshot.currentSingerSessionId,
            pendingRequests: snapshot.pendingRequests,
            state: snapshot.state,
            reason: result.reason,
            actorUserId: user.id,
            ownershipVersion: snapshot.ownershipVersion,
            grantedAt: snapshot.grantedAt,
            occurredAt: new Date().toISOString(),
            correlationId,
          };
          io.to(getRoomChannel(roomId)).emit(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED, eventPayload);
        }

        ack?.({
          success: true,
          data: snapshot ?? result.snapshot,
          correlationId,
        });
      } catch (err: unknown) {
        logger.warn({ err, roomId, userId: user.id }, 'mic:release rejected');
        sendMicAckError(ack, err, 'MIC_RELEASE_FAILED', 'Failed to release mic', correlationId);
      }
    }
  );

  // 6. mic:state:request -> MicOwnershipService.getSnapshot
  socket.on(
    SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<MicOwnershipSnapshotDto>) => void
    ) => {
      const parsed = MicStateRequestPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid mic state request payload',
          },
        });
        return;
      }

      const { roomId, correlationId } = parsed.data;
      if (!Types.ObjectId.isValid(roomId)) {
        ack?.({
          success: false,
          error: { code: 'INVALID_ROOM_ID', message: 'Invalid room ID format', correlationId },
          correlationId,
        });
        return;
      }

      try {
        const snapshot = await micOwnershipService.getSnapshot(roomId, user.id);

        socket.emit(SOCKET_EVENTS.SERVER.MIC_STATE, {
          ...snapshot,
          ...(correlationId ? { correlationId } : {}),
        });

        ack?.({
          success: true,
          data: snapshot,
          correlationId,
        });
      } catch (err: unknown) {
        logger.warn({ err, roomId, userId: user.id }, 'mic:state:request rejected');
        sendMicAckError(
          ack,
          err,
          'MIC_STATE_REQUEST_FAILED',
          'Failed to retrieve mic state',
          correlationId
        );
      }
    }
  );
}
