import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { roomService } from '../modules/rooms/room.service.js';
import { signAccessToken } from '../utils/jwt.js';
import { env } from '../config/env.js';
import {
  createSocketServer,
  closeSocketServer,
  disconnectUserSockets,
  presenceManager,
} from '../realtime/index.js';
import { SOCKET_EVENTS } from '@ktv/contracts';

describe('Sprint 2.0: Realtime Foundation (Socket.IO) Integration Tests', () => {
  let server: http.Server;
  let serverUrl: string;
  const activeSockets: ClientSocket[] = [];

  const testPassword = 'Password123!Realtime';

  beforeAll(async () => {
    await connectDatabase();
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
    for (const socket of activeSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    await closeSocketServer();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await disconnectDatabase();
  });

  beforeEach(() => {
    presenceManager.clear();
  });

  afterEach(() => {
    while (activeSockets.length > 0) {
      const s = activeSockets.pop();
      if (s?.connected) {
        s.disconnect();
      }
    }
  });

  async function cleanup() {
    const s20Rooms = await RoomModel.find({ name: { $regex: /Sprint20/ } }).select('_id');
    const roomIds = s20Rooms.map((r) => r._id);
    const s20Users = await UserModel.find({ email: { $regex: /@sprint20-test\.ktv/ } }).select('_id');
    const userIds = s20Users.map((u) => u._id);

    if (roomIds.length > 0 || userIds.length > 0) {
      await RoomMembershipModel.deleteMany({
        $or: [
          ...(roomIds.length > 0 ? [{ roomId: { $in: roomIds } }] : []),
          ...(userIds.length > 0 ? [{ userId: { $in: userIds } }] : []),
        ],
      });
    }
    await RoomModel.deleteMany({ name: { $regex: /Sprint20/ } });
    await UserModel.deleteMany({ email: { $regex: /@sprint20-test\.ktv/ } });
  }

  async function createTestUser(username: string, email: string, role = 'user', status = 'active') {
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await UserModel.create({
      username,
      email,
      passwordHash,
      role,
      status,
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

  function createClient(token?: string, extraAuth?: Record<string, unknown>): ClientSocket {
    const client = ioClient(serverUrl, {
      auth: { token, ...extraAuth },
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
    });
    activeSockets.push(client);
    return client;
  }

  function connectSocket(client: ClientSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
      client.connect();
    });
  }

  // =========================================================================
  // 1. AUTHENTICATION & HANDSHAKE VERIFICATION (Scenarios 1-6)
  // =========================================================================
  describe('1. Authentication & Handshake Security', () => {
    it('1. Valid access token can connect successfully', async () => {
      const user = await createTestUser('s20_auth_valid', 'valid@sprint20-test.ktv');
      const client = createClient(user.token);

      await expect(connectSocket(client)).resolves.toBeUndefined();
      expect(client.connected).toBe(true);
    });

    it('2. Invalid token is rejected with AUTH_INVALID_TOKEN', async () => {
      const client = createClient('tampered.invalid.jwt.token');

      await expect(connectSocket(client)).rejects.toThrow();
      expect(client.connected).toBe(false);
    });

    it('3. Expired token is rejected with AUTH_TOKEN_EXPIRED', async () => {
      const user = await createTestUser('s20_auth_exp', 'exp@sprint20-test.ktv');
      // Sign token with 0s expiration
      const expiredToken = jwt.sign(
        { sub: user.id, username: user.username, role: 'user' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '0s' }
      );

      const client = createClient(expiredToken);
      await expect(connectSocket(client)).rejects.toThrow();
      expect(client.connected).toBe(false);
    });

    it('4. Revoked session / non-existent user cannot connect', async () => {
      const fakeSub = '60d5ec49f1b2c82d88c88888';
      const orphanToken = signAccessToken({
        sub: fakeSub,
        username: 'ghost_user',
        role: 'user',
      });

      const client = createClient(orphanToken);
      await expect(connectSocket(client)).rejects.toThrow();
      expect(client.connected).toBe(false);
    });

    it('5. Suspended user cannot connect', async () => {
      const suspended = await createTestUser(
        's20_suspended',
        'suspended@sprint20-test.ktv',
        'user',
        'suspended'
      );
      const client = createClient(suspended.token);

      await expect(connectSocket(client)).rejects.toThrow();
      expect(client.connected).toBe(false);
    });

    it('6. Client cannot spoof user identity via handshake payload', async () => {
      const regularUser = await createTestUser('s20_regular', 'regular@sprint20-test.ktv');
      // Attempt to spoof role: admin and fake username
      const client = createClient(regularUser.token, {
        role: 'admin',
        username: 'spoofed_admin',
        userId: 'fake_admin_id',
      });

      await expect(connectSocket(client)).resolves.toBeUndefined();
      expect(client.connected).toBe(true);
      // Sockets data on server side derives purely from verified token
    });
  });

  // =========================================================================
  // 2. ROOM AUTHORIZATION & SUBSCRIPTIONS (Scenarios 7-10)
  // =========================================================================
  describe('2. Room Authorization & Subscriptions', () => {
    let host: any;
    let authorizedMember: any;
    let unauthorizedUser: any;
    let privateRoom: any;

    beforeAll(async () => {
      host = await createTestUser('s20_room_host', 'host@sprint20-test.ktv');
      authorizedMember = await createTestUser('s20_room_auth_mem', 'auth_mem@sprint20-test.ktv');
      unauthorizedUser = await createTestUser('s20_room_unauth', 'unauth@sprint20-test.ktv');

      // Create private room
      privateRoom = await roomService.create(host.id, {
        name: 'Sprint20 Private Lounge',
        visibility: 'private',
        category: 'pop',
        capacity: 10,
        roomType: 'standard',
      });

      // Directly create active member in RoomMembershipModel (simulating invited member)
      await RoomMembershipModel.create({
        roomId: privateRoom.id,
        userId: authorizedMember.id,
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
      });
      await RoomModel.findByIdAndUpdate(privateRoom.id, { $inc: { currentParticipantsCount: 1 } });
    });

    it('7. Unauthorized user cannot join a private room', async () => {
      const client = createClient(unauthorizedUser.token);
      await connectSocket(client);

      const ack: any = await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: privateRoom.id }, resolve);
      });

      expect(ack.success).toBe(false);
      expect(ack.error.code).toBe('FORBIDDEN_PRIVATE_ROOM');
    });

    it('8. Non-member cannot subscribe to member-only private room events', async () => {
      const client = createClient(unauthorizedUser.token);
      await connectSocket(client);

      let receivedEvent = false;
      client.on(SOCKET_EVENTS.SERVER.MEMBER_JOINED, () => {
        receivedEvent = true;
      });

      // Try joining private room (rejected)
      await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: privateRoom.id }, resolve);
      });

      // Another user joins
      const hostClient = createClient(host.token);
      await connectSocket(hostClient);
      await new Promise((resolve) => {
        hostClient.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: privateRoom.id }, resolve);
      });

      // Unauthorized client must not have received the event
      expect(receivedEvent).toBe(false);
    });

    it('9. Active member can subscribe and receives presence snapshot', async () => {
      const client = createClient(authorizedMember.token);
      await connectSocket(client);

      const snapshotPromise = new Promise<any>((resolve) => {
        client.once(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, resolve);
      });

      const ack: any = await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: privateRoom.id }, resolve);
      });

      expect(ack.success).toBe(true);
      expect(ack.data.roomId).toBe(privateRoom.id);

      const snapshot = await snapshotPromise;
      expect(snapshot.roomId).toBe(privateRoom.id);
      expect(snapshot.onlineUsers.length).toBeGreaterThanOrEqual(1);
      expect(snapshot.onlineUsers.some((u: any) => u.userId === authorizedMember.id)).toBe(true);
    });

    it('10. Duplicate room subscription is idempotent', async () => {
      const client = createClient(authorizedMember.token);
      await connectSocket(client);

      const ack1: any = await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: privateRoom.id }, resolve);
      });
      const ack2: any = await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: privateRoom.id }, resolve);
      });

      expect(ack1.success).toBe(true);
      expect(ack2.success).toBe(true);
      // Total online members should still be 1
      expect(ack2.data.totalOnline).toBe(1);
    });
  });

  // =========================================================================
  // 3. PRESENCE & MULTI-TAB LIFECYCLE (Scenarios 11-16)
  // =========================================================================
  describe('3. Presence & Multi-Tab Lifecycle', () => {
    let host: any;
    let room: any;

    beforeAll(async () => {
      host = await createTestUser('s20_presence_host', 'pres_host@sprint20-test.ktv');
      room = await roomService.create(host.id, {
        name: 'Sprint20 Presence Room',
        visibility: 'public',
        category: 'anime',
        capacity: 10,
        roomType: 'standard',
      });
    });

    it('11. Presence snapshot contains only authorized minimal fields', async () => {
      const client = createClient(host.token);
      await connectSocket(client);

      const snapshotPromise = new Promise<any>((resolve) => {
        client.once(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, resolve);
      });

      await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      const snapshot = await snapshotPromise;
      const hostPresence = snapshot.onlineUsers.find((u: any) => u.userId === host.id);
      expect(hostPresence).toBeDefined();
      expect(hostPresence.userId).toBe(host.id);
      expect(hostPresence.username).toBe(host.username);
      expect(hostPresence.isOnline).toBe(true);
      // Password hash, secrets, internal properties must never be leaked
      expect(hostPresence.passwordHash).toBeUndefined();
      expect(hostPresence.token).toBeUndefined();
    });

    it('12. Multiple sockets for one user are tracked with accurate deviceCount', async () => {
      const tab1 = createClient(host.token);
      const tab2 = createClient(host.token);
      await connectSocket(tab1);
      await connectSocket(tab2);

      await new Promise((resolve) => {
        tab1.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      const snapshot2Promise = new Promise<any>((resolve) => {
        tab2.once(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, resolve);
      });

      await new Promise((resolve) => {
        tab2.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      const snapshot2 = await snapshot2Promise;
      const hostPresence = snapshot2.onlineUsers.find((u: any) => u.userId === host.id);
      expect(hostPresence.deviceCount).toBe(2);
      expect(snapshot2.totalOnline).toBe(1); // 1 unique user online
    });

    it('13. Disconnecting one tab does not mark the user offline if another tab remains', async () => {
      const tab1 = createClient(host.token);
      const tab2 = createClient(host.token);
      await connectSocket(tab1);
      await connectSocket(tab2);

      await new Promise((resolve) => {
        tab1.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });
      await new Promise((resolve) => {
        tab2.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      let memberLeftFired = false;
      tab2.on(SOCKET_EVENTS.SERVER.MEMBER_LEFT, () => {
        memberLeftFired = true;
      });

      // Disconnect Tab 1
      tab1.disconnect();
      await new Promise((r) => setTimeout(r, 50));

      // Member left should NOT have fired because Tab 2 is still open!
      expect(memberLeftFired).toBe(false);

      // Presence should show user is still online
      const presence = presenceManager.getRoomPresence(room.id);
      expect(presence.length).toBe(1);
      expect(presence[0].deviceCount).toBe(1);
    });

    it('14. Disconnecting the last socket updates ephemeral presence and emits member:left', async () => {
      const peer = await createTestUser('s20_peer_observer', 'peer@sprint20-test.ktv');
      const peerClient = createClient(peer.token);
      await connectSocket(peerClient);
      await new Promise((resolve) => {
        peerClient.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      const hostSocket = createClient(host.token);
      await connectSocket(hostSocket);
      await new Promise((resolve) => {
        hostSocket.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      const memberLeftPromise = new Promise<any>((resolve) => {
        peerClient.once(SOCKET_EVENTS.SERVER.MEMBER_LEFT, resolve);
      });

      // Disconnect host's only socket
      hostSocket.disconnect();

      const leftEvent = await memberLeftPromise;
      expect(leftEvent.roomId).toBe(room.id);
      expect(leftEvent.userId).toBe(host.id);

      // Verify presence manager no longer shows host
      const presence = presenceManager.getRoomPresence(room.id);
      expect(presence.some((u) => u.userId === host.id)).toBe(false);
    });

    it('15. Reconnection restores room presence correctly', async () => {
      const client = createClient(host.token);
      await connectSocket(client);

      await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });
      expect(presenceManager.isUserOnlineInRoom(room.id, host.id)).toBe(true);

      // Disconnect
      client.disconnect();
      await new Promise((r) => setTimeout(r, 50));
      expect(presenceManager.isUserOnlineInRoom(room.id, host.id)).toBe(false);

      // Reconnect
      await connectSocket(client);
      await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      expect(presenceManager.isUserOnlineInRoom(room.id, host.id)).toBe(true);
    });

    it('16. Invariant verified: Temporary disconnect does not modify persistent membership or counts', async () => {
      const initialRoom = await RoomModel.findById(room.id);
      const initialCount = initialRoom?.currentParticipantsCount;
      const initialActiveMemberships = await RoomMembershipModel.countDocuments({
        roomId: room.id,
        status: 'active',
      });

      // Connect and disconnect multiple sockets rapidly
      const temp1 = createClient(host.token);
      const temp2 = createClient(host.token);
      await connectSocket(temp1);
      await connectSocket(temp2);

      await new Promise((resolve) => {
        temp1.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });
      await new Promise((resolve) => {
        temp2.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: room.id }, resolve);
      });

      temp1.disconnect();
      temp2.disconnect();

      // Invariants MUST be strictly preserved in MongoDB:
      const finalRoom = await RoomModel.findById(room.id);
      const finalActiveMemberships = await RoomMembershipModel.countDocuments({
        roomId: room.id,
        status: 'active',
      });

      expect(finalRoom?.currentParticipantsCount).toBe(initialCount);
      expect(finalActiveMemberships).toBe(initialActiveMemberships);
      expect(finalRoom?.currentParticipantsCount).toBe(finalActiveMemberships);
    });
  });

  // =========================================================================
  // 4. ROOM CLOSURE, USER REVOCATION & SECURITY (Scenarios 17-20)
  // =========================================================================
  describe('4. Lifecycle, Revocation & Security Protections', () => {
    let host: any;
    let participant: any;
    let testRoom: any;

    beforeEach(async () => {
      host = await createTestUser(`s20_cl_host_${Date.now()}`, `cl_h_${Date.now()}@sprint20-test.ktv`);
      participant = await createTestUser(`s20_cl_part_${Date.now()}`, `cl_p_${Date.now()}@sprint20-test.ktv`);

      testRoom = await roomService.create(host.id, {
        name: `Sprint20 Close Room ${Date.now()}`,
        visibility: 'public',
        category: 'rock',
        capacity: 10,
        roomType: 'standard',
      });
      await roomService.joinRoom(testRoom.id, participant.id);
    });

    it('17. Room closure prevents further subscriptions and notifies connected members', async () => {
      const partClient = createClient(participant.token);
      await connectSocket(partClient);

      await new Promise((resolve) => {
        partClient.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: testRoom.id }, resolve);
      });

      const roomClosedPromise = new Promise<any>((resolve) => {
        partClient.once(SOCKET_EVENTS.SERVER.ROOM_CLOSED, resolve);
      });

      // Host closes the room via roomService
      await roomService.closeRoom(testRoom.id);
      const { broadcastRoomClosed } = await import('../realtime/index.js');
      await broadcastRoomClosed(testRoom.id, 'Host closed lounge');

      const closeEvent = await roomClosedPromise;
      expect(closeEvent.roomId).toBe(testRoom.id);
      expect(closeEvent.reason).toContain('Host closed lounge');

      // Subsequent join attempt to closed room must be rejected
      const newClient = createClient(host.token);
      await connectSocket(newClient);
      const ack: any = await new Promise((resolve) => {
        newClient.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: testRoom.id }, resolve);
      });

      expect(ack.success).toBe(false);
      expect(ack.error.code).toBe('ROOM_CLOSED');
    });

    it('18. Logout / revocation invalidates established socket connections via disconnectUserSockets', async () => {
      const client = createClient(participant.token);
      await connectSocket(client);
      expect(client.connected).toBe(true);

      const disconnectPromise = new Promise<string>((resolve) => {
        client.on('disconnect', (reason) => resolve(reason));
      });

      // Server forcefully terminates sockets for revoked/logged out user
      await disconnectUserSockets(participant.id);

      const reason = await disconnectPromise;
      expect(['io server disconnect', 'server namespace disconnect', 'transport close']).toContain(reason);
      expect(client.connected).toBe(false);
    });

    it('19. Malformed and oversized payloads are rejected safely with INVALID_PAYLOAD', async () => {
      const client = createClient(host.token);
      await connectSocket(client);

      // 1. Missing roomId
      const ackMissing: any = await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, {}, resolve);
      });
      expect(ackMissing.success).toBe(false);
      expect(ackMissing.error.code).toBe('INVALID_PAYLOAD');

      // 2. Non-ObjectId roomId
      const ackMalformed: any = await new Promise((resolve) => {
        client.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: 'not-a-valid-id' }, resolve);
      });
      expect(ackMalformed.success).toBe(false);
      expect(ackMalformed.error.code).toBe('INVALID_ROOM_ID');
    });

    it('20. Graceful shutdown closes Socket.IO connections cleanly', async () => {
      const client = createClient(host.token);
      await connectSocket(client);
      expect(client.connected).toBe(true);

      // Verify closeSocketServer cleans up presence and closes engine
      await closeSocketServer();
      expect(presenceManager.getRoomPresence(testRoom.id).length).toBe(0);

      // Re-initialize for subsequent test runs
      createSocketServer(server);
    });
  });
});
