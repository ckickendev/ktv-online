import { useAuthStore } from '@/stores/use-auth-store';
import { useCurrentUser } from './queries/use-current-user';

export function useAuth() {
  const { isAuthenticated, isInitialized, user, logout, setAuth, resetAuth } = useAuthStore();
  const currentUserQuery = useCurrentUser();

  return {
    user: user ?? currentUserQuery.data ?? null,
    isAuthenticated,
    isInitialized,
    isLoading: !isInitialized && currentUserQuery.isLoading,
    logout,
    setAuth,
    resetAuth,
    refetchUser: currentUserQuery.refetch,
  };
}
