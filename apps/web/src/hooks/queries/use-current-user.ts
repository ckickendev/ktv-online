import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { authApi, CurrentUserDto } from '@/lib/api/endpoints/auth';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/stores/use-auth-store';
import { useEffect } from 'react';

export function useCurrentUser() {
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  const query = useQuery<CurrentUserDto>({
    queryKey: queryKeys.auth.currentUser(),
    queryFn: async () => {
      return authApi.getMe();
    },
    enabled: tokenStore.hasToken(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) {
      setUser(query.data);
    } else if (query.isError) {
      setUser(null);
    }
    if (!query.isLoading) {
      setInitialized(true);
    }
  }, [query.data, query.isError, query.isLoading, setUser, setInitialized]);

  return query;
}
