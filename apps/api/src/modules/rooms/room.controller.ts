import { Request, Response, NextFunction } from 'express';
import { roomService } from './room.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { CreateRoomDto, RoomQueryDto } from '@ktv/contracts';

export class RoomController {
  async getRooms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as RoomQueryDto;
      const { items, total } = await roomService.findRooms(query);

      const page = query.page || 1;
      const limit = query.limit || 20;
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
        if (result.error === 'NOT_A_MEMBER') {
          sendError(res, 'You are not an active member of this room', 400);
          return;
        }
        sendError(res, 'Room not found', 404);
        return;
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

      const members = await roomService.getActiveMembers(roomId);
      sendSuccess(
        res,
        members.map((m) => m.toJSON()),
        'Room active members retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const roomController = new RoomController();
