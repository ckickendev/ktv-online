import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { roomApi, PaginatedRoomsResult } from '@/lib/api/endpoints/rooms';
import { RoomQueryDto } from '@ktv/contracts';

export function useRooms(filters?: Partial<RoomQueryDto>) {
  return useQuery<PaginatedRoomsResult>({
    queryKey: queryKeys.rooms.list(filters),
    queryFn: async () => {
      return roomApi.getRooms(filters);
    },
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });
}
