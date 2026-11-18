import { z } from 'zod';

// ==========================================
// Basic Spatial Coordinates & Posture Enums
// ==========================================

export const SpatialPositionSchema = z.object({
  col: z.number(),
  row: z.number(),
  elevation: z.number().default(0),
});
export type SpatialPosition = z.infer<typeof SpatialPositionSchema>;

export const RoomSeatTypeSchema = z.enum(['sofa', 'vip', 'stage']);
export type RoomSeatType = z.infer<typeof RoomSeatTypeSchema>;

export const RoomDirectionSchema = z.enum(['front', 'left', 'right', 'back']);
export type RoomDirection = z.infer<typeof RoomDirectionSchema>;

export const AvatarPostureSchema = z.enum(['idle', 'sitting', 'standing', 'walking']);
export type AvatarPosture = z.infer<typeof AvatarPostureSchema>;

export const AvatarActivitySchema = z.enum(['listening', 'speaking', 'singing', 'dancing']);
export type AvatarActivity = z.infer<typeof AvatarActivitySchema>;

// ==========================================
// Seats and Avatar Entity Schemas
// ==========================================

export const RoomSeatSchema = z.object({
  id: z.string(),
  type: RoomSeatTypeSchema,
  position: SpatialPositionSchema,
  direction: RoomDirectionSchema.default('front'),
  occupiedBy: z.string().nullable().default(null),
  enabled: z.boolean().default(true),
});
export type RoomSeat = z.infer<typeof RoomSeatSchema>;

export const RoomAvatarSchema = z.object({
  userId: z.string(),
  username: z.string().optional(),
  displayName: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  seatId: z.string().nullable().default(null),
  position: SpatialPositionSchema,
  direction: RoomDirectionSchema.default('front'),
  posture: AvatarPostureSchema.default('idle'),
  activity: AvatarActivitySchema.default('listening'),
});
export type RoomAvatar = z.infer<typeof RoomAvatarSchema>;

export const RoomSpatialStateSchema = z.object({
  roomId: z.string(),
  version: z.number().default(1),
  seats: z.array(RoomSeatSchema).default([]),
  avatars: z.array(RoomAvatarSchema).default([]),
});
export type RoomSpatialState = z.infer<typeof RoomSpatialStateSchema>;

// ==========================================
// Proposed Realtime Spatial Event Payloads
// ==========================================

export const SpatialSeatOccupyPayloadSchema = z.object({
  roomId: z.string(),
  seatId: z.string(),
  correlationId: z.string().optional(),
});
export type SpatialSeatOccupyPayload = z.infer<typeof SpatialSeatOccupyPayloadSchema>;

export const SpatialSeatVacatePayloadSchema = z.object({
  roomId: z.string(),
  seatId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type SpatialSeatVacatePayload = z.infer<typeof SpatialSeatVacatePayloadSchema>;

export const SpatialMoveRequestPayloadSchema = z.object({
  roomId: z.string(),
  destination: SpatialPositionSchema,
  requestId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type SpatialMoveRequestPayload = z.infer<typeof SpatialMoveRequestPayloadSchema>;

export const SpatialSeatUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  seat: RoomSeatSchema,
  correlationId: z.string().optional(),
});
export type SpatialSeatUpdatedPayload = z.infer<typeof SpatialSeatUpdatedPayloadSchema>;

export const SpatialAvatarMovedPayloadSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  from: SpatialPositionSchema,
  to: SpatialPositionSchema,
  direction: RoomDirectionSchema,
  sequence: z.number().default(1),
  correlationId: z.string().optional(),
});
export type SpatialAvatarMovedPayload = z.infer<typeof SpatialAvatarMovedPayloadSchema>;

export const SpatialAvatarUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  avatar: RoomAvatarSchema,
  correlationId: z.string().optional(),
});
export type SpatialAvatarUpdatedPayload = z.infer<typeof SpatialAvatarUpdatedPayloadSchema>;

// ==========================================
// Event Names Constants (Proposed S4 Events)
// ==========================================

export const SPATIAL_SOCKET_EVENTS = {
  CLIENT: {
    SEAT_OCCUPY: 'spatial:seat:occupy',
    SEAT_VACATE: 'spatial:seat:vacate',
    MOVE_REQUEST: 'spatial:move:request',
    INTERACTION_REQUEST: 'spatial:interaction:request',
  },
  SERVER: {
    STATE_SNAPSHOT: 'spatial:state:snapshot',
    SEAT_UPDATED: 'spatial:seat:updated',
    AVATAR_MOVED: 'spatial:avatar:moved',
    AVATAR_UPDATED: 'spatial:avatar:updated',
    INTERACTION_NEW: 'spatial:interaction:new',
  },
} as const;
