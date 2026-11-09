'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChatMessageDto,
  RoomActivityDto,
  ChatMessageNewPayload,
  ChatMessageDeletedPayload,
  ChatReactionUpdatedPayload,
  RoomActivityNewPayload,
  RoomMemberKickedPayload,
  ChatErrorPayload,
  SupportedReactionEmoji,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { socketManager } from '@/lib/socket/socket-client';
import { useAuth } from '@/hooks/use-auth';
import { useRoomMessages, useRoomActivities } from '@/hooks/queries/use-chat';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/query-keys';

export interface UseRoomChatOptions {
  enabled?: boolean;
}

export interface UseRoomChatReturn {
  messages: ChatMessageDto[];
  activities: RoomActivityDto[];
  isLoadingMessages: boolean;
  isSending: boolean;
  chatError: string | null;
  isKicked: boolean;
  kickedReason: string | null;
  sendMessage: (content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  addReaction: (messageId: string, emoji: SupportedReactionEmoji) => void;
  removeReaction: (messageId: string, emoji: SupportedReactionEmoji) => void;
  clearChatError: () => void;
}

export function useRoomChat(
  roomId: string | undefined,
  options?: UseRoomChatOptions
): UseRoomChatReturn {
  const enabled = options?.enabled !== false && Boolean(roomId);
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: initialMessagesData, isLoading: isLoadingMessages } = useRoomMessages(roomId, {
    enabled,
  });
  const { data: initialActivitiesData } = useRoomActivities(roomId, { enabled });

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [activities, setActivities] = useState<RoomActivityDto[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isKicked, setIsKicked] = useState(false);
  const [kickedReason, setKickedReason] = useState<string | null>(null);

  const currentRoomIdRef = useRef<string | undefined>(roomId);
  currentRoomIdRef.current = roomId;

  // Hydrate messages from REST query
  useEffect(() => {
    if (initialMessagesData?.messages) {
      setMessages(initialMessagesData.messages);
    }
  }, [initialMessagesData]);

  // Hydrate activities from REST query
  useEffect(() => {
    if (initialActivitiesData) {
      setActivities(initialActivitiesData);
    }
  }, [initialActivitiesData]);

