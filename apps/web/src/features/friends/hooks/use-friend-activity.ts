import { useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/query-keys';
import { useFriends } from './use-friends';
import { friendsApi } from '../api/friends-api';
import { socketManager } from '@/lib/socket/socket-client';
import {
  FriendshipDto,
  PendingInvitationsResponseDto,
  DismissInvitationResponseDto,
  SOCKET_EVENTS,
} from '@ktv/contracts';

export interface FriendActivityGroups {
  singingNow: FriendshipDto[];
  inLounges: FriendshipDto[];
  availableOnline: FriendshipDto[];
  offline: FriendshipDto[];
}

export interface FriendActivityStats {
  totalFriends: number;
  singingCount: number;
  inLoungeCount: number;
  onlineCount: number;
  offlineCount: number;
  hasActiveFriends: boolean;
}

/**
 * Hook to retrieve normalized friend activities partitioned by presence status:
 * - singingNow (highest visual priority)
 * - inLounges (friends currently in rooms)
 * - availableOnline (friends online and ready to hangout)
 * - offline (collapsible / secondary)
 */
export function useFriendActivity() {
  const { data, isLoading, isError, error, refetch } = useFriends();

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const groups = useMemo<FriendActivityGroups>(() => {
    const singingNow: FriendshipDto[] = [];
    const inLounges: FriendshipDto[] = [];
    const availableOnline: FriendshipDto[] = [];
    const offline: FriendshipDto[] = [];

    for (const friendship of items) {
      const status = friendship.friend.presence?.status;
      switch (status) {
        case 'singing':
          singingNow.push(friendship);
          break;
        case 'in_lounge':
          inLounges.push(friendship);
          break;
        case 'online':
          availableOnline.push(friendship);
          break;
        case 'offline':
        default:
          offline.push(friendship);
          break;
      }
    }

    return {
      singingNow,
      inLounges,
      availableOnline,
      offline,
    };
  }, [items]);

  const stats = useMemo<FriendActivityStats>(() => {
    const singingCount = groups.singingNow.length;
    const inLoungeCount = groups.inLounges.length;
    const onlineCount = groups.availableOnline.length;
    const offlineCount = groups.offline.length;
    const totalFriends = items.length;
    const hasActiveFriends = singingCount > 0 || inLoungeCount > 0 || onlineCount > 0;

    return {
      totalFriends,
      singingCount,
      inLoungeCount,
      onlineCount,
      offlineCount,
      hasActiveFriends,
    };
  }, [groups, items.length]);

  return {
    items,
    groups,
    stats,
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * Hook to retrieve authenticated pending invitations with realtime listener.
 */
export function usePendingInvitations() {
  const queryClient = useQueryClient();

  const query = useQuery<PendingInvitationsResponseDto>({
    queryKey: queryKeys.friends.pendingInvitations(),
    queryFn: () => friendsApi.getPendingInvitations(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const socket = socketManager.connect();
    if (!socket) return;

    const handleInvitationReceived = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.pendingInvitations() });
    };

    const handleReconnect = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.pendingInvitations() });
    };

    socket.on(SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED, handleInvitationReceived);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off(SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED, handleInvitationReceived);
      socket.off('connect', handleReconnect);
    };
  }, [queryClient]);

  return query;
}

/**
 * Mutation hook to dismiss a pending room invitation.
 */
export function useDismissInvitation() {
  const queryClient = useQueryClient();

  return useMutation<DismissInvitationResponseDto, Error, string>({
    mutationFn: (invitationId: string) => friendsApi.dismissInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.pendingInvitations() });
    },
  });
}
