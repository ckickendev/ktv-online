import { Request, Response, NextFunction } from 'express';
import { HistoryQuerySchema } from '@ktv/contracts';
import { karaokeHistoryService } from './history.service.js';
import { userService } from '../users/user.service.js';
import { sendError } from '../../utils/response.js';

export class KaraokeHistoryController {
  /**
   * GET /api/v1/history/my-songs
   */
  public async getMySongs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const parsed = HistoryQuerySchema.safeParse(req.query);
      const page = parsed.success ? parsed.data.page : 1;
      const limit = parsed.success ? parsed.data.limit : 20;

      const result = await karaokeHistoryService.getUserPerformances(user.id, page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/history/my-sessions
   */
  public async getMySessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const parsed = HistoryQuerySchema.safeParse(req.query);
      const page = parsed.success ? parsed.data.page : 1;
      const limit = parsed.success ? parsed.data.limit : 20;

      const result = await karaokeHistoryService.getUserSessions(user.id, page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/history/my-stats
   */
  public async getMyStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const result = await karaokeHistoryService.getUserStats(user.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/history/sessions/:sessionId
   */
  public async getSessionRecap(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      if (!sessionId) {
        sendError(res, 'Session ID is required', 400);
        return;
      }

      const requestingUserId = req.user?.id;
      const recap = await karaokeHistoryService.getSessionRecap(sessionId, requestingUserId);
      res.status(200).json(recap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SESSION_NOT_FOUND') {
        sendError(res, 'Session not found', 404);
        return;
      }
      if (msg === 'FORBIDDEN_PRIVATE_SESSION') {
        sendError(
          res,
          'This karaoke session is private and can only be viewed by lounge attendees.',
          403
        );
        return;
      }
      next(err);
    }
  }

  /**
   * GET /api/v1/users/:userId/history
   */
  public async getUserPublicHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = req.params.userId;
      if (!targetUserId) {
        sendError(res, 'User ID is required', 400);
        return;
      }

      const isSelf = req.user?.id === targetUserId;

      // Check target user's privacy preference
      if (!isSelf) {
        const preferences = await userService.getPreferences(targetUserId);
        if (!preferences.isHistoryPublic) {
          res.status(200).json({
            items: [],
            total: 0,
            page: 1,
            limit: 20,
            totalPages: 0,
            isPrivate: true,
          });
          return;
        }
      }

      const parsed = HistoryQuerySchema.safeParse(req.query);
      const page = parsed.success ? parsed.data.page : 1;
      const limit = parsed.success ? parsed.data.limit : 20;

      const result = await karaokeHistoryService.getUserPerformances(targetUserId, page, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const karaokeHistoryController = new KaraokeHistoryController();
