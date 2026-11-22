import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import {
  MicApprovePayloadSchema,
  MicOwnershipSnapshotDtoSchema,
  MicReleasePayloadSchema,
  MicRequestPayloadSchema,
  SOCKET_EVENTS,
} from '@ktv/contracts';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import {
  checkTransactionSupport,
  isTransactionSupported,
  setTransactionSupported,
} from '../database/transaction.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { MicOwnershipModel, MAX_PENDING_MIC_REQUESTS } from '../modules/mic/mic-ownership.model.js';
import {
  micOwnershipService,
  MicOwnershipError,
} from '../modules/mic/mic-ownership.service.js';
import { signAccessToken } from '../utils/jwt.js';

describe('S3.2: Virtual Microphone Ownership Backend Domain', { timeout: 60000 }, () => {
  const app = createApp();
  let fastPasswordHash: string;
  let initialTxSupported = false;

  const createdUserIds: Types.ObjectId[] = [];
  const createdRoomIds: Types.ObjectId[] = [];

  interface TestUser {
    id: string;
    objectId: Types.ObjectId;
    username: string;
    token: string;
  }

  async function cleanup() {
    const testUsers = await UserModel.find({
      email: { $regex: /@s32-mic-test\.ktv$/ },
    })
      .select('_id')
      .exec();
    const userIds = testUsers.map((u) => u._id);

    const testRooms = await RoomModel.find({
      $or: [
        { name: { $regex: /^S32 Mic Test/ } },
        ...(userIds.length > 0 ? [{ ownerId: { $in: userIds } }] : []),
      ],
    })
      .select('_id')
      .exec();
    const roomIds = testRooms.map((r) => r._id);

    if (roomIds.length > 0) {
      await MicOwnershipModel.deleteMany({ roomId: { $in: roomIds } }).exec();
      await RoomMembershipModel.deleteMany({ roomId: { $in: roomIds } }).exec();
      await RoomModel.deleteMany({ _id: { $in: roomIds } }).exec();
    }
    if (userIds.length > 0) {
      await RoomMembershipModel.deleteMany({ userId: { $in: userIds } }).exec();
      await UserModel.deleteMany({ _id: { $in: userIds } }).exec();
    }
  }

  async function createTestUser(prefix: string): Promise<TestUser> {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const username = `${prefix}_${suffix}`.toLowerCase().slice(0, 28);
    const email = `${username}@s32-mic-test.ktv`;

    const user = await UserModel.create({
      username,
      displayName: `Display ${prefix}`,
      email,
      passwordHash: fastPasswordHash,
      role: 'user',
      status: 'active',
      avatar: `https://example.com/${username}.png`,
    });
    createdUserIds.push(user._id as Types.ObjectId);

    const token = signAccessToken({
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    });

    return {
      id: user._id.toString(),
      objectId: user._id as Types.ObjectId,
      username: user.username,
      token,
    };
  }

  async function createBulkUsers(count: number, prefix: string): Promise<TestUser[]> {
    const base = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const docs = Array.from({ length: count }, (_, idx) => {
      const username = `${prefix}_${idx}_${base}`.toLowerCase().slice(0, 28);
      return {
        username,
        displayName: `Singer ${idx}`,
        email: `${username}@s32-mic-test.ktv`,
        passwordHash: fastPasswordHash,
        role: 'user' as const,
        status: 'active' as const,
      };
    });
    const inserted = await UserModel.insertMany(docs);
    return inserted.map((u) => {
      createdUserIds.push(u._id as Types.ObjectId);
      return {
        id: u._id.toString(),
        objectId: u._id as Types.ObjectId,
        username: u.username,
        token: signAccessToken({
          sub: u._id.toString(),
          username: u.username,
          role: u.role,
        }),
      };
    });
  }

  async function createRoomWithHost(
    host: TestUser,
    options: { visibility?: 'public' | 'private'; capacity?: number } = {}
  ): Promise<string> {
    const room = await RoomModel.create({
      name: `S32 Mic Test Room ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: host.objectId,
      visibility: options.visibility ?? 'public',
      capacity: options.capacity ?? 50,
      status: 'idle',
      currentParticipantsCount: 1,
      stateVersion: 1,
    });
    createdRoomIds.push(room._id as Types.ObjectId);

    await RoomMembershipModel.create({
      roomId: room._id,
      userId: host.objectId,
      role: 'host',
      status: 'active',
    });

    return room._id.toString();
  }

  async function addMember(
    roomId: string,
    user: TestUser,
    role: 'member' | 'moderator' = 'member',
    overrides: { isMuted?: boolean; kickedAt?: Date | null; status?: 'active' | 'left' } = {}
  ): Promise<void> {
    await RoomMembershipModel.create({
      roomId: new Types.ObjectId(roomId),
      userId: user.objectId,
      role,
      status: overrides.status ?? 'active',
      isMuted: overrides.isMuted ?? false,
      kickedAt: overrides.kickedAt ?? null,
    });
  }

  beforeAll(async () => {
    await connectDatabase();
    initialTxSupported = await checkTransactionSupport();
    fastPasswordHash = await bcrypt.hash('TestPass123!', 4);
    await cleanup();
  });

  afterAll(async () => {
    setTransactionSupported(initialTxSupported);
    await cleanup();
    await disconnectDatabase();
  });

  beforeEach(() => {
    setTransactionSupported(initialTxSupported);
    vi.restoreAllMocks();
  });

  it('validates contracts schemas and SOCKET_EVENTS constants for mic domain', () => {
    expect(SOCKET_EVENTS.CLIENT.MIC_REQUEST).toBe('mic:request');
    expect(SOCKET_EVENTS.CLIENT.MIC_CANCEL).toBe('mic:cancel');
    expect(SOCKET_EVENTS.CLIENT.MIC_APPROVE).toBe('mic:approve');
    expect(SOCKET_EVENTS.CLIENT.MIC_REJECT).toBe('mic:reject');
    expect(SOCKET_EVENTS.CLIENT.MIC_RELEASE).toBe('mic:release');
    expect(SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST).toBe('mic:state:request');

    expect(SOCKET_EVENTS.SERVER.MIC_STATE).toBe('mic:state');
    expect(SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED).toBe('mic:request:created');
    expect(SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED).toBe('mic:request:cancelled');
    expect(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED).toBe('mic:ownership:changed');

    expect(MicRequestPayloadSchema.safeParse({ roomId: 'room-1' }).success).toBe(true);
    expect(MicApprovePayloadSchema.safeParse({ roomId: 'room-1', targetUserId: 'u-1' }).success).toBe(true);
    expect(
      MicReleasePayloadSchema.safeParse({
        roomId: 'room-1',
        expectedOwnershipVersion: 3,
        expectedSessionId: 'sess-1',
      }).success
    ).toBe(true);
  });

  it('1. initializes a room with AVAILABLE state and version 1', async () => {
    const host = await createTestUser('host_init');
    const roomId = await createRoomWithHost(host);

    const snapshot = await micOwnershipService.getSnapshot(roomId, host.id);
    expect(MicOwnershipSnapshotDtoSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.roomId).toBe(roomId);
    expect(snapshot.state).toBe('AVAILABLE');
    expect(snapshot.currentSingerId).toBeNull();
    expect(snapshot.currentSinger).toBeNull();
    expect(snapshot.currentSingerSessionId).toBeNull();
    expect(snapshot.pendingRequests).toEqual([]);
    expect(snapshot.ownershipVersion).toBe(1);
    expect(snapshot.grantedAt).toBeNull();
    expect(snapshot.expiresAt).toBeNull();
  });

  it('2 & 3. transitions AVAILABLE -> REQUEST_PENDING and preserves multiple FIFO requests', async () => {
    const host = await createTestUser('host_fifo');
    const u1 = await createTestUser('u1_fifo');
    const u2 = await createTestUser('u2_fifo');
    const u3 = await createTestUser('u3_fifo');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);
    await addMember(roomId, u2);
    await addMember(roomId, u3);

    const r1 = await micOwnershipService.requestMic(roomId, u1.id);
    expect(r1.changed).toBe(true);
    expect(r1.snapshot.state).toBe('REQUEST_PENDING');
    expect(r1.snapshot.ownershipVersion).toBe(2);

    const r2 = await micOwnershipService.requestMic(roomId, u2.id);
    expect(r2.snapshot.state).toBe('REQUEST_PENDING');
    expect(r2.snapshot.ownershipVersion).toBe(3);

    const r3 = await micOwnershipService.requestMic(roomId, u3.id);
    expect(r3.snapshot.ownershipVersion).toBe(4);
    expect(r3.snapshot.pendingRequests.map((p) => p.userId)).toEqual([u1.id, u2.id, u3.id]);
    expect(r3.snapshot.pendingRequests.every((p) => Boolean(p.requestId && p.requestedAt))).toBe(true);
  });

  it('4. enforces duplicate request idempotency sequentially and concurrently without version bump', async () => {
    const host = await createTestUser('host_dup');
    const u1 = await createTestUser('u1_dup');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);

    const first = await micOwnershipService.requestMic(roomId, u1.id);
    expect(first.changed).toBe(true);
    expect(first.idempotent).toBe(false);
    expect(first.snapshot.ownershipVersion).toBe(2);

    const second = await micOwnershipService.requestMic(roomId, u1.id);
    expect(second.changed).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.request.requestId).toBe(first.request.requestId);
    expect(second.snapshot.pendingRequests).toHaveLength(1);
    expect(second.snapshot.ownershipVersion).toBe(2);

    // Concurrent duplicate burst from another user
    const u2 = await createTestUser('u2_dup');
    await addMember(roomId, u2);
    const burst = await Promise.all(
      Array.from({ length: 6 }, () => micOwnershipService.requestMic(roomId, u2.id))
    );
    const winners = burst.filter((b) => b.changed);
    expect(winners).toHaveLength(1);
    const latest = await micOwnershipService.getSnapshot(roomId, host.id);
    expect(latest.pendingRequests.filter((p) => p.userId === u2.id)).toHaveLength(1);
    expect(latest.ownershipVersion).toBe(3);
  });

  it('5. enforces maximum pending request queue capacity of 20', async () => {
    const host = await createTestUser('host_cap');
    const roomId = await createRoomWithHost(host, { capacity: 50 });
    const users = await createBulkUsers(21, 'cap');

    await RoomMembershipModel.insertMany(
      users.map((u) => ({
        roomId: new Types.ObjectId(roomId),
        userId: u.objectId,
        role: 'member',
        status: 'active',
      }))
    );

    for (let i = 0; i < MAX_PENDING_MIC_REQUESTS; i++) {
      const res = await micOwnershipService.requestMic(roomId, users[i]!.id);
      expect(res.changed).toBe(true);
    }

    const fullSnap = await micOwnershipService.getSnapshot(roomId, host.id);
    expect(fullSnap.pendingRequests).toHaveLength(20);

    await expect(micOwnershipService.requestMic(roomId, users[20]!.id)).rejects.toMatchObject({
      code: 'MIC_REQUEST_QUEUE_FULL',
    });
  });

  it('6. handles request cancellation (REQUEST_PENDING -> AVAILABLE when last, stays REQUEST_PENDING otherwise)', async () => {
    const host = await createTestUser('host_cancel');
    const u1 = await createTestUser('u1_cancel');
    const u2 = await createTestUser('u2_cancel');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);
    await addMember(roomId, u2);

    await micOwnershipService.requestMic(roomId, u1.id);
    await micOwnershipService.requestMic(roomId, u2.id);

    const c1 = await micOwnershipService.cancelRequest(roomId, u1.id);
    expect(c1.snapshot.state).toBe('REQUEST_PENDING');
    expect(c1.snapshot.pendingRequests.map((r) => r.userId)).toEqual([u2.id]);
    expect(c1.snapshot.ownershipVersion).toBe(4);

    const c2 = await micOwnershipService.cancelRequest(roomId, u2.id);
    expect(c2.snapshot.state).toBe('AVAILABLE');
    expect(c2.snapshot.pendingRequests).toEqual([]);
    expect(c2.snapshot.ownershipVersion).toBe(5);
  });

  it('7 & 8. handles host approve, request while OCCUPIED, approve while OCCUPIED, and host reject', async () => {
    const host = await createTestUser('host_app');
    const u1 = await createTestUser('u1_app');
    const u2 = await createTestUser('u2_app');
    const u3 = await createTestUser('u3_app');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);
    await addMember(roomId, u2);
    await addMember(roomId, u3);

    await micOwnershipService.requestMic(roomId, u1.id);
    await micOwnershipService.requestMic(roomId, u2.id);

    // Host approves u1
    const approved = await micOwnershipService.approveRequest(roomId, host.id, u1.id);
    expect(approved.snapshot.state).toBe('OCCUPIED');
    expect(approved.snapshot.currentSingerId).toBe(u1.id);
    expect(approved.snapshot.currentSingerSessionId).toBeTruthy();
    expect(approved.snapshot.grantedAt).toBeTruthy();
    expect(approved.snapshot.pendingRequests.map((r) => r.userId)).toEqual([u2.id]);

    // u3 requests while OCCUPIED -> queued in FIFO, does not replace u1
    const reqWhileOccupied = await micOwnershipService.requestMic(roomId, u3.id);
    expect(reqWhileOccupied.snapshot.state).toBe('OCCUPIED');
    expect(reqWhileOccupied.snapshot.currentSingerId).toBe(u1.id);
    expect(reqWhileOccupied.snapshot.pendingRequests.map((r) => r.userId)).toEqual([u2.id, u3.id]);

    // Approve while OCCUPIED -> MIC_ALREADY_OCCUPIED
    await expect(
      micOwnershipService.approveRequest(roomId, host.id, u2.id)
    ).rejects.toMatchObject({ code: 'MIC_ALREADY_OCCUPIED' });

    // Host rejects u2
    const rejected = await micOwnershipService.rejectRequest(roomId, host.id, u2.id, {
      reason: 'Next song please',
    });
    expect(rejected.rejectedRequest.userId).toBe(u2.id);
    expect(rejected.snapshot.state).toBe('OCCUPIED');
    expect(rejected.snapshot.pendingRequests.map((r) => r.userId)).toEqual([u3.id]);

    // Singer releases -> transitions to REQUEST_PENDING (since u3 is waiting), then host rejects u3 -> AVAILABLE
    const released = await micOwnershipService.releaseMic(roomId, u1.id, {
      expectedSessionId: approved.grantedSessionId,
    });
    expect(released.snapshot.state).toBe('REQUEST_PENDING');
    expect(released.snapshot.currentSingerId).toBeNull();

    const rejectedLast = await micOwnershipService.rejectRequest(roomId, host.id, u3.id);
    expect(rejectedLast.snapshot.state).toBe('AVAILABLE');
    expect(rejectedLast.snapshot.pendingRequests).toEqual([]);
  });

  it('9 & 10. guarantees at most one official singer under Promise.all concurrent approvals', async () => {
    const host = await createTestUser('host_race');
    const contenders = await createBulkUsers(5, 'racer');
    const roomId = await createRoomWithHost(host);
    await RoomMembershipModel.insertMany(
      contenders.map((u) => ({
        roomId: new Types.ObjectId(roomId),
        userId: u.objectId,
        role: 'member',
        status: 'active',
      }))
    );

    for (const u of contenders) {
      await micOwnershipService.requestMic(roomId, u.id);
    }

    const results = await Promise.allSettled(
      contenders.map((u) => micOwnershipService.approveRequest(roomId, host.id, u.id))
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(contenders.length - 1);
    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(MicOwnershipError);
        expect(['MIC_ALREADY_OCCUPIED', 'STALE_OWNERSHIP_VERSION']).toContain(
          (r.reason as MicOwnershipError).code
        );
      }
    }

    const finalSnap = await micOwnershipService.getSnapshot(roomId, host.id);
    expect(finalSnap.state).toBe('OCCUPIED');
    expect(finalSnap.pendingRequests).toHaveLength(contenders.length - 1);
    expect(finalSnap.currentSingerId).toBe(
      (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof micOwnershipService.approveRequest>>>)
        .value.snapshot.currentSingerId
    );
  });

  it('11 & 12. validates singer voluntary release and rejects stale session / duplicate release', async () => {
    const host = await createTestUser('host_rel');
    const u1 = await createTestUser('u1_rel');
    const u2 = await createTestUser('u2_rel');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);
    await addMember(roomId, u2);

    await micOwnershipService.requestMic(roomId, u1.id);
    const grant1 = await micOwnershipService.approveRequest(roomId, host.id, u1.id);

    // Wrong sessionId rejected
    await expect(
      micOwnershipService.releaseMic(roomId, u1.id, {
        expectedSessionId: 'stale-or-invalid-session-id',
      })
    ).rejects.toMatchObject({ code: 'STALE_SINGER_SESSION' });

    // Concurrent duplicate releases -> only 1 succeeds
    const dupReleases = await Promise.allSettled([
      micOwnershipService.releaseMic(roomId, u1.id, {
        expectedSessionId: grant1.grantedSessionId,
        expectedOwnershipVersion: grant1.snapshot.ownershipVersion,
      }),
      micOwnershipService.releaseMic(roomId, u1.id, {
        expectedSessionId: grant1.grantedSessionId,
        expectedOwnershipVersion: grant1.snapshot.ownershipVersion,
      }),
    ]);
    expect(dupReleases.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(dupReleases.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // Grant u2 a brand new session (and verify u1's stale session cannot touch u2)
    await micOwnershipService.requestMic(roomId, u2.id);
    const grant2 = await micOwnershipService.approveRequest(roomId, host.id, u2.id);

    await expect(
      micOwnershipService.releaseMic(roomId, u1.id, {
        expectedSessionId: grant1.grantedSessionId,
      })
    ).rejects.toMatchObject({ code: 'STALE_SINGER_SESSION' });

    // Same user re-granted: old sessionId STILL cannot release new session
    await micOwnershipService.releaseMic(roomId, u2.id, {
      expectedSessionId: grant2.grantedSessionId,
    });
    await micOwnershipService.requestMic(roomId, u1.id);
    const grant3 = await micOwnershipService.approveRequest(roomId, host.id, u1.id);

    await expect(
      micOwnershipService.releaseMic(roomId, u1.id, {
        expectedSessionId: grant1.grantedSessionId,
      })
    ).rejects.toMatchObject({ code: 'STALE_SINGER_SESSION' });

    const snapAfterStale = await micOwnershipService.getSnapshot(roomId, host.id);
    expect(snapAfterStale.currentSingerId).toBe(u1.id);
    expect(snapAfterStale.currentSingerSessionId).toBe(grant3.grantedSessionId);
  });

  it('13. enforces exact version/session fencing on host force-release', async () => {
    const host = await createTestUser('host_frel');
    const u1 = await createTestUser('u1_frel');
    const u2 = await createTestUser('u2_frel');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);
    await addMember(roomId, u2);

    await micOwnershipService.requestMic(roomId, u1.id);
    const grant1 = await micOwnershipService.approveRequest(roomId, host.id, u1.id);

    // Unfenced host force-release is rejected
    await expect(micOwnershipService.releaseMic(roomId, host.id)).rejects.toMatchObject({
      code: 'FORCE_RELEASE_FENCING_REQUIRED',
    });

    // u1 releases, u2 takes ownership
    await micOwnershipService.releaseMic(roomId, u1.id, {
      expectedSessionId: grant1.grantedSessionId,
    });
    await micOwnershipService.requestMic(roomId, u2.id);
    const grant2 = await micOwnershipService.approveRequest(roomId, host.id, u2.id);

    // Host executes stale force-release with grant1's version/session -> MUST NOT release u2
    await expect(
      micOwnershipService.releaseMic(roomId, host.id, {
        expectedOwnershipVersion: grant1.snapshot.ownershipVersion,
      })
    ).rejects.toMatchObject({ code: 'STALE_OWNERSHIP_VERSION' });

    await expect(
      micOwnershipService.releaseMic(roomId, host.id, {
        expectedSessionId: grant1.grantedSessionId,
      })
    ).rejects.toMatchObject({ code: 'STALE_SINGER_SESSION' });

    // Exact observed fencing succeeds
    const forced = await micOwnershipService.releaseMic(roomId, host.id, {
      expectedOwnershipVersion: grant2.snapshot.ownershipVersion,
      expectedSessionId: grant2.grantedSessionId,
    });
    expect(forced.reason).toBe('host_forced_release');
    expect(forced.previousSingerId).toBe(u2.id);
    expect(forced.snapshot.state).toBe('AVAILABLE');
  });

  it('14. enforces authorization matrix & REST snapshot permissions', async () => {
    const host = await createTestUser('host_auth');
    const mod = await createTestUser('mod_auth');
    const member = await createTestUser('mem_auth');
    const outsider = await createTestUser('out_auth');
    const privateRoomId = await createRoomWithHost(host, { visibility: 'private' });
    await addMember(privateRoomId, mod, 'moderator');
    await addMember(privateRoomId, member, 'member');

    // Outsider cannot request mic
    await expect(micOwnershipService.requestMic(privateRoomId, outsider.id)).rejects.toMatchObject({
      code: 'FORBIDDEN_NOT_MEMBER',
    });

    await micOwnershipService.requestMic(privateRoomId, member.id);

    // Non-host (member & moderator) cannot approve or reject
    await expect(
      micOwnershipService.approveRequest(privateRoomId, mod.id, member.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_HOST' });
    await expect(
      micOwnershipService.rejectRequest(privateRoomId, member.id, member.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_HOST' });

    // Moderator cannot cancel member's request
    await expect(micOwnershipService.cancelRequest(privateRoomId, mod.id)).rejects.toMatchObject({
      code: 'REQUEST_NOT_FOUND',
    });

    // Host approves member
    const granted = await micOwnershipService.approveRequest(privateRoomId, host.id, member.id);

    // Moderator and outsider cannot release member's mic
    await expect(
      micOwnershipService.releaseMic(privateRoomId, mod.id, {
        expectedOwnershipVersion: granted.snapshot.ownershipVersion,
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN_MIC_RELEASE' });

    // REST GET /api/v1/rooms/:roomId/mic privacy & auth checks
    const unauthRes = await request(app).get(`/api/v1/rooms/${privateRoomId}/mic`);
    expect(unauthRes.status).toBe(401);

    const outsiderRes = await request(app)
      .get(`/api/v1/rooms/${privateRoomId}/mic`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(outsiderRes.status).toBe(403);

    const memberRes = await request(app)
      .get(`/api/v1/rooms/${privateRoomId}/mic`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.success).toBe(true);
    expect(memberRes.body.data.currentSingerId).toBe(member.id);
    expect(memberRes.body.data.state).toBe('OCCUPIED');

    // Public room REST read succeeds cleanly
    const publicRoomId = await createRoomWithHost(host, { visibility: 'public' });
    const pubRes = await request(app).get(`/api/v1/rooms/${publicRoomId}/mic`);
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.data.state).toBe('AVAILABLE');
  });

  it('15. enforces kicked/left/muted member blocks and departure cleanup hooks', async () => {
    const host = await createTestUser('host_klm');
    const kickedUser = await createTestUser('kick_u');
    const leftUser = await createTestUser('left_u');
    const mutedUser = await createTestUser('mute_u');
    const activeSinger = await createTestUser('sing_u');
    const roomId = await createRoomWithHost(host);

    await addMember(roomId, kickedUser, 'member', { status: 'left', kickedAt: new Date() });
    await addMember(roomId, leftUser, 'member', { status: 'left', kickedAt: null });
    await addMember(roomId, mutedUser, 'member', { isMuted: true });
    await addMember(roomId, activeSinger, 'member');

    await expect(micOwnershipService.requestMic(roomId, kickedUser.id)).rejects.toMatchObject({
      code: 'FORBIDDEN_KICKED',
    });
    await expect(micOwnershipService.requestMic(roomId, leftUser.id)).rejects.toMatchObject({
      code: 'FORBIDDEN_NOT_MEMBER',
    });
    await expect(micOwnershipService.requestMic(roomId, mutedUser.id)).rejects.toMatchObject({
      code: 'FORBIDDEN_USER_MUTED',
    });

    // Active singer gets approved, then departs ('disconnected') -> released cleanly
    await micOwnershipService.requestMic(roomId, activeSinger.id);
    const granted = await micOwnershipService.approveRequest(roomId, host.id, activeSinger.id);
    expect(granted.snapshot.currentSingerId).toBe(activeSinger.id);

    const dep = await micOwnershipService.handleMemberDeparted(
      roomId,
      activeSinger.id,
      'disconnected'
    );
    expect(dep).not.toBeNull();
    expect(dep?.releasedSinger).toBe(true);
    expect(dep?.ownershipReason).toBe('singer_disconnected');
    expect(dep?.snapshot.state).toBe('AVAILABLE');
    expect(dep?.snapshot.currentSingerId).toBeNull();
    expect(dep?.snapshot.currentSingerSessionId).toBeNull();

    // handleMemberMuted sweeps singer/pending request
    await micOwnershipService.requestMic(roomId, activeSinger.id);
    await micOwnershipService.approveRequest(roomId, host.id, activeSinger.id);
    const mutedSweep = await micOwnershipService.handleMemberMuted(roomId, activeSinger.id);
    expect(mutedSweep?.releasedSinger).toBe(true);
    expect(mutedSweep?.ownershipReason).toBe('singer_muted');
    expect(mutedSweep?.snapshot.state).toBe('AVAILABLE');
  });

  it('16. cleans up singer ownership and pending requests on room closure', async () => {
    const host = await createTestUser('host_close');
    const u1 = await createTestUser('u1_close');
    const u2 = await createTestUser('u2_close');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);
    await addMember(roomId, u2);

    await micOwnershipService.requestMic(roomId, u1.id);
    await micOwnershipService.approveRequest(roomId, host.id, u1.id);
    await micOwnershipService.requestMic(roomId, u2.id);

    const closed = await micOwnershipService.handleRoomClosed(roomId);
    expect(closed).not.toBeNull();
    expect(closed?.previousSingerId).toBe(u1.id);
    expect(closed?.removedRequests).toHaveLength(1);
    expect(closed?.snapshot.state).toBe('AVAILABLE');
    expect(closed?.snapshot.currentSingerId).toBeNull();
    expect(closed?.snapshot.currentSingerSessionId).toBeNull();
    expect(closed?.snapshot.pendingRequests).toEqual([]);

    // Closed room rejects further mutations
    await RoomModel.updateOne({ _id: new Types.ObjectId(roomId) }, { $set: { status: 'closed' } }).exec();
    await expect(micOwnershipService.requestMic(roomId, u2.id)).rejects.toMatchObject({
      code: 'FORBIDDEN_ROOM_CLOSED',
    });
  });

  it('17 & 19a. handles concurrent approve vs kick/leave race (both tx and fallback compensating rollback)', async () => {
    const runRaceCheck = async (txMode: boolean) => {
      setTransactionSupported(txMode);

      const host = await createTestUser(txMode ? 'h_tx' : 'h_fb');
      const target = await createTestUser(txMode ? 't_tx' : 't_fb');
      const roomId = await createRoomWithHost(host);
      await addMember(roomId, target);
      await micOwnershipService.requestMic(roomId, target.id);

      // Intercept MicOwnershipModel.findOneAndUpdate to kick the target member right after
      // approve's pre-check passes (forcing an in-flight cross-document race).
      const origFindOneAndUpdate = MicOwnershipModel.findOneAndUpdate.bind(MicOwnershipModel);
      let injectedKick = false;
      const spy = vi.spyOn(MicOwnershipModel, 'findOneAndUpdate').mockImplementation(((
        filter: unknown,
        update: unknown,
        options: unknown
      ) => {
        if (
          !injectedKick &&
          filter &&
          typeof filter === 'object' &&
          'state' in (filter as Record<string, unknown>) &&
          (filter as Record<string, unknown>).state === 'REQUEST_PENDING'
        ) {
          injectedKick = true;
          const query = origFindOneAndUpdate(filter as never, update as never, options as never);
          const origExec = query.exec.bind(query);
          query.exec = async () => {
            await RoomMembershipModel.updateOne(
              { roomId: new Types.ObjectId(roomId), userId: target.objectId },
              { $set: { status: 'left', kickedAt: new Date(), kickedBy: host.objectId } }
            ).exec();
            return origExec();
          };
          return query;
        }
        return origFindOneAndUpdate(filter as never, update as never, options as never);
      }) as typeof MicOwnershipModel.findOneAndUpdate);

      try {
        await expect(
          micOwnershipService.approveRequest(roomId, host.id, target.id)
        ).rejects.toMatchObject({ code: 'TARGET_MEMBERSHIP_LOST' });
      } finally {
        spy.mockRestore();
      }

      // Compensating rollback + departure cleanup leaves no kicked singer occupying the mic
      const after = await micOwnershipService.getSnapshot(roomId, host.id);
      expect(after.currentSingerId).toBeNull();
      expect(after.currentSingerSessionId).toBeNull();
      expect(after.state).not.toBe('OCCUPIED');
    };

    if (initialTxSupported) {
      await runRaceCheck(true);
    }
    await runRaceCheck(false);
  });

  it('18 & 19b. guarantees strict ownershipVersion monotonicity and single-winner Promise.all in standalone fallback', async () => {
    setTransactionSupported(false);
    expect(isTransactionSupported()).toBe(false);

    const host = await createTestUser('host_mono');
    const u1 = await createTestUser('u1_mono');
    const u2 = await createTestUser('u2_mono');
    const u3 = await createTestUser('u3_mono');
    const roomId = await createRoomWithHost(host);
    await addMember(roomId, u1);
    await addMember(roomId, u2);
    await addMember(roomId, u3);

    const s0 = await micOwnershipService.getSnapshot(roomId, host.id);
    const r1 = await micOwnershipService.requestMic(roomId, u1.id);
    const r2 = await micOwnershipService.requestMic(roomId, u2.id);
    const r3 = await micOwnershipService.requestMic(roomId, u3.id);

    expect([
      s0.ownershipVersion,
      r1.snapshot.ownershipVersion,
      r2.snapshot.ownershipVersion,
      r3.snapshot.ownershipVersion,
    ]).toEqual([1, 2, 3, 4]);

    // Concurrent approve race in standalone non-tx fallback mode
    const race = await Promise.allSettled([
      micOwnershipService.approveRequest(roomId, host.id, u1.id),
      micOwnershipService.approveRequest(roomId, host.id, u2.id),
      micOwnershipService.approveRequest(roomId, host.id, u3.id),
    ]);
    const winners = race.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);

    const winSnap = (
      winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof micOwnershipService.approveRequest>>>
    ).value.snapshot;
    expect(winSnap.ownershipVersion).toBe(5);
    expect(winSnap.state).toBe('OCCUPIED');

    const rel = await micOwnershipService.releaseMic(roomId, winSnap.currentSingerId!, {
      expectedSessionId: winSnap.currentSingerSessionId!,
    });
    expect(rel.snapshot.ownershipVersion).toBe(6);
    expect(rel.snapshot.state).toBe('REQUEST_PENDING');
  });
});
