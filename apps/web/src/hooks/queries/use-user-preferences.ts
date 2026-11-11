'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPreferencesDto,
  UpdateUserPreferencesDto,
  DEFAULT_USER_PREFERENCES,
} from '@ktv/contracts';
import { userApi } from '@/lib/api/endpoints/users';
import { queryKeys } from './query-keys';
import { useAuth } from '@/hooks/use-auth';

export interface UseUserPreferencesOptions {
  enabled?: boolean;
}

export function useUserPreferences(options: UseUserPreferencesOptions = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = options.enabled ?? isAuthenticated;

  const query = useQuery<UserPreferencesDto>({
    queryKey: queryKeys.users.preferences(),
    queryFn: () => userApi.getPreferences(),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: DEFAULT_USER_PREFERENCES,
  });

  return {
    preferences: query.data || DEFAULT_USER_PREFERENCES,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserPreferencesDto) => userApi.updatePreferences(data),
    onSuccess: (updatedPreferences) => {
      queryClient.setQueryData(queryKeys.users.preferences(), updatedPreferences);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.preferences() });
    },
  });
}
