import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { roomService } from './room.service.js';
import { roomReconciliationService } from './room-reconciliation.service.js';
import { RoomMembershipModel } from './membership.model.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';
import { broadcastRoomClosed } from '../../realtime/index.js';
import { CreateRoomDto, RoomQueryDto, UpdateRoomDto } from '@ktv/contracts';

export class RoomController {
  async getRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as RoomQueryDto;
      const { items, total } = await roomService.findRooms(query);

      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const totalPages = Math.ceil(total / limit) || 1;

      sendSuccess(
        res,
        {
          items: items.map((room) => room.toJSON()),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
        'Rooms retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async getRoomById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const room = await roomService.findById(id);
      if (!room) {
        sendError(res, 'Room not found', 404);
        return;
      }

      // Security: Private room protection - only host or active members can view
      if (room.visibility === 'private') {
        if (!req.user) {
          sendError(res, 'Authentication required to view private room', 401);
          return;
        }

        const isOwner =
          (room.ownerId as { _id?: { toString(): string } } | undefined)?._id?.toString() ===
            req.user.id || room.ownerId.toString() === req.user.id;

        if (!isOwner) {
          const isMember = await RoomMembershipModel.exists({
            roomId: room._id,
            userId: new Types.ObjectId(req.user.id),
            status: 'active',
          });

          if (!isMember) {
            sendError(
              res,
              'Access denied: You do not have permission to view this private lounge',
              403
            );
            return;
          }
        }
      }

      sendSuccess(res, room.toJSON(), 'Room retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to create a room', 401);
        return;
      }

      const data = req.body as CreateRoomDto;
      // SEC-01 Remediation: ownerId is strictly derived from verified authenticated token
      const ownerId = req.user.id;

      const room = await roomService.create(ownerId, data);
      sendSuccess(res, room.toJSON(), 'Room created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async joinRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to join a room', 401);
        return;
      }

