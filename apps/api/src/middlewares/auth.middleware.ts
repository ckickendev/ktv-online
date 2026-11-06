import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { UserModel } from '../modules/users/user.model.js';
import { sendError } from '../utils/response.js';
import { UserRole } from '@ktv/contracts';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 'Authentication token is required', 401);
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    sendError(res, 'Authentication token is required', 401);
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    // Verify user exists and status is active in database
    const user = await UserModel.findById(payload.sub).select('status role username').exec();
    if (!user) {
      sendError(res, 'User account no longer exists', 401);
      return;
    }

    if (user.status !== 'active') {
      sendError(res, 'User account is suspended or inactive', 403);
      return;
    }

    req.user = {
      id: user._id.toString(),
      username: user.username,
      role: user.role as UserRole,
    };

    next();
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === 'TokenExpiredError') {
      sendError(res, 'Authentication token has expired', 401);
      return;
    }
    sendError(res, 'Invalid authentication token', 401);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(res, 'Insufficient permissions to perform this action', 403);
      return;
    }

    next();
  };
}
