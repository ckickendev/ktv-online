import { z } from 'zod';

const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url('NEXT_PUBLIC_API_URL must be a valid URL')
    .default('http://localhost:5001/api/v1'),
});

function getClientEnv() {
  const parsed = EnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  });

  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    console.error('Invalid frontend environment configuration:', errorDetails);
    // In production build or browser runtime, provide safe fallback or throw
    return {
      NEXT_PUBLIC_API_URL: 'http://localhost:5001/api/v1',
    };
  }

  return parsed.data;
}

export const env = getClientEnv();
