import { RoomQueryDto } from '@ktv/contracts';

export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    currentUser: () => [...queryKeys.auth.all, 'currentUser'] as const,
  },
  rooms: {
    all: ['rooms'] as const,
    lists: () => [...queryKeys.rooms.all, 'list'] as const,
    list: (filters?: Partial<RoomQueryDto>) => [...queryKeys.rooms.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.rooms.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.rooms.details(), id] as const,
    members: (id: string) => [...queryKeys.rooms.detail(id), 'members'] as const,
    mine: (params?: { page?: number; limit?: number }) =>
      [...queryKeys.rooms.all, 'mine', params ?? {}] as const,
  },
  users: {
    all: ['users'] as const,
    profile: (id: string) => [...queryKeys.users.all, 'profile', id] as const,
  },
};
