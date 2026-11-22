import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import {
  MicOwnershipSnapshotDto,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { roomService } from '../modules/rooms/room.service.js';
import { MicOwnershipModel } from '../modules/mic/mic-ownership.model.js';
import { micOwnershipService } from '../modules/mic/mic-ownership.service.js';
import {
  broadcastMicLifecycleUpdate,
  resetMicBroadcastTracker,
} from '../modules/mic/mic.events.js';
import { micRequestLimiter } from '../modules/mic/mic-request.limiter.js';
import {
  broadcastRoomClosed,
  closeSocketServer,
  createSocketServer,
  getRoomDisconnectGracePeriodMs,
  presenceManager,
  setRoomDisconnectGracePeriodMs,
} from '../realtime/index.js';
import { signAccessToken } from '../utils/jwt.js';

describe(
  'S3.3: Virtual Microphone Ownership Socket.IO & Lifecycle Wiring',
  { timeout: 60000 },
  () => {
    let server: http.Server;
    let serverUrl: string;
    let fastPasswordHash: string;
    let originalGraceMs: number;
    const activeSockets: ClientSocket[] = [];

    interface TestUser {
      id: string;
      objectId: Types.ObjectId;
      username: string;
      token: string;
    }

    function createClient(token?: string): ClientSocket {
      const client = ioClient(serverUrl, {
        ...(token ? { auth: { token } } : {}),
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      activeSockets.push(client);
      return client;
    }

    function connectSocket(client: ClientSocket): Promise<void> {
      return new Promise((resolve, reject) => {
        if (client.connected) {
          resolve();
          return;
        }
        client.once('connect', () => resolve());
        client.once('connect_error', (err) => reject(err));
      });
    }

    function emitAck<T = unknown>(
      client: ClientSocket,
      event: string,
      payload: unknown
    ): Promise<SocketAckResponse<T>> {
      return new Promise((resolve) => {
        client.emit(event, payload, (ack: SocketAckResponse<T>) => resolve(ack));
      });
    }

    function waitForEvent<T = unknown>(
      client: ClientSocket,
      event: string,
      predicate?: (data: T) => boolean,
      timeoutMs = 5000
    ): Promise<T> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          client.off(event, handler);
          reject(new Error(`Timed out waiting for socket event "${event}"`));
        }, timeoutMs);

        const handler = (data: T) => {
          if (!predicate || predicate(data)) {
            clearTimeout(timer);
            client.off(event, handler);
            resolve(data);
          }
        };

        client.on(event, handler);
      });
    }

    async function joinRoomSocket(
      client: ClientSocket,
      roomId: string
    ): Promise<MicOwnershipSnapshotDto> {
      const micStatePromise = waitForEvent<MicOwnershipSnapshotDto>(
        client,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (snap) => snap.roomId === roomId
      );
      const joinAck = await emitAck(client, SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId });
      expect(joinAck.success).toBe(true);
      return micStatePromise;
    }

    async function cleanup() {
      const users = await UserModel.find({
        email: { $regex: /@s33-mic-test\.ktv$/ },
      })
        .select('_id')
        .exec();
      const userIds = users.map((u) => u._id);

      const rooms = await RoomModel.find({
        $or: [
          { name: { $regex: /^S33 Mic Test/ } },
          ...(userIds.length > 0 ? [{ ownerId: { $in: userIds } }] : []),
        ],
      })
        .select('_id')
        .exec();
      const roomIds = rooms.map((r) => r._id);

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
      const user = await UserModel.create({
        username,
        displayName: `User ${prefix}`,
        email: `${username}@s33-mic-test.ktv`,
        passwordHash: fastPasswordHash,
        role: 'user',
        status: 'active',
        avatar: `https://example.com/${username}.png`,
      });

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

    async function createRoomWithHost(
      host: TestUser,
      visibility: 'public' | 'private' = 'public'
    ): Promise<string> {
      const room = await RoomModel.create({
        name: `S33 Mic Test ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerId: host.objectId,
        visibility,
        capacity: 20,
        status: 'idle',
        currentParticipantsCount: 1,
        stateVersion: 1,
      });

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
      role: 'member' | 'moderator' = 'member'
    ): Promise<void> {
      await RoomMembershipModel.create({
        roomId: new Types.ObjectId(roomId),
        userId: user.objectId,
        role,
        status: 'active',
      });
      await RoomModel.updateOne(
        { _id: new Types.ObjectId(roomId) },
        { $inc: { currentParticipantsCount: 1 } }
      ).exec();
    }

    beforeAll(async () => {
      await connectDatabase();
      fastPasswordHash = await bcrypt.hash('TestPass123!', 4);
      originalGraceMs = getRoomDisconnectGracePeriodMs();
      await cleanup();

      const app = createApp();
      server = http.createServer(app);
      createSocketServer(server);

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const address = server.address() as AddressInfo;
          serverUrl = `http://localhost:${address.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      setRoomDisconnectGracePeriodMs(originalGraceMs);
      for (const s of activeSockets) {
        if (s.connected) s.disconnect();
      }
      await closeSocketServer();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await cleanup();
      await disconnectDatabase();
    });

    beforeEach(() => {
      presenceManager.clear();
      micRequestLimiter.clear();
      resetMicBroadcastTracker();
      setRoomDisconnectGracePeriodMs(originalGraceMs);
      vi.restoreAllMocks();
    });

    afterEach(() => {
      while (activeSockets.length > 0) {
        const s = activeSockets.pop();
        if (s?.connected) s.disconnect();
      }
      setRoomDisconnectGracePeriodMs(originalGraceMs);
    });

    // =====================================================================
    // SECTION A: SOCKET.IO HANDLERS & AUTHORIZATION
    // =====================================================================

    it('rejects unauthenticated sockets and enforces room join & membership on Socket.IO commands', async () => {
      const host = await createTestUser('h_unauth');
      const outsider = await createTestUser('out_unauth');
      const roomId = await createRoomWithHost(host, 'public');
      const privateRoomId = await createRoomWithHost(host, 'private');

      // Unauthenticated socket fails handshake
      const unauthSocket = createClient();
      await expect(connectSocket(unauthSocket)).rejects.toThrow(/Authentication token/i);

      // Connected outsider who has NOT called room:join cannot mutate
      const outsiderSocket = createClient(outsider.token);
      await connectSocket(outsiderSocket);

      const unjoinedAck = await emitAck(outsiderSocket, SOCKET_EVENTS.CLIENT.MIC_REQUEST, {
        roomId,
      });
      expect(unjoinedAck.success).toBe(false);
      expect(unjoinedAck.error?.code).toBe('FORBIDDEN_NOT_IN_ROOM');

      // Private room state request rejected for outsider
      const privStateAck = await emitAck(outsiderSocket, SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST, {
        roomId: privateRoomId,
      });
      expect(privStateAck.success).toBe(false);
      expect(privStateAck.error?.code).toBe('FORBIDDEN_PRIVATE_ROOM');

      // Public room viewer who joins channel still cannot request mic without active membership
      await joinRoomSocket(outsiderSocket, roomId);
      const nonMemberReq = await emitAck(outsiderSocket, SOCKET_EVENTS.CLIENT.MIC_REQUEST, {
        roomId,
      });
      expect(nonMemberReq.success).toBe(false);
      expect(nonMemberReq.error?.code).toBe('FORBIDDEN_NOT_MEMBER');

      // Invalid payloads rejected via Zod validation
      const invalidPayloadAck = await emitAck(outsiderSocket, SOCKET_EVENTS.CLIENT.MIC_REQUEST, {
        roomId: '',
      });
      expect(invalidPayloadAck.success).toBe(false);
      expect(invalidPayloadAck.error?.code).toBe('INVALID_PAYLOAD');
    });

    it('delivers initial MIC_STATE on room:join, broadcasts mutations to room, and handles MIC_STATE_REQUEST', async () => {
      const host = await createTestUser('h_sock');
      const m1 = await createTestUser('m1_sock');
      const m2 = await createTestUser('m2_sock');
      const roomId = await createRoomWithHost(host, 'private');
      await addMember(roomId, m1, 'moderator');
      await addMember(roomId, m2, 'member');

      const hostSock = createClient(host.token);
      const m1Sock = createClient(m1.token);
      const m2Sock = createClient(m2.token);
      await Promise.all([
        connectSocket(hostSock),
        connectSocket(m1Sock),
        connectSocket(m2Sock),
      ]);

      const [hInit, m1Init] = await Promise.all([
        joinRoomSocket(hostSock, roomId),
        joinRoomSocket(m1Sock, roomId),
      ]);
      expect(hInit.state).toBe('AVAILABLE');
      expect(hInit.ownershipVersion).toBe(1);
      expect(m1Init.ownershipVersion).toBe(1);

      // Member m1 requests mic -> room receives MIC_STATE + MIC_REQUEST_CREATED
      const hostNextState = waitForEvent<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.ownershipVersion === 2
      );
      const hostReqCreated = waitForEvent<{ request: { userId: string } }>(
        hostSock,
        SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED
      );

      const reqAck = await emitAck<MicOwnershipSnapshotDto>(
        m1Sock,
        SOCKET_EVENTS.CLIENT.MIC_REQUEST,
        { roomId }
      );
      expect(reqAck.success).toBe(true);
      expect(reqAck.data?.ownershipVersion).toBe(2);

      const [broadcastedSnap, createdEvt] = await Promise.all([hostNextState, hostReqCreated]);
      expect(broadcastedSnap.state).toBe('REQUEST_PENDING');
      expect(createdEvt.request.userId).toBe(m1.id);

      // Duplicate request does NOT bump version or broadcast
      let extraBroadcasts = 0;
      const countListener = () => {
        extraBroadcasts += 1;
      };
      hostSock.on(SOCKET_EVENTS.SERVER.MIC_STATE, countListener);
      const dupAck = await emitAck<MicOwnershipSnapshotDto>(
        m1Sock,
        SOCKET_EVENTS.CLIENT.MIC_REQUEST,
        { roomId }
      );
      await new Promise((r) => setTimeout(r, 100));
      hostSock.off(SOCKET_EVENTS.SERVER.MIC_STATE, countListener);
      expect(dupAck.success).toBe(true);
      expect(dupAck.data?.ownershipVersion).toBe(2);
      expect(extraBroadcasts).toBe(0);

      // Moderator/member cannot approve or reject
      const modApprove = await emitAck(m1Sock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
        roomId,
        targetUserId: m1.id,
      });
      expect(modApprove.success).toBe(false);
      expect(modApprove.error?.code).toBe('FORBIDDEN_NOT_HOST');

      // Host approves m1
      const m1OccupiedPromise = waitForEvent<MicOwnershipSnapshotDto>(
        m1Sock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.ownershipVersion === 3
      );
      const m1OwnershipChangedPromise = waitForEvent<{ currentSingerId: string; reason: string }>(
        m1Sock,
        SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED,
        (e) => e.reason === 'approved'
      );

      const approveAck = await emitAck<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.CLIENT.MIC_APPROVE,
        { roomId, targetUserId: m1.id }
      );
      expect(approveAck.success).toBe(true);
      expect(approveAck.data?.state).toBe('OCCUPIED');

      const [occSnap, chgEvt] = await Promise.all([
        m1OccupiedPromise,
        m1OwnershipChangedPromise,
      ]);
      expect(occSnap.currentSingerId).toBe(m1.id);
      expect(chgEvt.currentSingerId).toBe(m1.id);

      // Newly joined m2 receives current OCCUPIED state immediately on join
      const m2Init = await joinRoomSocket(m2Sock, roomId);
      expect(m2Init.state).toBe('OCCUPIED');
      expect(m2Init.currentSingerId).toBe(m1.id);
      expect(m2Init.ownershipVersion).toBe(3);

      // Unfenced host force-release fails; fenced host force-release succeeds
      const unfencedAck = await emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_RELEASE, { roomId });
      expect(unfencedAck.success).toBe(false);
      expect(unfencedAck.error?.code).toBe('FORCE_RELEASE_FENCING_REQUIRED');

      const m2ReqAck = await emitAck<MicOwnershipSnapshotDto>(
        m2Sock,
        SOCKET_EVENTS.CLIENT.MIC_REQUEST,
        { roomId }
      );
      expect(m2ReqAck.success).toBe(true);

      // Host force-releases m1 with exact version/session
      const forcedReleaseAck = await emitAck<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.CLIENT.MIC_RELEASE,
        {
          roomId,
          expectedOwnershipVersion: m2ReqAck.data!.ownershipVersion,
          expectedSessionId: occSnap.currentSingerSessionId!,
        }
      );
      expect(forcedReleaseAck.success).toBe(true);
      expect(forcedReleaseAck.data?.state).toBe('REQUEST_PENDING');
      expect(forcedReleaseAck.data?.currentSingerId).toBeNull();

      // Host rejects m2
      const rejectCancelledPromise = waitForEvent<{ userId: string; reason: string }>(
        m2Sock,
        SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED,
        (e) => e.reason === 'rejected'
      );
      const rejectAck = await emitAck<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.CLIENT.MIC_REJECT,
        { roomId, targetUserId: m2.id, reason: 'Try again later' }
      );
      expect(rejectAck.success).toBe(true);
      expect(rejectAck.data?.state).toBe('AVAILABLE');
      const rejEvt = await rejectCancelledPromise;
      expect(rejEvt.userId).toBe(m2.id);

      // Explicit MIC_STATE_REQUEST returns latest snapshot
      const stateReqAck = await emitAck<MicOwnershipSnapshotDto>(
        m2Sock,
        SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST,
        { roomId }
      );
      expect(stateReqAck.success).toBe(true);
      expect(stateReqAck.data?.ownershipVersion).toBe(rejectAck.data?.ownershipVersion);
    });

    it('applies rate limiting to mic:request spam without blocking mic:cancel or mic:release', async () => {
      const host = await createTestUser('h_rl');
      const u1 = await createTestUser('u1_rl');
      const roomId = await createRoomWithHost(host);
      await addMember(roomId, u1);

      const hostSock = createClient(host.token);
      const u1Sock = createClient(u1.token);
      await Promise.all([connectSocket(hostSock), connectSocket(u1Sock)]);
      await Promise.all([joinRoomSocket(hostSock, roomId), joinRoomSocket(u1Sock, roomId)]);

      // Consume 4 of 5 tokens synchronously so the 5th real Socket.IO request succeeds cleanly
      // without Atlas latency refilling tokens mid-loop, then 6th immediately rate-limits.
      for (let i = 0; i < 4; i++) {
        expect(micRequestLimiter.tryConsume(u1.id)).toBe(true);
      }

      const fifthReq = await emitAck(u1Sock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      expect(fifthReq.success).toBe(true);

      // Cancel must NOT be blocked even with 0 mic:request tokens left
      const cancelUnblocked = await emitAck(u1Sock, SOCKET_EVENTS.CLIENT.MIC_CANCEL, { roomId });
      expect(cancelUnblocked.success).toBe(true);

      // Next mic:request is rate limited
      const blocked = await emitAck(u1Sock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      expect(blocked.success).toBe(false);
      expect(blocked.error?.code).toBe('RATE_LIMIT_EXCEEDED');

      // Even while mic:request is exhausted, mic:cancel & mic:release remain unblocked:
      // Clear limiter temporarily to place u1 on stage, re-exhaust limiter, then test release & cancel.
      micRequestLimiter.clear();
      await emitAck(u1Sock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      const app = await emitAck<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.CLIENT.MIC_APPROVE,
        { roomId, targetUserId: u1.id }
      );
      expect(app.success).toBe(true);

      for (let i = 0; i < 5; i++) {
        micRequestLimiter.tryConsume(u1.id);
      }
      expect(micRequestLimiter.tryConsume(u1.id)).toBe(false);

      // Singer voluntary release MUST NOT be blocked by rate limiter
      const rel = await emitAck<MicOwnershipSnapshotDto>(
        u1Sock,
        SOCKET_EVENTS.CLIENT.MIC_RELEASE,
        { roomId, expectedSessionId: app.data!.currentSingerSessionId! }
      );
      expect(rel.success).toBe(true);
      expect(rel.data?.state).toBe('AVAILABLE');
    });

    // =====================================================================
    // SECTION B: ROOM LIFECYCLE INTEGRATION
    // =====================================================================

    it('cleans up mic ownership & pending requests on leaveRoom, kickMember, muteMember, and closeRoom while preserving state on transferHost', async () => {
      const host = await createTestUser('h_life');
      const singer = await createTestUser('s_life');
      const queuedUser = await createTestUser('q_life');
      const nextHost = await createTestUser('nh_life');
      const roomId = await createRoomWithHost(host);
      await addMember(roomId, singer);
      await addMember(roomId, queuedUser);
      await addMember(roomId, nextHost);

      const hostSock = createClient(host.token);
      const nextHostSock = createClient(nextHost.token);
      const singerSock = createClient(singer.token);
      await Promise.all([
        connectSocket(hostSock),
        connectSocket(nextHostSock),
        connectSocket(singerSock),
      ]);
      await Promise.all([
        joinRoomSocket(hostSock, roomId),
        joinRoomSocket(nextHostSock, roomId),
        joinRoomSocket(singerSock, roomId),
      ]);

      // 1. Leave releases singer + removes pending request
      await emitAck(singerSock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      await emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
        roomId,
        targetUserId: singer.id,
      });
      await micOwnershipService.requestMic(roomId, queuedUser.id);

      const stateAfterLeave = waitForEvent<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.currentSingerId === null && s.state === 'REQUEST_PENDING'
      );
      await roomService.leaveRoom(roomId, singer.id);
      const snapAfterSingerLeave = await stateAfterLeave;
      expect(snapAfterSingerLeave.pendingRequests.map((p) => p.userId)).toEqual([queuedUser.id]);

      const stateAfterQueueLeave = waitForEvent<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.state === 'AVAILABLE'
      );
      await roomService.leaveRoom(roomId, queuedUser.id);
      await stateAfterQueueLeave;

      // 2. Host transfer preserves singer ownership and transfers approval authority cleanly
      // Re-join room as active member after prior leaveRoom test
      await addMember(roomId, singer);
      const singerReqRes = await emitAck(singerSock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      expect(singerReqRes.success).toBe(true);
      const singerAppRes = await emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
        roomId,
        targetUserId: singer.id,
      });
      expect(singerAppRes.success).toBe(true);
      const transferRes = await roomService.transferHost(roomId, host.id, nextHost.id);
      expect(transferRes.success).toBe(true);

      const snapAfterTransfer = await micOwnershipService.getSnapshot(roomId, nextHost.id);
      expect(snapAfterTransfer.currentSingerId).toBe(singer.id);
      expect(snapAfterTransfer.state).toBe('OCCUPIED');

      // Previous host can no longer approve/reject; new host CAN force-release
      await emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      const oldHostReject = await emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_REJECT, {
        roomId,
        targetUserId: host.id,
      });
      expect(oldHostReject.success).toBe(false);
      expect(oldHostReject.error?.code).toBe('FORBIDDEN_NOT_HOST');

      const newHostForceRel = await emitAck<MicOwnershipSnapshotDto>(
        nextHostSock,
        SOCKET_EVENTS.CLIENT.MIC_RELEASE,
        {
          roomId,
          expectedSessionId: snapAfterTransfer.currentSingerSessionId!,
        }
      );
      expect(newHostForceRel.success).toBe(true);
      expect(newHostForceRel.data?.state).toBe('REQUEST_PENDING');

      // 3. Mute releases singer / removes pending request; unmute does NOT alter mic ownership
      await emitAck(nextHostSock, SOCKET_EVENTS.CLIENT.MIC_REJECT, {
        roomId,
        targetUserId: host.id,
      });
      await emitAck(singerSock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      await emitAck(nextHostSock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
        roomId,
        targetUserId: singer.id,
      });

      const mutedBroadcast = waitForEvent<MicOwnershipSnapshotDto>(
        nextHostSock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.state === 'AVAILABLE' && s.currentSingerId === null
      );
      await roomService.muteMember(roomId, nextHost.id, singer.id, true, 'Too loud');
      const snapAfterMute = await mutedBroadcast;
      const versionAfterMute = snapAfterMute.ownershipVersion;

      // Unmute does NOT alter mic ownership or ownershipVersion
      await roomService.muteMember(roomId, nextHost.id, singer.id, false);
      const snapAfterUnmute = await micOwnershipService.getSnapshot(roomId, nextHost.id);
      expect(snapAfterUnmute.ownershipVersion).toBe(versionAfterMute);
      expect(snapAfterUnmute.state).toBe('AVAILABLE');

      // 4. Kick removes pending request & releases singer ownership
      await emitAck(singerSock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      await emitAck(nextHostSock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
        roomId,
        targetUserId: singer.id,
      });

      const kickBroadcast = waitForEvent<MicOwnershipSnapshotDto>(
        nextHostSock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.state === 'AVAILABLE' && s.currentSingerId === null
      );
      await roomService.kickMember(roomId, nextHost.id, singer.id, 'Removed');
      await kickBroadcast;

      // 5. Room closure clears singer + queue cleanly
      await emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      await emitAck(nextHostSock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
        roomId,
        targetUserId: host.id,
      });

      const closeMicBroadcast = waitForEvent<MicOwnershipSnapshotDto>(
        nextHostSock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.state === 'AVAILABLE' && s.currentSingerId === null
      );
      await roomService.closeRoom(roomId);
      const closedSnap = await closeMicBroadcast;
      expect(closedSnap.pendingRequests).toEqual([]);
      await broadcastRoomClosed(roomId);
    });

    // =====================================================================
    // SECTION C: DISCONNECT GRACE PERIOD & MULTI-TAB PROTECTION
    // =====================================================================

    it('preserves ownership during grace window, cancels cleanup on reconnect, releases after expiry, and ignores single-tab closes', async () => {
      setRoomDisconnectGracePeriodMs(1500);

      const host = await createTestUser('h_grace');
      const singer = await createTestUser('s_grace');
      const roomId = await createRoomWithHost(host);
      await addMember(roomId, singer);

      const hostSock = createClient(host.token);
      const singerTab1 = createClient(singer.token);
      await Promise.all([connectSocket(hostSock), connectSocket(singerTab1)]);
      await Promise.all([joinRoomSocket(hostSock, roomId), joinRoomSocket(singerTab1, roomId)]);

      await emitAck(singerTab1, SOCKET_EVENTS.CLIENT.MIC_REQUEST, { roomId });
      await emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
        roomId,
        targetUserId: singer.id,
      });

      // Disconnect tab1 and reconnect well within 1500ms grace window
      singerTab1.disconnect();
      await new Promise((r) => setTimeout(r, 120));

      // Ownership still intact before grace expires
      const midGraceSnap = await micOwnershipService.getSnapshot(roomId, host.id);
      expect(midGraceSnap.currentSingerId).toBe(singer.id);
      expect(midGraceSnap.state).toBe('OCCUPIED');

      // Reconnect within grace window -> generation fence cancels timer
      const singerReconnected = createClient(singer.token);
      await connectSocket(singerReconnected);
      await joinRoomSocket(singerReconnected, roomId);

      // Wait well past 1500ms -> singer MUST STILL hold ownership
      await new Promise((r) => setTimeout(r, 1700));
      const postReconnectSnap = await micOwnershipService.getSnapshot(roomId, host.id);
      expect(postReconnectSnap.currentSingerId).toBe(singer.id);
      expect(postReconnectSnap.state).toBe('OCCUPIED');

      // Multi-tab: open tab2, disconnect reconnected tab1 -> tab2 remains connected so mic stays OCCUPIED
      const singerTab2 = createClient(singer.token);
      await connectSocket(singerTab2);
      await joinRoomSocket(singerTab2, roomId);

      singerReconnected.disconnect();
      await new Promise((r) => setTimeout(r, 1700));
      const multiTabSnap = await micOwnershipService.getSnapshot(roomId, host.id);
      expect(multiTabSnap.currentSingerId).toBe(singer.id);
      expect(multiTabSnap.state).toBe('OCCUPIED');

      // Now disconnect last remaining tab (tab2) and let 1500ms grace expire -> auto-releases + broadcasts MIC_STATE
      const expiredBroadcast = waitForEvent<MicOwnershipSnapshotDto>(
        hostSock,
        SOCKET_EVENTS.SERVER.MIC_STATE,
        (s) => s.state === 'AVAILABLE' && s.currentSingerId === null
      );
      singerTab2.disconnect();
      const postGraceSnap = await expiredBroadcast;
      expect(postGraceSnap.currentSingerId).toBeNull();
      expect(postGraceSnap.currentSingerSessionId).toBeNull();
    });

    // =====================================================================
    // SECTION D: CONCURRENCY & STALE CLEANUP RACES
    // =====================================================================

    it('handles approve vs kick/leave/mute/close races, concurrent cleanups, stale session cleanup, and monotonic subscriber versions', async () => {
      const host = await createTestUser('h_conc');
      const uKick = await createTestUser('u_kick');
      const uLeave = await createTestUser('u_leave');
      const uMute = await createTestUser('u_mute');
      const uClose = await createTestUser('u_close');

      // 1. Approve vs Kick
      const rKick = await createRoomWithHost(host);
      await addMember(rKick, uKick);
      const hostSock = createClient(host.token);
      await connectSocket(hostSock);
      await joinRoomSocket(hostSock, rKick);

      const observedVersions: number[] = [];
      hostSock.on(SOCKET_EVENTS.SERVER.MIC_STATE, (s: MicOwnershipSnapshotDto) => {
        if (s.roomId === rKick) observedVersions.push(s.ownershipVersion);
      });

      await micOwnershipService.requestMic(rKick, uKick.id);
      await Promise.allSettled([
        emitAck(hostSock, SOCKET_EVENTS.CLIENT.MIC_APPROVE, {
          roomId: rKick,
          targetUserId: uKick.id,
        }),
        roomService.kickMember(rKick, host.id, uKick.id, 'Concurrent kick'),
      ]);
      await new Promise((r) => setTimeout(r, 150));
      const finalKickSnap = await micOwnershipService.getSnapshot(rKick, host.id);
      expect(finalKickSnap.currentSingerId).toBeNull();
      expect(finalKickSnap.pendingRequests).toEqual([]);
      for (let i = 1; i < observedVersions.length; i++) {
        expect(observedVersions[i]).toBeGreaterThan(observedVersions[i - 1]!);
      }

      // 2. Approve vs Leave
      const rLeave = await createRoomWithHost(host);
      await addMember(rLeave, uLeave);
      await micOwnershipService.requestMic(rLeave, uLeave.id);
      await Promise.allSettled([
        micOwnershipService.approveRequest(rLeave, host.id, uLeave.id),
        roomService.leaveRoom(rLeave, uLeave.id),
      ]);
      const finalLeaveSnap = await micOwnershipService.getSnapshot(rLeave, host.id);
      expect(finalLeaveSnap.currentSingerId).toBeNull();
      expect(finalLeaveSnap.pendingRequests).toEqual([]);

      // 3. Approve vs Mute
      const rMute = await createRoomWithHost(host);
      await addMember(rMute, uMute);
      await micOwnershipService.requestMic(rMute, uMute.id);
      await Promise.allSettled([
        micOwnershipService.approveRequest(rMute, host.id, uMute.id),
        roomService.muteMember(rMute, host.id, uMute.id, true, 'Concurrent mute'),
      ]);
      const finalMuteSnap = await micOwnershipService.getSnapshot(rMute, host.id);
      expect(finalMuteSnap.currentSingerId).toBeNull();
      expect(finalMuteSnap.pendingRequests).toEqual([]);

      // 4. Approve vs Room Closure
      const rClose = await createRoomWithHost(host);
      await addMember(rClose, uClose);
      await micOwnershipService.requestMic(rClose, uClose.id);
      await Promise.allSettled([
        micOwnershipService.approveRequest(rClose, host.id, uClose.id),
        roomService.closeRoom(rClose),
      ]);
      const finalCloseSnap = await micOwnershipService.getSnapshot(rClose, host.id);
      expect(finalCloseSnap.state).toBe('AVAILABLE');
      expect(finalCloseSnap.currentSingerId).toBeNull();
      expect(finalCloseSnap.pendingRequests).toEqual([]);

      // 5. Concurrent lifecycle cleanup & stale expectedSessionId fencing
      const rFence = await createRoomWithHost(host);
      await addMember(rFence, uKick);
      await micOwnershipService.requestMic(rFence, uKick.id);
      const grant1 = await micOwnershipService.approveRequest(rFence, host.id, uKick.id);
      await micOwnershipService.releaseMic(rFence, uKick.id, {
        expectedSessionId: grant1.grantedSessionId,
      });
      await micOwnershipService.requestMic(rFence, uKick.id);
      const grant2 = await micOwnershipService.approveRequest(rFence, host.id, uKick.id);

      // Stale cleanup carrying old session1 must NOT release session2
      const staleCleanup = await micOwnershipService.handleMemberDeparted(
        rFence,
        uKick.id,
        'disconnected',
        { expectedSessionId: grant1.grantedSessionId }
      );
      expect(staleCleanup).toBeNull();
      const stillGrant2 = await micOwnershipService.getSnapshot(rFence, host.id);
      expect(stillGrant2.currentSingerSessionId).toBe(grant2.grantedSessionId);

      // Simultaneous cleanup calls only perform one sweep
      const cleanups = await Promise.all([
        micOwnershipService.handleMemberDeparted(rFence, uKick.id, 'kicked'),
        micOwnershipService.handleMemberDeparted(rFence, uKick.id, 'disconnected'),
      ]);
      expect(cleanups.filter((c) => c !== null)).toHaveLength(1);
      await broadcastMicLifecycleUpdate(null, rFence, null); // safe no-op guard
    });
  }
);
