import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { UserModel } from '../users/user.model.js';
import { SessionModel } from './session.model.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../../utils/jwt.js';
import { disconnectSessionSockets } from '../../realtime/socket.server.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { AuthResult, RefreshResult } from './auth.types.js';
import { LoginDto } from './auth.validation.js';

export class AuthService {
  async authenticate(dto: LoginDto): Promise<AuthResult> {
    const user = await UserModel.findOne({ email: dto.email.toLowerCase() }).select('+passwordHash').exec();
    if (!user) {
      return { success: false, error: 'INVALID_CREDENTIALS' };
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      return { success: false, error: 'INVALID_CREDENTIALS' };
    }

    if (user.status !== 'active') {
      return { success: false, error: 'ACCOUNT_INACTIVE' };
    }

    const familyId = crypto.randomUUID();
    const jti = crypto.randomUUID();

    const payload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
      familyId,
      jti,
    };

    const accessToken = signAccessToken({
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
      familyId,
    });

    const refreshToken = signRefreshToken(payload);

    // Persist refresh session with 7 day expiry
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await SessionModel.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt,
      isRevoked: false,
    });

    return {
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        },
      },
    };
  }

  async refreshToken(token: string): Promise<RefreshResult> {
    try {
      const decoded = verifyRefreshToken(token);
      const tokenHash = hashToken(token);

      // Atomically mark session as revoked to prevent concurrent double-refresh
      const session = await SessionModel.findOneAndUpdate(
        { tokenHash, isRevoked: false },
        { $set: { isRevoked: true } },
        { new: false }
      ).exec();

      if (!session) {
        // Check if token existed but was already revoked -> Replay detected
        const revokedSession = await SessionModel.findOne({ tokenHash }).exec();
        if (revokedSession && revokedSession.isRevoked) {
          logger.warn(
            { userId: revokedSession.userId, familyId: revokedSession.familyId },
            '🚨 Security alert: Refresh token replay detected! Revoking token family.'
          );
          await SessionModel.updateMany(
            { familyId: revokedSession.familyId },
            { $set: { isRevoked: true } }
          ).exec();
          await disconnectSessionSockets(revokedSession.familyId);
          return { success: false, error: 'REPLAY_DETECTED' };
        }
        return { success: false, error: 'INVALID_TOKEN' };
      }

      if (session.userId.toString() !== decoded.sub) {
        return { success: false, error: 'INVALID_TOKEN' };
      }

      const user = await UserModel.findById(session.userId).exec();
      if (!user || user.status !== 'active') {
        return { success: false, error: 'ACCOUNT_INACTIVE' };
      }

      // Issue new token pair preserving the familyId
      const newJti = crypto.randomUUID();
      const newPayload = {
        sub: user._id.toString(),
        username: user.username,
        role: user.role,
        familyId: session.familyId,
        jti: newJti,
      };

      const newAccessToken = signAccessToken({
        sub: newPayload.sub,
        username: newPayload.username,
        role: newPayload.role,
        familyId: session.familyId,
      });

      const newRefreshToken = signRefreshToken(newPayload);

      // Create new active session record
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await SessionModel.create({
        userId: user._id,
        tokenHash: hashToken(newRefreshToken),
        familyId: session.familyId,
        expiresAt,
        isRevoked: false,
      });

      return {
        success: true,
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        },
      };
    } catch {
      return { success: false, error: 'INVALID_TOKEN' };
    }
  }

  async logout(token: string): Promise<boolean> {
    try {
      const tokenHash = hashToken(token);
      const session = await SessionModel.findOne({ tokenHash }).exec();
      if (!session) {
        return false;
      }

      // Revoke this session and its family, and disconnect active sockets
      session.isRevoked = true;
      await session.save();
      await SessionModel.updateMany({ familyId: session.familyId }, { $set: { isRevoked: true } }).exec();
      await disconnectSessionSockets(session.familyId);
      return true;
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();
