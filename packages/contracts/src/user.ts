import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'user', 'moderator']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['active', 'suspended', 'offline', 'online']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserDtoSchema = z.object({
  id: z.string(),
  username: z.string().min(3).max(30),
  email: z.string().email(),
  avatar: z.string().url().optional().nullable(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserDto = z.infer<typeof UserDtoSchema>;

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
