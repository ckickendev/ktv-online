'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserDto, PublicUserProfileDto, UpdateProfileDto } from '@ktv/contracts';
import { userApi } from '@/lib/api/endpoints/users';
import { queryKeys } from './query-keys';
import { useAuthStore } from '@/stores/use-auth-store';

export function useUserProfile(userId?: string) {
  return useQuery<UserDto>({
    queryKey: queryKeys.users.profile(userId ?? ''),
    queryFn: () => userApi.getProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicUserProfile(userId?: string) {
  return useQuery<PublicUserProfileDto>({
    queryKey: queryKeys.users.publicProfile(userId ?? ''),
    queryFn: () => userApi.getPublicProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (data: UpdateProfileDto) => userApi.updateProfile(data),
    onSuccess: (updatedUser: UserDto) => {
      // Update local auth store
      if (currentUser && currentUser.id === updatedUser.id) {
        setUser({
          ...currentUser,
          displayName: updatedUser.displayName,
          bio: updatedUser.bio,
          avatar: updatedUser.avatar,
        });
      }

      // Update query cache for current user and users list/profiles
      queryClient.setQueryData(queryKeys.auth.currentUser(), (prev: unknown) => {
        if (!prev || typeof prev !== 'object') return prev;
        return {
          ...prev,
          displayName: updatedUser.displayName,
          bio: updatedUser.bio,
          avatar: updatedUser.avatar,
        };
      });

      queryClient.setQueryData(queryKeys.users.profile(updatedUser.id), updatedUser);
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
