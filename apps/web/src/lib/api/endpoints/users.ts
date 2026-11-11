import { apiClient } from '../client';
import {
  CreateUserDto,
  UserDto,
  UserPreferencesDto,
  UpdateUserPreferencesDto,
} from '@ktv/contracts';

export const userApi = {
  async register(payload: CreateUserDto): Promise<UserDto> {
    return apiClient.post<UserDto>('/users/register', payload, {
      skipAuth: true,
      skipAuthRefresh: true,
    });
  },

  async getProfile(userId: string): Promise<UserDto> {
    return apiClient.get<UserDto>(`/users/${userId}`);
  },

  async getPreferences(): Promise<UserPreferencesDto> {
    return apiClient.get<UserPreferencesDto>('/users/me/preferences');
  },

  async updatePreferences(data: UpdateUserPreferencesDto): Promise<UserPreferencesDto> {
    return apiClient.patch<UserPreferencesDto>('/users/me/preferences', data);
  },
};
