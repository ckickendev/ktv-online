import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invitationApi } from '@/lib/api/endpoints/invitations';
import { queryKeys } from './query-keys';
import {
  CreateInvitationResponseDto,
  InvitationPreviewDto,
  RoomInvitationDto,
  RoomMembershipDto,
} from '@ktv/contracts';

/**
 * Hook to fetch the active invitation for a room (host only).
 */
export function useActiveInvitation(roomId: string | undefined, enabled = true) {
  return useQuery<RoomInvitationDto | null>({
    queryKey: queryKeys.invitations.active(roomId ?? ''),
    queryFn: () => (roomId ? invitationApi.getActiveInvitation(roomId) : Promise.resolve(null)),
    enabled: Boolean(roomId) && enabled,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Hook to create a new invitation link for a room.
 */
export function useCreateInvitation(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<CreateInvitationResponseDto, Error, { expiresInHours?: number }>({
    mutationFn: ({ expiresInHours } = {}) =>
      invitationApi.createInvitation(roomId, expiresInHours),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitations.active(roomId),
      });
    },
  });
}

/**
 * Hook to revoke an active invitation link for a room.
 */
export function useRevokeInvitation(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<null, Error, void>({
    mutationFn: () => invitationApi.revokeInvitation(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitations.active(roomId),
      });
    },
  });
}

/**
 * Hook to preview an invitation token.
 */
export function useInvitationPreview(token: string | undefined) {
  return useQuery<InvitationPreviewDto>({
    queryKey: queryKeys.invitations.preview(token ?? ''),
    queryFn: () => (token ? invitationApi.previewInvitation(token) : Promise.reject(new Error('No token'))),
    enabled: Boolean(token),
    staleTime: 1000 * 10, // 10 seconds
    retry: false,
  });
}

/**
 * Hook to join a room via an invitation token.
 */
export function useJoinViaInvitation() {
  const queryClient = useQueryClient();

  return useMutation<RoomMembershipDto, Error, string>({
    mutationFn: (token: string) => invitationApi.joinViaInvitation(token),
    onSuccess: (data) => {
      if (data?.roomId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.rooms.detail(data.roomId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.rooms.membership(data.roomId),
        });
      }
    },
  });
}
