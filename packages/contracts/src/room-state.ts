import { z } from 'zod';
import {
  HostDtoSchema,
  RoomCategorySchema,
  RoomMembershipDtoSchema,
  RoomStatusSchema,
  RoomTypeSchema,
  RoomVisibilitySchema,
  RoomAtmospherePresetSchema,
} from './room.js';

// Safe snapshot representation of Room entity
export const RoomSnapshotDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  ownerId: z.string(),
  roomType: RoomTypeSchema,
  visibility: RoomVisibilitySchema,
  capacity: z.number().int(),
  status: RoomStatusSchema,
  category: RoomCategorySchema,
  currentParticipantsCount: z.number().int().nonnegative(),
  isChatEnabled: z.boolean().default(true),
  isLocked: z.boolean().default(false).optional(),
  atmospherePreset: RoomAtmospherePresetSchema.default('midnight_lounge').optional(),
  stateVersion: z.number().int().positive().optional(),
  currentSongTitle: z.string().nullable().optional(),
  currentSingerName: z.string().nullable().optional(),
});
export type RoomSnapshotDto = z.infer<typeof RoomSnapshotDtoSchema>;

// Viewer state in relation to the room
export const RoomViewerStateSchema = z.object({
  isMember: z.boolean(),
  role: z.enum(['host', 'moderator', 'member', 'viewer', 'none']).default('none'),
  isMuted: z.boolean().default(false),
  isKicked: z.boolean().default(false),
});
export type RoomViewerState = z.infer<typeof RoomViewerStateSchema>;

// Authoritative Room State Snapshot
export const RoomStateSnapshotSchema = z.object({
  room: RoomSnapshotDtoSchema,
  host: HostDtoSchema,
  members: z.array(RoomMembershipDtoSchema),
  presence: z.array(z.string()), // Array of active online userIds in room
  viewer: RoomViewerStateSchema,
  version: z.number().int().positive(),
  generatedAt: z.string(),
});
export type RoomStateSnapshotDto = z.infer<typeof RoomStateSnapshotSchema>;

// Supported Room State Event Types
export const RoomStateEventTypeSchema = z.enum([
  'room.updated',
  'room.settings.updated',
  'room.lock.updated',
  'room.host.transferred',
  'member.joined',
  'member.left',
  'member.kicked',
  'member.role.updated',
  'member.muted',
  'member.unmuted',
  'room.closed',
]);
export type RoomStateEventType = z.infer<typeof RoomStateEventTypeSchema>;

// Versioned Room State Event
export const RoomStateEventSchema = z.object({
  roomId: z.string(),
  version: z.number().int().positive(),
  eventId: z.string(),
  type: RoomStateEventTypeSchema,
  occurredAt: z.string(),
  payload: z.record(z.unknown()),
});
export type RoomStateEventDto = z.infer<typeof RoomStateEventSchema>;

// Client -> Server request for state snapshot
export const RoomStateRequestPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});
export type RoomStateRequestPayload = z.infer<typeof RoomStateRequestPayloadSchema>;

// Lightweight room version check response for lost final event detection
export const RoomStateVersionDtoSchema = z.object({
  version: z.number().int().positive(),
  status: RoomStatusSchema.optional(),
  currentParticipantsCount: z.number().int().nonnegative().optional(),
});
export type RoomStateVersionDto = z.infer<typeof RoomStateVersionDtoSchema>;

