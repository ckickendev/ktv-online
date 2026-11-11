import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { Server, Socket } from 'socket.io';
import {
  SendGiftPayloadSchema,
  GiftNewPayload,
  getGiftDefinition,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { karaokeService } from '../modules/karaoke/karaoke.service.js';
import { getRoomChannel } from './room.events.js';
import { giftLimiter } from './gift.limiter.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedSocketData } from './socket.auth.js';

export function registerGiftEvents(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>
): void {
  const user = socket.data.user;

  socket.on(
    SOCKET_EVENTS.CLIENT.GIFT_SEND,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = SendGiftPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid gift payload',
          },
        });
        return;
      }

      const { roomId, giftId, clientGiftId, recipientUserId, correlationId } = parsed.data;

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
        // 2. Validate Gift against Catalog
        const giftDef = getGiftDefinition(giftId);
        if (!giftDef) {
          ack?.({
            success: false,
            error: { code: 'INVALID_GIFT_ID', message: 'Selected gift does not exist in catalog' },
            correlationId,
          });
          return;
        }

        // 3. Room Existence and State Check
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

        // 4. Authorization: Sender must be room owner or active member (not kicked)
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
                message: 'You must be an active member of this room to send gifts',
              },
              correlationId,
            });
            return;
          }
        }

        // 5. Authoritative Performer Resolution
        const playback = await karaokeService.getPlaybackSnapshot(roomId);
        if (
          !playback.currentItem ||
          (playback.status !== 'playing' && playback.status !== 'paused')
        ) {
          ack?.({
            success: false,
            error: {
              code: 'NO_ACTIVE_PERFORMER',
              message: 'Gifts can only be sent while a performance is active on stage',
            },
            correlationId,
          });
          return;
        }

        const performer =
          playback.currentItem.singer || playback.currentItem.requestedBy;
        if (!performer || !performer.id) {
          ack?.({
            success: false,
            error: {
              code: 'NO_ACTIVE_PERFORMER',
              message: 'No active performer found on stage',
            },
            correlationId,
          });
          return;
        }

        // Disallow self-gifting
        if (user.id === performer.id) {
          ack?.({
            success: false,
            error: {
              code: 'CANNOT_GIFT_SELF',
              message: 'You cannot send a gift to yourself while performing!',
            },
            correlationId,
          });
          return;
        }

        // Guard against stale recipient if client specified an intended performer
        if (recipientUserId && recipientUserId !== performer.id) {
          ack?.({
            success: false,
            error: {
              code: 'PERFORMER_CHANGED',
              message: 'The performer changed before your gift could be delivered',
            },
            correlationId,
          });
          return;
        }

        // 6. Idempotency Check (prevent accidental duplicates from retries)
        if (clientGiftId) {
          const isFresh = giftLimiter.checkAndMarkIdempotent(clientGiftId);
          if (!isFresh) {
            logger.info(
              { roomId, userId: user.id, clientGiftId },
              'Idempotent gift submission duplicate dropped'
            );
            ack?.({
              success: true,
              data: { duplicate: true },
              correlationId,
            });
            return;
          }
        }

        // 7. Rate Limiting Check (Token Bucket: max 3 gifts burst / 1 every 1.5s)
        const allowed = giftLimiter.tryConsume(user.id);
        if (!allowed) {
          logger.warn(
            { roomId, userId: user.id },
            'Gift request dropped: User rate limit exceeded'
          );
          ack?.({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'You are sending gifts too quickly. Please wait a moment.',
            },
            correlationId,
          });
          return;
        }

        // 8. Construct Ephemeral Gift Event Payload
        const broadcastPayload: GiftNewPayload = {
          id: `gift_${randomUUID()}`,
          roomId,
          giftId,
          sender: {
            id: user.id,
            username: user.username,
            displayName: user.username,
            avatar: user.avatar,
          },
          recipient: {
            id: performer.id,
            username: performer.username,
            displayName: performer.displayName || performer.username,
            avatar: performer.avatar,
          },
          songTitle: playback.currentItem.song?.title,
          timestamp: new Date().toISOString(),
          clientGiftId,
          correlationId,
        };

        // 9. Broadcast to All Room Members via Socket.IO (Zero MongoDB Writes)
        const channel = getRoomChannel(roomId);
        io.to(channel).emit(SOCKET_EVENTS.SERVER.GIFT_NEW, broadcastPayload);

        logger.info(
          {
            roomId,
            giftId,
            senderId: user.id,
            recipientId: performer.id,
            giftEventId: broadcastPayload.id,
          },
          '🎁 Virtual gift broadcast to room'
        );

        // Acknowledge receipt to the sender
        ack?.({
          success: true,
          data: { id: broadcastPayload.id },
          correlationId,
        });
      } catch (err) {
        logger.error({ err, roomId, userId: user.id }, 'Error processing virtual gift');
        ack?.({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process virtual gift',
          },
          correlationId,
        });
      }
    }
  );
}
