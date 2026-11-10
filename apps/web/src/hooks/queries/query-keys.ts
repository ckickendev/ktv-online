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
    state: (id: string) => [...queryKeys.rooms.detail(id), 'state'] as const,
    members: (id: string) => [...queryKeys.rooms.detail(id), 'members'] as const,
    membership: (id: string) => [...queryKeys.rooms.detail(id), 'membership'] as const,
    mine: (params?: { page?: number; limit?: number }) =>
      [...queryKeys.rooms.all, 'mine', params ?? {}] as const,
    joined: (params?: { page?: number; limit?: number }) =>
      [...queryKeys.rooms.all, 'joined', params ?? {}] as const,
  },
  users: {
    all: ['users'] as const,
    profile: (id: string) => [...queryKeys.users.all, 'profile', id] as const,
  },
  chat: {
    all: ['chat'] as const,
    messages: (roomId: string) => [...queryKeys.chat.all, 'messages', roomId] as const,
    activities: (roomId: string) => [...queryKeys.chat.all, 'activities', roomId] as const,
  },
  karaoke: {
    all: ['karaoke'] as const,
    queue: (roomId: string) => [...queryKeys.karaoke.all, 'queue', roomId] as const,
    playback: (roomId: string) => [...queryKeys.karaoke.all, 'playback', roomId] as const,
    songs: (query?: Record<string, unknown>) => [...queryKeys.karaoke.all, 'songs', query ?? {}] as const,
  },
};
