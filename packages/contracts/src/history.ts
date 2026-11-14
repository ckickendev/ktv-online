import { z } from 'zod';

// ==========================================
// PERFORMANCE OUTCOMES & ENTITY CONTRACTS
// ==========================================

export const PerformanceOutcomeSchema = z.enum([
  'playing',
  'completed',
  'skipped',
  'failed',
  'interrupted',
]);
export type PerformanceOutcome = z.infer<typeof PerformanceOutcomeSchema>;

export const KaraokePerformanceDtoSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  roomId: z.string(),
  queueItemId: z.string(),
  songId: z.string(),
  songTitle: z.string(),
  artist: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  genre: z.string(),
  language: z.string(),
  durationMs: z.number().int().nonnegative(),
  singerId: z.string(),
  singerUsername: z.string(),
  singerDisplayName: z.string().nullable().optional(),
  singerAvatar: z.string().nullable().optional(),
  requestedById: z.string(),
  roomName: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  durationPerformedMs: z.number().int().nonnegative().default(0),
  outcome: PerformanceOutcomeSchema,
});
export type KaraokePerformanceDto = z.infer<typeof KaraokePerformanceDtoSchema>;

// ==========================================
// SESSION & PARTICIPANT CONTRACTS
// ==========================================

export const SessionParticipantDtoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  role: z.string().default('member'),
  joinedAt: z.string(),
  leftAt: z.string().nullable().optional(),
  songsPerformedCount: z.number().int().nonnegative().default(0),
});
export type SessionParticipantDto = z.infer<typeof SessionParticipantDtoSchema>;

export const KaraokeSessionDtoSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  hostId: z.string(),
  hostUsername: z.string(),
  hostDisplayName: z.string().nullable().optional(),
  visibility: z.enum(['public', 'private']),
  roomType: z.string().default('standard'),
  atmospherePreset: z.string().default('midnight_lounge'),
  startedAt: z.string(),
  endedAt: z.string().nullable().optional(),
  status: z.enum(['active', 'completed']),
  endedReason: z.string().nullable().optional(),
  totalSongsPlayed: z.number().int().nonnegative().default(0),
  totalParticipantsCount: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  participants: z.array(SessionParticipantDtoSchema).default([]),
});
export type KaraokeSessionDto = z.infer<typeof KaraokeSessionDtoSchema>;

export const SessionRecapDtoSchema = z.object({
  session: KaraokeSessionDtoSchema,
  performances: z.array(KaraokePerformanceDtoSchema),
});
export type SessionRecapDto = z.infer<typeof SessionRecapDtoSchema>;

// ==========================================
// USER STATS & QUERIES
// ==========================================

export const UserKaraokeStatsDtoSchema = z.object({
  totalSessionsJoined: z.number().int().nonnegative().default(0),
  totalPerformancesStarted: z.number().int().nonnegative().default(0),
  completedPerformances: z.number().int().nonnegative().default(0),
  skippedPerformances: z.number().int().nonnegative().default(0),
  uniqueSongsCount: z.number().int().nonnegative().default(0),
  totalPerformanceDurationMs: z.number().int().nonnegative().default(0),
  topGenres: z.array(
    z.object({
      genre: z.string(),
      count: z.number().int().positive(),
    })
  ).default([]),
});
export type UserKaraokeStatsDto = z.infer<typeof UserKaraokeStatsDtoSchema>;

export const HistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

export const PaginatedPerformancesResponseSchema = z.object({
  items: z.array(KaraokePerformanceDtoSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type PaginatedPerformancesResponse = z.infer<typeof PaginatedPerformancesResponseSchema>;

export const PaginatedSessionsResponseSchema = z.object({
  items: z.array(KaraokeSessionDtoSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type PaginatedSessionsResponse = z.infer<typeof PaginatedSessionsResponseSchema>;
