import { Request, Response, NextFunction } from 'express';
import { chatService } from './chat.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import { getRoomChannel } from '../../realtime/room.events.js';
import { SOCKET_EVENTS } from '@ktv/contracts';

export class ChatController {
  async getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const { limit, before } = req.query;
      const userId = req.user?.id;

      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const result = await chatService.getMessages(
        roomId,
        userId,
        limit ? Number(limit) : 50,
        before as string | undefined
      );

      sendSuccess(res, result);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'ROOM_NOT_FOUND') {
          sendError(res, 'Room not found', 404);
          return;
        }
        if (error.message === 'FORBIDDEN_PRIVATE_ROOM') {
          sendError(res, 'Access denied to private room messages', 403);
          return;
        }
        if (error.message === 'UNAUTHORIZED') {
          sendError(res, 'Authentication required to view messages in private room', 401);
          return;
        }
      }
      next(error);
    }
  }

  async deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const messageId = req.params.messageId as string;
      const userId = req.user?.id;

      if (!roomId || !messageId) {
        sendError(res, 'Room ID and Message ID are required', 400);
        return;
      }

      if (!userId) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const result = await chatService.deleteMessage(roomId, messageId, userId);

      // Broadcast deletion event to room channel
      const io = getSocketServer();
      if (io) {
        const channel = getRoomChannel(roomId);
        io.to(channel).emit(SOCKET_EVENTS.SERVER.CHAT_MESSAGE_DELETED, {
          roomId,
          messageId,
          deletedBy: userId,
        });
      }

      sendSuccess(res, result, 'Message deleted by host');
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'ROOM_NOT_FOUND' || error.message === 'MESSAGE_NOT_FOUND') {
          sendError(res, 'Message or room not found', 404);
          return;
        }
        if (error.message === 'FORBIDDEN_NOT_HOST') {
          sendError(res, 'Only the room host can delete messages', 403);
          return;
        }
      }
      next(error);
    }
  }

  async getActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId as string;
      const { limit } = req.query;
      const userId = req.user?.id;

      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const activities = await chatService.getActivities(
        roomId,
        userId,
        limit ? Number(limit) : 50
      );

      sendSuccess(res, activities);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'ROOM_NOT_FOUND') {
          sendError(res, 'Room not found', 404);
          return;
        }
        if (error.message === 'FORBIDDEN_PRIVATE_ROOM') {
          sendError(res, 'Access denied to private room activities', 403);
          return;
        }
        if (error.message === 'UNAUTHORIZED') {
          sendError(res, 'Authentication required to view activities in private room', 401);
          return;
        }
      }
      next(error);
    }
  }
}

export const chatController = new ChatController();
