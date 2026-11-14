import { z } from 'zod';

// ==========================================
// SONG CATALOG CONTRACTS
// ==========================================

export const SongMediaAvailabilitySchema = z.enum([
  'available',
  'restricted',
  'unavailable',
  'fixture_mock',
]);
export type SongMediaAvailability = z.infer<typeof SongMediaAvailabilitySchema>;

export const AudioAvailabilitySchema = z.enum([
  'metadata_only',
  'audio_available',
  'audio_unavailable',
  'restricted',
]);
export type AudioAvailability = z.infer<typeof AudioAvailabilitySchema>;

export const AudioLicenseClassificationSchema = z.enum([
  'licensed_commercial',
  'royalty_free',
  'public_domain',
  'user_supplied_authorized',
  'development_fixture',
]);
export type AudioLicenseClassification = z.infer<typeof AudioLicenseClassificationSchema>;

export const ResolvedAudioSourceDtoSchema = z.object({
  songId: z.string(),
  provider: z.string(),
  url: z.string(),
  mimeType: z.string().default('audio/mpeg'),
  availability: AudioAvailabilitySchema,
  licenseClassification: AudioLicenseClassificationSchema,
  supportsByteRange: z.boolean().default(true),
  isPlayable: z.boolean().default(true),
  durationMs: z.number().int().positive().optional(),
  expiresAt: z.string().nullable().optional(),
  attribution: z.string().nullable().optional(),
});
export type ResolvedAudioSourceDto = z.infer<typeof ResolvedAudioSourceDtoSchema>;

export const TimedLyricWordSchema = z.object({
  id: z.string().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});
export type TimedLyricWord = z.infer<typeof TimedLyricWordSchema>;

export const TimedLyricLineSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative().optional(),
  text: z.string(),
  translation: z.string().optional(),
  words: z.array(TimedLyricWordSchema).optional(),
});
export type TimedLyricLine = z.infer<typeof TimedLyricLineSchema>;

export const LyricsAvailabilitySchema = z.enum([
  'timed_available',
  'text_only',
  'unavailable',
]);
export type LyricsAvailability = z.infer<typeof LyricsAvailabilitySchema>;

export const SongLyricsDtoSchema = z.object({
  songId: z.string(),
  provider: z.string(),
  lines: z.array(TimedLyricLineSchema),
  language: z.string().default('en'),
  hasTimedLyrics: z.boolean(),
  attribution: z.string().optional(),
});
export type SongLyricsDto = z.infer<typeof SongLyricsDtoSchema>;

export const SongDtoSchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerSongId: z.string(),
  title: z.string().min(1),
  artist: z.string().min(1),
  thumbnailUrl: z.string().nullable().optional(),
  durationMs: z.number().int().positive(),
  language: z.string().default('en'),
  genre: z.string().default('pop'),
  mediaAvailability: SongMediaAvailabilitySchema.default('fixture_mock'),
  audioAvailability: AudioAvailabilitySchema.default('metadata_only'),
  lyricsAvailability: LyricsAvailabilitySchema.default('unavailable'),
  licenseClassification: AudioLicenseClassificationSchema.default('development_fixture'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SongDto = z.infer<typeof SongDtoSchema>;

export const SongAvailabilityFilterSchema = z.enum([
  'all',
  'playable',
  'metadata_only',
]);
export type SongAvailabilityFilter = z.infer<typeof SongAvailabilityFilterSchema>;

export const SongSearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  genre: z.string().optional(),
  language: z.string().optional(),
  availability: SongAvailabilityFilterSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type SongSearchQuery = z.infer<typeof SongSearchQuerySchema>;

export const SongSearchResponseSchema = z.object({
  songs: z.array(SongDtoSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});
export type SongSearchResponse = z.infer<typeof SongSearchResponseSchema>;

// ==========================================
// ROOM SONG QUEUE CONTRACTS
// ==========================================

export const QueueItemStatusSchema = z.enum([
  'queued',
  'playing',
  'completed',
  'skipped',
  'removed',
  'failed',
]);
export type QueueItemStatus = z.infer<typeof QueueItemStatusSchema>;

export const RoomQueueRequesterDtoSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});
export type RoomQueueRequesterDto = z.infer<typeof RoomQueueRequesterDtoSchema>;

export const RoomQueueItemDtoSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  songId: z.string(),
  song: SongDtoSchema,
  requestedBy: RoomQueueRequesterDtoSchema,
  singer: RoomQueueRequesterDtoSchema.nullable().optional(),
  position: z.number().int().nonnegative(),
  status: QueueItemStatusSchema,
  queueVersion: z.number().int().positive(),
  addedAt: z.string(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  removedAt: z.string().nullable().optional(),
});
export type RoomQueueItemDto = z.infer<typeof RoomQueueItemDtoSchema>;

