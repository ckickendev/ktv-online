import { create } from 'zustand';
import { CurrentUserDto, authApi } from '@/lib/api/endpoints/auth';
import { tokenStore } from '@/lib/api/token-store';
import { authRefreshCoordinator } from '@/lib/api/auth-refresh';
import { getQueryClient } from '@/providers/query-provider';
import { queryKeys } from '@/hooks/queries/query-keys';

interface AuthState {
  isAuthenticated: boolean;
  isInitialized: boolean;
  user: CurrentUserDto | null;
  setAuth: (user: CurrentUserDto, accessToken: string) => void;
  setUser: (user: CurrentUserDto | null) => void;
  setInitialized: (initialized: boolean) => void;
  logout: () => Promise<void>;
  resetAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Wire session expiration to auto-reset store and clear auth query cache
  authRefreshCoordinator.onSessionExpired(() => {
    set({ isAuthenticated: false, user: null });
    if (typeof window !== 'undefined') {
      try {
        getQueryClient().removeQueries({ queryKey: queryKeys.auth.all });
      } catch (err) {
        console.error('Error clearing query cache on session expiration:', err);
      }
    }
  });

  return {
    isAuthenticated: false,
    isInitialized: false,
    user: null,

    setAuth: (user: CurrentUserDto, accessToken: string) => {
      tokenStore.setAccessToken(accessToken);
      set({ isAuthenticated: true, user, isInitialized: true });
    },

    setUser: (user: CurrentUserDto | null) => {
      set({ user, isAuthenticated: Boolean(user) });
    },

    setInitialized: (isInitialized: boolean) => {
      set({ isInitialized });
    },

    resetAuth: () => {
      tokenStore.clearAccessToken();
      set({ isAuthenticated: false, user: null });
      if (typeof window !== 'undefined') {
        try {
          getQueryClient().clear();
        } catch (err) {
          console.error('Error clearing query cache on reset:', err);
        }
      }
    },

    logout: async () => {
      try {
        await authApi.logout();
      } catch (err) {
        console.error('Logout error:', err);
      } finally {
        tokenStore.clearAccessToken();
        set({ isAuthenticated: false, user: null });
        if (typeof window !== 'undefined') {
          try {
            getQueryClient().clear();
          } catch (err) {
            console.error('Error clearing query cache on logout:', err);
          }
        }
      }
    },
  };
});
