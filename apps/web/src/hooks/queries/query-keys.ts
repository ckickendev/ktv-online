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
    publicProfile: (id: string) => [...queryKeys.users.all, 'publicProfile', id] as const,
    preferences: () => [...queryKeys.users.all, 'preferences'] as const,
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
    lyrics: (songId: string) => [...queryKeys.karaoke.all, 'lyrics', songId] as const,
    audio: (songId: string) => [...queryKeys.karaoke.all, 'audio', songId] as const,
  },
  invitations: {
    all: ['invitations'] as const,
    active: (roomId: string) => [...queryKeys.invitations.all, 'active', roomId] as const,
    preview: (token: string) => [...queryKeys.invitations.all, 'preview', token] as const,
  },
  history: {
    all: ['history'] as const,
    mySongs: (params?: Record<string, unknown>) => [...queryKeys.history.all, 'my-songs', params ?? {}] as const,
    mySessions: (params?: Record<string, unknown>) => [...queryKeys.history.all, 'my-sessions', params ?? {}] as const,
    myStats: () => [...queryKeys.history.all, 'my-stats'] as const,
    sessionRecap: (id: string) => [...queryKeys.history.all, 'session-recap', id] as const,
  },
};
