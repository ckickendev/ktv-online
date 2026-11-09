import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { voiceSessionRegistry } from './voice-session.registry.js';
import { RoomModel } from '../rooms/room.model.js';
import { voiceService } from './voice.service.js';
import { VoiceWebhookEventModel } from './voice-webhook-event.model.js';
import { assertMonotonicEventOrder } from './voice-participant-sequence.model.js';

export class VoiceWebhookController {
  private receiver: WebhookReceiver | null = null;
  private readonly instanceId: string;

  constructor() {
    this.instanceId = `webhook_handler_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  }

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
   * Generates a deterministic, collision-resistant event ID if LiveKit omits an official event ID.
   */
  private getDeterministicEventId(event: {
    id?: string;
    event?: string;
    createdAt?: number | string | bigint;
    room?: { name?: string };
    participant?: { identity?: string };
  }): string {
    if (event.id && event.id.trim().length > 0) {
      return event.id.trim();
    }
    const raw = [
      event.event || 'unknown',
      String(event.createdAt || ''),
      event.room?.name || '',
      event.participant?.identity || '',
    ].join(':');

    return `wh_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
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

    let event;
    try {
      // 1. Mandatory official SDK signature verification before any processing
      event = await receiver.receive(bodyString, authHeader);
    } catch (err: unknown) {
      logger.warn(
        {
          correlationId,
          err: err instanceof Error ? err.message : String(err),
        },
        'LiveKit webhook signature verification failed'
      );
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const eventId = this.getDeterministicEventId(event);
    const roomName = event.room?.name || '';
    const participantIdentity = event.participant?.identity || '';
    const eventTimestampMs = Number(event.createdAt) ? Number(event.createdAt) * 1000 : Date.now();

    // 2. Durable Deduplication & Atomic Claim in MongoDB across all API instances
    const claimResult = await VoiceWebhookEventModel.claimEvent(
      eventId,
      event.event,
      roomName,
      eventTimestampMs,
      this.instanceId,
      participantIdentity || undefined
    );

    if (!claimResult.claimed) {
      logger.info(
        { correlationId, eventId, eventType: event.event },
        'Duplicate or in-flight LiveKit webhook event ignored'
      );
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    const eventDoc = claimResult.eventDoc;

    try {
      // 3. Monotonic Ordering Check per participant in room (across all instances)
      if (participantIdentity && roomName) {
        const participantKey = `${roomName}:${participantIdentity}`;
        const isMonotonic = await assertMonotonicEventOrder(
          participantKey,
          eventTimestampMs,
          event.event
        );

        if (!isMonotonic) {
          logger.warn(
            { correlationId, eventId, eventType: event.event, participantKey, eventTimestampMs },
            'Stale out-of-order LiveKit webhook event ignored'
          );
          if (eventDoc) {
            eventDoc.status = 'completed';
            eventDoc.processedAt = new Date();
            await eventDoc.save();
          }
          res.status(200).json({ received: true, stale: true });
          return;
        }
      }

      logger.info(
        {
          correlationId,
          eventType: event.event,
          roomName,
          participantIdentity,
          eventId,
        },
        'Processing claimed LiveKit webhook event'
      );

      // Extract raw roomId from ktv_room_<roomId>
      const parsedRoomId = roomName.startsWith('ktv_room_') ? roomName.replace('ktv_room_', '') : undefined;

      // 4. Handle lifecycle events ephemerally (NEVER mutate Room.currentParticipantsCount or RoomMembership)
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

      // 5. Mark event as completed
      if (eventDoc) {
        eventDoc.status = 'completed';
        eventDoc.processedAt = new Date();
        eventDoc.error = null;
        await eventDoc.save();
      }

      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { correlationId, eventId, eventType: event.event, err: errorMsg },
        'Error processing claimed LiveKit webhook event'
      );

      if (eventDoc) {
        eventDoc.status = 'failed';
        eventDoc.error = errorMsg;
        await eventDoc.save();
      }

      res.status(500).json({ error: 'Internal webhook processing failure' });
    }
  }
}

export const voiceWebhookController = new VoiceWebhookController();
