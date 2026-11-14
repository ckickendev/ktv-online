import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import {
  JoinRoomPayloadSchema,
  LeaveRoomPayloadSchema,
  PresenceRequestPayloadSchema,
  RoomStateRequestPayloadSchema,
  RoomStateSnapshotDto,
  SOCKET_EVENTS,
  SocketAckResponse,
  PresenceMemberDto,
} from '@ktv/contracts';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { roomService } from '../modules/rooms/room.service.js';
import { presenceManager } from './presence.manager.js';
import { broadcastUserPresenceToFriends } from './friend.events.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedSocketData } from './socket.auth.js';

export function getRoomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function registerRoomEvents(io: Server, socket: Socket<any, any, any, AuthenticatedSocketData>): void {
  const user = socket.data.user;

  // 1. Client joins room presence channel
  socket.on(
    SOCKET_EVENTS.CLIENT.ROOM_JOIN,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = JoinRoomPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid join payload',
          },
        });
        return;
      }

      const { roomId, correlationId } = parsed.data;

      if (!Types.ObjectId.isValid(roomId)) {
        ack?.({
          success: false,
          error: { code: 'INVALID_ROOM_ID', message: 'Invalid room ID format' },
          correlationId,
        });
        return;
      }

      try {
        const roomObjectId = new Types.ObjectId(roomId);
        const room = await RoomModel.findById(roomObjectId).select('status visibility ownerId').exec();

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

        // Reconnection and authorization check: verify user was not kicked from this room
        const isOwner = room.ownerId.toString() === user.id;
        let role: 'host' | 'member' | 'viewer' = isOwner ? 'host' : 'viewer';

        if (!isOwner) {
          const wasKicked = await RoomMembershipModel.exists({
            roomId: roomObjectId,
            userId: new Types.ObjectId(user.id),
            status: 'left',
            kickedAt: { $ne: null },
          });

          if (wasKicked) {
            logger.warn(
              { roomId, userId: user.id },
              'Socket room join rejected: User was kicked from this room'
            );
            ack?.({
              success: false,
              error: {
                code: 'FORBIDDEN_KICKED',
                message: 'You have been removed from this room by the host',
              },
              correlationId,
            });
            return;
          }
        }

        if (room.visibility === 'private') {
          if (!isOwner) {
            const isMember = await RoomMembershipModel.exists({
              roomId: roomObjectId,
              userId: new Types.ObjectId(user.id),
              status: 'active',
            });

            if (!isMember) {
              logger.warn(
                { roomId, userId: user.id },
                'Socket room subscription rejected: Unauthorized private room access'
              );
              ack?.({
                success: false,
                error: {
                  code: 'FORBIDDEN_PRIVATE_ROOM',
                  message: 'You are not authorized to subscribe to this private room',
                },
                correlationId,
              });
              return;
            }
            role = 'member';
          }
        } else {
          // Public room: check if user is host or member or viewer
          if (!isOwner) {
            const isMember = await RoomMembershipModel.exists({
              roomId: roomObjectId,
              userId: new Types.ObjectId(user.id),
              status: 'active',
            });
            if (isMember) {
              role = 'member';
            }
          }
        }

        const channel = getRoomChannel(roomId);
        await socket.join(channel);

        // Update presence
        const { isFirstConnection, totalOnline, memberDto } = presenceManager.addSocket(
          roomId,
          user.id,
          user.username,
          socket.id,
          role,
          user.avatar
        );

        logger.info(
          { roomId, userId: user.id, socketId: socket.id, isFirstConnection, totalOnline },
          'User joined room presence'
        );

        // If first connection for this user in this room, broadcast to all occupants
        if (isFirstConnection) {
          socket.to(channel).emit(SOCKET_EVENTS.SERVER.MEMBER_JOINED, {
            roomId,
            user: memberDto,
            totalOnline,
            correlationId,
          });

          // Proactively broadcast updated room presence to friends (DEF-PRES-01)
          broadcastUserPresenceToFriends(io, user.id).catch((err) => {
            logger.error({ err, userId: user.id }, 'Error broadcasting friend presence on room join');
          });
        }

        // Send current presence snapshot back to the joining socket
        const onlineUsers: PresenceMemberDto[] = presenceManager.getRoomPresence(roomId);
        socket.emit(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, {
          roomId,
          onlineUsers,
          totalOnline,
          correlationId,
        });

        // Send authoritative room state snapshot to the joining socket
        const snapshotResult = await roomService.getRoomStateSnapshot(roomId, user.id);
        if (snapshotResult.success) {
          socket.emit(SOCKET_EVENTS.SERVER.ROOM_STATE_SNAPSHOT, snapshotResult.snapshot);
        }

        ack?.({
          success: true,
          data: { roomId, totalOnline },
          correlationId,
        });
      } catch (err) {
        logger.error({ err, roomId, userId: user.id }, 'Error during socket room join');
        ack?.({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to join room presence' },
          correlationId,
        });
      }
    }
  );

  // 2. Client leaves room presence channel
  socket.on(
    SOCKET_EVENTS.CLIENT.ROOM_LEAVE,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = LeaveRoomPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid leave payload',
          },
        });
        return;
      }

      const { roomId, correlationId } = parsed.data;
      const channel = getRoomChannel(roomId);

      await socket.leave(channel);

      const result = presenceManager.removeSocket(socket.id);
      if (result && result.isLastDisconnection) {
        socket.to(channel).emit(SOCKET_EVENTS.SERVER.MEMBER_LEFT, {
          roomId,
          userId: user.id,
          username: user.username,
          totalOnline: result.totalOnline,
          correlationId,
        });

        // Broadcast presence transition out of room to friends (DEF-PRES-01)
        broadcastUserPresenceToFriends(io, user.id).catch((err) => {
          logger.error({ err, userId: user.id }, 'Error broadcasting friend presence on room leave');
        });
      }

      logger.info(
        { roomId, userId: user.id, socketId: socket.id },
        'User left room presence'
      );

      ack?.({
        success: true,
        correlationId,
      });
    }
  );

  // 3. Client requests an updated presence snapshot
  socket.on(
    SOCKET_EVENTS.CLIENT.PRESENCE_REQUEST,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = PresenceRequestPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: { code: 'INVALID_PAYLOAD', message: 'Invalid presence request payload' },
        });
        return;
      }

      const { roomId, correlationId } = parsed.data;
      const onlineUsers = presenceManager.getRoomPresence(roomId);

      socket.emit(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, {
        roomId,
        onlineUsers,
        totalOnline: onlineUsers.length,
        correlationId,
      });

      ack?.({
        success: true,
        correlationId,
      });
    }
  );

  // 4. Client requests a fresh authoritative room state snapshot
  socket.on(
    SOCKET_EVENTS.CLIENT.ROOM_STATE_REQUEST,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse<RoomStateSnapshotDto>) => void) => {
      const parsed = RoomStateRequestPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid room state request payload',
          },
        });
        return;
      }

      const { roomId, correlationId } = parsed.data;

      try {
        const snapshotResult = await roomService.getRoomStateSnapshot(roomId, user.id);
        if (!snapshotResult.success) {
          ack?.({
            success: false,
            error: {
              code: snapshotResult.error,
              message: 'Failed to retrieve room state snapshot',
            },
            correlationId,
          });
          return;
        }

        socket.emit(SOCKET_EVENTS.SERVER.ROOM_STATE_SNAPSHOT, snapshotResult.snapshot);
        ack?.({
          success: true,
          data: snapshotResult.snapshot,
          correlationId,
        });
      } catch (err: unknown) {
        logger.error({ err, roomId, userId: user.id }, 'Error retrieving room state snapshot');
        ack?.({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve room state snapshot' },
          correlationId,
        });
      }
    }
  );

  // 5. Socket disconnection (unexpected network drop or tab close with 10s grace period)
  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, userId: user.id, reason }, 'Socket disconnected');

    const { isPendingGrace, immediateResult } = presenceManager.handleDisconnect(
      socket.id,
      10000, // 10s disconnect grace period
      (expiredResult) => {
        const channel = getRoomChannel(expiredResult.roomId);
        io.to(channel).emit(SOCKET_EVENTS.SERVER.MEMBER_LEFT, {
          roomId: expiredResult.roomId,
          userId: expiredResult.userId,
          username: expiredResult.username,
          totalOnline: expiredResult.totalOnline,
        });

        logger.info(
          { roomId: expiredResult.roomId, userId: expiredResult.userId, remainingOnline: expiredResult.totalOnline },
          'Disconnect grace period expired: emitted member:left'
        );

        // Disconnect grace expired: update friends on departure from room (DEF-PRES-01)
        broadcastUserPresenceToFriends(io, expiredResult.userId).catch((err) => {
          logger.error({ err, userId: expiredResult.userId }, 'Error broadcasting friend presence after room grace expired');
        });
      }
    );

    if (isPendingGrace) {
      logger.info(
        { socketId: socket.id, userId: user.id },
        'Last socket disconnected for user: 10s grace period scheduled'
      );
    } else if (immediateResult && immediateResult.isLastDisconnection) {
      const channel = getRoomChannel(immediateResult.roomId);
      io.to(channel).emit(SOCKET_EVENTS.SERVER.MEMBER_LEFT, {
        roomId: immediateResult.roomId,
        userId: immediateResult.userId,
        username: immediateResult.username,
        totalOnline: immediateResult.totalOnline,
      });

      broadcastUserPresenceToFriends(io, immediateResult.userId).catch((err) => {
        logger.error({ err, userId: immediateResult.userId }, 'Error broadcasting friend presence after immediate disconnect');
      });
    }
  });
}
