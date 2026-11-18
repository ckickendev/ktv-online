import { z } from 'zod';

export const VoiceConnectionStateSchema = z.enum([
  'idle',
  'requesting_permission',
  'connecting',
  'connected',
  'reconnecting',
  'disconnected',
  'failed',
  'unauthorized',
]);

export type VoiceConnectionState = z.infer<typeof VoiceConnectionStateSchema>;

export const VoiceTokenRequestSchema = z.object({
  tabId: z.string().max(64).optional(),
});

export type VoiceTokenRequestDto = z.infer<typeof VoiceTokenRequestSchema>;

export const VoiceTokenResponseSchema = z.object({
  serverUrl: z.string().url(),
  token: z.string().min(1),
  roomName: z.string().min(1),
  participantIdentity: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export type VoiceTokenResponseDto = z.infer<typeof VoiceTokenResponseSchema>;

export const VoiceParticipantDtoSchema = z.object({
  identity: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  isMuted: z.boolean(),
  isSpeaking: z.boolean(),
  joinedAt: z.string().datetime().optional(),
});

export type VoiceParticipantDto = z.infer<typeof VoiceParticipantDtoSchema>;

export const VoiceParticipantEventSchema = z.object({
  roomId: z.string().min(1),
  participant: VoiceParticipantDtoSchema,
  event: z.enum(['joined', 'left', 'updated']),
  timestamp: z.string().datetime(),
});

export type VoiceParticipantEvent = z.infer<typeof VoiceParticipantEventSchema>;

// ==========================================
// S2 Room-Wide Serializable Voice Presence
// ==========================================

export const RoomVoiceParticipantStateSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().optional(),
  isConnected: z.boolean().default(true),
  isMuted: z.boolean().default(false),
  isSpeaking: z.boolean().default(false),
  hasMicTrack: z.boolean().default(false),
  connectionState: VoiceConnectionStateSchema.default('connected'),
  sessionCount: z.number().int().nonnegative().default(1),
  updatedAt: z.string().datetime(),
});

export type RoomVoiceParticipantStateDto = z.infer<typeof RoomVoiceParticipantStateSchema>;

export const VoiceStateRequestPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});

export type VoiceStateRequestPayload = z.infer<typeof VoiceStateRequestPayloadSchema>;

export const VoiceSpeakingUpdatePayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  isSpeaking: z.boolean(),
  isMuted: z.boolean().optional(),
  correlationId: z.string().optional(),
});

export type VoiceSpeakingUpdatePayload = z.infer<typeof VoiceSpeakingUpdatePayloadSchema>;

export const VoiceStateSnapshotPayloadSchema = z.object({
  roomId: z.string().min(1),
  participants: z.array(RoomVoiceParticipantStateSchema),
  correlationId: z.string().optional(),
});

export type VoiceStateSnapshotPayload = z.infer<typeof VoiceStateSnapshotPayloadSchema>;

export const VoiceParticipantUpdatedPayloadSchema = z.object({
  roomId: z.string().min(1),
  participant: RoomVoiceParticipantStateSchema,
  event: z.enum(['joined', 'left', 'updated']),
  timestamp: z.string().datetime(),
  correlationId: z.string().optional(),
});

export type VoiceParticipantUpdatedPayload = z.infer<typeof VoiceParticipantUpdatedPayloadSchema>;
