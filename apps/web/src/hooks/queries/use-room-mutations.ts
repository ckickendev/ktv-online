import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { roomApi } from '@/lib/api/endpoints/rooms';
import { CreateRoomDto, RoomDto, UpdateRoomDto, RoomMembershipDto } from '@ktv/contracts';

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation<RoomDto, Error, CreateRoomDto>({
    mutationFn: async (payload: CreateRoomDto) => {
      return roomApi.createRoom(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.mine() });
    },
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation<RoomDto, Error, { roomId: string; data: UpdateRoomDto }>({
    mutationFn: async ({ roomId, data }) => {
      return roomApi.updateRoom(roomId, data);
    },
    onSuccess: (updatedRoom, { roomId }) => {
      queryClient.setQueryData(queryKeys.rooms.detail(roomId), updatedRoom);
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.mine() });
    },
  });
}

export function useCloseRoom() {
  const queryClient = useQueryClient();

  return useMutation<RoomDto, Error, string>({
    mutationFn: async (roomId: string) => {
      return roomApi.closeRoom(roomId);
    },
    onSuccess: (closedRoom, roomId) => {
      queryClient.setQueryData(queryKeys.rooms.detail(roomId), closedRoom);
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.mine() });
    },
  });
}

export function useUpdateMemberRole(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    RoomMembershipDto,
    Error,
    { userId: string; role: 'moderator' | 'member' }
  >({
    mutationFn: async ({ userId, role }) => {
      return roomApi.updateMemberRole(roomId, userId, role);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.state(roomId) });
    },
  });
}

export function useMuteMember(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    RoomMembershipDto,
    Error,
    { userId: string; isMuted: boolean; reason?: string }
  >({
    mutationFn: async ({ userId, isMuted, reason }) => {
      return roomApi.muteMember(roomId, userId, isMuted, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.state(roomId) });
    },
  });
}

export function useTransferHost(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<RoomDto, Error, { newHostUserId: string }>({
    mutationFn: async ({ newHostUserId }) => {
      return roomApi.transferHost(roomId, newHostUserId);
    },
    onSuccess: (updatedRoom) => {
      queryClient.setQueryData(queryKeys.rooms.detail(roomId), updatedRoom);
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.membership(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.state(roomId) });
    },
  });
}

export function useSetRoomLock(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<RoomDto, Error, boolean>({
    mutationFn: async (isLocked: boolean) => {
      return roomApi.setRoomLock(roomId, isLocked);
    },
    onSuccess: (updatedRoom) => {
      queryClient.setQueryData(queryKeys.rooms.detail(roomId), updatedRoom);
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.state(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
    },
  });
}
