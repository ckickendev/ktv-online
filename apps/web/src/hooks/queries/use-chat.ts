import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, roomApi } from '@/lib/api';
import { queryKeys } from './query-keys';
import { ChatMessageDto, RoomActivityDto } from '@ktv/contracts';

export function useRoomMessages(roomId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.messages(roomId ?? ''),
    queryFn: async () => {
      if (!roomId) return { messages: [] as ChatMessageDto[], nextCursor: undefined };
      return chatApi.getMessages(roomId);
    },
    enabled: Boolean(roomId) && (options?.enabled ?? true),
    staleTime: 1000 * 30, // 30s cache
  });
}

export function useRoomActivities(roomId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.activities(roomId ?? ''),
    queryFn: async () => {
      if (!roomId) return [] as RoomActivityDto[];
      return chatApi.getActivities(roomId);
    },
    enabled: Boolean(roomId) && (options?.enabled ?? true),
    staleTime: 1000 * 20,
  });
}

export function useDeleteMessage(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => chatApi.deleteMessage(roomId, messageId),
    onSuccess: (data) => {
      // Optimistically update query cache
      queryClient.setQueryData(
        queryKeys.chat.messages(roomId),
        (old: { messages: ChatMessageDto[]; nextCursor?: string } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === data.messageId
                ? {
                    ...m,
                    isDeleted: true,
                    content: '[This message was deleted by the host]',
                  }
                : m
            ),
          };
        }
      );
    },
  });
}

export function useKickMember(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      roomApi.kickMember(roomId, userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.activities(roomId) });
    },
  });
}
