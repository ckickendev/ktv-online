import { apiClient } from '@/lib/api/client';
import {
  AddQueueItemDto,
  PlaybackCommandDto,
  PlaybackStateDto,
  ReorderQueueDto,
  ResolvedAudioSourceDto,
  RoomQueueItemDto,
  RoomQueueSnapshotDto,
  SongDto,
  SongLyricsDto,
  SongSearchQuery,
  SongSearchResponse,
  ServerTimeDto,
} from '@ktv/contracts';

export const karaokeApi = {
  /**
   * Search song catalog matching query, genre, and language.
   */
  async searchSongs(query: SongSearchQuery): Promise<SongSearchResponse> {
    return apiClient.get<SongSearchResponse>('/songs/search', {
      params: {
        q: query.q,
        genre: query.genre,
        language: query.language,
        page: query.page,
        limit: query.limit,
      },
    });
  },

  /**
   * Retrieve authoritative queue snapshot for a room.
   */
  async getQueue(roomId: string): Promise<RoomQueueSnapshotDto> {
    return apiClient.get<RoomQueueSnapshotDto>(`/rooms/${roomId}/queue`);
  },

  /**
   * Add song to room queue.
   */
  async addToQueue(
    roomId: string,
    payload: AddQueueItemDto
  ): Promise<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto; addedItem: RoomQueueItemDto }> {
    return apiClient.post<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto; addedItem: RoomQueueItemDto }>(
      `/rooms/${roomId}/queue`,
      payload
    );
  },

  /**
   * Remove item from room queue.
   */
  async removeFromQueue(
    roomId: string,
    itemId: string
  ): Promise<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto }> {
    return apiClient.delete<{ queue: RoomQueueSnapshotDto; playback: PlaybackStateDto }>(
      `/rooms/${roomId}/queue/${itemId}`
    );
  },

  /**
   * Reorder queued items (host only).
   */
  async reorderQueue(
    roomId: string,
    payload: ReorderQueueDto
  ): Promise<RoomQueueSnapshotDto> {
    return apiClient.post<RoomQueueSnapshotDto>(`/rooms/${roomId}/queue/reorder`, payload);
  },

  /**
   * Retrieve authoritative playback snapshot for a room.
   */
  async getPlayback(roomId: string): Promise<PlaybackStateDto> {
    return apiClient.get<PlaybackStateDto>(`/rooms/${roomId}/playback`);
  },

  /**
   * Submit authoritative playback control command (play, pause, seek, skip, stop).
   */
  async executePlaybackCommand(
    roomId: string,
    payload: PlaybackCommandDto
  ): Promise<{ playback: PlaybackStateDto; queue: RoomQueueSnapshotDto }> {
    return apiClient.post<{ playback: PlaybackStateDto; queue: RoomQueueSnapshotDto }>(
      `/rooms/${roomId}/playback/command`,
      payload
    );
  },

  /**
   * Resolve playable audio source for a song.
   */
  async resolveAudioSource(songId: string): Promise<ResolvedAudioSourceDto> {
    return apiClient.post<ResolvedAudioSourceDto>(`/songs/${songId}/audio/resolve`);
  },

  /**
   * Fetch synchronized lyrics for a song.
   */
  async getLyrics(songId: string): Promise<SongLyricsDto> {
    return apiClient.get<SongLyricsDto>(`/songs/${songId}/lyrics`);
  },

  /**
   * Get single song details by ID.
   */
  async getSongById(songId: string): Promise<SongDto> {
    return apiClient.get<SongDto>(`/songs/${songId}`);
  },

  /**
   * Fetch lightweight server timestamp for client clock synchronization.
   */
  async getServerTime(): Promise<ServerTimeDto> {
    return apiClient.get<ServerTimeDto>('/time');
  },
};
