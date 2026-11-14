import { z } from 'zod';
import {
  HostDtoSchema,
  RoomAtmospherePresetSchema,
  RoomCategorySchema,
  RoomStatusSchema,
  RoomTypeSchema,
  RoomVisibilitySchema,
} from './room.js';

export const InvitationStatusSchema = z.enum(['active', 'expired', 'revoked']);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

export const InvitationPreviewStatusSchema = z.enum([
  'valid',
  'expired',
  'revoked',
  'room_closed',
  'room_full',
  'invalid',
]);
export type InvitationPreviewStatus = z.infer<typeof InvitationPreviewStatusSchema>;

export const CreateInvitationSchema = z.object({
  expiresInHours: z.coerce.number().int().min(1).max(168).default(48).optional(),
});
export type CreateInvitationDto = z.infer<typeof CreateInvitationSchema>;

export const CreateInvitationResponseSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  token: z.string(),
  inviteUrl: z.string().optional(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type CreateInvitationResponseDto = z.infer<typeof CreateInvitationResponseSchema>;

export const RoomInvitationDtoSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  status: InvitationStatusSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable().optional(),
});
export type RoomInvitationDto = z.infer<typeof RoomInvitationDtoSchema>;

export const InvitationPreviewDtoSchema = z.object({
  invitation: z.object({
    status: InvitationPreviewStatusSchema,
    expiresAt: z.string().datetime().optional(),
  }),
  room: z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
      category: RoomCategorySchema,
      roomType: RoomTypeSchema,
      visibility: RoomVisibilitySchema,
      capacity: z.number(),
      currentParticipantsCount: z.number(),
      status: RoomStatusSchema,
      atmospherePreset: RoomAtmospherePresetSchema.optional(),
      host: HostDtoSchema.optional(),
    })
    .optional(),
  userState: z
    .object({
      isAuthenticated: z.boolean(),
      isMember: z.boolean(),
      isHost: z.boolean(),
      isKicked: z.boolean(),
    })
    .optional(),
});
export type InvitationPreviewDto = z.infer<typeof InvitationPreviewDtoSchema>;

export const JoinRoomWithInviteSchema = z.object({
  inviteToken: z.string().trim().min(1).max(256).optional(),
});
export type JoinRoomWithInviteDto = z.infer<typeof JoinRoomWithInviteSchema>;
