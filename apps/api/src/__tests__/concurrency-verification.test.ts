import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { roomReconciliationService } from '../modules/rooms/room-reconciliation.service.js';
import { roomService } from '../modules/rooms/room.service.js';
import { signAccessToken } from '../utils/jwt.js';
import { setAppShuttingDown } from '../utils/lifecycle.js';

describe('Sprint 1.6.1: Final Concurrency & Operational Verification', () => {
  const app = createApp();
  const testPassword = 'Password123!Verif';

  beforeAll(async () => {
    await connectDatabase();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    setAppShuttingDown(false);
    await disconnectDatabase();
  });

  async function cleanup() {
    const s161Rooms = await RoomModel.find({ name: { $regex: /Sprint161/ } }).select('_id');
    const roomIds = s161Rooms.map((r) => r._id);
    const s161Users = await UserModel.find({ email: { $regex: /@verif-test\.ktv/ } }).select('_id');
    const userIds = s161Users.map((u) => u._id);

    if (roomIds.length > 0 || userIds.length > 0) {
      await RoomMembershipModel.deleteMany({
        $or: [
          ...(roomIds.length > 0 ? [{ roomId: { $in: roomIds } }] : []),
          ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : []),
        ],
      });
    }
    await RoomModel.deleteMany({ name: { $regex: /Sprint161/ } });
    await UserModel.deleteMany({ email: { $regex: /@verif-test\.ktv/ } });
  }

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
  // SECTION 1: JOIN VS CLOSE ROOM RACE CONDITIONS
  // =========================================================================
  describe('1. Join vs Close Room Race Verification', () => {
    let host: any;
    let contender1: any;
    let contender2: any;

    beforeAll(async () => {
      host = await createTestUser('verif_race_host', 'host@verif-test.ktv');
      contender1 = await createTestUser('verif_race_c1', 'c1@verif-test.ktv');
      contender2 = await createTestUser('verif_race_c2', 'c2@verif-test.ktv');
    });

    it('Scenario 1: Join reserves capacity before Close -> Cleanly swept and zeroed', async () => {
      // Create room with 1 host (occupancy = 1)
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Race Room S1',
          category: 'pop',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // User joins successfully (count becomes 2)
      const joinRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${contender1.token}`);
      expect([200, 201]).toContain(joinRes.status);

      // Now host closes room
      const closeRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${host.token}`);
      expect(closeRes.status).toBe(200);

      // Invariants:
      // 1. Closed room status is 'closed'
      // 2. currentParticipantsCount is strictly 0
      // 3. All memberships (host and member) marked 'left'
      const roomInDb = await RoomModel.findById(roomId);
      expect(roomInDb?.status).toBe('closed');
      expect(roomInDb?.currentParticipantsCount).toBe(0);

      const activeMembers = await RoomMembershipModel.countDocuments({
        roomId,
        status: 'active',
      });
      expect(activeMembers).toBe(0);
    });

    it('Scenario 2: Close starts before Join reservation -> Join rejected with 400', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Race Room S2',
          category: 'rock',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Host closes room first
      await request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${host.token}`);

      // Contender attempts to join closed room
      const joinRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${contender1.token}`);

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.message).toContain('closed');

      // Invariants: count remains 0, active memberships = 0
      const roomInDb = await RoomModel.findById(roomId);
      expect(roomInDb?.currentParticipantsCount).toBe(0);

      const activeMembers = await RoomMembershipModel.countDocuments({
        roomId,
        status: 'active',
      });
      expect(activeMembers).toBe(0);
    });

    it('Scenario 3 & 4: Close occurs while Join is in-flight -> Post-join check catches and concludes membership', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Race Room S3S4',
          category: 'ballad',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Trigger Join and Close in parallel
      const [joinOutcome, closeOutcome] = await Promise.all([
        request(app)
          .post(`/api/v1/rooms/${roomId}/join`)
          .set('Authorization', `Bearer ${contender2.token}`),
        request(app)
          .post(`/api/v1/rooms/${roomId}/close`)
          .set('Authorization', `Bearer ${host.token}`),
      ]);

      expect(closeOutcome.status).toBe(200);
      expect(joinOutcome.status).toBeDefined();

      // Invariants check:
      // Regardless of who won the sub-millisecond race, final database state MUST be:
      // - status: 'closed'
      // - currentParticipantsCount: 0
      // - active memberships in RoomMembershipModel: 0
      const roomInDb = await RoomModel.findById(roomId);
      expect(roomInDb?.status).toBe('closed');
      expect(roomInDb?.currentParticipantsCount).toBe(0);

      const activeCount = await RoomMembershipModel.countDocuments({
        roomId,
        status: 'active',
      });
      expect(activeCount).toBe(0);
    });

    it('Scenario 5: Repeated Stress Race: 20 simultaneous Joins vs Close in parallel', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Stress Race Room',
          category: 'hiphop',
          capacity: 30,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Create 20 unique contenders
      const contenders = await Promise.all(
        Array.from({ length: 20 }).map((_, i) =>
          createTestUser(`stress_user_${i}`, `stress_${i}@verif-test.ktv`)
        )
      );

      // Fire 20 joins and 1 close concurrently in Promise.all
      const joinPromises = contenders.map((u) =>
        request(app)
          .post(`/api/v1/rooms/${roomId}/join`)
          .set('Authorization', `Bearer ${u.token}`)
      );
      const closePromise = request(app)
        .post(`/api/v1/rooms/${roomId}/close`)
        .set('Authorization', `Bearer ${host.token}`);

      await Promise.all([...joinPromises, closePromise]);

      // Strict Invariants:
      // 1. Room is definitively closed
      // 2. Count is strictly 0 (no negative counts, no leaked reservations)
      // 3. Exactly 0 active memberships exist for this room
      const finalRoom = await RoomModel.findById(roomId);
      expect(finalRoom?.status).toBe('closed');
      expect(finalRoom?.currentParticipantsCount).toBe(0);

      const survivingActive = await RoomMembershipModel.countDocuments({
        roomId,
        status: 'active',
      });
      expect(survivingActive).toBe(0);

      // 4. Retry behavior: subsequent join is definitively rejected with 400
      const subsequentJoin = await request(app)
        .post(`/api/v1/rooms/${roomId}/join`)
        .set('Authorization', `Bearer ${contenders[0].token}`);
      expect(subsequentJoin.status).toBe(400);
      expect(subsequentJoin.body.message).toContain('closed');
    });
  });

  // =========================================================================
  // SECTION 2: RECONCILIATION CONCURRENCY SAFETY
  // =========================================================================
  describe('2. Reconciliation Concurrency Safety Verification', () => {
    let host: any;
    let member: any;
    let admin: any;

    beforeAll(async () => {
      host = await createTestUser('verif_rec_host', 'rec_host@verif-test.ktv');
      member = await createTestUser('verif_rec_mem', 'rec_mem@verif-test.ktv');
      admin = await createTestUser('verif_rec_admin', 'rec_admin@verif-test.ktv', 'admin');
    });

    it('Scenario 1: Dry-run detects drift without mutating database', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Rec DryRun',
          category: 'pop',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Corrupt participant count in DB to simulate post-reservation crash
      await RoomModel.findByIdAndUpdate(roomId, { currentParticipantsCount: 42 });

      const dryRun = await roomReconciliationService.reconcileRoom(roomId, true);
      expect(dryRun?.drift).toBe(41); // 42 stored - 1 actual host
      expect(dryRun?.reconciled).toBe(false);
      expect(dryRun?.actionTaken).toBe('COUNT_REPAIRED');

      // Database MUST remain untouched at 42 in dry run
      const roomInDb = await RoomModel.findById(roomId);
      expect(roomInDb?.currentParticipantsCount).toBe(42);
    });

    it('Scenario 2: Live repair fixes known drift idempotently', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Rec Live',
          category: 'pop',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      await RoomModel.findByIdAndUpdate(roomId, { currentParticipantsCount: 99 });

      // Live repair run 1
      const repair1 = await roomReconciliationService.reconcileRoom(roomId, false);
      expect(repair1?.reconciled).toBe(true);
      expect(repair1?.actualActiveMembers).toBe(1);

      const roomAfterRepair1 = await RoomModel.findById(roomId);
      expect(roomAfterRepair1?.currentParticipantsCount).toBe(1);

      // Idempotency: Live repair run 2 (no drift exists now)
      const repair2 = await roomReconciliationService.reconcileRoom(roomId, false);
      expect(repair2?.reconciled).toBe(false);
      expect(repair2?.drift).toBe(0);
      expect(repair2?.actionTaken).toBe('NONE');
    });

    it('Scenario 3: Join happens while reconciliation is in-flight -> CAS aborts stale overwrite', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Rec CAS Join',
          category: 'rock',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Corrupt stored count to 10
      await RoomModel.findByIdAndUpdate(roomId, { currentParticipantsCount: 10 });

      // Deterministically simulate an interleaved join during the calculation window
      const countSpy = vi
        .spyOn(RoomMembershipModel, 'countDocuments')
        .mockImplementationOnce((() => ({
          exec: async () => {
            // Interleaved concurrent join mutates room in DB before CAS executes
            await RoomModel.findByIdAndUpdate(roomId, { $inc: { currentParticipantsCount: 1 } });
            return 2;
          },
        })) as any);

      const recResult = await roomReconciliationService.reconcileRoom(roomId, false);
      countSpy.mockRestore();

      // Invariants verified:
      // 1. Reconciliation detects concurrent mutation and aborts
      expect(recResult?.reconciled).toBe(false);
      expect(recResult?.actionTaken).toBe('ABORTED_CONCURRENT_MUTATION');

      // 2. Room in DB was NOT overwritten with stale snapshot
      const preservedRoom = await RoomModel.findById(roomId);
      expect(preservedRoom?.currentParticipantsCount).toBe(11);
    });

    it('Scenario 4: Leave happens while reconciliation is in-flight -> CAS aborts stale overwrite', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Rec CAS Leave',
          category: 'rock',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Corrupt stored count to 10
      await RoomModel.findByIdAndUpdate(roomId, { currentParticipantsCount: 10 });

      // Interleaved leave mutates room in DB during calculation
      const countSpy = vi
        .spyOn(RoomMembershipModel, 'countDocuments')
        .mockImplementationOnce((() => ({
          exec: async () => {
            await RoomModel.findByIdAndUpdate(roomId, { $inc: { currentParticipantsCount: -1 } });
            return 1;
          },
        })) as any);

      const recResult = await roomReconciliationService.reconcileRoom(roomId, false);
      countSpy.mockRestore();

      expect(recResult?.reconciled).toBe(false);
      expect(recResult?.actionTaken).toBe('ABORTED_CONCURRENT_MUTATION');

      const preservedRoom = await RoomModel.findById(roomId);
      expect(preservedRoom?.currentParticipantsCount).toBe(9);
    });

    it('Scenario 5: Close happens during reconciliation -> Closed room invariant enforced', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Rec Close Race',
          category: 'ballad',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Close room
      await roomService.closeRoom(roomId);

      // If reconciliation runs on a closed room, it MUST enforce 0
      const recClosed = await roomReconciliationService.reconcileRoom(roomId, false);
      expect(recClosed?.actualActiveMembers).toBe(0);

      const finalRoom = await RoomModel.findById(roomId);
      expect(finalRoom?.status).toBe('closed');
      expect(finalRoom?.currentParticipantsCount).toBe(0);
    });

    it('Scenario 6: Two reconciliation requests run concurrently -> Safe and idempotent', async () => {
      const roomRes = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          name: 'Sprint161 Concurrent Rec',
          category: 'hiphop',
          capacity: 5,
          visibility: 'public',
        });
      const roomId = roomRes.body.data.id;

      // Corrupt count
      await RoomModel.findByIdAndUpdate(roomId, { currentParticipantsCount: 50 });

      // Run two live repairs concurrently
      const [recA, recB] = await Promise.all([
        roomReconciliationService.reconcileRoom(roomId, false),
        roomReconciliationService.reconcileRoom(roomId, false),
      ]);

      expect(recA).toBeDefined();
      expect(recB).toBeDefined();

      // Exactly one must have performed the repair, or both resolved cleanly
      const finalRoom = await RoomModel.findById(roomId);
      expect(finalRoom?.currentParticipantsCount).toBe(1);
    });

    it('Scenario 7: Administrative authorization enforced', async () => {
      // Non-admin request rejected with 403 Forbidden
      const unauthRes = await request(app)
        .post('/api/v1/rooms/reconcile?dryRun=true')
        .set('Authorization', `Bearer ${member.token}`);
      expect(unauthRes.status).toBe(403);

      // Authorized admin request accepted with 200 OK
      const adminRes = await request(app)
        .post('/api/v1/rooms/reconcile?dryRun=true')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.success).toBe(true);
      expect(adminRes.body.data.dryRun).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 3: PROCESS ERROR & LIFECYCLE READINESS
  // =========================================================================
  describe('3. Process Error & Lifecycle Readiness Verification', () => {
    it('Readiness probe returns 200 when database is connected and app is running', async () => {
      setAppShuttingDown(false);
      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ready');
    });

    it('Readiness probe returns 503 when app enters shutting down state', async () => {
      setAppShuttingDown(true);
      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('shutting down');
      expect(res.body.data.status).toBe('not_ready');

      // Reset for remaining tests
      setAppShuttingDown(false);
    });

    it('Consolidated health probe returns 503 when app is shutting down', async () => {
      setAppShuttingDown(true);
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.data.status).toBe('degraded');

      setAppShuttingDown(false);
    });

    it('Correlation ID is preserved across request and response headers', async () => {
      const customId = 'verif-correlation-9988-7766';
      const res = await request(app)
        .get('/api/v1/health/live')
        .set('x-request-id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('Correlation ID is automatically generated when omitted', async () => {
      const res = await request(app).get('/api/v1/health/live');
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect((res.headers['x-request-id'] as string).length).toBeGreaterThan(10);
    });
  });
});
