import { apiClient } from '../client';
import { CreateUserDto, UserDto } from '@ktv/contracts';

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
};
