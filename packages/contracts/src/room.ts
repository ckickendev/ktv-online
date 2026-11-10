import { z } from 'zod';
import { PaginationQuerySchema } from './common.js';

export const RoomTypeSchema = z.enum(['standard', 'vip', 'party']);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const RoomVisibilitySchema = z.enum(['public', 'private']);
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;

export const RoomStatusSchema = z.enum(['idle', 'singing', 'paused', 'closed']);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;

export const RoomCategorySchema = z.enum(['all', 'pop', 'anime', 'rock', 'ballad', 'hiphop', 'rnb']);
export type RoomCategory = z.infer<typeof RoomCategorySchema>;

export const RoomAtmospherePresetSchema = z.enum([
  'midnight_lounge',
  'neon_stage',
  'cozy_acoustic',
  'minimal_studio',
  'classic_karaoke',
]);
export type RoomAtmospherePreset = z.infer<typeof RoomAtmospherePresetSchema>;

export const HostDtoSchema = z.object({
  id: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
});
export type HostDto = z.infer<typeof HostDtoSchema>;

export const RoomDtoSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(60),
  description: z.string().max(250).optional().nullable(),
  ownerId: z.string(),
  host: HostDtoSchema.optional(),
  roomType: RoomTypeSchema,
  visibility: RoomVisibilitySchema,
  capacity: z.number().int().min(2).max(50),
  status: RoomStatusSchema,
  currentParticipantsCount: z.number().int().nonnegative().default(0),
  category: RoomCategorySchema.default('all'),
  isChatEnabled: z.boolean().default(true).optional(),
  atmospherePreset: RoomAtmospherePresetSchema.default('midnight_lounge').optional(),
  stateVersion: z.number().int().positive().default(1).optional(),
  currentSongTitle: z.string().optional().nullable(),
  currentSingerName: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RoomDto = z.infer<typeof RoomDtoSchema>;

export const CreateRoomSchema = z.object({
  name: z
    .string()
    .min(2, 'Room name must be at least 2 characters')
    .max(60, 'Room name cannot exceed 60 characters'),
  description: z.string().max(250, 'Description cannot exceed 250 characters').optional(),
  roomType: RoomTypeSchema.default('standard'),
  visibility: RoomVisibilitySchema.default('public'),
  capacity: z.coerce.number().int().min(2).max(50).default(10),
  category: RoomCategorySchema.default('all'),
  isChatEnabled: z.boolean().default(true).optional(),
  atmospherePreset: RoomAtmospherePresetSchema.default('midnight_lounge').optional(),
});

export type CreateRoomDto = z.infer<typeof CreateRoomSchema>;

export const UpdateRoomSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(250).optional().nullable(),
  visibility: RoomVisibilitySchema.optional(),
  capacity: z.coerce.number().int().min(2).max(50).optional(),
  status: RoomStatusSchema.optional(),
  category: RoomCategorySchema.optional(),
  isChatEnabled: z.boolean().optional(),
  atmospherePreset: RoomAtmospherePresetSchema.optional(),
  expectedStateVersion: z.number().int().positive().optional(),
});

export type UpdateRoomDto = z.infer<typeof UpdateRoomSchema>;

export const RoomSortBySchema = z.enum(['newest', 'oldest', 'popular']);
export type RoomSortBy = z.infer<typeof RoomSortBySchema>;

export const RoomAvailabilitySchema = z.enum(['all', 'available', 'full']);
export type RoomAvailability = z.infer<typeof RoomAvailabilitySchema>;

export const RoomQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(100).optional(),
  category: RoomCategorySchema.optional(),
  status: RoomStatusSchema.optional(),
  roomType: RoomTypeSchema.optional(),
  visibility: RoomVisibilitySchema.optional(),
  availability: RoomAvailabilitySchema.optional(),
  sortBy: RoomSortBySchema.optional(),
});

export type RoomQueryDto = z.infer<typeof RoomQuerySchema>;

export const RoomMembershipRoleSchema = z.enum(['host', 'member']);
export type RoomMembershipRole = z.infer<typeof RoomMembershipRoleSchema>;

export const RoomMembershipStatusSchema = z.enum(['active', 'left']);
export type RoomMembershipStatus = z.infer<typeof RoomMembershipStatusSchema>;

export const RoomMembershipDtoSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: z.string(),
  user: HostDtoSchema.optional(),
  role: RoomMembershipRoleSchema,
  status: RoomMembershipStatusSchema,
  joinedAt: z.string().datetime(),
  leftAt: z.string().datetime().nullable().optional(),
});

export type RoomMembershipDto = z.infer<typeof RoomMembershipDtoSchema>;

export const RoomMyMembershipDtoSchema = z.object({
  isMember: z.boolean(),
  role: RoomMembershipRoleSchema.optional(),
  membership: RoomMembershipDtoSchema.nullable().optional(),
});

export type RoomMyMembershipDto = z.infer<typeof RoomMyMembershipDtoSchema>;

