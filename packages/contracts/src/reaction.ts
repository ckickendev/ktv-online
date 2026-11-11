import { z } from 'zod';

export const STAGE_REACTION_EMOJIS = ['👏', '🔥', '❤️', '🎉', '🎤'] as const;
export type StageReactionEmoji = (typeof STAGE_REACTION_EMOJIS)[number];

export const StageReactionEmojiSchema = z.enum(STAGE_REACTION_EMOJIS);

// Client -> Server: Send stage reaction
export const SendStageReactionPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  emoji: StageReactionEmojiSchema,
  clientReactionId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type SendStageReactionPayload = z.infer<typeof SendStageReactionPayloadSchema>;

// Server -> Client: Authoritative stage reaction broadcast
export const StageReactionSenderSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});
export type StageReactionSender = z.infer<typeof StageReactionSenderSchema>;

export const StageReactionNewPayloadSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  emoji: StageReactionEmojiSchema,
  sender: StageReactionSenderSchema,
  timestamp: z.string(),
  clientReactionId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type StageReactionNewPayload = z.infer<typeof StageReactionNewPayloadSchema>;
