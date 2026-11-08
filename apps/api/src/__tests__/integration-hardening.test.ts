import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { SessionModel } from '../modules/auth/session.model.js';
import { roomReconciliationService } from '../modules/rooms/room-reconciliation.service.js';
import { signAccessToken } from '../utils/jwt.js';

describe('Integration Testing & System Hardening (Sprint 1.6)', () => {
  const app = createApp();
  const testPassword = 'Password123!Hardened';

  beforeAll(async () => {
    await connectDatabase();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await disconnectDatabase();
  });

  async function cleanup() {
    await RoomMembershipModel.deleteMany({});
    await RoomModel.deleteMany({ name: { $regex: /Hardening/ } });
    await UserModel.deleteMany({ email: { $regex: /@hardening-test\.ktv/ } });
    await SessionModel.deleteMany({});
  }

  // Helper to create users
  async function createTestUser(username: string, email: string, role = 'user') {
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await UserModel.create({
      username,
      email,
      passwordHash,
      role,
      status: 'active',
      avatar: `https://images.unsplash.com/${username}.jpg`,
    });
    const token = signAccessToken({
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    });
    return {
      id: user._id.toString(),
      username,
      email,
      token,
      user,
    };
  }

  // =========================================================================
  // JOURNEY 1 — New User
  // =========================================================================
  describe('Journey 1 — New User Full Lifecycle', () => {
    const email = 'journey1_user@hardening-test.ktv';
    const username = 'journey1_user';
    let accessToken = '';
    let refreshTokenCookie = '';
    let roomId = '';

    it('Step 1: Register', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email,
        password: testPassword,
        username,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(email);
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('Step 2: Login', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email,
        password: testPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      accessToken = res.body.data.tokens.accessToken;
      expect(accessToken).toBeDefined();

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      refreshTokenCookie = cookies[0];
      expect(refreshTokenCookie).toContain('refreshToken=');
    });

    it('Step 3: Restore session after reload (fetch /auth/me)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe(username);
    });

    it('Step 4: Browse rooms', async () => {
      const res = await request(app)
        .get('/api/v1/rooms')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('Step 5: Create room & verify host membership and invariant count=1', async () => {
      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Hardening Journey 1 Room',
          category: 'pop',
          capacity: 4,
          visibility: 'public',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      roomId = res.body.data.id;
      expect(res.body.data.currentParticipantsCount).toBe(1);

      // Verify active membership exists
      const membership = await RoomMembershipModel.findOne({
        roomId,
        status: 'active',
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('host');
    });

    it('Step 6: Join own room according to existing host semantics', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Already');
      expect(res.body.data.role).toBe('host');
      expect(res.body.data.status).toBe('active');
    });

    it('Step 7: Close room & verify participant count becomes 0 and membership marked left', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('closed');
      expect(res.body.data.currentParticipantsCount).toBe(0);

      const memberships = await RoomMembershipModel.find({ roomId, status: 'active' });
      expect(memberships.length).toBe(0);
    });

    it('Step 8: Logout', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', refreshTokenCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // JOURNEY 2 — Two Users Public Room Flow
  // =========================================================================
  describe('Journey 2 — Two Users Public Room Flow', () => {
    let userA: any;
    let userB: any;
    let roomId: string;

    beforeAll(async () => {
      userA = await createTestUser('hardening_user_a', 'user_a@hardening-test.ktv');
      userB = await createTestUser('hardening_user_b', 'user_b@hardening-test.ktv');
    });

    it('User A creates public room', async () => {
      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          name: 'Hardening Two Users Lounge',
          category: 'pop',
          capacity: 5,
          visibility: 'public',
        });

      expect(res.status).toBe(201);
      roomId = res.body.data.id;
      expect(res.body.data.currentParticipantsCount).toBe(1);
    });

    it('User B discovers room in public discovery', async () => {
      const res = await request(app)
        .get('/api/v1/rooms?search=Hardening+Two+Users')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(res.status).toBe(200);
      const found = res.body.data.items.find((r: any) => r.id === roomId);
      expect(found).toBeDefined();
      expect(found.currentParticipantsCount).toBe(1);
    });

    it('User B joins room -> count increments to 2', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);

      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(2);
    });

    it('User A sees updated member snapshot (both members present)', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${roomId}/members`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      const memberUsernames = res.body.data.map((m: any) => m.user?.username || m.user);
      expect(memberUsernames).toContain(userA.username);
      expect(memberUsernames).toContain(userB.username);
    });

    it('User B leaves room -> count decrements to 1', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/leave`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(1);
    });

    it('User A sees updated member snapshot (User B is gone)', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${roomId}/members`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      const memberUsernames = res.body.data.map((m: any) => m.user?.username || m.user);
      expect(memberUsernames).toContain(userA.username);
      expect(memberUsernames).not.toContain(userB.username);
    });
  });

  // =========================================================================
  // JOURNEY 3 — Private Room Protection & Membership Privacy
  // =========================================================================
  describe('Journey 3 — Private Room Protection & Membership Privacy', () => {
    let host: any;
    let outsider: any;
    let privateRoomId: string;

    beforeAll(async () => {
      host = await createTestUser('hardening_priv_host', 'priv_host@hardening-test.ktv');
      outsider = await createTestUser('hardening_priv_outsider', 'priv_outsider@hardening-test.ktv');

      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Top Secret VIP Lounge',
          category: 'ballad',
          capacity: 2,
          visibility: 'private',
        });

      privateRoomId = res.body.data.id;
    });

    it('Public discovery MUST NOT list the private room', async () => {
      const res = await request(app)
        .get('/api/v1/rooms?search=Top+Secret')
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(200);
      const found = res.body.data.items.find((r: any) => r.id === privateRoomId);
      expect(found).toBeUndefined();
    });

    it('Direct room access without auth returns 401', async () => {
      const res = await request(app).get(`/api/v1/rooms/${privateRoomId}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Direct room access by non-member outsider returns 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${privateRoomId}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('private');
    });

    it('Direct member inspection by non-member outsider returns 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/rooms/${privateRoomId}/members`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Room owner (host) CAN access private room detail and member list', async () => {
      const roomRes = await request(app)
        .get(`/api/v1/rooms/${privateRoomId}`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(roomRes.status).toBe(200);
      expect(roomRes.body.data.id).toBe(privateRoomId);

      const membersRes = await request(app)
        .get(`/api/v1/rooms/${privateRoomId}/members`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(membersRes.status).toBe(200);
      expect(Array.isArray(membersRes.body.data)).toBe(true);
      expect(membersRes.body.data.length).toBe(1);
    });
  });

  // =========================================================================
  // JOURNEY 4 — Capacity & Invariant Enforcement
  // =========================================================================
  describe('Journey 4 — Capacity & Invariant Enforcement', () => {
    let host: any;
    let member1: any;
    let member2: any;
    let roomId: string;

    beforeAll(async () => {
      host = await createTestUser('hardening_cap_host', 'cap_host@hardening-test.ktv');
      member1 = await createTestUser('hardening_cap_m1', 'cap_m1@hardening-test.ktv');
      member2 = await createTestUser('hardening_cap_m2', 'cap_m2@hardening-test.ktv');

      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Strict Capacity Room',
          category: 'rock',
          capacity: 2,
          visibility: 'public',
        });
      roomId = res.body.data.id;
    });

    it('Room has 1 host; member 1 joins -> 2/2 (Room is full)', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member1.token}`);

      expect([200, 201]).toContain(res.status);
      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(2);
    });

    it('Member 2 attempts to join full room -> rejected with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member2.token}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('maximum capacity');

      // Room count remains strictly 2
      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(2);
    });

    it('Member 1 leaves room -> count decrements to 1', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/leave`)
        .set('Authorization', `Bearer ${member1.token}`);

      expect(res.status).toBe(200);
      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(1);
    });

    it('Member 2 joins freed spot -> succeeds with count 2', async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${member2.token}`);

      expect([200, 201]).toContain(res.status);
      const roomAfter = await RoomModel.findById(roomId);
      expect(roomAfter?.currentParticipantsCount).toBe(2);

      // Verify invariant: active memberships === currentParticipantsCount
      const activeCount = await RoomMembershipModel.countDocuments({
        roomId,
        status: 'active',
      });
      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(activeCount);
      expect(room?.currentParticipantsCount).toBe(2);
    });
  });

  // =========================================================================
  // JOURNEY 5 — Session Failure, Token Rotation & Replay Detection
  // =========================================================================
  describe('Journey 5 — Session Failure, Token Rotation & Replay Detection', () => {
    const email = 'journey5_user@hardening-test.ktv';

    beforeAll(async () => {
      await createTestUser('journey5_user', email);
    });

    it('Login -> Refresh -> Rotation -> Replay detection revokes family', async () => {
      // 1. Initial login
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email,
        password: testPassword,
      });
      expect(loginRes.status).toBe(200);

      const cookie1 = (loginRes.headers['set-cookie'] as unknown as string[])[0];

      // 2. Legitimate refresh
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1);

      expect(refreshRes.status).toBe(200);
      const newAccessToken = refreshRes.body.data.accessToken;
      expect(newAccessToken).toBeDefined();

      const cookie2 = (refreshRes.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie2).not.toBe(cookie1);

      // 3. New access token works
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newAccessToken}`);
      expect(meRes.status).toBe(200);

      // 4. Replay attack: Attacker attempts to reuse rotated cookie1
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toContain('replay detected');

      // 5. Verify family was invalidated: legitimate cookie2 is now also rejected
      const subsequentRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie2);

      expect(subsequentRes.status).toBe(401);
    });
  });

  // =========================================================================
  // JOURNEY 6 — Account Isolation & Profile Privacy
  // =========================================================================
  describe('Journey 6 — Account Isolation & Profile Privacy', () => {
    let userA: any;
    let userB: any;

    beforeAll(async () => {
      userA = await createTestUser('hardening_iso_a', 'user_iso_a@hardening-test.ktv');
      userB = await createTestUser('hardening_iso_b', 'user_iso_b@hardening-test.ktv');
    });

    it('Public profile inspection strips email for other users', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${userB.id}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe(userB.username);
      // Security verification: email must NOT be returned
      expect(res.body.data.email).toBeUndefined();
    });

    it('Self profile inspection preserves email for authenticated owner', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${userB.id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe(userB.username);
      expect(res.body.data.email).toBe(userB.email);
    });

    it('Correlation ID header is returned on every response', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${userA.id}`)
        .set('x-request-id', 'test-custom-correlation-1234');

      expect(res.headers['x-request-id']).toBe('test-custom-correlation-1234');
    });
  });

  // =========================================================================
  // JOURNEY 7 — Failure Recovery & Reconciliation
  // =========================================================================
  describe('Journey 7 — Failure Recovery & Reconciliation Service', () => {
    let host: any;
    let member: any;
    let admin: any;
    let driftRoomId: string;
    let closedRoomId: string;

    beforeAll(async () => {
      host = await createTestUser('hardening_rec_host', 'rec_host@hardening-test.ktv');
      member = await createTestUser('hardening_rec_mem', 'rec_mem@hardening-test.ktv');
      admin = await createTestUser('hardening_admin', 'admin@hardening-test.ktv', 'admin');

      // Create room with 2 actual members
      const r1 = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Drift Lounge',
          category: 'hiphop',
          capacity: 4,
          visibility: 'public',
        });
      driftRoomId = r1.body.data.id;

      await request(app)
        .post(`/api/v1/rooms/${driftRoomId}/join`)
        .set('Authorization', `Bearer ${member.token}`);

      // Create closed room
      const r2 = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Closed Lounge',
          category: 'rock',
          capacity: 4,
          visibility: 'public',
        });
      closedRoomId = r2.body.data.id;
      await request(app)
        .post(`/api/v1/rooms/${closedRoomId}/close`)
        .set('Authorization', `Bearer ${host.token}`);
    });

    it('Reconciliation dryRun detects count drift without mutating database', async () => {
      // Artificially corrupt room participant count in DB to simulate crash after reservation
      await RoomModel.findByIdAndUpdate(driftRoomId, { currentParticipantsCount: 99 });

      const dryRunResult = await roomReconciliationService.reconcileRoom(driftRoomId, true);
      expect(dryRunResult?.reconciled).toBe(false);
      expect(dryRunResult?.drift).not.toBe(0);
      expect(dryRunResult?.storedCount).toBe(99);
      expect(dryRunResult?.actualActiveMembers).toBe(2);

      // Verify DB was NOT mutated in dry-run
      const room = await RoomModel.findById(driftRoomId);
      expect(room?.currentParticipantsCount).toBe(99);
    });

    it('Reconciliation live run repairs count drift to match actual active memberships', async () => {
      const liveResult = await roomReconciliationService.reconcileRoom(driftRoomId, false);
      expect(liveResult?.reconciled).toBe(true);
      expect(liveResult?.actualActiveMembers).toBe(2);

      // Verify DB was repaired
      const room = await RoomModel.findById(driftRoomId);
      expect(room?.currentParticipantsCount).toBe(2);
    });

    it('Reconciliation zeroes participant count on closed room', async () => {
      // Artificially corrupt closed room
      await RoomModel.findByIdAndUpdate(closedRoomId, { currentParticipantsCount: 5 });

      const result = await roomReconciliationService.reconcileRoom(closedRoomId, false);
      expect(result?.reconciled).toBe(true);

      const room = await RoomModel.findById(closedRoomId);
      expect(room?.currentParticipantsCount).toBe(0);
    });

    it('Admin reconciliation endpoint requires admin role', async () => {
      // Normal user attempts reconcile -> 403 Forbidden
      const unauthRes = await request(app)
        .post('/api/v1/rooms/reconcile?dryRun=true')
        .set('Authorization', `Bearer ${member.token}`);
      expect(unauthRes.status).toBe(403);

      // Admin user attempts reconcile -> 200 OK
      const adminRes = await request(app)
        .post('/api/v1/rooms/reconcile?dryRun=true')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.success).toBe(true);
      expect(adminRes.body.data.dryRun).toBe(true);
    });
  });

  // =========================================================================
  // CONCURRENCY & RACE CONDITION HARDENING
  // =========================================================================
  describe('Concurrency & Race Condition Hardening', () => {
    let host: any;
    let concurrencyUser: any;

    beforeAll(async () => {
      host = await createTestUser('hardening_race_host', 'race_host@hardening-test.ktv');
      concurrencyUser = await createTestUser('hardening_race_user', 'race_user@hardening-test.ktv');
    });

    it('Concurrent duplicate joins by same user do NOT double-reserve capacity', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Duplicate Join Lounge',
          category: 'pop',
          capacity: 10,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Fire 10 simultaneous join requests for the same user
      const joinPromises = Array.from({ length: 10 }).map(() =>
        request(app)
          .post(`/api/v1/rooms/${roomId}/join`)
          .set('Authorization', `Bearer ${concurrencyUser.token}`)
      );

      const results = await Promise.all(joinPromises);

      // All requests should resolve cleanly (201 newly joined or 200 already joined)
      results.forEach((res) => {
        expect([200, 201]).toContain(res.status);
        expect(res.body.success).toBe(true);
      });

      // Crucial verification: room capacity count MUST NOT be inflated beyond 2 (host + user)
      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(2);

      // Active memberships must be exactly 2
      const activeMemberships = await RoomMembershipModel.find({
        roomId,
        status: 'active',
      });
      expect(activeMemberships.length).toBe(2);
    });

    it('Concurrent joins at capacity boundary respect maximum capacity', async () => {
      // Room with capacity 3: 1 host + 2 available spots
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Capacity Race Lounge',
          category: 'hiphop',
          capacity: 3,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Create 5 distinct concurrent contenders
      const contenders = await Promise.all(
        Array.from({ length: 5 }).map((_, i) =>
          createTestUser(`contender_${i}`, `contender_${i}@hardening-test.ktv`)
        )
      );

      // Fire 5 simultaneous join requests for the 2 available slots
      const joinResults = await Promise.all(
        contenders.map((user) =>
          request(app)
            .post(`/api/v1/rooms/${roomId}/join`)
            .set('Authorization', `Bearer ${user.token}`)
        )
      );

      const successfulJoins = joinResults.filter((r) => r.status === 201 || r.status === 200);
      const rejectedJoins = joinResults.filter((r) => r.status === 409);

      // Exactly 2 contenders must win slots; exactly 3 contenders must receive 409
      expect(successfulJoins.length).toBe(2);
      expect(rejectedJoins.length).toBe(3);

      // Verify invariant: room is strictly at capacity 3
      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(3);

      const activeMemberships = await RoomMembershipModel.find({
        roomId,
        status: 'active',
      });
      expect(activeMemberships.length).toBe(3);
    });

    it('Join vs Close: Joining a closed room is rejected and rolls back capacity', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Close Race Lounge',
          category: 'ballad',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Close room
      await request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${host.token}`);

      // Attempt join
      const joinRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${concurrencyUser.token}`);

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.success).toBe(false);
      expect(joinRes.body.message).toContain('closed');

      // Verify count remains 0
      const room = await RoomModel.findById(roomId);
      expect(room?.currentParticipantsCount).toBe(0);
    });

    it('Capacity reduction race: Cannot reduce capacity below current occupancy', async () => {
      // Create room with capacity 5
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Hardening Cap Reduce Lounge',
          category: 'rnb',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Add two members so occupancy is 3 (host + user 1 + user 2)
      const user2 = await createTestUser('hardening_cap_red_2', 'cap_red_2@hardening-test.ktv');
      await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${concurrencyUser.token}`);
      await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${user2.token}`);

      // Host attempts to reduce capacity to 2 (valid number >= 2, but less than occupancy of 3)
      const reduceRes = await request(app)
        .patch(`/api/v1/rooms/${roomId}`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          capacity: 2,
        });

      expect(reduceRes.status).toBe(400);
      expect(reduceRes.body.success).toBe(false);
      expect(reduceRes.body.message).toContain('participant count');

      // Capacity remains 5
      const room = await RoomModel.findById(roomId);
      expect(room?.capacity).toBe(5);
    });
  });
});

