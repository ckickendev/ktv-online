import { z } from 'zod';

// Error payload
export const SocketErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  correlationId: z.string().optional(),
});
export type SocketErrorPayload = z.infer<typeof SocketErrorPayloadSchema>;

// Standard Acknowledgement payload
export const SocketAckResponseSchema = z.object({
  success: z.boolean(),
  error: SocketErrorPayloadSchema.optional(),
  data: z.unknown().optional(),
  correlationId: z.string().optional(),
});
export type SocketAckResponse<T = unknown> = {
  success: boolean;
  error?: SocketErrorPayload;
  data?: T;
  correlationId?: string;
};

// Client -> Server payloads
export const JoinRoomPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

export const LeaveRoomPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});
export type LeaveRoomPayload = z.infer<typeof LeaveRoomPayloadSchema>;

export const PresenceRequestPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});
export type PresenceRequestPayload = z.infer<typeof PresenceRequestPayloadSchema>;

// Presence member representation (minimal, safe user DTO)
export const PresenceMemberDtoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
  role: z.enum(['host', 'member', 'viewer']).default('member'),
  isOnline: z.boolean().default(true),
  deviceCount: z.number().int().positive().default(1),
  joinedAt: z.string().optional(),
});
export type PresenceMemberDto = z.infer<typeof PresenceMemberDtoSchema>;

// Server -> Client payloads
export const RoomPresenceSnapshotPayloadSchema = z.object({
  roomId: z.string(),
  onlineUsers: z.array(PresenceMemberDtoSchema),
  totalOnline: z.number().int().nonnegative(),
  correlationId: z.string().optional(),
});
export type RoomPresenceSnapshotPayload = z.infer<typeof RoomPresenceSnapshotPayloadSchema>;

export const RoomMemberJoinedPayloadSchema = z.object({
  roomId: z.string(),
  user: PresenceMemberDtoSchema,
  totalOnline: z.number().int().positive(),
  correlationId: z.string().optional(),
});
export type RoomMemberJoinedPayload = z.infer<typeof RoomMemberJoinedPayloadSchema>;

export const RoomMemberLeftPayloadSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  username: z.string().optional(),
  totalOnline: z.number().int().nonnegative(),
  correlationId: z.string().optional(),
});
export type RoomMemberLeftPayload = z.infer<typeof RoomMemberLeftPayloadSchema>;

export const RoomClosedPayloadSchema = z.object({
  roomId: z.string(),
  reason: z.string().default('Room has been closed by host'),
  correlationId: z.string().optional(),
});
export type RoomClosedPayload = z.infer<typeof RoomClosedPayloadSchema>;

export const PresenceUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  isOnline: z.boolean(),
  totalOnline: z.number().int().nonnegative(),
  correlationId: z.string().optional(),
});
export type PresenceUpdatedPayload = z.infer<typeof PresenceUpdatedPayloadSchema>;

export const MemberRoleUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  role: z.enum(['host', 'moderator', 'member']),
  updatedBy: z.string(),
  correlationId: z.string().optional(),
});
export type MemberRoleUpdatedPayload = z.infer<typeof MemberRoleUpdatedPayloadSchema>;

export const MemberMutedPayloadSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  isMuted: z.boolean(),
  mutedBy: z.string(),
  reason: z.string().optional(),
  correlationId: z.string().optional(),
});
export type MemberMutedPayload = z.infer<typeof MemberMutedPayloadSchema>;

export const RoomLockUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  isLocked: z.boolean(),
  updatedBy: z.string(),
  correlationId: z.string().optional(),
});
export type RoomLockUpdatedPayload = z.infer<typeof RoomLockUpdatedPayloadSchema>;

export const RoomHostTransferredPayloadSchema = z.object({
  roomId: z.string(),
  previousHostId: z.string(),
  newHostId: z.string(),
  newHostUsername: z.string(),
  newHostDisplayName: z.string().nullable().optional(),
  correlationId: z.string().optional(),
});
export type RoomHostTransferredPayload = z.infer<typeof RoomHostTransferredPayloadSchema>;

// Event Names Constants
export const SOCKET_EVENTS = {
  CLIENT: {
    ROOM_JOIN: 'room:join',
    ROOM_LEAVE: 'room:leave',
    PRESENCE_REQUEST: 'room:presence:request',
    ROOM_STATE_REQUEST: 'room:state:request',
    CHAT_MESSAGE_SEND: 'chat:message:send',
    CHAT_REACTION_ADD: 'chat:reaction:add',
    CHAT_REACTION_REMOVE: 'chat:reaction:remove',
    CHAT_MESSAGE_DELETE: 'chat:message:delete',
    KARAOKE_QUEUE_ADD: 'karaoke:queue:add',
    KARAOKE_QUEUE_REMOVE: 'karaoke:queue:remove',
    KARAOKE_QUEUE_REORDER: 'karaoke:queue:reorder',
    KARAOKE_PLAYBACK_COMMAND: 'karaoke:playback:command',
    KARAOKE_STATE_REQUEST: 'karaoke:state:request',
    KARAOKE_CLOCK_SYNC: 'karaoke:clock:sync',
    STAGE_REACTION_SEND: 'stage:reaction:send',
    GIFT_SEND: 'gift:send',
  },
  SERVER: {
    PRESENCE_SNAPSHOT: 'room:presence:snapshot',
    ROOM_STATE_SNAPSHOT: 'room:state:snapshot',
    ROOM_STATE_EVENT: 'room:state:event',
    MEMBER_JOINED: 'room:member:joined',
    MEMBER_LEFT: 'room:member:left',
    MEMBER_ROLE_UPDATED: 'room:member:role-updated',
    MEMBER_MUTED: 'room:member:muted',
    ROOM_LOCK_UPDATED: 'room:lock:updated',
    ROOM_HOST_TRANSFERRED: 'room:host:transferred',
    ROOM_CLOSED: 'room:closed',
    PRESENCE_UPDATED: 'presence:updated',
    CHAT_MESSAGE_NEW: 'chat:message:new',
    CHAT_MESSAGE_DELETED: 'chat:message:deleted',
    CHAT_REACTION_UPDATED: 'chat:reaction:updated',
    CHAT_ERROR: 'chat:error',
    ACTIVITY_NEW: 'room:activity:new',
    MEMBER_KICKED: 'room:member:kicked',
    KARAOKE_QUEUE_UPDATED: 'karaoke:queue:updated',
    KARAOKE_PLAYBACK_UPDATED: 'karaoke:playback:updated',
    KARAOKE_SNAPSHOT: 'karaoke:snapshot',
    KARAOKE_CLOCK_SYNC_RESPONSE: 'karaoke:clock:sync:response',
    KARAOKE_ERROR: 'karaoke:error',
    STAGE_REACTION_NEW: 'stage:reaction:new',
    GIFT_NEW: 'gift:new',
    ERROR: 'error',
  },
} as const;

export type SocketClientEvent =
  (typeof SOCKET_EVENTS.CLIENT)[keyof typeof SOCKET_EVENTS.CLIENT];
export type SocketServerEvent =
  (typeof SOCKET_EVENTS.SERVER)[keyof typeof SOCKET_EVENTS.SERVER];
