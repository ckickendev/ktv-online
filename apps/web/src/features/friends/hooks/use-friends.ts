import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/query-keys';
import { friendsApi, PaginatedFriendsResponse } from '../api/friends-api';
import { socketManager } from '@/lib/socket/socket-client';
import {
  SOCKET_EVENTS,
  FriendPresenceUpdatedPayload,
  FriendQueryDto,
  FriendRequestQueryDto,
} from '@ktv/contracts';

/**
 * Hook to retrieve accepted friends with realtime presence updates.
 */
export function useFriends(params?: Partial<FriendQueryDto>) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.friends.list(params as Record<string, unknown>),
    queryFn: () => friendsApi.getFriends(params),
    staleTime: 15_000,
    refetchInterval: 30_000, // Poll every 30s as backup to realtime events
  });

  // Listen to realtime socket presence updates and friendship changes
  useEffect(() => {
    const socket = socketManager.connect();
    if (!socket) return;

    const handlePresenceUpdated = (payload: FriendPresenceUpdatedPayload) => {
      queryClient.setQueriesData<PaginatedFriendsResponse>(
        { queryKey: queryKeys.friends.all },
        (oldData) => {
          if (!oldData?.items) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((item) => {
              if (item.friend.id === payload.userId) {
                return {
                  ...item,
                  friend: {
                    ...item.friend,
                    presence: {
                      userId: payload.userId,
                      status: payload.status,
                      roomId: payload.roomId,
                      roomTitle: payload.roomTitle,
                      isPrivateLounge: payload.isPrivateLounge,
                      songTitle: payload.songTitle,
                      updatedAt: payload.updatedAt,
                    },
                  },
                };
              }
              return item;
            }),
          };
        }
      );
    };

    const handleFriendAccepted = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    };

    socket.on(SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED, handlePresenceUpdated);
    socket.on(SOCKET_EVENTS.SERVER.FRIEND_REQUEST_ACCEPTED, handleFriendAccepted);

    return () => {
      socket.off(SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED, handlePresenceUpdated);
      socket.off(SOCKET_EVENTS.SERVER.FRIEND_REQUEST_ACCEPTED, handleFriendAccepted);
    };
  }, [queryClient]);

  return query;
}

/**
 * Hook to retrieve pending incoming friend requests with realtime notification listener.
 */
export function useIncomingRequests(params?: Partial<FriendRequestQueryDto>) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.friends.incoming(params as Record<string, unknown>),
    queryFn: () => friendsApi.getIncomingRequests(params),
    staleTime: 10_000,
  });

  useEffect(() => {
    const socket = socketManager.connect();
    if (!socket) return;

    const handleRequestReceived = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.incoming() });
    };

    socket.on(SOCKET_EVENTS.SERVER.FRIEND_REQUEST_RECEIVED, handleRequestReceived);

    return () => {
      socket.off(SOCKET_EVENTS.SERVER.FRIEND_REQUEST_RECEIVED, handleRequestReceived);
    };
  }, [queryClient]);

  return query;
}

/**
 * Hook to retrieve pending outgoing friend requests.
 */
export function useOutgoingRequests(params?: Partial<FriendRequestQueryDto>) {
  return useQuery({
    queryKey: queryKeys.friends.outgoing(params as Record<string, unknown>),
    queryFn: () => friendsApi.getOutgoingRequests(params),
    staleTime: 10_000,
  });
}

/**
 * Hook to search users across the platform.
 */
export function useUserSearch(searchTerm: string) {
  const q = searchTerm.trim();
  return useQuery({
    queryKey: queryKeys.friends.search(q),
    queryFn: () => friendsApi.searchUsers({ q, limit: 12 }),
    enabled: q.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Mutations for friendship actions.
 */
export function useSendFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetUserId: string) => friendsApi.sendFriendRequest(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.outgoing() });
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    },
  });
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => friendsApi.acceptFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    },
  });
}

export function useDeclineFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => friendsApi.declineFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.incoming() });
    },
  });
}

export function useCancelFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => friendsApi.cancelFriendRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.outgoing() });
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    },
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (friendUserId: string) => friendsApi.removeFriend(friendUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    },
  });
}

export function useSendLoungeInviteToFriend() {
  return useMutation({
    mutationFn: ({ roomId, friendUserId }: { roomId: string; friendUserId: string }) =>
      friendsApi.sendLoungeInvite(roomId, friendUserId),
  });
}
