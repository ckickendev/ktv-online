import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { AddressInfo } from 'net';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { TrackSource } from 'livekit-server-sdk';
import { SOCKET_EVENTS } from '@ktv/contracts';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../database/connection.js';
import { env } from '../config/env.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import { SessionModel } from '../modules/auth/session.model.js';
import { VoiceWebhookEventModel } from '../modules/voice/voice-webhook-event.model.js';
import { VoiceParticipantSequenceModel } from '../modules/voice/voice-participant-sequence.model.js';
import { authService } from '../modules/auth/auth.service.js';
import { roomService } from '../modules/rooms/room.service.js';
import { voiceService } from '../modules/voice/voice.service.js';
import { voiceSessionRegistry } from '../modules/voice/voice-session.registry.js';
import { voicePresenceStore } from '../modules/voice/voice-presence.store.js';
import { createVoiceTokenRateLimiter } from '../middlewares/rate-limiter.middleware.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { voiceController } from '../modules/voice/voice.controller.js';
import { signAccessToken, hashToken } from '../utils/jwt.js';
import {
  createSocketServer,
  closeSocketServer,
  presenceManager,
} from '../realtime/index.js';

describe('S2: LiveKit Voice Infrastructure & Hardening Tests', { timeout: 20000 }, () => {
  const app = createApp();
  let server: http.Server;
  let serverUrl: string;
  const activeSockets: ClientSocket[] = [];

  const testApiKey = 'lk_test_api_key_s2';
  const testApiSecret = 'lk_test_api_secret_s2_minimum_32_characters_long';
  const testLiveKitUrl = 'wss://test-ktv-s2.livekit.cloud';
  const testPassword = 'Password123!VoiceTest';

  let origLiveKitUrl: string | undefined;
  let origLiveKitKey: string | undefined;
  let origLiveKitSecret: string | undefined;
  let origWebhookSecret: string | undefined;

  const mockRoomClient = {
    listParticipants: vi.fn(async () => [] as Array<{ identity: string; metadata?: string; tracks?: Array<{ sid: string; source?: number; type?: number }> }>),
    removeParticipant: vi.fn(async () => {}),
    updateParticipant: vi.fn(async () => {}),
    mutePublishedTrack: vi.fn(async () => {}),
    deleteRoom: vi.fn(async () => {}),
  };

  function signWebhookPayload(rawBody: string): string {
    const sha256 = crypto.createHash('sha256').update(rawBody).digest('base64');
    return jwt.sign({ iss: testApiKey, sha256 }, testApiSecret, { expiresIn: '5m' });
  }

  async function createTestUser(username: string, email: string, options?: { status?: 'active' | 'suspended'; familyId?: string }) {
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await UserModel.create({
      username,
      email,
      passwordHash,
      role: 'user',
      status: options?.status ?? 'active',
      displayName: `${username} Display`,
    });

    const familyId = options?.familyId ?? crypto.randomUUID();
    const refreshToken = `refresh_${crypto.randomUUID()}`;
    await SessionModel.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isRevoked: false,
    });

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
      familyId,
    });

    return {
      id: user._id.toString(),
      username,
      email,
      familyId,
      accessToken,
      refreshToken,
    };
  }

  async function cleanup() {
    const rooms = await RoomModel.find({ name: { $regex: /S2VoiceTest/ } }).select('_id');
    const roomIds = rooms.map((r) => r._id);
    const users = await UserModel.find({ email: { $regex: /@s2-voice-test\.ktv/ } }).select('_id');
    const userIds = users.map((u) => u._id);

    if (roomIds.length > 0) {
      await RoomMembershipModel.deleteMany({ roomId: { $in: roomIds } });
      await RoomModel.deleteMany({ _id: { $in: roomIds } });
    }
    if (userIds.length > 0) {
      await SessionModel.deleteMany({ userId: { $in: userIds } });
      await UserModel.deleteMany({ _id: { $in: userIds } });
    }
    await VoiceWebhookEventModel.deleteMany({ roomName: { $regex: /^ktv_room_/ } });
    await VoiceParticipantSequenceModel.deleteMany({ participantKey: { $regex: /^ktv_room_/ } });
  }

  async function connectSocket(token: string): Promise<ClientSocket> {
    const client = ioClient(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    activeSockets.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', (err) => reject(err));
    });
    return client;
  }

  beforeAll(async () => {
    origLiveKitUrl = env.LIVEKIT_URL;
    origLiveKitKey = env.LIVEKIT_API_KEY;
    origLiveKitSecret = env.LIVEKIT_API_SECRET;
    origWebhookSecret = env.LIVEKIT_WEBHOOK_SECRET;

    (env as any).LIVEKIT_URL = testLiveKitUrl;
    (env as any).LIVEKIT_API_KEY = testApiKey;
    (env as any).LIVEKIT_API_SECRET = testApiSecret;
    (env as any).LIVEKIT_WEBHOOK_SECRET = testApiSecret;

    vi.spyOn(voiceService, 'getClient').mockReturnValue(mockRoomClient as any);

    await connectDatabase();
    await cleanup();

    server = http.createServer(app);
    createSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        serverUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const s of activeSockets) {
      if (s.connected) s.disconnect();
    }
    await closeSocketServer();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await disconnectDatabase();

    (env as any).LIVEKIT_URL = origLiveKitUrl;
    (env as any).LIVEKIT_API_KEY = origLiveKitKey;
    (env as any).LIVEKIT_API_SECRET = origLiveKitSecret;
    (env as any).LIVEKIT_WEBHOOK_SECRET = origWebhookSecret;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    presenceManager.clear();
    voiceSessionRegistry.clear();
    voicePresenceStore.clear();
  });

  afterEach(() => {
    while (activeSockets.length > 0) {
      const s = activeSockets.pop();
      if (s?.connected) s.disconnect();
    }
  });

  describe('Priority 1: Security, Token Authorization, Session Family & Rate Limiting', () => {
    it('rejects unauthenticated requests with 401 and invalid roomId with 400 INVALID_ROOM_ID', async () => {
      const user = await createTestUser('s2_auth_u1', 's2_auth_u1@s2-voice-test.ktv');

      const unauthRes = await request(app).post('/api/v1/rooms/507f1f77bcf86cd799439011/voice/token').send({});
      expect(unauthRes.status).toBe(401);

      const invalidRoomRes = await request(app)
        .post('/api/v1/rooms/not-a-valid-object-id/voice/token')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({});

      expect(invalidRoomRes.status).toBe(400);
      expect(invalidRoomRes.body.error.code).toBe('INVALID_ROOM_ID');
    });

    it('rejects non-members, kicked members, and closed rooms', async () => {
      const host = await createTestUser('s2_host_auth', 's2_host_auth@s2-voice-test.ktv');
      const outsider = await createTestUser('s2_outsider', 's2_outsider@s2-voice-test.ktv');
      const kicked = await createTestUser('s2_kicked', 's2_kicked@s2-voice-test.ktv');

      const room = await roomService.create(host.id, {
        name: 'S2VoiceTest Auth Room',
        capacity: 8,
        visibility: 'public',
        roomType: 'standard',
        category: 'all',
        isChatEnabled: true,
        atmospherePreset: 'midnight_lounge',
      });

      // Non-member rejected
      const outsiderRes = await request(app)
        .post(`/api/v1/rooms/${room._id.toString()}/voice/token`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({});
      expect(outsiderRes.status).toBe(403);
      expect(outsiderRes.body.error.code).toBe('FORBIDDEN_NOT_MEMBER');

      // Join then kick user
      await roomService.joinRoom(room._id.toString(), kicked.id);
      await roomService.kickMember(room._id.toString(), host.id, kicked.id, 'Testing kick');

      const kickedRes = await request(app)
        .post(`/api/v1/rooms/${room._id.toString()}/voice/token`)
        .set('Authorization', `Bearer ${kicked.accessToken}`)
        .send({});
      expect(kickedRes.status).toBe(403);

      // Close room -> host rejected
      await roomService.closeRoom(room._id.toString());
      const closedRes = await request(app)
        .post(`/api/v1/rooms/${room._id.toString()}/voice/token`)
        .set('Authorization', `Bearer ${host.accessToken}`)
        .send({});
      expect(closedRes.status).toBe(403);
      expect(closedRes.body.error.code).toBe('FORBIDDEN_ROOM_CLOSED');
    });

    it('issues short-lived microphone-only tokens with server-generated identity and restricts muted members', async () => {
      const host = await createTestUser('s2_host_grant', 's2_host_grant@s2-voice-test.ktv');
      const member = await createTestUser('s2_mem_grant', 's2_mem_grant@s2-voice-test.ktv');

      const room = await roomService.create(host.id, {
        name: 'S2VoiceTest Grants Room',
        capacity: 8,
        visibility: 'public',
        roomType: 'standard',
        category: 'all',
        isChatEnabled: true,
        atmospherePreset: 'midnight_lounge',
      });
      const roomId = room._id.toString();
      await roomService.joinRoom(roomId, member.id);

      // Unmuted member gets canPublish: true, TrackSource.MICROPHONE only
      const res1 = await request(app)
        .post(`/api/v1/rooms/${roomId}/voice/token`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ tabId: 'tab01' });

      expect(res1.status).toBe(200);
      expect(res1.body.data.roomName).toBe(`ktv_room_${roomId}`);
      expect(res1.body.data.participantIdentity).toMatch(new RegExp(`^${member.id}_vps_`));

      const decoded1 = jwt.verify(res1.body.data.token, testApiSecret) as any;
      expect(decoded1.video.room).toBe(`ktv_room_${roomId}`);
      expect(decoded1.video.canPublish).toBe(true);
      expect(decoded1.video.canSubscribe).toBe(true);
      expect(decoded1.video.canPublishData).toBe(false);
      expect(decoded1.video.canPublishSources).toEqual(['microphone']);

      // Mute member via moderation -> next token has canPublish: false
      await roomService.muteMember(roomId, host.id, member.id, true);

      const res2 = await request(app)
        .post(`/api/v1/rooms/${roomId}/voice/token`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ tabId: 'tab02' });

      expect(res2.status).toBe(200);
      const decoded2 = jwt.verify(res2.body.data.token, testApiSecret) as any;
      expect(decoded2.video.canPublish).toBe(false);
      expect(decoded2.video.canPublishSources).toEqual([]);
    });

    it('propagates familyId into req.user, denies tokens after family revocation, and evicts active LiveKit sessions', async () => {
      const host = await createTestUser('s2_host_fam', 's2_host_fam@s2-voice-test.ktv');
      const room = await roomService.create(host.id, {
        name: 'S2VoiceTest Family Room',
        capacity: 8,
        visibility: 'public',
        roomType: 'standard',
        category: 'all',
        isChatEnabled: true,
        atmospherePreset: 'midnight_lounge',
      });
      const roomId = room._id.toString();

      // Mint token -> registers familyId in VoiceSessionRegistry
      const tokenRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/voice/token`)
        .set('Authorization', `Bearer ${host.accessToken}`)
        .send({ tabId: 'tabFam1' });

      expect(tokenRes.status).toBe(200);
      const identity = tokenRes.body.data.participantIdentity;

      const registered = voiceSessionRegistry.getByFamily(host.familyId);
      expect(registered.length).toBe(1);
      expect(registered[0]?.identity).toBe(identity);

      // Revoke session family (simulating logout / token replay)
      await authService.revokeSessionFamily(host.familyId, 'TEST_REVOKE');

      expect(mockRoomClient.removeParticipant).toHaveBeenCalledWith(`ktv_room_${roomId}`, identity);
      expect(voiceSessionRegistry.getByFamily(host.familyId).length).toBe(0);

      // Subsequent voice token request using the same access token must be rejected
      const deniedRes = await request(app)
        .post(`/api/v1/rooms/${roomId}/voice/token`)
        .set('Authorization', `Bearer ${host.accessToken}`)
        .send({});
      expect(deniedRes.status).toBe(403);
      expect(deniedRes.body.error.code).toBe('FORBIDDEN_SESSION_REVOKED');
    });

    it('enforces dedicated rate limiting on voice token issuance', async () => {
      const user = await createTestUser('s2_ratelimit', 's2_ratelimit@s2-voice-test.ktv');
      const room = await roomService.create(user.id, {
        name: 'S2VoiceTest RateLimit Room',
        capacity: 8,
        visibility: 'public',
        roomType: 'standard',
        category: 'all',
        isChatEnabled: true,
        atmospherePreset: 'midnight_lounge',
      });
      const roomId = room._id.toString();

      const testApp = express();
      testApp.use(express.json());
      testApp.post(
        '/api/v1/rooms/:roomId/voice/token',
        requireAuth,
        createVoiceTokenRateLimiter(2, 60_000),
        (req, res, next) => voiceController.getVoiceToken(req, res, next)
      );

      const r1 = await request(testApp)
        .post(`/api/v1/rooms/${roomId}/voice/token`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({});
      const r2 = await request(testApp)
        .post(`/api/v1/rooms/${roomId}/voice/token`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({});
      const r3 = await request(testApp)
        .post(`/api/v1/rooms/${roomId}/voice/token`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({});

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
    });
  });

  describe('Priority 3 & 5: Webhooks, Socket.IO Voice Presence, Throttling & Room Cleanup', () => {
    it('rejects missing or invalid webhook signatures and reconciles valid lifecycle events without duplicates or stale ordering', async () => {
      const host = await createTestUser('s2_wh_host', 's2_wh_host@s2-voice-test.ktv');
      const listener = await createTestUser('s2_wh_listener', 's2_wh_listener@s2-voice-test.ktv');
      const room = await roomService.create(host.id, {
        name: 'S2VoiceTest Webhook Room',
        capacity: 8,
        visibility: 'public',
        roomType: 'standard',
        category: 'all',
        isChatEnabled: true,
        atmospherePreset: 'midnight_lounge',
      });
      const roomId = room._id.toString();
      await roomService.joinRoom(roomId, listener.id);

      // Missing auth header -> 401
      const noAuthRes = await request(app).post('/api/v1/webhooks/livekit').send({ event: 'participant_joined' });
      expect(noAuthRes.status).toBe(401);

      // Invalid signature -> 401
      const badSigRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send({ event: 'participant_joined' });
      expect(badSigRes.status).toBe(401);

      // Connect listener via Socket.IO WITHOUT joining LiveKit voice
      const listenerSocket = await connectSocket(listener.accessToken);
      await new Promise<void>((resolve) => {
        listenerSocket.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId }, () => resolve());
      });

      const joinedPromise = new Promise<any>((resolve) => {
        listenerSocket.once(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_JOINED, (p) => resolve(p));
      });

      const participantIdentity = `${host.id}_vps_abc123`;
      const nowSec = Math.floor(Date.now() / 1000);
      const joinEventBody = JSON.stringify({
        id: 'evt_join_1',
        event: 'participant_joined',
        createdAt: nowSec,
        room: { name: `ktv_room_${roomId}` },
        participant: {
          identity: participantIdentity,
          name: host.username,
          metadata: JSON.stringify({
            userId: host.id,
            username: host.username,
            displayName: `${host.username} Display`,
          }),
        },
      });

      const joinRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', signWebhookPayload(joinEventBody))
        .set('Content-Type', 'application/json')
        .send(joinEventBody);

      expect(joinRes.status).toBe(200);
      expect(joinRes.body).toEqual({ received: true });

      const joinedPayload = await joinedPromise;
      expect(joinedPayload.roomId).toBe(roomId);
      expect(joinedPayload.participant.userId).toBe(host.id);
      expect(joinedPayload.participant.isConnected).toBe(true);
      expect(joinedPayload.participant.hasMicTrack).toBe(false);

      // Duplicate webhook event idempotency
      const dupRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', signWebhookPayload(joinEventBody))
        .set('Content-Type', 'application/json')
        .send(joinEventBody);
      expect(dupRes.status).toBe(200);
      expect(dupRes.body.duplicate).toBe(true);

      // Track published webhook sets hasMicTrack = true
      const trackUpdatedPromise = new Promise<any>((resolve) => {
        listenerSocket.once(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_UPDATED, (p) => resolve(p));
      });

      const trackPubBody = JSON.stringify({
        id: 'evt_track_pub_1',
        event: 'track_published',
        createdAt: nowSec + 1,
        room: { name: `ktv_room_${roomId}` },
        participant: { identity: participantIdentity },
        track: { sid: 'TR_MIC_1', source: TrackSource.MICROPHONE, type: 0, muted: false },
      });

      const trackPubRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', signWebhookPayload(trackPubBody))
        .set('Content-Type', 'application/json')
        .send(trackPubBody);
      expect(trackPubRes.status).toBe(200);

      const trackPubPayload = await trackUpdatedPromise;
      expect(trackPubPayload.participant.hasMicTrack).toBe(true);

      // Stale out-of-order event ignored
      const staleBody = JSON.stringify({
        id: 'evt_stale_1',
        event: 'participant_left',
        createdAt: nowSec - 10,
        room: { name: `ktv_room_${roomId}` },
        participant: { identity: participantIdentity },
      });
      const staleRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', signWebhookPayload(staleBody))
        .set('Content-Type', 'application/json')
        .send(staleBody);
      expect(staleRes.status).toBe(200);
      expect(staleRes.body.stale).toBe(true);

      // Participant should still be connected in store
      expect(voicePresenceStore.getParticipant(roomId, host.id)?.isConnected).toBe(true);

      // Valid participant_left removes from voicePresenceStore and broadcasts VOICE_PARTICIPANT_LEFT
      const leftPromise = new Promise<any>((resolve) => {
        listenerSocket.once(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_LEFT, (p) => resolve(p));
      });
      const leaveBody = JSON.stringify({
        id: 'evt_leave_1',
        event: 'participant_left',
        createdAt: nowSec + 2,
        room: { name: `ktv_room_${roomId}` },
        participant: { identity: participantIdentity },
      });
      const leaveRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', signWebhookPayload(leaveBody))
        .set('Content-Type', 'application/json')
        .send(leaveBody);
      expect(leaveRes.status).toBe(200);

      const leftPayload = await leftPromise;
      expect(leftPayload.participant.userId).toBe(host.id);
      expect(leftPayload.participant.isConnected).toBe(false);
      expect(voicePresenceStore.getRoomSnapshot(roomId)).toEqual([]);
    });

    it('accepts LiveKit Content-Type application/webhook+json, preserves exact raw bytes for signature verification, rejects invalid signatures, and deduplicates safely', async () => {
      const host = await createTestUser('s2_wh_mime_host', 's2_wh_mime_host@s2-voice-test.ktv');
      const room = await roomService.create(host.id, {
        name: 'S2VoiceTest Webhook MIME Room',
        capacity: 8,
        visibility: 'public',
        roomType: 'standard',
        category: 'all',
        isChatEnabled: true,
        atmospherePreset: 'midnight_lounge',
      });
      const roomId = room._id.toString();
      const participantIdentity = `${host.id}_vps_mime01`;
      const nowSec = Math.floor(Date.now() / 1000);

      // Non-compact JSON formatting (extra whitespace/newlines) proves exact raw bytes are preserved
      const rawPrettyBody = JSON.stringify(
        {
          id: 'evt_webhook_mime_join_1',
          event: 'participant_joined',
          createdAt: nowSec,
          room: { name: `ktv_room_${roomId}` },
          participant: {
            identity: participantIdentity,
            name: host.username,
            metadata: JSON.stringify({
              userId: host.id,
              username: host.username,
              displayName: `${host.username} Display`,
            }),
          },
        },
        null,
        2
      );

      // Invalid signature with application/webhook+json must be rejected with 401
      const badSigRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', 'Bearer invalid.jwt.signature')
        .set('Content-Type', 'application/webhook+json')
        .send(rawPrettyBody);
      expect(badSigRes.status).toBe(401);

      // Valid signature over exact rawPrettyBody bytes with application/webhook+json must succeed
      const validRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', signWebhookPayload(rawPrettyBody))
        .set('Content-Type', 'application/webhook+json')
        .send(rawPrettyBody);

      expect(validRes.status).toBe(200);
      expect(validRes.body).toEqual({ received: true });
      expect(voicePresenceStore.getParticipant(roomId, host.id)?.isConnected).toBe(true);

      // Duplicate delivery with application/webhook+json must be deduplicated cleanly
      const dupRes = await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Authorization', signWebhookPayload(rawPrettyBody))
        .set('Content-Type', 'application/webhook+json')
        .send(rawPrettyBody);

      expect(dupRes.status).toBe(200);
      expect(dupRes.body).toEqual({ received: true, duplicate: true });
    });

    it('delivers voice:state:snapshot on room:join, throttles speaking updates, enforces moderation mute, and cleans up on room close', async () => {
      const host = await createTestUser('s2_spk_host', 's2_spk_host@s2-voice-test.ktv');
      const member = await createTestUser('s2_spk_mem', 's2_spk_mem@s2-voice-test.ktv');
      const outsider = await createTestUser('s2_spk_out', 's2_spk_out@s2-voice-test.ktv');

      const room = await roomService.create(host.id, {
        name: 'S2VoiceTest Socket Room',
        capacity: 8,
        visibility: 'public',
        roomType: 'standard',
        category: 'all',
        isChatEnabled: true,
        atmospherePreset: 'midnight_lounge',
      });
      const roomId = room._id.toString();
      await roomService.joinRoom(roomId, member.id);

      // Seed active LiveKit voice presence for host
      voicePresenceStore.markParticipantJoined({
        roomId,
        userId: host.id,
        username: host.username,
        displayName: `${host.username} Display`,
        identity: `${host.id}_vps_1`,
      });

      const hostSocket = await connectSocket(host.accessToken);
      const memberSocket = await connectSocket(member.accessToken);
      const outsiderSocket = await connectSocket(outsider.accessToken);

      // Non-voice member joins room and receives voice:state:snapshot containing host
      const snapshotPromise = new Promise<any>((resolve) => {
        memberSocket.once(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, (snap) => resolve(snap));
      });
      await new Promise<void>((resolve) => {
        memberSocket.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId }, () => resolve());
      });
      const snapshot = await snapshotPromise;
      expect(snapshot.roomId).toBe(roomId);
      expect(snapshot.participants.length).toBe(1);
      expect(snapshot.participants[0].userId).toBe(host.id);

      await new Promise<void>((resolve) => {
        hostSocket.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId }, () => resolve());
      });

      // Non-member speaking update rejected
      const outsiderAck = await new Promise<any>((resolve) => {
        outsiderSocket.emit(
          SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE,
          { roomId, isSpeaking: true },
          (ack: any) => resolve(ack)
        );
      });
      expect(outsiderAck.success).toBe(false);
      expect(outsiderAck.error.code).toBe('FORBIDDEN_NOT_MEMBER');

      // Member without active voice session cannot fabricate voice presence
      const unjoinedAck = await new Promise<any>((resolve) => {
        memberSocket.emit(
          SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE,
          { roomId, isSpeaking: true },
          (ack: any) => resolve(ack)
        );
      });
      expect(unjoinedAck.success).toBe(true);
      expect(unjoinedAck.data.applied).toBe(false);
      expect(voicePresenceStore.getParticipant(roomId, member.id)).toBeNull();

      // Host speaking update accepted and broadcast; never sets hasMicTrack
      const speakingBroadcastPromise = new Promise<any>((resolve) => {
        memberSocket.once(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_UPDATED, (p) => resolve(p));
      });
      const hostSpeakAck = await new Promise<any>((resolve) => {
        hostSocket.emit(
          SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE,
          { roomId, isSpeaking: true, isMuted: false },
          (ack: any) => resolve(ack)
        );
      });
      expect(hostSpeakAck.success).toBe(true);
      expect(hostSpeakAck.data.applied).toBe(true);

      const broadcastPayload = await speakingBroadcastPromise;
      expect(broadcastPayload.participant.isSpeaking).toBe(true);
      expect(broadcastPayload.participant.hasMicTrack).toBe(false);

      // Immediate rapid re-start within throttle window is throttled
      await new Promise<void>((resolve) => {
        hostSocket.emit(SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE, { roomId, isSpeaking: false }, () => resolve());
      });
      const throttledAck = await new Promise<any>((resolve) => {
        hostSocket.emit(
          SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE,
          { roomId, isSpeaking: true },
          (ack: any) => resolve(ack)
        );
      });
      expect(throttledAck.data.applied).toBe(false);

      // Moderation mute forces member muted and prevents client from unmuting
      await roomService.muteMember(roomId, host.id, member.id, true);
      voicePresenceStore.markParticipantJoined({
        roomId,
        userId: member.id,
        username: member.username,
        displayName: `${member.username} Display`,
        identity: `${member.id}_vps_1`,
        isModerationMuted: true,
      });

      await new Promise<void>((resolve) => {
        memberSocket.emit(
          SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE,
          { roomId, isSpeaking: true, isMuted: false },
          () => resolve()
        );
      });
      const moderatedParticipant = voicePresenceStore.getParticipant(roomId, member.id);
      expect(moderatedParticipant?.isMuted).toBe(true);
      expect(moderatedParticipant?.isSpeaking).toBe(false);

      // Closing room via roomService.closeRoom triggers closeLiveKitRoom & clears store
      await roomService.closeRoom(roomId);
      expect(mockRoomClient.deleteRoom).toHaveBeenCalledWith(`ktv_room_${roomId}`);
      expect(voicePresenceStore.getRoomSnapshot(roomId)).toEqual([]);
    });
  });
});
