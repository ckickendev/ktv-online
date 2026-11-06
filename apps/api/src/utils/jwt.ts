import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtTokenPayload {
  sub: string;
  username: string;
  role: string;
}

export function signAccessToken(payload: JwtTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(payload: JwtTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): JwtTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtTokenPayload;
}

export function verifyRefreshToken(token: string): JwtTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtTokenPayload;
}
