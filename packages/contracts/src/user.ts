import { z } from 'zod';
import { UserPreferencesDtoSchema } from './preferences.js';

export const UserRoleSchema = z.enum(['admin', 'user', 'moderator']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['active', 'suspended', 'offline', 'online']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserDtoSchema = z.object({
  id: z.string(),
  username: z.string().min(3).max(30),
  displayName: z.string().min(2).max(32).optional().nullable(),
  email: z.string().email(),
  avatar: z.string().url().optional().nullable(),
  bio: z.string().max(160).optional().nullable(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  preferences: UserPreferencesDtoSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserDto = z.infer<typeof UserDtoSchema>;

export const UpdateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(32, 'Display name cannot exceed 32 characters')
    .optional()
    .nullable(),
  bio: z
    .string()
    .trim()
    .max(160, 'Bio cannot exceed 160 characters')
    .optional()
    .nullable(),
  avatar: z
    .string()
    .trim()
    .url('Avatar must be a valid URL')
    .max(500, 'Avatar URL cannot exceed 500 characters')
    .optional()
    .nullable(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const PublicUserProfileDtoSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  role: UserRoleSchema,
  createdAt: z.string().datetime(),
  favoriteGenres: z.array(z.string()).optional(),
  favoriteLanguages: z.array(z.string()).optional(),
  participationStyle: z.string().optional(),
});

export type PublicUserProfileDto = z.infer<typeof PublicUserProfileDtoSchema>;

export const CreateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and dashes'),
  email: z.string().email('Valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters'),
  avatar: z.string().url('Avatar must be a valid URL').optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  avatar: z.string().url().optional().nullable(),
  status: UserStatusSchema.optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.string(),
  refreshToken: z.string().optional(),
});

export type AuthTokensDto = z.infer<typeof AuthTokensSchema>;

export const AuthSessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable().optional(),
    email: z.string(),
    avatar: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    role: z.string(),
  }),
  tokens: AuthTokensSchema,
});

export type AuthSessionResponseDto = z.infer<typeof AuthSessionResponseSchema>;

