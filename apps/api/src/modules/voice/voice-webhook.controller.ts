import { Request, Response, NextFunction } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { voiceSessionRegistry } from './voice-session.registry.js';
import { RoomModel } from '../rooms/room.model.js';
import { voiceService } from './voice.service.js';

export class VoiceWebhookController {
  private receiver: WebhookReceiver | null = null;

  // Bounded LRU deduplication cache: eventId -> processed timestamp
  private processedEventIds = new Map<string, number>();
  private readonly maxDeduplicationEntries = 5000;
  private readonly deduplicationTtlMs = 10 * 60 * 1000; // 10 minutes

  // Per-participant monotonic event ordering tracker: `${roomName}:${identity}` -> timestamp
  private participantLastEventTimes = new Map<string, number>();

  private getReceiver(): WebhookReceiver | null {
    if (!env.LIVEKIT_API_KEY || (!env.LIVEKIT_WEBHOOK_SECRET && !env.LIVEKIT_API_SECRET)) {
      return null;
    }
    if (!this.receiver) {
      const secret = env.LIVEKIT_WEBHOOK_SECRET || env.LIVEKIT_API_SECRET!;
      this.receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, secret);
    }
    return this.receiver;
  }

  /**
   * Cleans up expired entries from the deduplication map when size limit is exceeded.
   */
  private pruneDeduplicationCache(): void {
    const now = Date.now();
    for (const [id, time] of this.processedEventIds.entries()) {
      if (now - time > this.deduplicationTtlMs) {
        this.processedEventIds.delete(id);
      }
    }

    if (this.processedEventIds.size > this.maxDeduplicationEntries) {
      // Evict oldest 20%
      const keys = Array.from(this.processedEventIds.keys()).slice(0, Math.floor(this.maxDeduplicationEntries * 0.2));
      for (const k of keys) {
        this.processedEventIds.delete(k);
      }
    }
  }

  public async handleWebhook(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const correlationId = (req.headers['x-correlation-id'] || req.headers['x-request-id']) as string | undefined;
    const receiver = this.getReceiver();

    if (!receiver) {
      logger.warn({ correlationId }, 'LiveKit webhook received but webhook verification is not configured');
      res.status(503).json({ error: 'Webhook verification not configured' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      logger.warn({ correlationId }, 'LiveKit webhook missing authorization header');
      res.status(401).json({ error: 'Missing authorization header' });
      return;
    }

    // Retrieve raw body buffer captured by express.json verify callback
    const rawBuf = (req as unknown as { rawBody?: Buffer }).rawBody;
    const bodyString = Buffer.isBuffer(rawBuf)
      ? rawBuf.toString('utf-8')
      : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);

    try {
      const event = await receiver.receive(bodyString, authHeader);
      const eventId = event.id || `${event.event}_${event.createdAt}_${event.participant?.identity || ''}`;

      // 1. Idempotency Check: deduplicate re-delivered events
      if (this.processedEventIds.has(eventId)) {
        logger.info(
          { correlationId, eventId, eventType: event.event },
          'Duplicate LiveKit webhook event ignored'
        );
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      this.processedEventIds.set(eventId, Date.now());
      if (this.processedEventIds.size > this.maxDeduplicationEntries) {
        this.pruneDeduplicationCache();
      }

      const roomName = event.room?.name || '';
      const participantIdentity = event.participant?.identity || '';
      const eventTimestamp = Number(event.createdAt) ? Number(event.createdAt) * 1000 : Date.now();

      // 2. Monotonic Ordering Check per participant in room
      if (participantIdentity && roomName) {
        const participantKey = `${roomName}:${participantIdentity}`;
        const lastSeen = this.participantLastEventTimes.get(participantKey);

        if (lastSeen && eventTimestamp < lastSeen) {
          logger.warn(
            { correlationId, eventId, eventType: event.event, participantKey, eventTimestamp, lastSeen },
            'Stale out-of-order LiveKit webhook event ignored'
          );
          res.status(200).json({ received: true, stale: true });
          return;
        }

        this.participantLastEventTimes.set(participantKey, eventTimestamp);
      }

      logger.info(
        {
          correlationId,
          eventType: event.event,
          roomName,
          participantIdentity,
          eventId,
        },
        'Verified and processing LiveKit webhook event'
      );

      // Extract raw roomId from ktv_room_<roomId>
      const parsedRoomId = roomName.startsWith('ktv_room_') ? roomName.replace('ktv_room_', '') : undefined;

      // 3. Handle lifecycle events ephemerally (NEVER mutate Room.currentParticipantsCount or RoomMembership)
      switch (event.event) {
        case 'participant_joined': {
          // If KTVOnline room is already closed, evict delayed participant
          if (parsedRoomId && participantIdentity) {
            const dbRoom = await RoomModel.findById(parsedRoomId).select('status').exec();
            if (dbRoom && dbRoom.status === 'closed') {
              logger.warn(
                { correlationId, roomId: parsedRoomId, participantIdentity },
                'Participant joined closed room in LiveKit; evicting participant'
              );
              const rawUserId = participantIdentity.split('_')[0];
              if (rawUserId) {
                await voiceService.evictLiveKitParticipant(parsedRoomId, rawUserId);
              }
              break;
            }
          }

          logger.info(
            { roomName, participantIdentity },
            'LiveKit voice participant joined room'
          );
          break;
        }

        case 'participant_left': {
          if (participantIdentity) {
            voiceSessionRegistry.unregister(participantIdentity);
          }
          logger.info(
            { roomName, participantIdentity },
            'LiveKit voice participant left room'
          );
          break;
        }

        case 'room_finished': {
          if (parsedRoomId) {
            voiceSessionRegistry.clearRoom(parsedRoomId);
          }
          logger.info(
            { roomName },
            'LiveKit voice room finished'
          );
          break;
        }

        default:
          logger.debug({ eventType: event.event }, 'Ignored unhandled LiveKit webhook event');
          break;
      }

      res.status(200).json({ received: true });
    } catch (err: unknown) {
      logger.warn(
        {
          correlationId,
          err: err instanceof Error ? err.message : String(err),
        },
        'LiveKit webhook signature verification failed'
      );
      res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }
}

export const voiceWebhookController = new VoiceWebhookController();
