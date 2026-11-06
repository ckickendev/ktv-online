import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { signAccessToken } from '../utils/jwt.js';

describe('Room Membership Integrity & Concurrency (Phase C)', () => {
  const app = createApp();

  // Test users and tokens
  const users: { id: string; token: string; username: string }[] = [];
  let hostUser: { id: string; token: string; username: string };

  beforeAll(async () => {
    await connectDatabase();
    await UserModel.deleteMany({ email: { $regex: /@room-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Membership Test/ } });
    await RoomMembershipModel.deleteMany({});

    // Create 1 host user + 6 member users
    for (let i = 1; i <= 7; i++) {
      const u = await UserModel.create({
        username: `room_user_${i}`,
        email: `user_${i}@room-test.ktv`,
        passwordHash: 'dummy_hash',
        role: 'user',
        status: 'active',
      });
      const token = signAccessToken({
        sub: u._id.toString(),
        username: u.username,
        role: u.role,
      });
      users.push({ id: u._id.toString(), token, username: u.username });
    }
    hostUser = users[0]!;
  });

  afterAll(async () => {
    await UserModel.deleteMany({ email: { $regex: /@room-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Membership Test/ } });
    await RoomMembershipModel.deleteMany({});
    await disconnectDatabase();
  });

  describe('Room Creation & Host Membership', () => {
    it('should create room and automatically register creator as active host member', async () => {
      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${hostUser.token}`)
        .send({
          name: 'Membership Test Lounge 1',
          roomType: 'standard',
          capacity: 4,
          category: 'pop',
        });

      expect(res.status).toBe(201);
      const roomId = res.body.data.id;
      expect(res.body.data.currentParticipantsCount).toBe(1);

      // Verify RoomMembership record exists for host
      const hostMembership = await RoomMembershipModel.findOne({
        roomId: new mongoose.Types.ObjectId(roomId),
        userId: new mongoose.Types.ObjectId(hostUser.id),
      });

      expect(hostMembership).toBeDefined();
      expect(hostMembership?.role).toBe('host');
      expect(hostMembership?.status).toBe('active');
    });
  });

  describe('Join, Duplicate Idempotency & Capacity Limit', () => {
    it('should join room successfully, handle duplicate joins idempotently, and enforce capacity limit', async () => {
      // 1. Create a room with capacity 2 (host already occupies 1 spot)
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${hostUser.token}`)
        .send({
          name: 'Membership Test Lounge 2',
          capacity: 2,
        });

      const roomId = createRes.body.data.id;
      const member1 = users[1]!;
      const member2 = users[2]!;

      // 2. Member 1 joins successfully
      const joinRes1 = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member1.token}`)
        .send();

      expect(joinRes1.status).toBe(201);
      expect(joinRes1.body.success).toBe(true);
      expect(joinRes1.body.data.role).toBe('member');
      expect(joinRes1.body.data.status).toBe('active');

      // Verify room participant count is now 2
      const roomAfterJoin1 = await RoomModel.findById(roomId);
      expect(roomAfterJoin1?.currentParticipantsCount).toBe(2);

      // 3. Duplicate Join Test: Member 1 joins again -> idempotent response, does not increment count
      const dupJoinRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member1.token}`)
        .send();

      expect(dupJoinRes.status).toBe(200);
      expect(dupJoinRes.body.message).toContain('Already an active member');

      const roomAfterDup = await RoomModel.findById(roomId);
      expect(roomAfterDup?.currentParticipantsCount).toBe(2); // Still 2!

      // 4. Capacity Limit Test: Member 2 attempts to join full room (capacity 2 / 2) -> 409 Conflict
      const joinRes2 = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member2.token}`)
        .send();

      expect(joinRes2.status).toBe(409);
      expect(joinRes2.body.success).toBe(false);
      expect(joinRes2.body.message).toContain('maximum capacity');
    });
  });

  describe('Leave & Rejoin Behavior', () => {
    it('should release capacity on leave and allow safe rejoining', async () => {
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${hostUser.token}`)
        .send({
          name: 'Membership Test Lounge 3',
          capacity: 3,
        });

      const roomId = createRes.body.data.id;
      const member1 = users[1]!;

      // Join
      await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member1.token}`);

      let room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(2);

      // Leave
      const leaveRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/leave`)
        .set('Authorization', `Bearer ${member1.token}`);

      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.success).toBe(true);

      room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(1); // Capacity safely decremented

      const membership = await RoomMembershipModel.findOne({
        roomId: new mongoose.Types.ObjectId(roomId),
        userId: new mongoose.Types.ObjectId(member1.id),
      });
      expect(membership?.status).toBe('left');
      expect(membership?.leftAt).toBeDefined();

      // Rejoin
      const rejoinRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member1.token}`);

      expect(rejoinRes.status).toBe(201);
      room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(2);
    });
  });

  describe('Closed Room Protection', () => {
    it('should reject join attempts on closed rooms (400)', async () => {
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${hostUser.token}`)
        .send({
          name: 'Membership Test Lounge 4',
          capacity: 5,
        });

      const roomId = createRes.body.data.id;
      // Close the room
      await RoomModel.findByIdAndUpdate(roomId, { status: 'closed' });

      const joinRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${users[1]!.token}`);

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.message).toContain('closed room');
    });
  });

  describe('True Database Concurrency Test (DB-02)', () => {
    it('should safely enforce room capacity under concurrent simultaneous join requests', async () => {
      // 1. Create a room with capacity 3 (1 host + 2 available slots)
      const createRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${hostUser.token}`)
        .send({
          name: 'Membership Test Concurrency Lounge',
          capacity: 3,
        });

      const roomId = createRes.body.data.id;

      // 2. Launch 5 simultaneous join requests from 5 different users concurrently!
      const candidates = users.slice(1, 6); // 5 users competing for 2 slots
      const joinPromises = candidates.map((cand) =>
        request(app)
          .post(`/api/v1/rooms/${roomId}/join`)
          .set('Authorization', `Bearer ${cand.token}`)
          .send()
      );

      const results = await Promise.all(joinPromises);

      // Count successes (201 Created) and rejections (409 Conflict)
      const successCount = results.filter((r) => r.status === 201).length;
      const fullRejections = results.filter((r) => r.status === 409).length;

      // Exactly 2 users should succeed (since host took slot 1 of 3)
      expect(successCount).toBe(2);
      expect(fullRejections).toBe(3);

      // Verify persistent database state matches exactly
      const finalRoom = await RoomModel.findById(roomId);
      expect(finalRoom?.currentParticipantsCount).toBe(3);

      const activeMemberships = await RoomMembershipModel.countDocuments({
        roomId: new mongoose.Types.ObjectId(roomId),
        status: 'active',
      });
      // Exactly 3 active memberships: 1 host + 2 winning concurrent members
      expect(activeMemberships).toBe(3);
    });
  });
});
