import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { SessionModel } from '../modules/auth/session.model.js';

describe('Refresh Session Security & Rotation (Phase B)', () => {
  const app = createApp();
  const testPassword = 'Password123!Secure';

  beforeAll(async () => {
    await connectDatabase();
    await UserModel.deleteMany({ email: { $in: ['session_user@ktv.test', 'session_suspended@ktv.test'] } });
    await SessionModel.deleteMany({});

    const passwordHash = await bcrypt.hash(testPassword, 10);

    await UserModel.create({
      username: 'session_active_user',
      email: 'session_user@ktv.test',
      passwordHash,
      role: 'user',
      status: 'active',
    });

    await UserModel.create({
      username: 'session_suspended_user',
      email: 'session_suspended@ktv.test',
      passwordHash,
      role: 'user',
      status: 'suspended',
    });
  });

  afterAll(async () => {
    await UserModel.deleteMany({ email: { $in: ['session_user@ktv.test', 'session_suspended@ktv.test'] } });
    await SessionModel.deleteMany({});
    await disconnectDatabase();
  });

  describe('Login & Cookie Configuration', () => {
    it('should reject login for suspended users (403)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'session_suspended@ktv.test',
        password: testPassword,
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('suspended or inactive');
    });

    it('should set secure HTTP-only refresh token cookie and not expose it in JSON response', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'session_user@ktv.test',
        password: testPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('expiresIn');
      // Crucial: Refresh token must NOT be exposed in response body
      expect(res.body.data.tokens.refreshToken).toBeUndefined();

      // Verify Set-Cookie header
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(Array.isArray(cookies)).toBe(true);
      const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Path=/api/v1/auth');
      expect(refreshCookie?.toLowerCase()).toContain('samesite=lax');
    });
  });

  describe('Refresh Token Rotation & Replay Attack Detection', () => {
    it('should rotate refresh token and issue new access token on valid refresh', async () => {
      // 1. Login to get initial cookie
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'session_user@ktv.test',
        password: testPassword,
      });

      const initialCookie = (loginRes.headers['set-cookie'] as unknown as string[])[0] as string;

      // 2. Perform refresh using the cookie
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', initialCookie)
        .send();

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data).toHaveProperty('accessToken');

      // 3. Verify a new rotated cookie was sent
      const rotatedCookies = refreshRes.headers['set-cookie'] as unknown as string[];
      expect(rotatedCookies).toBeDefined();
      const rotatedCookie = rotatedCookies[0] as string;
      expect(rotatedCookie).toBeDefined();
      expect(rotatedCookie).not.toBe(initialCookie);

      // 4. Replay Attack Test: Attempting to reuse the old initialCookie MUST trigger replay detection!
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', initialCookie)
        .send();

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.success).toBe(false);
      expect(replayRes.body.message).toContain('replay detected');

      // 5. Verify all sessions in that family were revoked
      const subsequentRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotatedCookie)
        .send();

      expect(subsequentRes.status).toBe(401);
    });
  });

  describe('Logout & Session Revocation', () => {
    it('should revoke session and clear refresh cookie on logout', async () => {
      // Login
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'session_user@ktv.test',
        password: testPassword,
      });
      const cookie = (loginRes.headers['set-cookie'] as unknown as string[])[0] as string;

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .send();

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Verify cookie is cleared (expires in the past or max-age 0)
      const clearedCookies = logoutRes.headers['set-cookie'] as unknown as string[];
      expect(clearedCookies[0]).toContain('refreshToken=;');

      // Attempting to refresh with the logged out cookie must fail
      const refreshAfterLogout = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .send();

      expect(refreshAfterLogout.status).toBe(401);
    });
  });
});
