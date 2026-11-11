import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { Server, Socket } from 'socket.io';
import {
  SendStageReactionPayloadSchema,
  StageReactionNewPayload,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { getRoomChannel } from './room.events.js';
import { stageReactionLimiter } from './stage-reaction.limiter.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedSocketData } from './socket.auth.js';

export function registerStageReactionEvents(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>
): void {
  const user = socket.data.user;

  socket.on(
    SOCKET_EVENTS.CLIENT.STAGE_REACTION_SEND,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = SendStageReactionPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid stage reaction payload',
          },
        });
        return;
      }

      const { roomId, emoji, clientReactionId, correlationId } = parsed.data;

      // 1. Validate Room ID format
      if (!Types.ObjectId.isValid(roomId)) {
        ack?.({
          success: false,
          error: { code: 'INVALID_ROOM_ID', message: 'Invalid room ID format' },
          correlationId,
        });
        return;
      }

      const roomObjectId = new Types.ObjectId(roomId);

      try {
        // 2. Authorization check: Room must exist and be active
        const room = await RoomModel.findById(roomObjectId).select('status ownerId').exec();
        if (!room) {
          ack?.({
            success: false,
            error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' },
            correlationId,
          });
          return;
        }

        if (room.status === 'closed') {
          ack?.({
            success: false,
            error: { code: 'ROOM_CLOSED', message: 'Room is closed' },
            correlationId,
          });
          return;
        }

        // 3. User Authorization: Must be room owner or active member (not kicked)
        const isOwner = room.ownerId.toString() === user.id;
        if (!isOwner) {
          const isMember = await RoomMembershipModel.exists({
            roomId: roomObjectId,
            userId: new Types.ObjectId(user.id),
            status: 'active',
            kickedAt: null,
          });

          if (!isMember) {
            ack?.({
              success: false,
              error: {
                code: 'FORBIDDEN_NOT_MEMBER',
                message: 'You must be an active member of this room to cheer',
              },
              correlationId,
            });
            return;
          }
        }

        // 4. Rate Limiting Check (Token Bucket: max 5 cheers / 3 seconds per user)
        const allowed = stageReactionLimiter.tryConsume(user.id);
        if (!allowed) {
          logger.warn(
            { roomId, userId: user.id },
            'Stage reaction dropped: User rate limit exceeded'
          );
          ack?.({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many cheers. Slow down!',
            },
            correlationId,
          });
          return;
        }

        // 5. Build Ephemeral Stage Reaction Broadcast Payload
        const broadcastPayload: StageReactionNewPayload = {
          id: `sr_${randomUUID()}`,
          roomId,
          emoji,
          sender: {
            id: user.id,
            username: user.username,
            displayName: user.displayName || user.username,
            avatar: user.avatar,
          },
          timestamp: new Date().toISOString(),
          clientReactionId,
          correlationId,
        };

        // 6. Broadcast to all participants in the room channel (Zero DB persistence)
        const channel = getRoomChannel(roomId);
        io.to(channel).emit(SOCKET_EVENTS.SERVER.STAGE_REACTION_NEW, broadcastPayload);

        // Acknowledge receipt to the sender
        ack?.({
          success: true,
          data: { id: broadcastPayload.id },
          correlationId,
        });
      } catch (err) {
        logger.error({ err, roomId, userId: user.id }, 'Error processing stage reaction');
        ack?.({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process stage reaction',
          },
          correlationId,
        });
      }
    }
  );
}
