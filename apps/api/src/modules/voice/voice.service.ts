import crypto from 'crypto';
import { RoomServiceClient } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { UserModel } from '../users/user.model.js';
import { RoomModel } from '../rooms/room.model.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import { SessionModel } from '../auth/session.model.js';
import { VoiceParticipantMetadata } from './voice.types.js';
import { voiceTokenService } from './voice-token.service.js';
import { voiceSessionRegistry } from './voice-session.registry.js';
import { VoiceEvictionTaskModel } from './voice-eviction-task.model.js';

export interface GenerateVoiceTokenParams {
  roomId: string;
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    avatar?: string | null;
    avatarUrl?: string | null;
    familyId?: string;
  };
  tabId?: string;
}

export interface VoiceTokenResult {
  serverUrl: string;
  token: string;
  roomName: string;
  participantIdentity: string;
  expiresAt: string;
}

export class VoiceService {
  private client: RoomServiceClient | null = null;

  public getClient(): RoomServiceClient | null {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return null;
    }
    if (!this.client) {
      const httpUrl = env.LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
      this.client = new RoomServiceClient(httpUrl, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    }
    return this.client;
  }

  public getLiveKitRoomName(roomId: string): string {
    return `ktv_room_${roomId}`;
  }

  /**
   * Records a failed eviction task for background recovery.
   */
  public async recordPendingEviction(
    targetType: 'user' | 'family' | 'room',
    targetId: string,
    roomId?: string,
    participantIdentity?: string,
    lastError?: string
  ): Promise<void> {
    try {
      await VoiceEvictionTaskModel.create({
        targetType,
        targetId,
        roomId,
        participantIdentity,
        attemptCount: 1,
        maxAttempts: 5,
        status: 'pending',
        nextAttemptAt: new Date(Date.now() + 2000), // 2s initial delay
        lastError: lastError || null,
        errorCategory: 'transient',
      });
      logger.info(
        { targetType, targetId, roomId, participantIdentity },
        'Recorded pending voice eviction recovery task'
      );
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), targetType, targetId },
        'Failed to record pending voice eviction task'
      );
    }
  }

  /**
   * Generates a signed LiveKit access token after validating authorization invariants.
   */
  public async generateVoiceToken(params: GenerateVoiceTokenParams): Promise<VoiceTokenResult> {
    const { roomId, user, tabId } = params;

    // Check if LiveKit configuration is available
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new Error('VOICE_NOT_CONFIGURED');
    }

    // 1. Verify user exists and is active (not suspended/deactivated)
    const dbUser = await UserModel.findById(user.id);
    if (!dbUser || dbUser.status === 'suspended') {
      throw new Error('FORBIDDEN_USER_INACTIVE');
    }

    // 2. Verify session family is not revoked
    if (user.familyId) {
      const activeSession = await SessionModel.findOne({
        familyId: user.familyId,
        isRevoked: false,
      })
        .select('_id')
        .lean()
        .exec();

      if (!activeSession) {
        logger.warn(
          { userId: user.id, familyId: user.familyId, roomId },
          'Voice token denied: session family has been revoked'
        );
        throw new Error('FORBIDDEN_SESSION_REVOKED');
      }
    }

    // 3. Verify room exists and is open
    const room = await RoomModel.findById(roomId);
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }
    if (room.status === 'closed') {
      throw new Error('FORBIDDEN_ROOM_CLOSED');
    }

    // 4. Verify active room membership
    const membership = await RoomMembershipModel.findOne({
      roomId: room._id,
      userId: user.id,
    });

    if (!membership || membership.status !== 'active') {
      throw new Error('FORBIDDEN_NOT_MEMBER');
    }

    // 5. Verify user is not currently blocked by kick moderation
    if (membership.kickedAt != null) {
      throw new Error('FORBIDDEN_KICKED');
    }

    // 6. Backend-controlled opaque participant session identifier
    const cleanTabHint = (tabId && /^[a-zA-Z0-9-]{1,16}$/.test(tabId)) ? tabId : undefined;
    let participantSessionId: string;
    let participantIdentity: string;

    const existingSession = voiceSessionRegistry.findExistingSession(roomId, user.id, cleanTabHint);
    if (existingSession) {
      participantSessionId = existingSession.participantSessionId;
      participantIdentity = existingSession.identity;
      existingSession.lastRenewedAt = new Date();
    } else {
      participantSessionId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      participantIdentity = `${user.id}_vps_${participantSessionId}`;
    }

    const roomName = this.getLiveKitRoomName(roomId);

    // Public metadata contains strictly UI-necessary fields (NO familyId, NO tabId, NO security flags)
    const avatar = user.avatar || user.avatarUrl || dbUser.avatar || undefined;
    const metadata: VoiceParticipantMetadata = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      avatarUrl: avatar || undefined,
    };

    const { token, expiresAt } = await voiceTokenService.generateToken({
      roomName,
      participantIdentity,
      name: user.displayName || user.username,
      metadata,
    });

    // 7. Track in server-side session registry (private mapping)
    voiceSessionRegistry.register({
      identity: participantIdentity,
      participantSessionId,
      userId: user.id,
      roomId,
      familyId: user.familyId,
      tabHint: cleanTabHint,
      createdAt: existingSession ? existingSession.createdAt : new Date(),
      lastRenewedAt: new Date(),
    });

    logger.info(
      {
        roomId,
        roomName,
        userId: user.id,
        participantIdentity,
        familyId: user.familyId,
        expiresAt: expiresAt.toISOString(),
      },
      'Issued LiveKit voice access token'
    );

    return {
      serverUrl: env.LIVEKIT_URL!,
      token,
      roomName,
      participantIdentity,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Evicts all active LiveKit participants belonging to a specific KTVOnline user in a room.
   */
  public async evictLiveKitParticipant(roomId: string, userId: string): Promise<void> {
    const client = this.getClient();
    const roomName = this.getLiveKitRoomName(roomId);

    // Clean up local registry entries
    const userSessions = voiceSessionRegistry.getByUserAndRoom(roomId, userId);
    for (const s of userSessions) {
      voiceSessionRegistry.unregister(s.identity);
    }

    if (!client) return;

    try {
      const participants = await client.listParticipants(roomName);
      for (const p of participants) {
        let isMatch = p.identity.startsWith(`${userId}_`);
        if (!isMatch && p.metadata) {
          try {
            const parsed = JSON.parse(p.metadata) as VoiceParticipantMetadata;
            if (parsed.userId === userId) {
              isMatch = true;
            }
          } catch {
            // ignore JSON parse errors on metadata
          }
        }

        if (isMatch) {
          logger.info(
            { roomId, roomName, userId, participantIdentity: p.identity },
            'Disconnecting LiveKit voice participant'
          );
          await client.removeParticipant(roomName, p.identity);
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { roomId, roomName, userId, err: errorMsg },
        'Failed to evict participant from LiveKit; recording for recovery retry'
      );
      await this.recordPendingEviction('user', userId, roomId, undefined, errorMsg);
    }
  }

  /**
   * Evicts all LiveKit voice participants associated with a revoked session family across all rooms.
   */
  public async evictLiveKitSessionFamily(familyId: string): Promise<void> {
    const client = this.getClient();

    // 1. Query all known active voice sessions tied to this familyId
    const familySessions = voiceSessionRegistry.getByFamily(familyId);
    for (const s of familySessions) {
      voiceSessionRegistry.unregister(s.identity);
    }

    if (!client) return;

    for (const s of familySessions) {
      const roomName = this.getLiveKitRoomName(s.roomId);
      try {
        logger.info(
          { roomId: s.roomId, familyId, participantIdentity: s.identity },
          'Evicting voice participant for revoked session family'
        );
        await client.removeParticipant(roomName, s.identity);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { roomId: s.roomId, familyId, participantIdentity: s.identity, err: errorMsg },
          'Failed to evict family participant; recording for recovery retry'
        );
        await this.recordPendingEviction('family', familyId, s.roomId, s.identity, errorMsg);
      }
    }
  }

  /**
   * Evicts all active LiveKit voice participants belonging to a specific KTVOnline user across ALL rooms
   * (e.g. upon user suspension, deactivation, or global security revocation).
   */
  public async evictUserFromAllRooms(userId: string): Promise<void> {
    const userSessions = voiceSessionRegistry.getByUser(userId);
    const roomIds = new Set<string>();
    for (const s of userSessions) {
      roomIds.add(s.roomId);
      voiceSessionRegistry.unregister(s.identity);
    }

    const client = this.getClient();
    if (!client) return;

    for (const roomId of roomIds) {
      await this.evictLiveKitParticipant(roomId, userId);
    }
  }

  /**
   * Deletes and terminates a LiveKit voice room when a KTVOnline room is closed.
   */
  public async closeLiveKitRoom(roomId: string): Promise<void> {
    // Clear local registry for this room
    voiceSessionRegistry.clearRoom(roomId);

    const client = this.getClient();
    if (!client) return;

    const roomName = this.getLiveKitRoomName(roomId);
    try {
      logger.info({ roomId, roomName }, 'Deleting LiveKit voice room on room closure');
      await client.deleteRoom(roomName);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { roomId, roomName, err: errorMsg },
        'Failed to delete LiveKit room; recording for recovery retry'
      );
      await this.recordPendingEviction('room', roomId, roomId, undefined, errorMsg);
    }
  }
}

export const voiceService = new VoiceService();