export const RoomQueueSnapshotDtoSchema = z.object({
  roomId: z.string(),
  items: z.array(RoomQueueItemDtoSchema),
  queueVersion: z.number().int().positive(),
  totalCount: z.number().int().nonnegative(),
  maxQueueSize: z.number().int().positive().default(50),
});
export type RoomQueueSnapshotDto = z.infer<typeof RoomQueueSnapshotDtoSchema>;

export const AddQueueItemDtoSchema = z.object({
  songId: z.string().min(1, 'Song ID is required'),
  singerId: z.string().optional(),
});
export type AddQueueItemDto = z.infer<typeof AddQueueItemDtoSchema>;

export const RemoveQueueItemDtoSchema = z.object({
  itemId: z.string().min(1, 'Queue item ID is required'),
});
export type RemoveQueueItemDto = z.infer<typeof RemoveQueueItemDtoSchema>;

export const ReorderQueueDtoSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, 'Ordered item IDs are required'),
  expectedQueueVersion: z.number().int().positive().optional(),
});
export type ReorderQueueDto = z.infer<typeof ReorderQueueDtoSchema>;

// ==========================================
// SERVER-AUTHORITATIVE PLAYBACK CONTRACTS
// ==========================================

export const PlaybackStatusSchema = z.enum([
  'idle',
  'loading',
  'playing',
  'paused',
  'ended',
  'error',
]);
export type PlaybackStatus = z.infer<typeof PlaybackStatusSchema>;

export const PlaybackStateDtoSchema = z.object({
  roomId: z.string(),
  currentQueueItemId: z.string().nullable(),
  currentItem: RoomQueueItemDtoSchema.nullable().optional(),
  status: PlaybackStatusSchema,
  positionMs: z.number().int().nonnegative(),
  anchorStartedAt: z.string().nullable().optional(),
  pausedAt: z.string().nullable().optional(),
  playbackVersion: z.number().int().positive(),
  updatedAt: z.string(),
});
export type PlaybackStateDto = z.infer<typeof PlaybackStateDtoSchema>;

export const PlaybackCommandTypeSchema = z.enum([
  'play',
  'pause',
  'seek',
  'skip',
  'stop',
]);
export type PlaybackCommandType = z.infer<typeof PlaybackCommandTypeSchema>;

export const PlaybackCommandDtoSchema = z.object({
  command: PlaybackCommandTypeSchema,
  positionMs: z.number().int().nonnegative().optional(),
  expectedPlaybackVersion: z.number().int().positive().optional(),
  correlationId: z.string().optional(),
});
export type PlaybackCommandDto = z.infer<typeof PlaybackCommandDtoSchema>;

export const KaraokeSnapshotDtoSchema = z.object({
  roomId: z.string(),
  playback: PlaybackStateDtoSchema,
  queue: RoomQueueSnapshotDtoSchema,
  serverTimestamp: z.string(),
});
export type KaraokeSnapshotDto = z.infer<typeof KaraokeSnapshotDtoSchema>;

// ==========================================
// REALTIME SOCKET.IO EVENT PAYLOADS
// ==========================================

export const KaraokeQueueUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  queue: RoomQueueSnapshotDtoSchema,
  action: z.enum(['added', 'removed', 'reordered', 'status_changed', 'cleared']),
  affectedItemId: z.string().optional(),
  occurredAt: z.string(),
});
export type KaraokeQueueUpdatedPayload = z.infer<typeof KaraokeQueueUpdatedPayloadSchema>;

export const KaraokePlaybackUpdatedPayloadSchema = z.object({
  roomId: z.string(),
  playback: PlaybackStateDtoSchema,
  command: PlaybackCommandTypeSchema.optional(),
  initiatedByUserId: z.string().optional(),
  occurredAt: z.string(),
});
export type KaraokePlaybackUpdatedPayload = z.infer<typeof KaraokePlaybackUpdatedPayloadSchema>;

export const KaraokeStateRequestPayloadSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  correlationId: z.string().optional(),
});
export type KaraokeStateRequestPayload = z.infer<typeof KaraokeStateRequestPayloadSchema>;

// ==========================================
// CLOCK SYNCHRONIZATION CONTRACTS
// ==========================================

export const ClockSyncRequestSchema = z.object({
  clientSendTime: z.number().int().positive(),
});
export type ClockSyncRequest = z.infer<typeof ClockSyncRequestSchema>;

export const ClockSyncResponseSchema = z.object({
  clientSendTime: z.number().int().positive(),
  serverTime: z.number().int().positive(),
  serverIso: z.string(),
});
export type ClockSyncResponse = z.infer<typeof ClockSyncResponseSchema>;

export const ServerTimeDtoSchema = z.object({
  serverTime: z.number().int().positive(),
  serverIso: z.string(),
});
export type ServerTimeDto = z.infer<typeof ServerTimeDtoSchema>;
