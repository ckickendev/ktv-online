import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { signAccessToken } from '../utils/jwt.js';

describe('Room Management & Ownership Verification (Sprint 1.3)', () => {
  const app = createApp();

  let userA: { id: string; token: string; username: string };
  let userB: { id: string; token: string; username: string };

  beforeAll(async () => {
    await connectDatabase();
    await UserModel.deleteMany({ email: { $regex: /@room-manage-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Manage Test/ } });
    await RoomMembershipModel.deleteMany({});

    // User A (Owner)
    const uA = await UserModel.create({
      username: 'room_owner_a',
      email: 'owner_a@room-manage-test.ktv',
      passwordHash: 'dummy_hash_a',
      role: 'user',
      status: 'active',
    });
    userA = {
      id: uA._id.toString(),
      token: signAccessToken({ sub: uA._id.toString(), username: uA.username, role: uA.role }),
      username: uA.username,
    };

    // User B (Other User)
    const uB = await UserModel.create({
      username: 'room_other_b',
      email: 'other_b@room-manage-test.ktv',
      passwordHash: 'dummy_hash_b',
      role: 'user',
      status: 'active',
    });
    userB = {
      id: uB._id.toString(),
      token: signAccessToken({ sub: uB._id.toString(), username: uB.username, role: uB.role }),
      username: uB.username,
    };
  });

  afterAll(async () => {
    await UserModel.deleteMany({ email: { $regex: /@room-manage-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Manage Test/ } });
    await RoomMembershipModel.deleteMany({});
    await disconnectDatabase();
  });

  describe('GET /api/v1/rooms/my-rooms', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/rooms/my-rooms');
      expect(res.status).toBe(401);
    });

    it('returns only rooms owned by the requesting authenticated user', async () => {
      // Create room owned by User A
      await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          name: 'Manage Test Lounge A1',
          category: 'rock',
          visibility: 'private',
          capacity: 8,
        });

      // Create room owned by User B
      await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          name: 'Manage Test Lounge B1',
          category: 'pop',
          visibility: 'public',
          capacity: 10,
        });

      const resA = await request(app)
        .get('/api/v1/rooms/my-rooms')
        .set('Authorization', `Bearer ${userA.token}`);

      expect(resA.status).toBe(200);
      expect(resA.body.success).toBe(true);
      expect(resA.body.data.items).toBeInstanceOf(Array);
      expect(resA.body.data.items.length).toBeGreaterThanOrEqual(1);

      // Verify all items belong to userA
      for (const room of resA.body.data.items) {
        expect(room.ownerId).toBe(userA.id);
      }
      expect(resA.body.data.items.some((r: { name: string }) => r.name === 'Manage Test Lounge A1')).toBe(true);
      expect(resA.body.data.items.some((r: { name: string }) => r.name === 'Manage Test Lounge B1')).toBe(false);
    });
  });

  describe('PATCH /api/v1/rooms/:id', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .patch('/api/v1/rooms/507f1f77bcf86cd799439011')
        .send({ name: 'New Name' });
      expect(res.status).toBe(401);
    });

    it('rejects non-owner with 403 Forbidden', async () => {
      // Room owned by User A
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          name: 'Manage Test Lounge To Update',
          category: 'pop',
          capacity: 10,
        });
      const roomId = createRes.body.data.id;

      // User B attempts to update User A's room
      const updateRes = await request(app)
        .patch(`/api/v1/rooms/${roomId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ name: 'Hacked Lounge Name' });

      expect(updateRes.status).toBe(403);
      expect(updateRes.body.success).toBe(false);
      expect(updateRes.body.message).toContain('Forbidden');
    });

    it('allows owner to update room settings', async () => {
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          name: 'Manage Test Initial Name',
          description: 'Initial description',
          category: 'pop',
          visibility: 'public',
          capacity: 10,
        });
      const roomId = createRes.body.data.id;

      const updateRes = await request(app)
        .patch(`/api/v1/rooms/${roomId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          name: 'Manage Test Updated Name',
          description: 'Updated description',
          category: 'anime',
          visibility: 'private',
          capacity: 15,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Manage Test Updated Name');
      expect(updateRes.body.data.description).toBe('Updated description');
      expect(updateRes.body.data.category).toBe('anime');
      expect(updateRes.body.data.visibility).toBe('private');
      expect(updateRes.body.data.capacity).toBe(15);
    });

    it('rejects reducing capacity below current participants count with 400', async () => {
      // Room has 1 participant on creation (owner)
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          name: 'Manage Test Capacity Guard',
          capacity: 6,
        });
      const roomId = createRes.body.data.id;

      // User B joins room -> participant count = 2
      await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${userB.token}`);

      // Owner attempts to reduce capacity to 1 (which is < 2)
      // Note: contracts min capacity is 2, so let's try reducing to min allowed by schema (2)
      // but let's first join a 3rd user or test reducing below participants count
      const uC = await UserModel.create({
        username: 'room_c',
        email: 'c@room-manage-test.ktv',
        passwordHash: 'dummy',
        role: 'user',
        status: 'active',
      });
      const tokenC = signAccessToken({ sub: uC._id.toString(), username: uC.username, role: uC.role });
      await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${tokenC}`);

      // Now participants = 3. Owner attempts to reduce capacity to 2.
      const reduceRes = await request(app)
        .patch(`/api/v1/rooms/${roomId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ capacity: 2 });

      expect(reduceRes.status).toBe(400);
      expect(reduceRes.body.message).toContain('Capacity cannot be reduced below current participant count');
    });
  });

  describe('POST /api/v1/rooms/:id/close', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).post('/api/v1/rooms/507f1f77bcf86cd799439011/close');
      expect(res.status).toBe(401);
    });

    it('rejects non-owner with 403 Forbidden', async () => {
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ name: 'Manage Test To Close' });
      const roomId = createRes.body.data.id;

      const closeRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(closeRes.status).toBe(403);
    });

    it('allows owner to close room and prevents subsequent joins', async () => {
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ name: 'Manage Test Closing Suite' });
      const roomId = createRes.body.data.id;

      const closeRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe('closed');

      // Attempt to join closed room should fail with 400
      const joinRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.message).toContain('Cannot join closed room');

      // Subsequent close call is idempotent
      const secondClose = await request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(secondClose.status).toBe(200);
      expect(secondClose.body.data.status).toBe('closed');
    });
  });
});
