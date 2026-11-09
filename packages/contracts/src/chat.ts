import { z } from 'zod';

// Supported Emoji Reactions Allowlist
export const SUPPORTED_REACTION_EMOJIS = ['❤️', '😂', '🔥', '👏', '🎉', '😍', '👍', '😮'] as const;
export type SupportedReactionEmoji = (typeof SUPPORTED_REACTION_EMOJIS)[number];
export const ReactionEmojiSchema = z.enum(SUPPORTED_REACTION_EMOJIS);

// Reaction Summary (Aggregated counts for UI display)
export const ChatReactionSummarySchema = z.object({
  emoji: ReactionEmojiSchema,
  count: z.number().int().nonnegative(),
  userIds: z.array(z.string()),
});
export type ChatReactionSummaryDto = z.infer<typeof ChatReactionSummarySchema>;

// Message Types
export const ChatMessageTypeSchema = z.enum(['text', 'system']);
export type ChatMessageType = z.infer<typeof ChatMessageTypeSchema>;

// Chat Message DTO
export const ChatMessageDtoSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  senderId: z.string().nullable().optional(),
  senderUsername: z.string(),
  senderAvatar: z.string().nullable().optional(),
  senderRole: z.enum(['host', 'member', 'viewer', 'system']).default('member'),
  content: z.string(),
  messageType: ChatMessageTypeSchema.default('text'),
  clientMessageId: z.string().optional(),
  isDeleted: z.boolean().default(false),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
  reactions: z.array(ChatReactionSummarySchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type ChatMessageDto = z.infer<typeof ChatMessageDtoSchema>;

// Client -> Server Payloads
export const SendChatMessagePayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message cannot exceed 1000 characters'),
  clientMessageId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type SendChatMessagePayload = z.infer<typeof SendChatMessagePayloadSchema>;

export const AddReactionPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  messageId: z.string().min(1, 'Message ID is required'),
  emoji: ReactionEmojiSchema,
  correlationId: z.string().optional(),
});
export type AddReactionPayload = z.infer<typeof AddReactionPayloadSchema>;

export const RemoveReactionPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  messageId: z.string().min(1, 'Message ID is required'),
  emoji: ReactionEmojiSchema,
  correlationId: z.string().optional(),
});
export type RemoveReactionPayload = z.infer<typeof RemoveReactionPayloadSchema>;

export const DeleteChatMessagePayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  messageId: z.string().min(1, 'Message ID is required'),
  correlationId: z.string().optional(),
});
export type DeleteChatMessagePayload = z.infer<typeof DeleteChatMessagePayloadSchema>;

// Server -> Client Payloads
export const ChatMessageNewPayloadSchema = z.object({
  roomId: z.string(),
  message: ChatMessageDtoSchema,
  correlationId: z.string().optional(),
});
export type ChatMessageNewPayload = z.infer<typeof ChatMessageNewPayloadSchema>;

export const ChatMessageDeletedPayloadSchema = z.object({
  roomId: z.string(),
  messageId: z.string(),
  deletedBy: z.string(),
  correlationId: z.string().optional(),
});
export type ChatMessageDeletedPayload = z.infer<typeof ChatMessageDeletedPayloadSchema>;

export const ChatReactionUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  messageId: z.string(),
  reactions: z.array(ChatReactionSummarySchema),
  correlationId: z.string().optional(),
});
export type ChatReactionUpdatedPayload = z.infer<typeof ChatReactionUpdatedPayloadSchema>;

export const ChatErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  clientMessageId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type ChatErrorPayload = z.infer<typeof ChatErrorPayloadSchema>;

// Activity Feed Contracts
export const RoomActivityTypeSchema = z.enum([
  'room_created',
  'member_joined',
  'member_left',
  'member_kicked',
  'room_settings_updated',
  'room_closed',
]);
export type RoomActivityType = z.infer<typeof RoomActivityTypeSchema>;

export const RoomActivityDtoSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  type: RoomActivityTypeSchema,
  actor: z.object({
    id: z.string(),
    username: z.string(),
    avatar: z.string().nullable().optional(),
    role: z.string().optional(),
  }),
  target: z
    .object({
      id: z.string(),
      username: z.string(),
    })
    .optional(),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});
export type RoomActivityDto = z.infer<typeof RoomActivityDtoSchema>;

export const RoomActivityNewPayloadSchema = z.object({
  roomId: z.string(),
  activity: RoomActivityDtoSchema,
});
export type RoomActivityNewPayload = z.infer<typeof RoomActivityNewPayloadSchema>;

export const RoomMemberKickedPayloadSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  reason: z.string().default('You were removed from the room by the host'),
});
export type RoomMemberKickedPayload = z.infer<typeof RoomMemberKickedPayloadSchema>;

// REST Query Schemas
export const GetMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});
export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;

export const KickMemberPayloadSchema = z.object({
  reason: z.string().max(200).optional(),
});
export type KickMemberPayload = z.infer<typeof KickMemberPayloadSchema>;