  // Setup Socket.IO event listeners for chat, reactions, activities, and kicks
  useEffect(() => {
    if (!enabled || !roomId) return;

    const socket = socketManager.getSocket();
    if (!socket) return;

    const targetRoomId = roomId;

    // 1. New message broadcast
    const handleNewMessage = (payload: ChatMessageNewPayload) => {
      if (payload.roomId !== targetRoomId) return;

      setMessages((prev) => {
        // If clientMessageId exists, replace optimistic item; otherwise avoid duplicates
        const clientMsgId = payload.message.clientMessageId;
        const existsById = prev.some((m) => m.id === payload.message.id);
        if (existsById) return prev;

        if (clientMsgId && prev.some((m) => m.clientMessageId === clientMsgId)) {
          return prev.map((m) => (m.clientMessageId === clientMsgId ? payload.message : m));
        }

        return [...prev, payload.message];
      });

      // Update query cache as well
      queryClient.setQueryData(
        queryKeys.chat.messages(targetRoomId),
        (old: { messages: ChatMessageDto[]; nextCursor?: string } | undefined) => {
          if (!old) return { messages: [payload.message] };
          if (old.messages.some((m) => m.id === payload.message.id)) return old;
          return {
            ...old,
            messages: [...old.messages, payload.message],
          };
        }
      );
    };

    // 2. Message deleted broadcast
    const handleDeletedMessage = (payload: ChatMessageDeletedPayload) => {
      if (payload.roomId !== targetRoomId) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? {
                ...m,
                isDeleted: true,
                content: '[This message was deleted by the host]',
                deletedBy: payload.deletedBy,
              }
            : m
        )
      );

      // Invalidate or update query cache
      queryClient.setQueryData(
        queryKeys.chat.messages(targetRoomId),
        (old: { messages: ChatMessageDto[]; nextCursor?: string } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.id === payload.messageId
                ? {
                    ...m,
                    isDeleted: true,
                    content: '[This message was deleted by the host]',
                    deletedBy: payload.deletedBy,
                  }
                : m
            ),
          };
        }
      );
    };

    // 3. Reaction updated broadcast
    const handleReactionUpdated = (payload: ChatReactionUpdatedPayload) => {
      if (payload.roomId !== targetRoomId) return;

      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m))
      );
    };

    // 4. Activity new broadcast
    const handleActivityNew = (payload: RoomActivityNewPayload) => {
      if (payload.roomId !== targetRoomId) return;

      setActivities((prev) => [payload.activity, ...prev]);

      // Invalidate room detail and members query if membership changed
      if (
        payload.activity.type === 'member_joined' ||
        payload.activity.type === 'member_left' ||
        payload.activity.type === 'member_kicked'
      ) {
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(targetRoomId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(targetRoomId) });
      }
    };

    // 5. Member kicked notification
    const handleMemberKicked = (payload: RoomMemberKickedPayload) => {
      if (payload.roomId !== targetRoomId) return;

      if (currentUser && payload.userId === currentUser.id) {
        setIsKicked(true);
        setKickedReason(payload.reason || 'You were removed from the room by the host');
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms.membership(targetRoomId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(targetRoomId) });
      }
    };

    // 6. Chat error
    const handleChatError = (payload: ChatErrorPayload) => {
      setChatError(payload.message || 'Chat error occurred');
    };

    socket.on(SOCKET_EVENTS.SERVER.CHAT_MESSAGE_NEW, handleNewMessage);
    socket.on(SOCKET_EVENTS.SERVER.CHAT_MESSAGE_DELETED, handleDeletedMessage);
    socket.on(SOCKET_EVENTS.SERVER.CHAT_REACTION_UPDATED, handleReactionUpdated);
    socket.on(SOCKET_EVENTS.SERVER.ACTIVITY_NEW, handleActivityNew);
    socket.on(SOCKET_EVENTS.SERVER.MEMBER_KICKED, handleMemberKicked);
    socket.on(SOCKET_EVENTS.SERVER.CHAT_ERROR, handleChatError);

    return () => {
      socket.off(SOCKET_EVENTS.SERVER.CHAT_MESSAGE_NEW, handleNewMessage);
      socket.off(SOCKET_EVENTS.SERVER.CHAT_MESSAGE_DELETED, handleDeletedMessage);
      socket.off(SOCKET_EVENTS.SERVER.CHAT_REACTION_UPDATED, handleReactionUpdated);
      socket.off(SOCKET_EVENTS.SERVER.ACTIVITY_NEW, handleActivityNew);
      socket.off(SOCKET_EVENTS.SERVER.MEMBER_KICKED, handleMemberKicked);
      socket.off(SOCKET_EVENTS.SERVER.CHAT_ERROR, handleChatError);
    };
  }, [enabled, roomId, currentUser, queryClient]);

  const clearChatError = useCallback(() => {
    setChatError(null);
  }, []);

  // Send message action
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const socket = socketManager.getSocket();
      const currentRoomId = currentRoomIdRef.current;

      if (!socket?.connected || !currentRoomId || !content.trim()) {
        return false;
      }

      const clientMessageId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setIsSending(true);
      setChatError(null);

      // Optimistic update in UI
      const optimisticMessage: ChatMessageDto = {
        id: clientMessageId,
        roomId: currentRoomId,
        senderId: currentUser?.id ?? null,
        senderUsername: currentUser?.username ?? 'Me',
        senderAvatar: currentUser?.avatar ?? null,
        senderRole: 'member',
        content: content.trim(),
        messageType: 'text',
        clientMessageId,
        isDeleted: false,
        reactions: [],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      return new Promise<boolean>((resolve) => {
        socket.emit(
          SOCKET_EVENTS.CLIENT.CHAT_MESSAGE_SEND,
          {
            roomId: currentRoomId,
            content: content.trim(),
            clientMessageId,
          },
          (res: SocketAckResponse<ChatMessageDto>) => {
            setIsSending(false);
            if (res.success && res.data) {
              const persisted = res.data;
              setMessages((prev) =>
                prev.map((m) => (m.clientMessageId === clientMessageId ? persisted : m))
              );
              resolve(true);
            } else {
              setChatError(res.error?.message || 'Failed to send message');
              // Remove failed optimistic message
              setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
              resolve(false);
            }
          }
        );
      });
    },
    [currentUser]
  );

  // Add emoji reaction action
  const addReaction = useCallback((messageId: string, emoji: SupportedReactionEmoji) => {
    const socket = socketManager.getSocket();
    const currentRoomId = currentRoomIdRef.current;
    if (!socket?.connected || !currentRoomId) return;

    socket.emit(SOCKET_EVENTS.CLIENT.CHAT_REACTION_ADD, {
      roomId: currentRoomId,
      messageId,
      emoji,
    });
  }, []);

  // Remove emoji reaction action
  const removeReaction = useCallback((messageId: string, emoji: SupportedReactionEmoji) => {
    const socket = socketManager.getSocket();
    const currentRoomId = currentRoomIdRef.current;
    if (!socket?.connected || !currentRoomId) return;

    socket.emit(SOCKET_EVENTS.CLIENT.CHAT_REACTION_REMOVE, {
      roomId: currentRoomId,
      messageId,
      emoji,
    });
  }, []);

  // Delete message action (host moderation)
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    const socket = socketManager.getSocket();
    const currentRoomId = currentRoomIdRef.current;
    if (!socket?.connected || !currentRoomId) return false;

    return new Promise<boolean>((resolve) => {
      socket.emit(
        SOCKET_EVENTS.CLIENT.CHAT_MESSAGE_DELETE,
        {
          roomId: currentRoomId,
          messageId,
        },
        (res: SocketAckResponse) => {
          if (res.success) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      isDeleted: true,
                      content: '[This message was deleted by the host]',
                    }
                  : m
              )
            );
            resolve(true);
          } else {
            setChatError(res.error?.message || 'Failed to delete message');
            resolve(false);
          }
        }
      );
    });
  }, []);

  return {
    messages,
    activities,
    isLoadingMessages,
    isSending,
    chatError,
    isKicked,
    kickedReason,
    sendMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    clearChatError,
  };
}
