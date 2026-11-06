import bcrypt from 'bcrypt';
import { UserModel } from '../users/user.model.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { env } from '../../config/env.js';
import { AuthSessionResponse, AuthTokens } from './auth.types.js';
import { LoginDto } from './auth.validation.js';

export class AuthService {
  async authenticate(dto: LoginDto): Promise<AuthSessionResponse | null> {
    const user = await UserModel.findOne({ email: dto.email.toLowerCase() }).select('+passwordHash').exec();
    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    const payload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const tokens: AuthTokens = {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    };

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
      tokens,
    };
  }

  async refreshToken(token: string): Promise<AuthTokens | null> {
    try {
      const decoded = verifyRefreshToken(token);
      const user = await UserModel.findById(decoded.sub).exec();
      if (!user || user.status !== 'active') {
        return null;
      }

      const payload = {
        sub: user._id.toString(),
        username: user.username,
        role: user.role,
      };

      return {
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      };
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