      const { id: roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const result = await roomService.joinRoom(roomId, req.user.id);
      if (!result.success) {
        switch (result.error) {
          case 'ROOM_NOT_FOUND':
            sendError(res, 'Room not found', 404);
            return;
          case 'ROOM_CLOSED':
            sendError(res, 'Cannot join closed room', 400);
            return;
          case 'ROOM_FULL':
            sendError(res, 'Room has reached maximum capacity', 409);
            return;
          case 'PRIVATE_ROOM':
            sendError(res, 'Cannot join private room without direct invitation', 403);
            return;
          default:
            sendError(res, 'Failed to join room', 400);
            return;
        }
      }

      const message = result.alreadyJoined
        ? 'Already an active member of this room'
        : 'Joined room successfully';

      sendSuccess(res, result.membership.toJSON(), message, result.alreadyJoined ? 200 : 201);
    } catch (error) {
      next(error);
    }
  }

  async leaveRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to leave a room', 401);
        return;
      }

      const { id: roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const result = await roomService.leaveRoom(roomId, req.user.id);
      if (!result.success) {
        switch (result.error) {
          case 'NOT_A_MEMBER':
            sendError(res, 'You are not an active member of this room', 400);
            return;
          case 'HOST_CANNOT_LEAVE':
            sendError(res, 'Room host cannot leave their active lounge. Close the lounge instead.', 400);
            return;
          case 'ROOM_NOT_FOUND':
          default:
            sendError(res, 'Room not found', 404);
            return;
        }
      }

      sendSuccess(res, null, 'Left room successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const result = await roomService.getActiveMembers(roomId, req.user?.id);
      if (!result.success) {
        switch (result.error) {
          case 'ROOM_NOT_FOUND':
            sendError(res, 'Room not found', 404);
            return;
          case 'UNAUTHORIZED':
            sendError(res, 'Authentication required to view members of private room', 401);
            return;
          case 'FORBIDDEN_PRIVATE_ROOM':
            sendError(res, 'You do not have permission to view members of this private room', 403);
            return;
          default:
            sendError(res, 'Failed to retrieve room members', 400);
            return;
        }
      }

      sendSuccess(
        res,
        result.members.map((m) => m.toJSON()),
        'Room active members retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async getMyMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to view membership', 401);
        return;
      }
      const { id: roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const membership = await roomService.getMyMembership(roomId, req.user.id);
      if (!membership) {
        sendSuccess(res, { isMember: false, membership: null }, 'Not an active member of this room');
        return;
      }

      sendSuccess(
        res,
        {
          isMember: true,
          role: membership.role,
          membership: membership.toJSON(),
        },
        'User membership retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async getJoinedRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to view joined rooms', 401);
        return;
      }

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { items, total } = await roomService.findJoinedRoomsByUser(req.user.id, page, limit);

      const totalPages = Math.ceil(total / limit) || 1;

      sendSuccess(
        res,
        {
          items: items.map((room) => room.toJSON()),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
        'Joined rooms retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async getMyRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to view your rooms', 401);
        return;
      }

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const { items, total } = await roomService.findRoomsByOwner(req.user.id, page, limit);

      const totalPages = Math.ceil(total / limit);

      sendSuccess(
        res,
        {
          items: items.map((room) => room.toJSON()),
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
        'User rooms retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async updateRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to update room', 401);
        return;
      }

      const { id } = req.params;
      if (!id) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const room = await roomService.findById(id);
      if (!room) {
        sendError(res, 'Room not found', 404);
        return;
      }

      // Check ownership
      const ownerId =
        (room.ownerId as { _id?: { toString(): string } } | undefined)?._id?.toString() ??
        room.ownerId.toString();
      if (ownerId !== req.user.id) {
        sendError(res, 'Forbidden: You are not the owner of this room', 403);
        return;
      }

      const updateData = req.body as UpdateRoomDto;

      // Validate capacity: cannot be lower than current participants count
      if (
        updateData.capacity !== undefined &&
        updateData.capacity < room.currentParticipantsCount
      ) {
        sendError(
          res,
          `Capacity cannot be reduced below current participant count (${room.currentParticipantsCount})`,
          400
        );
        return;
      }

      const updatedRoom = await roomService.update(id, updateData);
      if (!updatedRoom) {
        if (updateData.capacity !== undefined) {
          const recheck = await roomService.findById(id);
          if (recheck && recheck.currentParticipantsCount > updateData.capacity) {
            sendError(
              res,
              `Capacity cannot be reduced below current participant count (${recheck.currentParticipantsCount})`,
              400
            );
            return;
          }
        }
        sendError(res, 'Room not found', 404);
        return;
      }

      sendSuccess(res, updatedRoom.toJSON(), 'Room updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async closeRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to close room', 401);
        return;
      }

      const { id } = req.params;
      if (!id) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const room = await roomService.findById(id);
      if (!room) {
        sendError(res, 'Room not found', 404);
        return;
      }

      // Check ownership
      const ownerId =
        (room.ownerId as { _id?: { toString(): string } } | undefined)?._id?.toString() ??
        room.ownerId.toString();
      if (ownerId !== req.user.id) {
        sendError(res, 'Forbidden: You are not the owner of this room', 403);
        return;
      }

      if (room.status === 'closed') {
        sendSuccess(res, room.toJSON(), 'Room is already closed', 200);
        return;
      }

      const closedRoom = await roomService.closeRoom(id);
      if (!closedRoom) {
        sendError(res, 'Room not found', 404);
        return;
      }

      // Broadcast room closure event to all connected realtime sockets
      await broadcastRoomClosed(id, 'Room has been closed by host');

      sendSuccess(res, closedRoom.toJSON(), 'Room closed successfully');
    } catch (error) {
      next(error);
    }
  }

  async reconcileRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dryRun = req.query.dryRun === 'true';
      const roomId = req.query.roomId as string | undefined;

      logger.info(
        { adminId: req.user?.id, roomId: roomId || 'ALL', dryRun },
        '🛡️ Administrative room reconciliation initiated'
      );

      if (roomId) {
        const result = await roomReconciliationService.reconcileRoom(roomId, dryRun);
        if (!result) {
          sendError(res, 'Room not found', 404);
          return;
        }
        sendSuccess(
          res,
          result,
          dryRun ? 'Dry-run room reconciliation completed' : 'Room reconciled successfully'
        );
        return;
      }

      const summary = await roomReconciliationService.reconcileAllRooms(dryRun);
      sendSuccess(
        res,
        summary,
        dryRun ? 'Dry-run reconciliation completed' : 'All rooms reconciled successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const roomController = new RoomController();
