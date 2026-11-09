import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import {
  JoinRoomPayloadSchema,
  LeaveRoomPayloadSchema,
  PresenceRequestPayloadSchema,
  SOCKET_EVENTS,
  SocketAckResponse,
  PresenceMemberDto,
} from '@ktv/contracts';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { presenceManager } from './presence.manager.js';
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

        // Private room authorization check:
        // Only room owner or active members may subscribe
        const isOwner = room.ownerId.toString() === user.id;
        let role: 'host' | 'member' | 'viewer' = isOwner ? 'host' : 'viewer';

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
        }

        // Send current presence snapshot back to the joining socket
        const onlineUsers: PresenceMemberDto[] = presenceManager.getRoomPresence(roomId);
        socket.emit(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, {
          roomId,
          onlineUsers,
          totalOnline,
          correlationId,
        });

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

  // 4. Socket disconnection
  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, userId: user.id, reason }, 'Socket disconnected');
    const result = presenceManager.removeSocket(socket.id);

    if (result && result.isLastDisconnection) {
      const channel = getRoomChannel(result.roomId);
      io.to(channel).emit(SOCKET_EVENTS.SERVER.MEMBER_LEFT, {
        roomId: result.roomId,
        userId: result.userId,
        username: result.username,
        totalOnline: result.totalOnline,
      });

      logger.info(
        { roomId: result.roomId, userId: result.userId, remainingOnline: result.totalOnline },
        'Last socket disconnected for user: emitted member:left'
      );
    }
  });
}
