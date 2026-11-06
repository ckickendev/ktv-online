import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { roomApi } from '@/lib/api/endpoints/rooms';
import { CreateRoomDto, RoomDto, UpdateRoomDto } from '@ktv/contracts';

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
