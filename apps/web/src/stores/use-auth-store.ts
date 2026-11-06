import { create } from 'zustand';
import { CurrentUserDto, authApi } from '@/lib/api/endpoints/auth';
import { userApi } from '@/lib/api/endpoints/users';
import { tokenStore } from '@/lib/api/token-store';
import { authRefreshCoordinator } from '@/lib/api/auth-refresh';
import { getQueryClient } from '@/providers/query-provider';
import { queryKeys } from '@/hooks/queries/query-keys';
import { ApiError } from '@/lib/api/errors';
import { CreateUserDto } from '@ktv/contracts';

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isNetworkError: boolean;
  user: CurrentUserDto | null;
  setAuth: (user: CurrentUserDto, accessToken: string) => void;
  setUser: (user: CurrentUserDto | null) => void;
  setInitialized: (initialized: boolean) => void;
  initializeSession: () => Promise<void>;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (payload: CreateUserDto, autoLogin?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  resetAuth: () => void;
}

let inFlightInitPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
  // Wire session expiration to auto-reset store and clear auth query cache
  authRefreshCoordinator.onSessionExpired(() => {
    set({
      status: 'unauthenticated',
      isAuthenticated: false,
      user: null,
      isInitialized: true,
      isNetworkError: false,
    });
    if (typeof window !== 'undefined') {
      try {
        getQueryClient().removeQueries({ queryKey: queryKeys.auth.all });
      } catch (err) {
        console.error('Error clearing query cache on session expiration:', err);
      }
    }
  });

  return {
    status: 'initializing',
    isAuthenticated: false,
    isInitialized: false,
    isNetworkError: false,
    user: null,

    setAuth: (user: CurrentUserDto, accessToken: string) => {
      tokenStore.setAccessToken(accessToken);
      set({
        status: 'authenticated',
        isAuthenticated: true,
        user,
        isInitialized: true,
        isNetworkError: false,
      });
    },

    setUser: (user: CurrentUserDto | null) => {
      set({
        user,
        isAuthenticated: Boolean(user),
        status: user ? 'authenticated' : 'unauthenticated',
      });
    },

    setInitialized: (isInitialized: boolean) => {
      set({
        isInitialized,
        status: isInitialized ? (get().isAuthenticated ? 'authenticated' : 'unauthenticated') : 'initializing',
      });
    },

    initializeSession: async () => {
      // Guard against concurrent double-mount invocation (e.g. React Strict Mode)
      if (inFlightInitPromise) {
        return inFlightInitPromise;
      }

      inFlightInitPromise = (async () => {
        try {
          // If token already present in memory, verify/fetch current user
          if (tokenStore.hasToken()) {
            if (!get().user) {
              const currentUser = await authApi.getMe();
              set({
                user: currentUser,
                isAuthenticated: true,
                status: 'authenticated',
                isInitialized: true,
                isNetworkError: false,
              });
            } else {
              set({
                isAuthenticated: true,
                status: 'authenticated',
                isInitialized: true,
                isNetworkError: false,
              });
            }
            return;
          }

          // Otherwise attempt silent session restoration via HTTP-only cookie
          const newAccessToken = await authRefreshCoordinator.refreshToken();
          tokenStore.setAccessToken(newAccessToken);

          const currentUser = await authApi.getMe();
          set({
            user: currentUser,
            isAuthenticated: true,
            status: 'authenticated',
            isInitialized: true,
            isNetworkError: false,
          });
        } catch (err: unknown) {
          if (err instanceof ApiError && err.isNetworkError) {
            // Network failure: do not treat as permanent session invalidation
            set({
              status: 'unauthenticated',
              isAuthenticated: false,
              isInitialized: true,
              isNetworkError: true,
            });
          } else {
            // Definitive refresh failure (no cookie, expired, revoked, or invalid)
            tokenStore.clearAccessToken();
            set({
              status: 'unauthenticated',
              isAuthenticated: false,
              user: null,
              isInitialized: true,
              isNetworkError: false,
            });
          }
        } finally {
          inFlightInitPromise = null;
        }
      })();

      return inFlightInitPromise;
    },

    login: async (credentials: { email: string; password: string }) => {
      const data = await authApi.login(credentials);

      // Clear existing query cache on account switch
      if (typeof window !== 'undefined') {
        try {
          getQueryClient().clear();
        } catch (err) {
          console.error('Error clearing query cache on login:', err);
        }
      }

      set({
        status: 'authenticated',
        isAuthenticated: true,
        user: data.user,
        isInitialized: true,
        isNetworkError: false,
      });
    },

    register: async (payload: CreateUserDto, autoLogin = true) => {
      await userApi.register(payload);
      if (autoLogin) {
        await get().login({ email: payload.email, password: payload.password });
      }
    },

    resetAuth: () => {
      tokenStore.clearAccessToken();
      set({
        status: 'unauthenticated',
        isAuthenticated: false,
        user: null,
        isInitialized: true,
        isNetworkError: false,
      });
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
        console.error('Logout error from backend:', err);
      } finally {
        tokenStore.clearAccessToken();
        set({
          status: 'unauthenticated',
          isAuthenticated: false,
          user: null,
          isInitialized: true,
          isNetworkError: false,
        });
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
