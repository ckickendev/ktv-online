import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { roomApi, PaginatedRoomsResult } from '@/lib/api/endpoints/rooms';
import { tokenStore } from '@/lib/api/token-store';

export function useMyRooms(params?: { page?: number; limit?: number }) {
  return useQuery<PaginatedRoomsResult>({
    queryKey: queryKeys.rooms.mine(params),
    queryFn: async () => {
      return roomApi.getMyRooms(params);
    },
    enabled: tokenStore.hasToken(),
    staleTime: 15 * 1000,
  });
}
