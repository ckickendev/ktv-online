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
      const data = req.body as CreateRoomDto;
      // In sprint 0 foundation, assume ownerId or default placeholder if not authenticated yet
      const ownerId = (req.headers['x-user-id'] as string) || '60d0fe4f5311236168a109ca';

      const room = await roomService.create(ownerId, data);
      sendSuccess(res, room.toJSON(), 'Room created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
}

export const roomController = new RoomController();
