import { apiClient } from '../client';
import { tokenStore } from '../token-store';
import { authRefreshCoordinator } from '../auth-refresh';
import { AuthSessionResponseDto } from '@ktv/contracts';

export interface CurrentUserDto {
  id: string;
  username: string;
  role: string;
}

export const authApi = {
  async login(credentials: { email: string; password: string }): Promise<AuthSessionResponseDto> {
    const data = await apiClient.post<AuthSessionResponseDto>('/auth/login', credentials, {
      skipAuth: true,
      skipAuthRefresh: true,
    });

    if (data.tokens?.accessToken) {
      tokenStore.setAccessToken(data.tokens.accessToken);
    }

    return data;
  },

  async refresh(): Promise<{ accessToken: string; expiresIn: string }> {
    return apiClient.post<{ accessToken: string; expiresIn: string }>(
      '/auth/refresh',
      {},
      {
        skipAuth: true,
        skipAuthRefresh: true,
        credentials: 'include',
      }
    );
  },

  async logout(): Promise<null> {
    try {
      return await apiClient.post<null>(
        '/auth/logout',
        {},
        {
          skipAuthRefresh: true,
          credentials: 'include',
        }
      );
    } finally {
      authRefreshCoordinator.notifySessionExpired();
    }
  },

  async getMe(): Promise<CurrentUserDto> {
    return apiClient.get<CurrentUserDto>('/auth/me');
  },
};
