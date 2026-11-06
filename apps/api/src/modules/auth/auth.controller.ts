import { Request, Response, NextFunction } from 'express';
import { CookieOptions } from 'express';
import { authService } from './auth.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { LoginDto } from './auth.validation.js';

export function getRefreshTokenCookieOptions(): CookieOptions {
  const isProduction = env.NODE_ENV === 'production' || !!env.COOKIE_SECURE;
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.authenticate(req.body as LoginDto);
      if (!result.success) {
        if (result.error === 'ACCOUNT_INACTIVE') {
          sendError(res, 'Account is suspended or inactive', 403);
          return;
        }
        sendError(res, 'Invalid email or password', 401);
        return;
      }

      const { user, tokens } = result.data;

      // Set secure HTTP-only refresh token cookie
      if (tokens.refreshToken) {
        res.cookie('refreshToken', tokens.refreshToken, getRefreshTokenCookieOptions());
      }

      // Do not leak refresh token in response body
      sendSuccess(
        res,
        {
          user,
          tokens: {
            accessToken: tokens.accessToken,
            expiresIn: tokens.expiresIn,
          },
        },
        'Login successful'
      );
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Prioritize HTTP-only cookie, fallback to request body
      const refreshToken =
        req.cookies?.refreshToken || (req.body as { refreshToken?: string })?.refreshToken;

      if (!refreshToken) {
        sendError(res, 'Refresh token is required', 401);
        return;
      }

      const result = await authService.refreshToken(refreshToken);
      if (!result.success) {
        // Clear cookie on failure
        res.clearCookie('refreshToken', { ...getRefreshTokenCookieOptions(), maxAge: undefined });

        if (result.error === 'REPLAY_DETECTED') {
          sendError(res, 'Refresh token replay detected. All sessions in this family have been revoked.', 401);
          return;
        }
        if (result.error === 'ACCOUNT_INACTIVE') {
          sendError(res, 'Account is suspended or inactive', 403);
          return;
        }
        sendError(res, 'Invalid or expired refresh token', 401);
        return;
      }

      // Set new rotated refresh token cookie
      res.cookie('refreshToken', result.tokens.refreshToken, getRefreshTokenCookieOptions());

      sendSuccess(
        res,
        {
          accessToken: result.tokens.accessToken,
          expiresIn: result.tokens.expiresIn,
        },
        'Tokens refreshed successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken =
        req.cookies?.refreshToken || (req.body as { refreshToken?: string })?.refreshToken;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear cookie
      res.clearCookie('refreshToken', { ...getRefreshTokenCookieOptions(), maxAge: undefined });
      sendSuccess(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    sendSuccess(res, req.user, 'Current authenticated user profile');
  }
}

export const authController = new AuthController();
