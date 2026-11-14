import { z } from 'zod';


// ==========================================
// ENUMS & PRIMITIVES
// ==========================================

export const FRIENDSHIP_STATUSES = ['pending', 'accepted', 'declined', 'blocked'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];
export const FriendshipStatusSchema = z.enum(FRIENDSHIP_STATUSES);

export const FRIEND_PRESENCE_STATUSES = ['offline', 'online', 'in_lounge', 'singing'] as const;
export type FriendPresenceStatus = (typeof FRIEND_PRESENCE_STATUSES)[number];
export const FriendPresenceStatusSchema = z.enum(FRIEND_PRESENCE_STATUSES);

// ==========================================
// FRIEND PRESENCE DTO
// ==========================================

export const FriendPresenceDtoSchema = z.object({
  userId: z.string(),
  status: FriendPresenceStatusSchema,
  roomId: z.string().nullable().optional(),
  roomTitle: z.string().nullable().optional(),
  isPrivateLounge: z.boolean().optional(),
  songTitle: z.string().nullable().optional(),
  updatedAt: z.string(),
});
export type FriendPresenceDto = z.infer<typeof FriendPresenceDtoSchema>;

// ==========================================
// FRIEND USER & RELATION DTOS
// ==========================================

export const FriendUserDtoSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  presence: FriendPresenceDtoSchema.optional(),
});
export type FriendUserDto = z.infer<typeof FriendUserDtoSchema>;

export const FriendshipDtoSchema = z.object({
  id: z.string(),
  friend: FriendUserDtoSchema,
  status: FriendshipStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FriendshipDto = z.infer<typeof FriendshipDtoSchema>;

export const FriendRequestDtoSchema = z.object({
  id: z.string(),
  requester: FriendUserDtoSchema,
  addressee: FriendUserDtoSchema,
  status: FriendshipStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FriendRequestDto = z.infer<typeof FriendRequestDtoSchema>;

// ==========================================
// REQUEST PAYLOADS & QUERIES
// ==========================================

export const SendFriendRequestSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
});
export type SendFriendRequestDto = z.infer<typeof SendFriendRequestSchema>;

export const FriendQuerySchema = z.object({
  status: FriendshipStatusSchema.optional().default('accepted'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type FriendQueryDto = z.infer<typeof FriendQuerySchema>;

export const FriendRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type FriendRequestQueryDto = z.infer<typeof FriendRequestQuerySchema>;

export const UserSearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query must not be empty').max(50),
  limit: z.coerce.number().int().positive().max(20).default(10),
});
export type UserSearchQueryDto = z.infer<typeof UserSearchQuerySchema>;

export const UserSearchResultRelationshipSchema = z.enum([
  'none',
  'self',
  'friends',
  'pending_incoming',
  'pending_outgoing',
  'blocked',
]);
export type UserSearchResultRelationship = z.infer<typeof UserSearchResultRelationshipSchema>;

export const UserSearchResultDtoSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  relationship: UserSearchResultRelationshipSchema,
  requestId: z.string().nullable().optional(),
});
export type UserSearchResultDto = z.infer<typeof UserSearchResultDtoSchema>;

export const SendLoungeInviteToFriendSchema = z.object({
  friendUserId: z.string().min(1, 'Friend user ID is required'),
});
export type SendLoungeInviteToFriendDto = z.infer<typeof SendLoungeInviteToFriendSchema>;

// ==========================================
// REALTIME PAYLOAD SCHEMAS
// ==========================================

export const FriendPresenceUpdatedPayloadSchema = z.object({
  userId: z.string(),
  username: z.string(),
  status: FriendPresenceStatusSchema,
  roomId: z.string().nullable().optional(),
  roomTitle: z.string().nullable().optional(),
  isPrivateLounge: z.boolean().optional(),
  songTitle: z.string().nullable().optional(),
  updatedAt: z.string(),
});
export type FriendPresenceUpdatedPayload = z.infer<typeof FriendPresenceUpdatedPayloadSchema>;

export const FriendRequestReceivedPayloadSchema = z.object({
  requestId: z.string(),
  requester: FriendUserDtoSchema,
  createdAt: z.string(),
});
export type FriendRequestReceivedPayload = z.infer<typeof FriendRequestReceivedPayloadSchema>;

export const FriendRequestAcceptedPayloadSchema = z.object({
  friendshipId: z.string(),
  friend: FriendUserDtoSchema,
  acceptedAt: z.string(),
});
export type FriendRequestAcceptedPayload = z.infer<typeof FriendRequestAcceptedPayloadSchema>;

export const FriendInvitationReceivedPayloadSchema = z.object({
  invitationToken: z.string(),
  roomId: z.string(),
  roomTitle: z.string(),
  isPrivate: z.boolean(),
  inviter: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
  }),
  sentAt: z.string(),
});
export type FriendInvitationReceivedPayload = z.infer<typeof FriendInvitationReceivedPayloadSchema>;
