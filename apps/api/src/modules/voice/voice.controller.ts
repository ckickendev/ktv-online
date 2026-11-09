import { Request, Response, NextFunction } from 'express';
import { voiceService } from './voice.service.js';
import { logger } from '../../utils/logger.js';

export class VoiceController {
  public async getVoiceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;
      const { tabId } = req.body || {};

      if (!roomId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ROOM_ID',
            message: 'Invalid room ID format',
          },
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required to access voice services',
          },
        });
        return;
      }

      const tokenData = await voiceService.generateVoiceToken(roomId, req.user, tabId);

      res.status(200).json({
        success: true,
        data: tokenData,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      switch (errorMessage) {
        case 'VOICE_SERVICE_NOT_CONFIGURED':
          res.status(503).json({
            success: false,
            error: {
              code: 'VOICE_SERVICE_NOT_CONFIGURED',
              message: 'Voice communication service is not currently configured on this server',
            },
          });
          return;

        case 'INVALID_ROOM_ID':
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_ROOM_ID',
              message: 'Invalid room ID format',
            },
          });
          return;

        case 'ROOM_NOT_FOUND':
          res.status(404).json({
            success: false,
            error: {
              code: 'ROOM_NOT_FOUND',
              message: 'Room not found',
            },
          });
          return;

        case 'FORBIDDEN_ROOM_CLOSED':
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN_ROOM_CLOSED',
              message: 'Cannot join voice in a closed room',
            },
          });
          return;

        case 'FORBIDDEN_USER_INACTIVE':
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN_USER_INACTIVE',
              message: 'User account is suspended or inactive',
            },
          });
          return;

        case 'FORBIDDEN_NOT_MEMBER':
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN_NOT_MEMBER',
              message: 'You must be an active room member to join voice',
            },
          });
          return;

        case 'FORBIDDEN_KICKED':
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN_KICKED',
              message: 'You were removed from this room by the host and cannot access voice',
            },
          });
          return;

        default:
          logger.error({ err, roomId: req.params.roomId, userId: req.user?.id }, 'Failed to generate voice token');
          next(err);
      }
    }
  }
}

export const voiceController = new VoiceController();
