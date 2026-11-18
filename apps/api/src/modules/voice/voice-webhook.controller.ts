import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { WebhookReceiver, TrackSource } from 'livekit-server-sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { voiceSessionRegistry } from './voice-session.registry.js';
import { voicePresenceStore } from './voice-presence.store.js';
import { RoomModel } from '../rooms/room.model.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import { voiceService } from './voice.service.js';
import { VoiceWebhookEventModel } from './voice-webhook-event.model.js';
import { assertMonotonicEventOrder } from './voice-participant-sequence.model.js';
import { VoiceParticipantMetadata } from './voice.types.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import {
  broadcastVoiceParticipantUpdate,
  broadcastVoiceRoomCleared,
} from '../../realtime/voice.events.js';

function extractParticipantInfo(participant?: {
  identity?: string;
  name?: string;
  metadata?: string;
}): {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
} | null {
  const identity = participant?.identity;
  if (!identity) return null;

  let metadataObj: Partial<VoiceParticipantMetadata> = {};
  if (participant?.metadata) {
    try {
      metadataObj = JSON.parse(participant.metadata) as Partial<VoiceParticipantMetadata>;
    } catch {
      // ignore invalid JSON metadata
    }
  }

  const userId = metadataObj.userId || identity.split('_')[0] || identity;
  const username = metadataObj.username || participant?.name || 'Member';
  const displayName = metadataObj.displayName || participant?.name || username;

  return {
    userId,
    username,
    displayName,
    avatarUrl: metadataObj.avatarUrl,
  };
}

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
   * Discriminates across event type, creation timestamp, room name, participant identity, and track/egress IDs.
   */
  private getDeterministicEventId(event: {
    id?: string;
    event?: string;
    createdAt?: number | string | bigint;
    room?: { name?: string };
    participant?: { identity?: string };
    track?: { sid?: string };
    egressInfo?: { egressId?: string };
  }): string {
    if (event.id && event.id.trim().length > 0) {
      return event.id.trim();
    }
    const raw = [
      event.event || 'unknown',
      String(event.createdAt || ''),
      event.room?.name || '',
      event.participant?.identity || '',
      event.track?.sid || event.egressInfo?.egressId || '',
    ].join(':');

    return `wh_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
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
    // Documented timestamp source and precision:
    // LiveKit server webhooks provide `createdAt` as a Unix timestamp (seconds or milliseconds).
    // Standardize to millisecond precision for monotonic sequence tracking.
    const rawCreatedAt = Number(event.createdAt);
    let eventTimestampMs: number;
    if (rawCreatedAt > 1e11) {
      // Already in milliseconds
      eventTimestampMs = Math.floor(rawCreatedAt);
    } else if (rawCreatedAt > 0) {
      // Seconds -> convert to milliseconds
      eventTimestampMs = Math.floor(rawCreatedAt * 1000);
    } else {
      eventTimestampMs = Date.now();
    }

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
      const participantInfo = extractParticipantInfo(event.participant);

      // 4. Handle lifecycle events ephemerally (NEVER mutate Room.currentParticipantsCount or RoomMembership)
      switch (event.event) {
        case 'participant_joined': {
          let isModerationMuted = false;

          // If KTVOnline room is already closed or user is not an active member, evict delayed participant
          if (parsedRoomId && participantIdentity) {
            if (Types.ObjectId.isValid(parsedRoomId)) {
              const dbRoom = await RoomModel.findById(parsedRoomId).select('status').lean().exec();
              if (dbRoom && dbRoom.status === 'closed') {
                logger.warn(
                  { correlationId, roomId: parsedRoomId, participantIdentity },
                  'Participant joined closed room in LiveKit; evicting participant'
                );
                if (participantInfo?.userId) {
                  await voiceService.evictLiveKitParticipant(parsedRoomId, participantInfo.userId);
                }
                break;
              }

              if (participantInfo?.userId && Types.ObjectId.isValid(participantInfo.userId)) {
                const membership = await RoomMembershipModel.findOne({
                  roomId: new Types.ObjectId(parsedRoomId),
                  userId: new Types.ObjectId(participantInfo.userId),
                  status: 'active',
                  kickedAt: null,
                })
                  .select('isMuted')
                  .lean()
                  .exec();

                if (!membership && dbRoom) {
                  logger.warn(
                    { correlationId, roomId: parsedRoomId, userId: participantInfo.userId },
                    'Non-member joined LiveKit room; evicting participant'
                  );
                  await voiceService.evictLiveKitParticipant(parsedRoomId, participantInfo.userId);
                  break;
                }
                isModerationMuted = Boolean(membership?.isMuted);
              }
            }

            if (participantInfo) {
              const update = voicePresenceStore.markParticipantJoined({
                roomId: parsedRoomId,
                userId: participantInfo.userId,
                username: participantInfo.username,
                displayName: participantInfo.displayName,
                avatarUrl: participantInfo.avatarUrl,
                identity: participantIdentity,
                isModerationMuted,
              });
              const io = getSocketServer();
              if (io) {
                broadcastVoiceParticipantUpdate(io, parsedRoomId, update, correlationId);
              }
            }
          }

          logger.info(
            { roomName, participantIdentity },
            'LiveKit voice participant joined room'
          );
          break;
        }

        case 'participant_left':
        case 'participant_connection_aborted': {
          if (participantIdentity) {
            voiceSessionRegistry.unregister(participantIdentity);
          }
          if (parsedRoomId && participantInfo) {
            const update = voicePresenceStore.markParticipantLeft(
              parsedRoomId,
              participantInfo.userId,
              participantIdentity
            );
            if (update) {
              const io = getSocketServer();
              if (io) {
                broadcastVoiceParticipantUpdate(io, parsedRoomId, update, correlationId);
              }
            }
          }
          logger.info(
            { roomName, participantIdentity, eventType: event.event },
            'LiveKit voice participant left room'
          );
          break;
        }

        case 'track_published': {
          const isAudioTrack =
            event.track?.source === TrackSource.MICROPHONE || event.track?.type === 0;
          if (parsedRoomId && participantIdentity && participantInfo && event.track?.sid && isAudioTrack) {
            const update = voicePresenceStore.markTrackPublished({
              roomId: parsedRoomId,
              userId: participantInfo.userId,
              username: participantInfo.username,
              displayName: participantInfo.displayName,
              avatarUrl: participantInfo.avatarUrl,
              identity: participantIdentity,
              trackSid: event.track.sid,
              isMuted: Boolean(event.track.muted),
            });
            const io = getSocketServer();
            if (io) {
              broadcastVoiceParticipantUpdate(io, parsedRoomId, update, correlationId);
            }
          }
          logger.info(
            { roomName, participantIdentity, trackSid: event.track?.sid },
            'LiveKit voice track published'
          );
          break;
        }

        case 'track_unpublished': {
          const isAudioTrack =
            event.track?.source === TrackSource.MICROPHONE || event.track?.type === 0;
          if (parsedRoomId && participantInfo && isAudioTrack) {
            const update = voicePresenceStore.markTrackUnpublished(
              parsedRoomId,
              participantInfo.userId,
              event.track?.sid
            );
            if (update) {
              const io = getSocketServer();
              if (io) {
                broadcastVoiceParticipantUpdate(io, parsedRoomId, update, correlationId);
              }
            }
          }
          logger.info(
            { roomName, participantIdentity, trackSid: event.track?.sid },
            'LiveKit voice track unpublished'
          );
          break;
        }

        case 'room_finished': {
          if (parsedRoomId) {
            voiceSessionRegistry.clearRoom(parsedRoomId);
            const cleared = voicePresenceStore.clearRoom(parsedRoomId);
            const io = getSocketServer();
            if (io && cleared.length > 0) {
              broadcastVoiceRoomCleared(io, parsedRoomId, cleared);
            }
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
