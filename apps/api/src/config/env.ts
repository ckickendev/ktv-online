import { config } from 'dotenv';
import { z } from 'zod';

config();

const DEV_DEFAULT_ACCESS_SECRET = 'ktv_online_jwt_access_secret_development_key_12345';
const DEV_DEFAULT_REFRESH_SECRET = 'ktv_online_jwt_refresh_secret_development_key_67890';

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(5001),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/ktv_online'),
    JWT_ACCESS_SECRET: z.string().min(16).default(DEV_DEFAULT_ACCESS_SECRET),
    JWT_REFRESH_SECRET: z.string().min(16).default(DEV_DEFAULT_REFRESH_SECRET),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: z.coerce.boolean().optional(),
    LIVEKIT_URL: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          try {
            const url = new URL(val);
            return ['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol);
          } catch {
            return false;
          }
        },
        { message: 'LIVEKIT_URL must be a valid URL with ws, wss, http, or https protocol' }
      ),
    LIVEKIT_API_KEY: z.string().optional(),
    LIVEKIT_API_SECRET: z.string().optional(),
    LIVEKIT_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.LIVEKIT_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LIVEKIT_URL'],
          message: 'LIVEKIT_URL is required in production',
        });
      }
      if (!data.LIVEKIT_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LIVEKIT_API_KEY'],
          message: 'LIVEKIT_API_KEY is required in production',
        });
      }
      if (!data.LIVEKIT_API_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['LIVEKIT_API_SECRET'],
          message: 'LIVEKIT_API_SECRET is required in production',
        });
      }
      if (!process.env.JWT_ACCESS_SECRET || data.JWT_ACCESS_SECRET === DEV_DEFAULT_ACCESS_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET must be explicitly provided in production and cannot use development default',
        });
      } else if (data.JWT_ACCESS_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET must be at least 32 characters in production',
        });
      }

      if (!process.env.JWT_REFRESH_SECRET || data.JWT_REFRESH_SECRET === DEV_DEFAULT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must be explicitly provided in production and cannot use development default',
        });
      } else if (data.JWT_REFRESH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET must be at least 32 characters in production',
        });
      }

      if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical',
        });
      }
    }
  });

export function validateEnv(rawEnv: Record<string, unknown> = process.env) {
  const result = EnvSchema.safeParse(rawEnv);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Environment validation failed:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}

export const env = validateEnv(process.env);
export type Env = z.infer<typeof EnvSchema>;
