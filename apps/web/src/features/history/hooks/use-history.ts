'use client';

import { useQuery } from '@tanstack/react-query';
import { HistoryQuery } from '@ktv/contracts';
import { historyApi } from '../api/history-api';
import { queryKeys } from '@/hooks/queries/query-keys';

export function useMySongs(params?: HistoryQuery) {
  return useQuery({
    queryKey: queryKeys.history.mySongs(params as Record<string, unknown>),
    queryFn: () => historyApi.getMySongs(params),
    staleTime: 60000,
  });
}

export function useMySessions(params?: HistoryQuery) {
  return useQuery({
    queryKey: queryKeys.history.mySessions(params as Record<string, unknown>),
    queryFn: () => historyApi.getMySessions(params),
    staleTime: 60000,
  });
}

export function useMyStats() {
  return useQuery({
    queryKey: queryKeys.history.myStats(),
    queryFn: () => historyApi.getMyStats(),
    staleTime: 60000,
  });
}

export function useSessionRecap(sessionId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.history.sessionRecap(sessionId || ''),
    queryFn: () => historyApi.getSessionRecap(sessionId!),
    enabled: Boolean(sessionId) && enabled,
    staleTime: 120000,
  });
}
