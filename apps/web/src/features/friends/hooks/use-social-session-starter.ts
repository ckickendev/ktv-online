import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/query-keys';
import { friendsApi } from '../api/friends-api';
import { useCreateRoom } from '@/hooks/queries/use-room-mutations';
import { useMyRooms } from '@/hooks/queries/use-my-rooms';
import { useAuth } from '@/hooks/use-auth';
import {
  BatchLoungeInviteResultDto,
  CreateRoomDto,
  RoomAtmospherePreset,
  RoomCategory,
  RoomDto,
} from '@ktv/contracts';

export type SocialSessionSubmissionStep =
  | 'idle'
  | 'creating_room'
  | 'sending_invitations'
  | 'success'
  | 'partial_success'
  | 'failed';

export function useSocialSessionStarter() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const createRoomMutation = useCreateRoom();
  const { data: myRoomsData, isLoading: isLoadingMyRooms } = useMyRooms();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [loungeMode, setLoungeMode] = useState<'new' | 'existing'>('new');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // New lounge form state
  const defaultLoungeName = useMemo(() => {
    const name = currentUser?.displayName || currentUser?.username || 'My';
    return `${name}'s Karaoke Lounge`;
  }, [currentUser]);

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomVisibility, setNewRoomVisibility] = useState<'private' | 'public'>('private');
  const [newRoomAtmosphere, setNewRoomAtmosphere] = useState<RoomAtmospherePreset>('midnight_lounge');
  const [newRoomCategory, setNewRoomCategory] = useState<RoomCategory>('all');

  // Search filter inside dialog
  const [searchQuery, setSearchQuery] = useState('');

  // Submission state
  const [submissionStep, setSubmissionStep] = useState<SocialSessionSubmissionStep>('idle');
  const [batchResult, setBatchResult] = useState<BatchLoungeInviteResultDto | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter eligible existing rooms
  const eligibleRooms = useMemo(() => {
    if (!myRoomsData?.items) return [];
    return myRoomsData.items.filter((room: RoomDto) => {
      // Must be owned by current user, not closed, not locked, and have space
      const isOwner = currentUser?.id && room.ownerId === currentUser.id;
      const isNotClosed = room.status !== 'closed';
      const isNotLocked = !room.isLocked;
      const hasCapacity = room.currentParticipantsCount < room.capacity;
      return isOwner && isNotClosed && isNotLocked && hasCapacity;
    });
  }, [myRoomsData?.items, currentUser?.id]);

  const open = useCallback(
    (initialFriendId?: string, fixedRoomId?: string) => {
      setIsOpen(true);
      setSelectedFriendIds(initialFriendId ? [initialFriendId] : []);
      if (fixedRoomId) {
        setLoungeMode('existing');
        setSelectedRoomId(fixedRoomId);
        setActiveRoomId(fixedRoomId);
      } else {
        setLoungeMode('new');
        setSelectedRoomId(null);
        setActiveRoomId(null);
      }
      setNewRoomName(defaultLoungeName);
      setNewRoomVisibility('private');
      setNewRoomAtmosphere('midnight_lounge');
      setNewRoomCategory('all');
      setSearchQuery('');
      setSubmissionStep('idle');
      setBatchResult(null);
      setErrorMessage(null);
    },
    [defaultLoungeName]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedFriendIds([]);
    setSubmissionStep('idle');
    setBatchResult(null);
    setErrorMessage(null);
  }, []);

  const toggleFriend = useCallback((friendId: string) => {
    setSelectedFriendIds((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter((id) => id !== friendId);
      }
      if (prev.length >= 20) {
        return prev; // Max 20 limit enforced
      }
      return [...prev, friendId];
    });
  }, []);

  const selectAllOnline = useCallback((onlineFriendIds: string[]) => {
    setSelectedFriendIds((prev) => {
      const merged = Array.from(new Set([...prev, ...onlineFriendIds]));
      return merged.slice(0, 20); // Cap to 20
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFriendIds([]);
  }, []);

  const isSubmitting =
    submissionStep === 'creating_room' || submissionStep === 'sending_invitations';

  const startSessionAndInvite = useCallback(async () => {
    if (isSubmitting) return;

    if (selectedFriendIds.length === 0) {
      setErrorMessage('Please select at least one friend to invite.');
      return;
    }

    if (selectedFriendIds.length > 20) {
      setErrorMessage('Maximum 20 friends allowed per batch invitation.');
      return;
    }

    setErrorMessage(null);
    let targetRoomId: string | null = null;

    // Step 1: Create or select room
    if (loungeMode === 'new') {
      const trimmedName = newRoomName.trim() || defaultLoungeName;
      if (trimmedName.length < 2) {
        setErrorMessage('Lounge name must be at least 2 characters.');
        return;
      }

      setSubmissionStep('creating_room');
      try {
        const payload: CreateRoomDto = {
          name: trimmedName,
          visibility: newRoomVisibility,
          atmospherePreset: newRoomAtmosphere,
          category: newRoomCategory,
          capacity: 10,
          roomType: 'standard',
        };

        const newRoom = await createRoomMutation.mutateAsync(payload);
        targetRoomId = newRoom.id;
        setActiveRoomId(newRoom.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create karaoke lounge.';
        setErrorMessage(msg);
        setSubmissionStep('failed');
        return;
      }
    } else {
      if (!selectedRoomId) {
        setErrorMessage('Please choose an existing lounge to use.');
        return;
      }
      targetRoomId = selectedRoomId;
      setActiveRoomId(selectedRoomId);
    }

    if (!targetRoomId) {
      setErrorMessage('No valid lounge identified.');
      setSubmissionStep('failed');
      return;
    }

    // Step 2: Dispatch batch invitations
    setSubmissionStep('sending_invitations');
    try {
      const result = await friendsApi.inviteLoungeBatch(targetRoomId, selectedFriendIds);
      setBatchResult(result);

      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.mine() });

      if (result.summary.failed === 0) {
        setSubmissionStep('success');
      } else if (result.summary.sent > 0) {
        setSubmissionStep('partial_success');
      } else {
        setSubmissionStep('failed');
        setErrorMessage('Failed to deliver batch invitations to selected friends.');
      }
    } catch (err: unknown) {
      // Room was created or selected, but batch invite encountered an error (e.g. rate limit)
      const msg = err instanceof Error ? err.message : 'Error sending batch invitations.';
      setErrorMessage(msg);
      setSubmissionStep('failed');
      // Do not delete room; allow user to enter room or retry
    }
  }, [
    isSubmitting,
    selectedFriendIds,
    loungeMode,
    newRoomName,
    defaultLoungeName,
    newRoomVisibility,
    newRoomAtmosphere,
    newRoomCategory,
    createRoomMutation,
    selectedRoomId,
    queryClient,
  ]);

  const retryFailedInvitations = useCallback(async () => {
    if (isSubmitting) return;
    if (!activeRoomId || !batchResult) return;
    const failedIds = batchResult.results
      .filter((r) => r.status === 'failed')
      .map((r) => r.friendUserId);

    if (failedIds.length === 0) return;

    setSubmissionStep('sending_invitations');
    setErrorMessage(null);

    try {
      const retryRes = await friendsApi.inviteLoungeBatch(activeRoomId, failedIds);

      // Merge results
      const updatedResults = batchResult.results.map((prev) => {
        const retried = retryRes.results.find((r) => r.friendUserId === prev.friendUserId);
        return retried || prev;
      });

      const totalSent = updatedResults.filter((r) => r.status === 'sent').length;
      const totalFailed = updatedResults.filter((r) => r.status === 'failed').length;

      const mergedBatchResult: BatchLoungeInviteResultDto = {
        success: totalSent > 0,
        summary: {
          total: updatedResults.length,
          sent: totalSent,
          failed: totalFailed,
        },
        results: updatedResults,
      };

      setBatchResult(mergedBatchResult);

      if (totalFailed === 0) {
        setSubmissionStep('success');
      } else {
        setSubmissionStep('partial_success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error retrying invitations.';
      setErrorMessage(msg);
      setSubmissionStep('partial_success');
    }
  }, [activeRoomId, batchResult, isSubmitting]);

  const navigateToRoom = useCallback(() => {
    if (activeRoomId) {
      close();
      router.push(`/rooms/${activeRoomId}`);
    }
  }, [activeRoomId, close, router]);

  return {
    isOpen,
    open,
    close,
    selectedFriendIds,
    toggleFriend,
    selectAllOnline,
    clearSelection,
    loungeMode,
    setLoungeMode,
    selectedRoomId,
    setSelectedRoomId,
    newRoomName,
    setNewRoomName,
    newRoomVisibility,
    setNewRoomVisibility,
    newRoomAtmosphere,
    setNewRoomAtmosphere,
    newRoomCategory,
    setNewRoomCategory,
    searchQuery,
    setSearchQuery,
    eligibleRooms,
    isLoadingMyRooms,
    isSubmitting,
    submissionStep,
    batchResult,
    activeRoomId,
    errorMessage,
    startSessionAndInvite,
    retryFailedInvitations,
    navigateToRoom,
  };
}
