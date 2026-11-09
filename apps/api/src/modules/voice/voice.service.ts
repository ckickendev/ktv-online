import crypto from 'crypto';
import mongoose from 'mongoose';
import { RoomServiceClient } from 'livekit-server-sdk';
import { VoiceTokenResponseDto } from '@ktv/contracts';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { RoomModel } from '../rooms/room.model.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import { UserModel } from '../users/user.model.js';
import { voiceTokenService } from './voice-token.service.js';
import { VoiceParticipantMetadata } from './voice.types.js';

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

    // 2. Verify room existence and open status
    const room = await RoomModel.findById(roomId);
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }
    if (room.status === 'closed') {
      throw new Error('FORBIDDEN_ROOM_CLOSED');
    }

    // 3. Verify active room membership
    const membership = await RoomMembershipModel.findOne({
      roomId: room._id,
      userId: user.id,
    });

    if (!membership || membership.status !== 'active') {
      throw new Error('FORBIDDEN_NOT_MEMBER');
    }

    // 4. Verify user is not currently blocked by kick moderation
    if (membership.kickedAt != null) {
      throw new Error('FORBIDDEN_KICKED');
    }

    // 5. Generate deterministic room name and session-unique participant identity
    const roomName = this.getLiveKitRoomName(roomId);
    const sessionSalt = tabId ? tabId.slice(0, 12) : crypto.randomUUID().slice(0, 8);
    const participantIdentity = `${user.id}_${sessionSalt}`;

    const avatar = user.avatar || user.avatarUrl || dbUser.avatar || undefined;
    const metadata: VoiceParticipantMetadata = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      avatarUrl: avatar || undefined,
      tabId,
    };

    const { token, expiresAt } = await voiceTokenService.generateToken({
      roomName,
      participantIdentity,
      name: user.displayName || user.username,
      metadata,
    });

    logger.info(
      {
        roomId,
        roomName,
        userId: user.id,
        participantIdentity,
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
    if (!client) return;

    const roomName = this.getLiveKitRoomName(roomId);
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
            'Disconnecting LiveKit voice participant due to moderation kick or leave'
          );
          await client.removeParticipant(roomName, p.identity);
        }
      }
    } catch (err: unknown) {
      logger.warn(
        { roomId, roomName, userId, err: err instanceof Error ? err.message : String(err) },
        'Failed to evict participant from LiveKit (room may already be empty)'
      );
    }
  }

  /**
   * Deletes and terminates a LiveKit voice room when a KTVOnline room is closed.
   */
  public async closeLiveKitRoom(roomId: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const roomName = this.getLiveKitRoomName(roomId);
    try {
      logger.info({ roomId, roomName }, 'Deleting LiveKit voice room on room closure');
      await client.deleteRoom(roomName);
    } catch (err: unknown) {
      logger.warn(
        { roomId, roomName, err: err instanceof Error ? err.message : String(err) },
        'Failed to delete LiveKit room (room may not have been created or active)'
      );
    }
  }
}

export const voiceService = new VoiceService();
