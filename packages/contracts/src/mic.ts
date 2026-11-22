import { z } from 'zod';

// ==========================================
// S3 VIRTUAL MICROPHONE OWNERSHIP CONTRACTS
// ==========================================

export const MicOwnershipStateSchema = z.enum([
  'AVAILABLE',
  'REQUEST_PENDING',
  'OCCUPIED',
]);
export type MicOwnershipState = z.infer<typeof MicOwnershipStateSchema>;

export const MicSingerDtoSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  grantedAt: z.string().datetime().nullable().optional(),
});
export type MicSingerDto = z.infer<typeof MicSingerDtoSchema>;

export const MicPendingRequestDtoSchema = z.object({
  requestId: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  requestedAt: z.string().datetime(),
});
export type MicPendingRequestDto = z.infer<typeof MicPendingRequestDtoSchema>;

export const MicOwnershipSnapshotDtoSchema = z.object({
  roomId: z.string().min(1),
  state: MicOwnershipStateSchema,
  currentSinger: MicSingerDtoSchema.nullable(),
  currentSingerId: z.string().nullable(),
  currentSingerSessionId: z.string().nullable(),
  pendingRequests: z.array(MicPendingRequestDtoSchema),
  ownershipVersion: z.number().int().positive(),
  grantedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable().optional(),
  updatedAt: z.string().datetime(),
});
export type MicOwnershipSnapshotDto = z.infer<typeof MicOwnershipSnapshotDtoSchema>;

// ==========================================
// CLIENT -> SERVER COMMAND PAYLOADS
// ==========================================

export const MicRequestPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});
export type MicRequestPayload = z.infer<typeof MicRequestPayloadSchema>;

export const MicCancelPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  requestId: z.string().min(1).optional(),
  expectedOwnershipVersion: z.number().int().positive().optional(),
  correlationId: z.string().optional(),
});
export type MicCancelPayload = z.infer<typeof MicCancelPayloadSchema>;

export const MicApprovePayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  targetUserId: z.string().min(1, 'Target user ID is required'),
  requestId: z.string().min(1).optional(),
  expectedOwnershipVersion: z.number().int().positive().optional(),
  correlationId: z.string().optional(),
});
export type MicApprovePayload = z.infer<typeof MicApprovePayloadSchema>;

export const MicRejectPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  targetUserId: z.string().min(1, 'Target user ID is required'),
  requestId: z.string().min(1).optional(),
  reason: z.string().trim().max(200).optional(),
  expectedOwnershipVersion: z.number().int().positive().optional(),
  correlationId: z.string().optional(),
});
export type MicRejectPayload = z.infer<typeof MicRejectPayloadSchema>;

export const MicReleasePayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  expectedOwnershipVersion: z.number().int().positive().optional(),
  expectedSessionId: z.string().min(1).optional(),
  correlationId: z.string().optional(),
});
export type MicReleasePayload = z.infer<typeof MicReleasePayloadSchema>;

export const MicStateRequestPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});
export type MicStateRequestPayload = z.infer<typeof MicStateRequestPayloadSchema>;

// ==========================================
// SERVER -> CLIENT SNAPSHOT & EVENT PAYLOADS
// ==========================================

export const MicStatePayloadSchema = MicOwnershipSnapshotDtoSchema.extend({
  correlationId: z.string().optional(),
});
export type MicStatePayload = z.infer<typeof MicStatePayloadSchema>;

export const MicRequestCreatedPayloadSchema = z.object({
  roomId: z.string().min(1),
  request: MicPendingRequestDtoSchema,
  state: MicOwnershipStateSchema,
  pendingRequests: z.array(MicPendingRequestDtoSchema),
  ownershipVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  correlationId: z.string().optional(),
});
export type MicRequestCreatedPayload = z.infer<typeof MicRequestCreatedPayloadSchema>;

export const MicRequestCancelledReasonSchema = z.enum([
  'cancelled',
  'rejected',
  'departed',
  'disconnected',
  'kicked',
  'muted',
  'room_closed',
]);
export type MicRequestCancelledReason = z.infer<typeof MicRequestCancelledReasonSchema>;

export const MicRequestCancelledPayloadSchema = z.object({
  roomId: z.string().min(1),
  userId: z.string().min(1),
  requestId: z.string().min(1),
  reason: MicRequestCancelledReasonSchema,
  actorUserId: z.string().optional(),
  rejectionReason: z.string().optional(),
  state: MicOwnershipStateSchema,
  pendingRequests: z.array(MicPendingRequestDtoSchema),
  ownershipVersion: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  correlationId: z.string().optional(),
});
export type MicRequestCancelledPayload = z.infer<typeof MicRequestCancelledPayloadSchema>;

export const MicOwnershipChangeReasonSchema = z.enum([
  'approved',
  'released',
  'host_forced_release',
  'singer_disconnected',
  'singer_left',
  'singer_kicked',
  'singer_muted',
  'room_closed',
]);
export type MicOwnershipChangeReason = z.infer<typeof MicOwnershipChangeReasonSchema>;

export const MicOwnershipChangedPayloadSchema = z.object({
  roomId: z.string().min(1),
  previousSingerId: z.string().nullable(),
  previousSingerSessionId: z.string().nullable(),
  currentSinger: MicSingerDtoSchema.nullable(),
  currentSingerId: z.string().nullable(),
  currentSingerSessionId: z.string().nullable(),
  pendingRequests: z.array(MicPendingRequestDtoSchema),
  state: MicOwnershipStateSchema,
  reason: MicOwnershipChangeReasonSchema,
  actorUserId: z.string().optional(),
  ownershipVersion: z.number().int().positive(),
  grantedAt: z.string().datetime().nullable(),
  occurredAt: z.string().datetime(),
  correlationId: z.string().optional(),
});
export type MicOwnershipChangedPayload = z.infer<typeof MicOwnershipChangedPayloadSchema>;
