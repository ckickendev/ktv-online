import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { LoginDto, RefreshTokenDto } from './auth.validation.js';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.authenticate(req.body as LoginDto);
      if (!result) {
        sendError(res, 'Invalid email or password', 401);
        return;
      }
      sendSuccess(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body as RefreshTokenDto;
      const tokens = await authService.refreshToken(refreshToken);
      if (!tokens) {
        sendError(res, 'Invalid or expired refresh token', 401);
        return;
      }
      sendSuccess(res, tokens, 'Tokens refreshed successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
