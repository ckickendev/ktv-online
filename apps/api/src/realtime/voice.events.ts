import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import {
  SOCKET_EVENTS,
  SocketAckResponse,
  VoiceStateRequestPayloadSchema,
  VoiceSpeakingUpdatePayloadSchema,
} from '@ktv/contracts';
import { RoomModel } from '../modules/rooms/room.model.js';
import { RoomMembershipModel } from '../modules/rooms/membership.model.js';
import {
  voicePresenceStore,
  VoiceParticipantUpdateResult,
} from '../modules/voice/voice-presence.store.js';
import { voiceSessionRegistry } from '../modules/voice/voice-session.registry.js';
import { getRoomChannel } from './room.events.js';
import { AuthenticatedSocketData } from './socket.auth.js';
import { logger } from '../utils/logger.js';

export function broadcastVoiceParticipantUpdate(
  io: Server,
  roomId: string,
  update: VoiceParticipantUpdateResult,
  correlationId?: string
): void {
  const channel = getRoomChannel(roomId);
  const eventName =
    update.event === 'joined'
      ? SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_JOINED
      : update.event === 'left'
      ? SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_LEFT
      : SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_UPDATED;

  io.to(channel).emit(eventName, {
    roomId,
    participant: update.participant,
    event: update.event,
    timestamp: new Date().toISOString(),
    correlationId,
  });
}

export function broadcastVoiceRoomCleared(
  io: Server,
  roomId: string,
  leftResults: VoiceParticipantUpdateResult[]
): void {
  const channel = getRoomChannel(roomId);
  for (const res of leftResults) {
    broadcastVoiceParticipantUpdate(io, roomId, res);
  }
  io.to(channel).emit(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, {
    roomId,
    participants: [],
  });
}

export function registerVoiceEvents(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>
): void {
  const user = socket.data.user;

  // 1. Client requests current room voice presence snapshot
  socket.on(
    SOCKET_EVENTS.CLIENT.VOICE_STATE_REQUEST,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = VoiceStateRequestPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid voice state request payload',
          },
        });
        return;
      }

      const { roomId, correlationId } = parsed.data;
      if (!Types.ObjectId.isValid(roomId)) {
        ack?.({
          success: false,
          error: { code: 'INVALID_ROOM_ID', message: 'Invalid room ID format' },
          correlationId,
        });
        return;
      }

      try {
        const roomObjectId = new Types.ObjectId(roomId);
        const room = await RoomModel.findById(roomObjectId)
          .select('status visibility ownerId')
          .lean()
          .exec();

        if (!room) {
          ack?.({
            success: false,
            error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' },
            correlationId,
          });
          return;
        }

        const isOwner = room.ownerId.toString() === user.id;
        if (room.visibility === 'private' && !isOwner) {
          const isMember = await RoomMembershipModel.exists({
            roomId: roomObjectId,
            userId: new Types.ObjectId(user.id),
            status: 'active',
          });
          if (!isMember) {
            ack?.({
              success: false,
              error: {
                code: 'FORBIDDEN_PRIVATE_ROOM',
                message: 'Unauthorized to view private room voice state',
              },
              correlationId,
            });
            return;
          }
        }

        const participants = voicePresenceStore.getRoomSnapshot(roomId);
        socket.emit(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, {
          roomId,
          participants,
          correlationId,
        });

        ack?.({
          success: true,
          data: { roomId, participants },
          correlationId,
        });
      } catch (err) {
        logger.error({ err, roomId, userId: user.id }, 'Error handling voice:state:request');
        ack?.({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve voice state' },
          correlationId,
        });
      }
    }
  );

  // 2. Client sends throttled speaking / mute telemetry (NON-AUTHORITATIVE)
  socket.on(
    SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = VoiceSpeakingUpdatePayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid speaking update payload',
          },
        });
        return;
      }

      const { roomId, isSpeaking, isMuted, correlationId } = parsed.data;
      if (!Types.ObjectId.isValid(roomId)) {
        ack?.({
          success: false,
          error: { code: 'INVALID_ROOM_ID', message: 'Invalid room ID format' },
          correlationId,
        });
        return;
      }

      try {
        // Verify active room membership & check server moderation mute
        const membership = await RoomMembershipModel.findOne({
          roomId: new Types.ObjectId(roomId),
          userId: new Types.ObjectId(user.id),
          status: 'active',
          kickedAt: null,
        })
          .select('isMuted')
          .lean()
          .exec();

        if (!membership) {
          ack?.({
            success: false,
            error: {
              code: 'FORBIDDEN_NOT_MEMBER',
              message: 'Active room membership required for voice updates',
            },
            correlationId,
          });
          return;
        }

        const hasActiveVoiceSession =
          voiceSessionRegistry.getByUserAndRoom(roomId, user.id).length > 0;

        const { allowed, result } = voicePresenceStore.updateSpeakingState({
          roomId,
          userId: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatarUrl: user.avatar || undefined,
          isSpeaking,
          isMuted,
          isModerationMuted: Boolean(membership.isMuted),
          hasActiveVoiceSession,
        });

        if (allowed && result) {
          broadcastVoiceParticipantUpdate(io, roomId, result, correlationId);
        }

        ack?.({
          success: true,
          data: { applied: allowed },
          correlationId,
        });
      } catch (err) {
        logger.error({ err, roomId, userId: user.id }, 'Error handling voice:speaking:update');
        ack?.({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to update voice speaking state' },
          correlationId,
        });
      }
    }
  );
}
