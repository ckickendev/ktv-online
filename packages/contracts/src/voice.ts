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
