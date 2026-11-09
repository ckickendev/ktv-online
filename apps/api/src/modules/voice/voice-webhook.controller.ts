import { Request, Response, NextFunction } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class VoiceWebhookController {
  private receiver: WebhookReceiver | null = null;

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

      logger.info(
        {
          correlationId,
          eventType: event.event,
          roomName: event.room?.name,
          participantIdentity: event.participant?.identity,
          eventSid: event.id,
        },
        'Verified and received LiveKit webhook event'
      );

      // Handle lifecycle events ephemerally (DO NOT mutate Room.currentParticipantsCount or RoomMembership)
      switch (event.event) {
        case 'participant_joined':
          logger.info(
            { roomName: event.room?.name, participant: event.participant?.identity },
            'LiveKit voice participant joined'
          );
          break;

        case 'participant_left':
          logger.info(
            { roomName: event.room?.name, participant: event.participant?.identity },
            'LiveKit voice participant left'
          );
          break;

        case 'room_finished':
          logger.info(
            { roomName: event.room?.name },
            'LiveKit voice room finished'
          );
          break;

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
