import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { signAccessToken } from '../utils/jwt.js';
import { EnvSchema } from '../config/env.js';

describe('Authentication & Authorization Security (Phase A)', () => {
  const app = createApp();
  let activeUserId: string;
  let activeUserToken: string;
  let suspendedUserId: string;
  let suspendedUserToken: string;

  beforeAll(async () => {
    await connectDatabase();
    await UserModel.deleteMany({ email: { $in: ['sec_active@ktv.test', 'sec_suspended@ktv.test'] } });

    // Create an active user
    const activeUser = await UserModel.create({
      username: 'sec_active_user',
      email: 'sec_active@ktv.test',
      passwordHash: 'dummy_hash',
      role: 'user',
      status: 'active',
    });
    activeUserId = activeUser._id.toString();
    activeUserToken = signAccessToken({
      sub: activeUserId,
      username: activeUser.username,
      role: activeUser.role,
    });

    // Create a suspended user
    const suspendedUser = await UserModel.create({
      username: 'sec_suspended_user',
      email: 'sec_suspended@ktv.test',
      passwordHash: 'dummy_hash',
      role: 'user',
      status: 'suspended',
    });
    suspendedUserId = suspendedUser._id.toString();
    suspendedUserToken = signAccessToken({
      sub: suspendedUserId,
      username: suspendedUser.username,
      role: suspendedUser.role,
    });
  });

  afterAll(async () => {
    await UserModel.deleteMany({ email: { $in: ['sec_active@ktv.test', 'sec_suspended@ktv.test'] } });
    await RoomModel.deleteMany({ ownerId: new mongoose.Types.ObjectId(activeUserId) });
    await disconnectDatabase();
  });

  describe('SEC-04: Production Environment Secret Validation', () => {
    it('should reject production startup if JWT_ACCESS_SECRET is using development default', () => {
      const prodEnv = {
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'ktv_online_jwt_access_secret_development_key_12345',
        JWT_REFRESH_SECRET: 'production_secret_32_characters_long_1234567890',
      };

      const result = EnvSchema.safeParse(prodEnv);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((i) => i.message);
        expect(errorMessages.some((msg) => msg.includes('cannot use development default'))).toBe(true);
      }
    });

    it('should reject production startup if secrets are shorter than 32 characters', () => {
      const prodEnv = {
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'short_secret_under_32_chars',
        JWT_REFRESH_SECRET: 'production_secret_32_characters_long_1234567890',
      };

      const result = EnvSchema.safeParse(prodEnv);
      expect(result.success).toBe(false);
    });

    it('should pass validation in production when both secrets are strong and distinct', () => {
      const validProdEnv = {
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'super_secure_access_secret_32_chars_long!',
        JWT_REFRESH_SECRET: 'super_secure_refresh_secret_32_chars_long!',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/ktv_online',
        FRONTEND_URL: 'https://ktv.online',
      };

      const result = EnvSchema.safeParse(validProdEnv);
      expect(result.success).toBe(true);
    });
  });

  describe('SEC-02: requireAuth Middleware Protection', () => {
    it('should reject requests with missing Authorization header (401)', async () => {
      const res = await request(app).post('/api/v1/rooms').send({ name: 'Test Room' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Authentication token is required');
    });

    it('should reject requests with malformed or invalid token signature (401)', async () => {
      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', 'Bearer invalid.tampered.token')
        .send({ name: 'Test Room' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid authentication token');
    });

    it('should reject requests with expired token (401)', async () => {
      const expiredToken = jwt.sign(
        { sub: activeUserId, username: 'test', role: 'user' },
        process.env.JWT_ACCESS_SECRET || 'ktv_online_jwt_access_secret_development_key_12345',
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ name: 'Test Room' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('expired');
    });

    it('should reject requests from suspended or inactive users (403)', async () => {
      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${suspendedUserToken}`)
        .send({ name: 'Test Room' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('suspended or inactive');
    });
  });

  describe('SEC-01: Identity Spoofing & x-user-id Ignored', () => {
    it('should derive room ownerId exclusively from token and ignore forged x-user-id header', async () => {
      const forgedVictimId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${activeUserToken}`)
        .set('x-user-id', forgedVictimId) // Attacker attempting to spoof ownerId
        .send({
          name: 'Secure Lounge 101',
          roomType: 'standard',
          capacity: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ownerId).toBe(activeUserId);
      expect(res.body.data.ownerId).not.toBe(forgedVictimId);
    });
  });
});
