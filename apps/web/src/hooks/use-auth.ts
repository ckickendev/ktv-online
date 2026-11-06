import { useAuthStore, AuthStatus } from '@/stores/use-auth-store';
import { useCurrentUser } from './queries/use-current-user';
import { CreateUserDto } from '@ktv/contracts';

export interface AuthContext {
  status: AuthStatus;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isNetworkError: boolean;
  user: ReturnType<typeof useAuthStore.getState>['user'];
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (payload: CreateUserDto, autoLogin?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  initializeSession: () => Promise<void>;
  resetAuth: () => void;
  refetchUser: () => void;
}

export function useAuth(): AuthContext {
  const {
    status,
    isAuthenticated,
    isNetworkError,
    user,
    login,
    register,
    logout,
    initializeSession,
    resetAuth,
  } = useAuthStore();

  const currentUserQuery = useCurrentUser();

  return {
    status,
    isAuthenticated,
    isInitializing: status === 'initializing',
    isNetworkError,
    user: user ?? currentUserQuery.data ?? null,
    login,
    register,
    logout,
    initializeSession,
    resetAuth,
    refetchUser: () => {
      currentUserQuery.refetch();
    },
  };
}
