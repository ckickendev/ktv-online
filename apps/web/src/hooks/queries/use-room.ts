import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { roomApi } from '@/lib/api/endpoints/rooms';
import { RoomDto, RoomMembershipDto } from '@ktv/contracts';

export function useRoom(roomId: string, options?: { enabled?: boolean }) {
  return useQuery<RoomDto>({
    queryKey: queryKeys.rooms.detail(roomId),
    queryFn: async () => {
      return roomApi.getRoomById(roomId);
    },
    enabled: Boolean(roomId) && options?.enabled !== false,
    staleTime: 15 * 1000,
  });
}

export function useRoomMembers(roomId: string, options?: { enabled?: boolean }) {
  return useQuery<RoomMembershipDto[]>({
    queryKey: queryKeys.rooms.members(roomId),
    queryFn: async () => {
      return roomApi.getMembers(roomId);
    },
    enabled: Boolean(roomId) && options?.enabled !== false,
    staleTime: 10 * 1000,
  });
}

export function useJoinRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roomId: string) => {
      return roomApi.joinRoom(roomId);
    },
    onSuccess: (_, roomId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
    },
  });
}

export function useLeaveRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roomId: string) => {
      return roomApi.leaveRoom(roomId);
    },
    onSuccess: (_, roomId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
    },
  });
}
