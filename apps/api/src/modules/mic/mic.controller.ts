import { Request, Response, NextFunction } from 'express';
import { micOwnershipService, MicOwnershipError } from './mic-ownership.service.js';
import { sendError, sendSuccess } from '../../utils/response.js';

export class MicController {
  /**
   * GET /api/v1/rooms/:roomId/mic
   */
  public async getMicSnapshot(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const snapshot = await micOwnershipService.getSnapshot(roomId, req.user?.id);
      sendSuccess(res, snapshot, 'Mic ownership snapshot retrieved successfully');
    } catch (err: unknown) {
      if (err instanceof MicOwnershipError) {
        sendError(res, err.message, err.statusCode);
        return;
      }
      next(err);
    }
  }
}

export const micController = new MicController();
