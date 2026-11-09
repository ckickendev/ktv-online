import crypto from 'crypto';
import mongoose from 'mongoose';
import { RoomServiceClient } from 'livekit-server-sdk';
import { VoiceTokenResponseDto } from '@ktv/contracts';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { RoomModel } from '../rooms/room.model.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import { UserModel } from '../users/user.model.js';
import { SessionModel } from '../auth/session.model.js';
import { voiceTokenService } from './voice-token.service.js';
import { VoiceParticipantMetadata } from './voice.types.js';
import { voiceSessionRegistry } from './voice-session.registry.js';
import { VoiceEvictionTaskModel } from './voice-eviction-task.model.js';

export interface AuthenticatedVoiceUser {
  id: string;
  email?: string;
  username: string;
  displayName?: string;
  avatar?: string | null;
  avatarUrl?: string;
  role?: string;
  familyId?: string;
}

export class VoiceService {
  private roomServiceClient: RoomServiceClient | null = null;

  public isConfigured(): boolean {
    return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
  }

  /**
   * Deterministically maps a KTVOnline room ID to an opaque LiveKit room identifier.
   */
  public getLiveKitRoomName(roomId: string): string {
    return `ktv_room_${roomId}`;
  }

  private getClient(): RoomServiceClient | null {
    if (!this.isConfigured()) return null;
    if (!this.roomServiceClient) {
      // RoomServiceClient expects http/https URL format
      const httpUrl = env.LIVEKIT_URL!.replace(/^ws(s)?:/, 'http$1:');
      this.roomServiceClient = new RoomServiceClient(httpUrl, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
    }
    return this.roomServiceClient;
  }

  /**
   * Records a failed eviction task for background recovery.
   */
  private async recordPendingEviction(
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
   * Authorizes caller and generates a LiveKit access token for room voice participation.
   */
  public async generateVoiceToken(
    roomId: string,
    user: AuthenticatedVoiceUser,
    tabId?: string
  ): Promise<VoiceTokenResponseDto> {
    if (!this.isConfigured()) {
      throw new Error('VOICE_SERVICE_NOT_CONFIGURED');
    }

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ROOM_ID');
    }

    // 1. Verify user status
    const dbUser = await UserModel.findById(user.id);
    if (!dbUser || dbUser.status === 'suspended') {
      throw new Error('FORBIDDEN_USER_INACTIVE');
    }

    // 2. Verify session family is active and not revoked
    if (user.familyId) {
      const activeSession = await SessionModel.findOne({
        familyId: user.familyId,
        isRevoked: false,
      }).exec();

      if (!activeSession) {
        logger.warn(
          { userId: user.id, familyId: user.familyId },
          'Rejected voice token request for revoked session family'
        );
        throw new Error('FORBIDDEN_SESSION_REVOKED');
      }
    }

    // 3. Verify room existence and open status
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

    // 6. Sanitize tabId and generate participant identity
    const cleanTabId = (tabId && /^[a-zA-Z0-9-]{1,16}$/.test(tabId))
      ? tabId
      : crypto.randomUUID().slice(0, 8);
    const participantIdentity = `${user.id}_${cleanTabId}`;
    const roomName = this.getLiveKitRoomName(roomId);

    const avatar = user.avatar || user.avatarUrl || dbUser.avatar || undefined;
    const metadata: VoiceParticipantMetadata = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      avatarUrl: avatar || undefined,
      tabId: cleanTabId,
      familyId: user.familyId,
      issuedAt: new Date().toISOString(),
    };

    const { token, expiresAt } = await voiceTokenService.generateToken({
      roomName,
      participantIdentity,
      name: user.displayName || user.username,
      metadata,
    });

    // 7. Track in server-side session registry
    voiceSessionRegistry.register({
      identity: participantIdentity,
      userId: user.id,
      roomId,
      familyId: user.familyId,
      tabId: cleanTabId,
      createdAt: new Date(),
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

  /**
   * Sweeps pending eviction tasks and retries provider calls with exponential backoff.
   */
  public async retryPendingEvictions(batchSize = 20): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const tasks = await VoiceEvictionTaskModel.find({
      status: 'pending',
      nextAttemptAt: { $lte: new Date() },
    })
      .limit(batchSize)
      .exec();

    for (const task of tasks) {
      try {
        if (task.targetType === 'room' && task.roomId) {
          const roomName = this.getLiveKitRoomName(task.roomId);
          await client.deleteRoom(roomName);
        } else if (task.targetType === 'user' && task.roomId && task.targetId) {
          const roomName = this.getLiveKitRoomName(task.roomId);
          await client.removeParticipant(
            roomName,
            task.participantIdentity || `${task.targetId}_`
          );
        } else if (task.targetType === 'family' && task.roomId && task.participantIdentity) {
          const roomName = this.getLiveKitRoomName(task.roomId);
          await client.removeParticipant(roomName, task.participantIdentity);
        }

        task.status = 'completed';
        task.lastError = null;
        await task.save();

        logger.info(
          { taskId: task._id.toString(), targetType: task.targetType, targetId: task.targetId },
          'Successfully recovered and completed pending voice eviction'
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        task.attemptCount += 1;
        task.lastError = errorMsg;

        if (task.attemptCount >= task.maxAttempts) {
          task.status = 'exhausted';
          logger.error(
            { taskId: task._id.toString(), targetType: task.targetType, targetId: task.targetId, attempts: task.attemptCount, err: errorMsg },
            'Exhausted max retry attempts for voice eviction task'
          );
        } else {
          // Bounded exponential backoff: 2s, 4s, 8s, 16s... up to 60s
          const backoffMs = Math.min(60000, 2000 * Math.pow(2, task.attemptCount));
          task.nextAttemptAt = new Date(Date.now() + backoffMs);
        }
        await task.save();
      }
    }
  }
}

export const voiceService = new VoiceService();
