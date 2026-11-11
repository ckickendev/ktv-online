import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { GenerateVoiceTokenOptions } from './voice.types.js';

export class VoiceTokenService {
  private readonly defaultTtlSeconds = 300; // 5 minutes

  /**
   * Generates a signed, short-lived LiveKit access token with minimum required voice grants.
   */
  public async generateToken(options: GenerateVoiceTokenOptions): Promise<{ token: string; expiresAt: Date }> {
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured');
    }

    const ttlSeconds = options.ttlSeconds ?? this.defaultTtlSeconds;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: options.participantIdentity,
      name: options.name,
      metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
      ttl: ttlSeconds,
    });

    const canPublish = options.canPublish !== false;

    token.addGrant({
      roomJoin: true,
      room: options.roomName,
      canPublish,
      canPublishSources: canPublish ? [TrackSource.MICROPHONE] : [],
      canSubscribe: true,
      canPublishData: false,
    });

    logger.info(
      {
        roomName: options.roomName,
        participantIdentity: options.participantIdentity,
        ttlSeconds,
        expiresAt: expiresAt.toISOString(),
      },
      'Generated LiveKit access token'
    );

    const jwt = await token.toJwt();
    return { token: jwt, expiresAt };
  }
}

export const voiceTokenService = new VoiceTokenService();
