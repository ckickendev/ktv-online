import { Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { UserModel } from '../modules/users/user.model.js';
import { logger } from '../utils/logger.js';
import { UserRole } from '@ktv/contracts';

export interface AuthenticatedSocketData {
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    role: UserRole;
    avatar?: string | null;
    familyId?: string;
  };
}

export type AuthenticatedSocket = Socket<any, any, any, AuthenticatedSocketData>;

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  const authPayload = socket.handshake.auth as { token?: string } | undefined;
  const headerToken = socket.handshake.headers.authorization;

  let token: string | undefined = authPayload?.token;

  if (!token && headerToken) {
    if (headerToken.startsWith('Bearer ')) {
      token = headerToken.split(' ')[1];
    } else {
      token = headerToken;
    }
  }

  if (!token || typeof token !== 'string') {
    logger.warn({ socketId: socket.id }, 'Socket connection rejected: Missing auth token');
    const err = new Error('Authentication token is required');
    (err as any).data = { code: 'AUTH_TOKEN_REQUIRED' };
    return next(err);
  }

  try {
    const payload = verifyAccessToken(token);

    // Validate user in MongoDB and verify active status
    const user = await UserModel.findById(payload.sub)
      .select('status role username displayName avatar')
      .exec();
    if (!user) {
      logger.warn({ sub: payload.sub, socketId: socket.id }, 'Socket connection rejected: User not found');
      const err = new Error('User account no longer exists');
      (err as any).data = { code: 'AUTH_USER_NOT_FOUND' };
      return next(err);
    }

    if (user.status !== 'active') {
      logger.warn(
        { userId: user._id, status: user.status, socketId: socket.id },
        'Socket connection rejected: User suspended or inactive'
      );
      const err = new Error('User account is suspended or inactive');
      (err as any).data = { code: 'AUTH_USER_SUSPENDED' };
      return next(err);
    }

    // Attach validated identity directly to socket.data
    socket.data.user = {
      id: user._id.toString(),
      username: user.username,
      displayName: user.displayName ?? null,
      role: user.role as UserRole,
      avatar: user.avatar ?? null,
      familyId: payload.familyId,
    };

    next();
  } catch (err: unknown) {
    const error = err as Error;
    logger.warn({ err: error.message, socketId: socket.id }, 'Socket authentication failed');

    if (error.name === 'TokenExpiredError') {
      const authErr = new Error('Authentication token has expired');
      (authErr as any).data = { code: 'AUTH_TOKEN_EXPIRED' };
      return next(authErr);
    }

    const authErr = new Error('Invalid authentication token');
    (authErr as any).data = { code: 'AUTH_INVALID_TOKEN' };
    return next(authErr);
  }
}
