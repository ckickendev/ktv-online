import { z } from 'zod';

export interface ApiResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: ApiErrorDetail[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  environment: z.string(),
  timestamp: z.string(),
  uptime: z.number(),
  database: z.object({
    status: z.enum(['connected', 'connecting', 'disconnected', 'error']),
    name: z.string().optional(),
    latencyMs: z.number().optional(),
  }),
});

export type HealthStatusDto = z.infer<typeof HealthStatusSchema>;
