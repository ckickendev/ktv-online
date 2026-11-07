import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { signAccessToken } from '../utils/jwt.js';

describe('Room Membership & Participation API (Sprint 1.5)', () => {
  const app = createApp();

  let hostUser: { id: string; token: string; username: string };
  let memberUser1: { id: string; token: string; username: string };
  let memberUser2: { id: string; token: string; username: string };
  let outsideUser: { id: string; token: string; username: string };
  let suspendedUser: { id: string; token: string; username: string };

  let publicRoom: any;
  let fullRoom: any;
  let closedRoom: any;
  let privateRoom: any;

  beforeAll(async () => {
    await connectDatabase();
    const existingRooms = await RoomModel.find({ name: { $regex: /Participation Lounge/ } }).select('_id');
    const existingRoomIds = existingRooms.map((r) => r._id);
    if (existingRoomIds.length > 0) {
      await RoomMembershipModel.deleteMany({ roomId: { $in: existingRoomIds } });
    }
    await UserModel.deleteMany({ email: { $regex: /@participation-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Participation Lounge/ } });

    // 1. Host User
    const uHost = await UserModel.create({
      username: 'part_host',
      email: 'host@participation-test.ktv',
      passwordHash: 'dummy_hash',
      avatar: 'https://images.unsplash.com/host.jpg',
      role: 'user',
      status: 'active',
    });
    hostUser = {
      id: uHost._id.toString(),
      token: signAccessToken({ sub: uHost._id.toString(), username: uHost.username, role: uHost.role }),
      username: uHost.username,
    };

    // 2. Member 1
    const uMem1 = await UserModel.create({
      username: 'part_member_1',
      email: 'member1@participation-test.ktv',
      passwordHash: 'dummy_hash',
      avatar: 'https://images.unsplash.com/mem1.jpg',
      role: 'user',
      status: 'active',
    });
    memberUser1 = {
      id: uMem1._id.toString(),
      token: signAccessToken({ sub: uMem1._id.toString(), username: uMem1.username, role: uMem1.role }),
      username: uMem1.username,
    };

    // 3. Member 2
    const uMem2 = await UserModel.create({
      username: 'part_member_2',
      email: 'member2@participation-test.ktv',
      passwordHash: 'dummy_hash',
      avatar: null,
      role: 'user',
      status: 'active',
    });
    memberUser2 = {
      id: uMem2._id.toString(),
      token: signAccessToken({ sub: uMem2._id.toString(), username: uMem2.username, role: uMem2.role }),
      username: uMem2.username,
    };

    // 4. Outside / Non-member User
    const uOut = await UserModel.create({
      username: 'part_outsider',
      email: 'outsider@participation-test.ktv',
      passwordHash: 'dummy_hash',
      avatar: null,
      role: 'user',
      status: 'active',
    });
    outsideUser = {
      id: uOut._id.toString(),
      token: signAccessToken({ sub: uOut._id.toString(), username: uOut.username, role: uOut.role }),
      username: uOut.username,
    };

    // 5. Suspended User
    const uSusp = await UserModel.create({
      username: 'part_suspended',
      email: 'suspended@participation-test.ktv',
      passwordHash: 'dummy_hash',
      role: 'user',
      status: 'suspended',
    });
    suspendedUser = {
      id: uSusp._id.toString(),
      token: signAccessToken({ sub: uSusp._id.toString(), username: uSusp.username, role: uSusp.role }),
      username: uSusp.username,
    };

    // Create Rooms
    // Public Room (capacity 4, host occupies 1 spot)
    publicRoom = await RoomModel.create({
      name: 'Participation Lounge Open Pop',
      description: 'Lively open karaoke lounge',
      ownerId: uHost._id,
      roomType: 'standard',
      visibility: 'public',
      capacity: 4,
      status: 'singing',
      category: 'pop',
      currentParticipantsCount: 1,
    });
    await RoomMembershipModel.create({
      roomId: publicRoom._id,
      userId: uHost._id,
      role: 'host',
      status: 'active',
    });

    // Full Room (capacity 2, host + member1 occupies 2 spots)
    fullRoom = await RoomModel.create({
      name: 'Participation Lounge Full VIP',
      description: 'Maxed out VIP lounge',
      ownerId: uHost._id,
      roomType: 'vip',
      visibility: 'public',
      capacity: 2,
      status: 'singing',
      category: 'rock',
      currentParticipantsCount: 2,
    });
    await RoomMembershipModel.create({
      roomId: fullRoom._id,
      userId: uHost._id,
      role: 'host',
      status: 'active',
    });
    await RoomMembershipModel.create({
      roomId: fullRoom._id,
      userId: uMem1._id,
      role: 'member',
      status: 'active',
    });

    // Closed Room
    closedRoom = await RoomModel.create({
      name: 'Participation Lounge Concluded',
      description: 'Session closed',
      ownerId: uHost._id,
      roomType: 'standard',
      visibility: 'public',
      capacity: 10,
      status: 'closed',
      category: 'ballad',
      currentParticipantsCount: 0,
    });

    // Private Room
    privateRoom = await RoomModel.create({
      name: 'Participation Lounge Private Stage',
      description: 'Private family karaoke',
      ownerId: uHost._id,
      roomType: 'vip',
      visibility: 'private',
      capacity: 6,
      status: 'idle',
      category: 'pop',
      currentParticipantsCount: 1,
    });
    await RoomMembershipModel.create({
      roomId: privateRoom._id,
      userId: uHost._id,
      role: 'host',
      status: 'active',
    });
  });

  afterAll(async () => {
    const testUserIds = [
      hostUser?.id,
      memberUser1?.id,
      memberUser2?.id,
      outsideUser?.id,
      suspendedUser?.id,
    ].filter(Boolean);

    await RoomMembershipModel.deleteMany({ userId: { $in: testUserIds } });
    await UserModel.deleteMany({ email: { $regex: /@participation-test\.ktv/ } });
    await RoomModel.deleteMany({ name: { $regex: /Participation Lounge/ } });
    await disconnectDatabase();
  });

  describe('POST /api/v1/rooms/:id/join', () => {
    it('allows an authenticated user to join an available public room', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/join`)
        .set('Authorization', `Bearer ${memberUser1.token}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('member');
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.roomId).toBe(publicRoom._id.toString());
      expect(res.body.data.userId).toBe(memberUser1.id);

      // Verify room count is incremented to 2
      const room = await RoomModel.findById(publicRoom._id);
      expect(room?.currentParticipantsCount).toBe(2);
    });

    it('rejects unauthenticated join requests with 401', async () => {
      const res = await request(app).post(`/api/v1/rooms/${publicRoom._id}/join`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects suspended accounts from joining with 403', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/join`)
        .set('Authorization', `Bearer ${suspendedUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('suspended');
    });

    it('returns 404 when joining a nonexistent room ID', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`/api/v1/rooms/${fakeId}/join`)
        .set('Authorization', `Bearer ${memberUser2.token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Room not found');
    });

    it('rejects joining a closed room with 400', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${closedRoom._id}/join`)
        .set('Authorization', `Bearer ${memberUser2.token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('closed room');
    });

    it('rejects joining a full room with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${fullRoom._id}/join`)
        .set('Authorization', `Bearer ${memberUser2.token}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('maximum capacity');
    });

    it('rejects direct join to private room for non-owners with 403', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${privateRoom._id}/join`)
        .set('Authorization', `Bearer ${outsideUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('private room');
    });

    it('handles duplicate join idempotently without double-incrementing count (200)', async () => {
      // memberUser1 is already an active member from test 1
      const res = await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/join`)
        .set('Authorization', `Bearer ${memberUser1.token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Already an active member');

      const room = await RoomModel.findById(publicRoom._id);
      expect(room?.currentParticipantsCount).toBe(2); // Still 2
    });
  });

  describe('POST /api/v1/rooms/:id/leave', () => {
    it('prevents a room host from abandoning an active room (400 HOST_CANNOT_LEAVE)', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/leave`)
        .set('Authorization', `Bearer ${hostUser.token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('host cannot leave');

      // Room count unchanged
      const room = await RoomModel.findById(publicRoom._id);
      expect(room?.currentParticipantsCount).toBe(2);
    });

    it('allows a regular active member to leave and releases capacity (200)', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/leave`)
        .set('Authorization', `Bearer ${memberUser1.token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Left room successfully');

      // Room count safely decremented from 2 to 1
      const room = await RoomModel.findById(publicRoom._id);
      expect(room?.currentParticipantsCount).toBe(1);

      // Membership record marked left
      const mem = await RoomMembershipModel.findOne({
        roomId: publicRoom._id,
        userId: memberUser1.id,
      });
      expect(mem?.status).toBe('left');
      expect(mem?.leftAt).toBeDefined();
    });

    it('rejects leave request if user is not an active member (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/leave`)
        .set('Authorization', `Bearer ${outsideUser.token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not an active member');
    });

    it('rejects repeated leave request without double-decrementing count (400)', async () => {
      // memberUser1 has already left
      const res = await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/leave`)
        .set('Authorization', `Bearer ${memberUser1.token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not an active member');

      const room = await RoomModel.findById(publicRoom._id);
      expect(room?.currentParticipantsCount).toBe(1); // Still 1
    });
  });

  describe('GET /api/v1/rooms/:id/members', () => {
    it('returns active members with safe populated user profiles for public rooms', async () => {
      // Member 2 joins public room
      await request(app)
        .post(`/api/v1/rooms/${publicRoom._id}/join`)
        .set('Authorization', `Bearer ${memberUser2.token}`);

      const res = await request(app).get(`/api/v1/rooms/${publicRoom._id}/members`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const members = res.body.data;
      expect(members.length).toBe(2); // Host + Member 2

      // Check host profile
      const hostItem = members.find((m: any) => m.role === 'host');
      expect(hostItem).toBeDefined();
      expect(hostItem.user).toBeDefined();
      expect(hostItem.user.username).toBe(hostUser.username);
      expect(hostItem.user.passwordHash).toBeUndefined();

      // Check member profile
      const memItem = members.find((m: any) => m.role === 'member');
      expect(memItem).toBeDefined();
      expect(memItem.user.username).toBe(memberUser2.username);
    });

    it('protects private room member list: rejects unauthenticated visitors with 401', async () => {
      const res = await request(app).get(`/api/v1/rooms/${privateRoom._id}/members`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Authentication required');
    });

    it('protects private room member list: rejects unauthorized non-members with 403', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${privateRoom._id}/members`)
        .set('Authorization', `Bearer ${outsideUser.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('permission');
    });

    it('allows private room host to view private room member list (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${privateRoom._id}/members`)
        .set('Authorization', `Bearer ${hostUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('GET /api/v1/rooms/:id/membership', () => {
    it('returns isMember: true with role and details for an active member', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${publicRoom._id}/membership`)
        .set('Authorization', `Bearer ${memberUser2.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMember).toBe(true);
      expect(res.body.data.role).toBe('member');
      expect(res.body.data.membership).toBeDefined();
      expect(res.body.data.membership.status).toBe('active');
    });

    it('returns isMember: false for a non-member', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${publicRoom._id}/membership`)
        .set('Authorization', `Bearer ${outsideUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMember).toBe(false);
      expect(res.body.data.membership).toBeNull();
    });

    it('rejects unauthenticated requests to check membership with 401', async () => {
      const res = await request(app).get(`/api/v1/rooms/${publicRoom._id}/membership`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/rooms/joined-rooms', () => {
    it('lists rooms that the user has actively joined as a member', async () => {
      // memberUser2 has actively joined publicRoom
      const res = await request(app)
        .get('/api/v1/rooms/joined-rooms')
        .set('Authorization', `Bearer ${memberUser2.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe(publicRoom._id.toString());
      expect(res.body.data.pagination).toBeDefined();
    });

    it('returns empty list for a user who has not joined any rooms as a member', async () => {
      const res = await request(app)
        .get('/api/v1/rooms/joined-rooms')
        .set('Authorization', `Bearer ${outsideUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });

  describe('Room Closure Active Membership Cleanup', () => {
    it('transitions active memberships to left when room is closed by host', async () => {
      // 1. Create a room with host and join a member
      const room = await RoomModel.create({
        name: 'Participation Lounge Closure Test',
        ownerId: new mongoose.Types.ObjectId(hostUser.id),
        roomType: 'standard',
        visibility: 'public',
        capacity: 5,
        status: 'singing',
        currentParticipantsCount: 2,
      });
      await RoomMembershipModel.create({
        roomId: room._id,
        userId: new mongoose.Types.ObjectId(hostUser.id),
        role: 'host',
        status: 'active',
      });
      await RoomMembershipModel.create({
        roomId: room._id,
        userId: new mongoose.Types.ObjectId(memberUser2.id),
        role: 'member',
        status: 'active',
      });

      // 2. Host closes room
      const closeRes = await request(app)
        .post(`/api/v1/rooms/${room._id}/close`)
        .set('Authorization', `Bearer ${hostUser.token}`);

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe('closed');

      // 3. Verify active memberships were transitioned to left
      const activeCount = await RoomMembershipModel.countDocuments({
        roomId: room._id,
        status: 'active',
      });
      expect(activeCount).toBe(0);

      const closedMemberships = await RoomMembershipModel.find({ roomId: room._id });
      closedMemberships.forEach((m) => {
        expect(m.status).toBe('left');
        expect(m.leftAt).toBeDefined();
      });
    });
  });
});
