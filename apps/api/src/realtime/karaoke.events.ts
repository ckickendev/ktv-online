import { Server, Socket } from 'socket.io';
import {
  AddQueueItemDtoSchema,
  KaraokePlaybackUpdatedPayload,
  KaraokeQueueUpdatedPayload,
  KaraokeStateRequestPayloadSchema,
  PlaybackCommandDtoSchema,
  PlaybackCommandType,
  PlaybackStateDto,
  ReorderQueueDtoSchema,
  RoomQueueSnapshotDto,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { karaokeService } from '../modules/karaoke/karaoke.service.js';
import { UnsupportedTopologyError } from '../database/transaction.js';
import { getRoomChannel } from './room.events.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedSocketData } from './socket.auth.js';

/**
 * Broadcasts an authoritative queue update to all room participants.
 */
export function broadcastKaraokeQueueUpdated(
  io: Server,
  roomId: string,
  queue: RoomQueueSnapshotDto,
  action: 'added' | 'removed' | 'reordered' | 'status_changed' | 'cleared' = 'status_changed',
  affectedItemId?: string
): void {
  const channel = getRoomChannel(roomId);
  const payload: KaraokeQueueUpdatedPayload = {
    roomId,
    queue,
    action,
    affectedItemId,
    occurredAt: new Date().toISOString(),
  };

  io.to(channel).emit(SOCKET_EVENTS.SERVER.KARAOKE_QUEUE_UPDATED, payload);
}

/**
 * Broadcasts an authoritative playback update to all room participants.
 */
export function broadcastKaraokePlaybackUpdated(
  io: Server,
  roomId: string,
  playback: PlaybackStateDto,
  command?: PlaybackCommandType,
  initiatedByUserId?: string
): void {
  const channel = getRoomChannel(roomId);
  const payload: KaraokePlaybackUpdatedPayload = {
    roomId,
    playback,
    command,
    initiatedByUserId,
    occurredAt: new Date().toISOString(),
  };

  io.to(channel).emit(SOCKET_EVENTS.SERVER.KARAOKE_PLAYBACK_UPDATED, payload);
}

/**
 * Registers realtime karaoke command handlers for an authenticated socket connection.
 */
export function registerKaraokeEvents(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>
): void {
  const user = socket.data.user;

  // 1. Add Song to Queue
  socket.on(
    SOCKET_EVENTS.CLIENT.KARAOKE_QUEUE_ADD,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto }>) => void
    ) => {
      try {
        const payload = rawPayload as { roomId?: string; songId?: string; correlationId?: string };
        if (!payload || typeof payload.roomId !== 'string') {
          ack?.({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: 'Room ID is required' },
          });
          return;
        }

        const parsed = AddQueueItemDtoSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({
            success: false,
            error: {
              code: 'INVALID_PAYLOAD',
              message: parsed.error.issues[0]?.message || 'Invalid add queue payload',
            },
            correlationId: payload.correlationId,
          });
          return;
        }

        const result = await karaokeService.addToQueue(payload.roomId, user.id, parsed.data);

        // Broadcast to channel
        broadcastKaraokeQueueUpdated(io, payload.roomId, result.queue, 'added', result.addedItem.id);
        broadcastKaraokePlaybackUpdated(io, payload.roomId, result.playback);

        ack?.({
          success: true,
          data: result,
          correlationId: payload.correlationId,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'FAILED_TO_ADD_TO_QUEUE';
        logger.warn({ err, userId: user.id }, 'Karaoke queue add rejected');

        socket.emit(SOCKET_EVENTS.SERVER.KARAOKE_ERROR, {
          code: message,
          message: 'Unable to add song to queue',
        });

        ack?.({
          success: false,
          error: { code: message, message: 'Failed to add song to queue' },
        });
      }
    }
  );

  // 2. Remove Song from Queue
  socket.on(
    SOCKET_EVENTS.CLIENT.KARAOKE_QUEUE_REMOVE,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto }>) => void
    ) => {
      try {
        const payload = rawPayload as { roomId?: string; itemId?: string; correlationId?: string };
        if (!payload || typeof payload.roomId !== 'string' || typeof payload.itemId !== 'string') {
          ack?.({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: 'Room ID and Item ID are required' },
          });
          return;
        }

        const result = await karaokeService.removeFromQueue(payload.roomId, user.id, payload.itemId);

        // Broadcast to channel
        broadcastKaraokeQueueUpdated(io, payload.roomId, result.queue, 'removed', payload.itemId);
        broadcastKaraokePlaybackUpdated(io, payload.roomId, result.playback);

        ack?.({
          success: true,
          data: result,
          correlationId: payload.correlationId,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'FAILED_TO_REMOVE_FROM_QUEUE';
        logger.warn({ err, userId: user.id }, 'Karaoke queue remove rejected');

        socket.emit(SOCKET_EVENTS.SERVER.KARAOKE_ERROR, {
          code: message,
          message: 'Unable to remove song from queue',
        });

        ack?.({
          success: false,
          error: { code: message, message: 'Failed to remove song from queue' },
        });
      }
    }
  );

  // 3. Reorder Queue
  socket.on(
    SOCKET_EVENTS.CLIENT.KARAOKE_QUEUE_REORDER,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<RoomQueueSnapshotDto>) => void
    ) => {
      try {
        const payload = rawPayload as {
          roomId?: string;
          itemIds?: string[];
          expectedQueueVersion?: number;
          correlationId?: string;
        };
        if (!payload || typeof payload.roomId !== 'string') {
          ack?.({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: 'Room ID is required' },
          });
          return;
        }

        const parsed = ReorderQueueDtoSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({
            success: false,
            error: {
              code: 'INVALID_PAYLOAD',
              message: parsed.error.issues[0]?.message || 'Invalid reorder payload',
            },
            correlationId: payload.correlationId,
          });
          return;
        }

        const updatedQueue = await karaokeService.reorderQueue(payload.roomId, user.id, parsed.data);

        // Broadcast to channel
        broadcastKaraokeQueueUpdated(io, payload.roomId, updatedQueue, 'reordered');

        ack?.({
          success: true,
          data: updatedQueue,
          correlationId: payload.correlationId,
        });
      } catch (err: unknown) {
        let message = err instanceof Error ? err.message : 'FAILED_TO_REORDER_QUEUE';
        let userMessage = 'Unable to reorder queue';
        if (err instanceof UnsupportedTopologyError || message.includes('UNSUPPORTED_TOPOLOGY')) {
          message = 'UNSUPPORTED_TOPOLOGY_FOR_REORDER';
          userMessage = 'Queue reordering requires MongoDB replica set transactions and is disabled in standalone mode.';
        }
        logger.warn({ err, userId: user.id }, 'Karaoke queue reorder rejected');

        socket.emit(SOCKET_EVENTS.SERVER.KARAOKE_ERROR, {
          code: message,
          message: userMessage,
        });

        ack?.({
          success: false,
          error: { code: message, message: userMessage },
        });
      }
    }
  );

  // 4. Playback Command (play, pause, seek, skip, stop)
  socket.on(
    SOCKET_EVENTS.CLIENT.KARAOKE_PLAYBACK_COMMAND,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<{ playback: PlaybackStateDto; queue: RoomQueueSnapshotDto }>) => void
    ) => {
      try {
        const payload = rawPayload as {
          roomId?: string;
          command?: PlaybackCommandType;
          positionMs?: number;
          expectedPlaybackVersion?: number;
          correlationId?: string;
        };
        if (!payload || typeof payload.roomId !== 'string') {
          ack?.({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: 'Room ID is required' },
          });
          return;
        }

        const parsed = PlaybackCommandDtoSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({
            success: false,
            error: {
              code: 'INVALID_PAYLOAD',
              message: parsed.error.issues[0]?.message || 'Invalid playback command payload',
            },
            correlationId: payload.correlationId,
          });
          return;
        }

        const result = await karaokeService.executePlaybackCommand(
          payload.roomId,
          user.id,
          parsed.data
        );

        // Broadcast to channel
        broadcastKaraokePlaybackUpdated(
          io,
          payload.roomId,
          result.playback,
          parsed.data.command,
          user.id
        );
        broadcastKaraokeQueueUpdated(io, payload.roomId, result.queue, 'status_changed');

        ack?.({
          success: true,
          data: result,
          correlationId: payload.correlationId,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'FAILED_TO_EXECUTE_PLAYBACK_COMMAND';
        logger.warn({ err, userId: user.id }, 'Karaoke playback command rejected');

        socket.emit(SOCKET_EVENTS.SERVER.KARAOKE_ERROR, {
          code: message,
          message: 'Unable to execute playback command',
        });

        ack?.({
          success: false,
          error: { code: message, message: 'Failed to execute playback command' },
        });
      }
    }
  );

  // 5. State Request (Reconciliation / Initial snapshot fetch)
  socket.on(
    SOCKET_EVENTS.CLIENT.KARAOKE_STATE_REQUEST,
    async (
      rawPayload: unknown,
      ack?: (res: SocketAckResponse<any>) => void
    ) => {
      try {
        const parsed = KaraokeStateRequestPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) {
          ack?.({
            success: false,
            error: {
              code: 'INVALID_PAYLOAD',
              message: parsed.error.issues[0]?.message || 'Invalid state request payload',
            },
          });
          return;
        }

        const snapshot = await karaokeService.getKaraokeSnapshot(parsed.data.roomId);

        // Send directly to the requesting socket
        socket.emit(SOCKET_EVENTS.SERVER.KARAOKE_SNAPSHOT, snapshot);

        ack?.({
          success: true,
          data: snapshot,
          correlationId: parsed.data.correlationId,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'FAILED_TO_GET_KARAOKE_SNAPSHOT';
        ack?.({
          success: false,
          error: { code: message, message: 'Failed to get karaoke snapshot' },
        });
      }
    }
  );
}
