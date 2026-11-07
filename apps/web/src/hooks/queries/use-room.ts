import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { roomApi, PaginatedRoomsResult } from '@/lib/api/endpoints/rooms';
import { RoomDto, RoomMembershipDto, RoomMyMembershipDto } from '@ktv/contracts';
import { tokenStore } from '@/lib/api/token-store';

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

export function useMyRoomMembership(roomId: string, options?: { enabled?: boolean }) {
  return useQuery<RoomMyMembershipDto>({
    queryKey: queryKeys.rooms.membership(roomId),
    queryFn: async () => {
      return roomApi.getMyMembership(roomId);
    },
    enabled: Boolean(roomId) && tokenStore.hasToken() && options?.enabled !== false,
    staleTime: 10 * 1000,
  });
}

export function useJoinedRooms(
  params?: { page?: number; limit?: number },
  options?: { enabled?: boolean }
) {
  return useQuery<PaginatedRoomsResult>({
    queryKey: queryKeys.rooms.joined(params),
    queryFn: async () => {
      return roomApi.getJoinedRooms(params);
    },
    enabled: tokenStore.hasToken() && options?.enabled !== false,
    staleTime: 15 * 1000,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.membership(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.joined() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.membership(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.joined() });
    },
  });
}

