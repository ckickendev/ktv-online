import { apiClient } from '@/lib/api/client';
import {
  HistoryQuery,
  PaginatedPerformancesResponse,
  PaginatedSessionsResponse,
  SessionRecapDto,
  UserKaraokeStatsDto,
} from '@ktv/contracts';

export const historyApi = {
  /**
   * Fetch paginated list of songs performed by the current user.
   */
  async getMySongs(params?: HistoryQuery): Promise<PaginatedPerformancesResponse> {
    return apiClient.get<PaginatedPerformancesResponse>('/history/my-songs', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });
  },

  /**
   * Fetch paginated list of karaoke sessions attended by the current user.
   */
  async getMySessions(params?: HistoryQuery): Promise<PaginatedSessionsResponse> {
    return apiClient.get<PaginatedSessionsResponse>('/history/my-sessions', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    });
  },

  /**
   * Fetch user's personal karaoke singing metrics.
   */
  async getMyStats(): Promise<UserKaraokeStatsDto> {
    return apiClient.get<UserKaraokeStatsDto>('/history/my-stats');
  },

  /**
   * Fetch complete session recap.
   */
  async getSessionRecap(sessionId: string): Promise<SessionRecapDto> {
    return apiClient.get<SessionRecapDto>(`/history/sessions/${sessionId}`);
  },
};
