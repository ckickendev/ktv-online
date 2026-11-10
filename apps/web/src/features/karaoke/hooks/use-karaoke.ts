'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddQueueItemDto,
  KaraokePlaybackUpdatedPayload,
  KaraokeQueueUpdatedPayload,
  KaraokeSnapshotDto,
  PlaybackCommandDto,
  PlaybackCommandType,
  PlaybackStateDto,
  ReorderQueueDto,
  RoomQueueSnapshotDto,
  SOCKET_EVENTS,
} from '@ktv/contracts';
import { karaokeApi } from '../api/karaoke-api';
import { queryKeys } from '@/hooks/queries/query-keys';
import { socketManager } from '@/lib/socket/socket-client';
import { clockSyncService } from '../services/clock-sync.service';

export interface UseKaraokeOptions {
  enabled?: boolean;
  currentUserId?: string;
  isHost?: boolean;
  isMember?: boolean;
  roomStatus?: string;
}

export function useKaraoke(roomId: string, options: UseKaraokeOptions = {}) {
  const { enabled = true, currentUserId, isHost = false, isMember = false, roomStatus = 'active' } = options;
  const queryClient = useQueryClient();

  // 1. TanStack Query: Queue snapshot
  const queueQuery = useQuery<RoomQueueSnapshotDto>({
    queryKey: queryKeys.karaoke.queue(roomId),
    queryFn: () => karaokeApi.getQueue(roomId),
    enabled: enabled && Boolean(roomId),
    staleTime: 5000,
  });

  // 2. TanStack Query: Playback snapshot
  const playbackQuery = useQuery<PlaybackStateDto>({
    queryKey: queryKeys.karaoke.playback(roomId),
    queryFn: () => karaokeApi.getPlayback(roomId),
    enabled: enabled && Boolean(roomId),
    staleTime: 5000,
  });

  const queue = queueQuery.data;
  const playback = playbackQuery.data;

  // Refs for checking version monotonicity
  const queueVersionRef = useRef<number>(queue?.queueVersion || 0);
  useEffect(() => {
    if (queue?.queueVersion) {
      queueVersionRef.current = Math.max(queueVersionRef.current, queue.queueVersion);
    }
  }, [queue?.queueVersion]);

  const playbackVersionRef = useRef<number>(playback?.playbackVersion || 0);
  useEffect(() => {
    if (playback?.playbackVersion) {
      playbackVersionRef.current = Math.max(playbackVersionRef.current, playback.playbackVersion);
    }
  }, [playback?.playbackVersion]);

  // 3. Socket.IO Realtime Listeners
  useEffect(() => {
    if (!enabled || !roomId) return;

    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleQueueUpdated = (payload: KaraokeQueueUpdatedPayload) => {
      if (payload.roomId !== roomId) return;
      if (payload.queue.queueVersion >= queueVersionRef.current) {
        queueVersionRef.current = payload.queue.queueVersion;
        queryClient.setQueryData(queryKeys.karaoke.queue(roomId), payload.queue);
      }
    };

    const handlePlaybackUpdated = (payload: KaraokePlaybackUpdatedPayload) => {
      if (payload.roomId !== roomId) return;
      if (payload.playback.playbackVersion >= playbackVersionRef.current) {
        playbackVersionRef.current = payload.playback.playbackVersion;
        queryClient.setQueryData(queryKeys.karaoke.playback(roomId), payload.playback);
      }
    };

    const handleSnapshot = (snapshot: KaraokeSnapshotDto) => {
      if (snapshot.roomId !== roomId) return;
      if (snapshot.queue.queueVersion >= queueVersionRef.current) {
        queueVersionRef.current = snapshot.queue.queueVersion;
        queryClient.setQueryData(queryKeys.karaoke.queue(roomId), snapshot.queue);
      }
      if (snapshot.playback.playbackVersion >= playbackVersionRef.current) {
        playbackVersionRef.current = snapshot.playback.playbackVersion;
        queryClient.setQueryData(queryKeys.karaoke.playback(roomId), snapshot.playback);
      }
    };

    const handleConnect = () => {
      socket.emit(SOCKET_EVENTS.CLIENT.KARAOKE_STATE_REQUEST, { roomId });
      clockSyncService.sync(3).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        socket.emit(SOCKET_EVENTS.CLIENT.KARAOKE_STATE_REQUEST, { roomId });
        clockSyncService.sync(2).catch(() => {});
      }
    };

    socket.on('connect', handleConnect);
    socket.on(SOCKET_EVENTS.SERVER.KARAOKE_QUEUE_UPDATED, handleQueueUpdated);
    socket.on(SOCKET_EVENTS.SERVER.KARAOKE_PLAYBACK_UPDATED, handlePlaybackUpdated);
    socket.on(SOCKET_EVENTS.SERVER.KARAOKE_SNAPSHOT, handleSnapshot);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off(SOCKET_EVENTS.SERVER.KARAOKE_QUEUE_UPDATED, handleQueueUpdated);
      socket.off(SOCKET_EVENTS.SERVER.KARAOKE_PLAYBACK_UPDATED, handlePlaybackUpdated);
      socket.off(SOCKET_EVENTS.SERVER.KARAOKE_SNAPSHOT, handleSnapshot);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [enabled, roomId, queryClient]);

  // Initial clock sync on mount
  useEffect(() => {
    if (enabled) {
      clockSyncService.sync(3).catch(() => {});
    }
  }, [enabled]);

  // 4. Derived Smooth Playback Progress from Authoritative Server Clock Anchor
  const [currentPositionMs, setCurrentPositionMs] = useState<number>(0);

  useEffect(() => {
    if (!playback) {
      setCurrentPositionMs(0);
      return;
    }

    if (playback.status === 'paused') {
      setCurrentPositionMs(playback.positionMs);
      return;
    }

    if (playback.status === 'idle' || playback.status === 'ended') {
      setCurrentPositionMs(0);
      return;
    }

    if (playback.status === 'playing' && playback.anchorStartedAt) {
      const anchorTime = new Date(playback.anchorStartedAt).getTime();
      const baseMs = playback.positionMs;
      const durationMs = playback.currentItem?.song?.durationMs || 300000;

      // Update position smoothly at 10Hz using authoritative server time
      const updatePosition = () => {
        const serverNow = clockSyncService.now();
        const elapsed = Math.max(0, serverNow - anchorTime);
        const derived = Math.min(durationMs, baseMs + elapsed);
        setCurrentPositionMs(derived);
      };

      updatePosition();
      const interval = setInterval(updatePosition, 100);
      const unsubscribe = clockSyncService.addListener(updatePosition);

      return () => {
        clearInterval(interval);
        unsubscribe();
      };
    }

    return undefined;
  }, [playback]);

  // 5. Current Playing Item and Singer Information
  const currentItem = playback?.currentItem || null;
  const currentRequester = currentItem?.requestedBy || null;
  const currentSinger = currentItem?.singer || currentItem?.requestedBy || null;
  const currentSingerId = currentSinger?.id || null;
  const currentSingerName =
    currentSinger?.displayName || currentSinger?.username || null;

  const isCurrentSinger = Boolean(currentUserId && currentSingerId === currentUserId);
  const isCurrentRequester = Boolean(currentUserId && currentRequester?.id === currentUserId);
  const canControlPlayback = Boolean(isHost || isCurrentSinger || isCurrentRequester);
  const canAddSongs = Boolean(isMember && roomStatus !== 'closed');

  // Next up singer turn check
  const nextUpItem = useMemo(() => {
    if (!queue?.items) return null;
    return queue.items.find((item) => item.status === 'queued') || null;
  }, [queue?.items]);

  const nextRequester = nextUpItem?.requestedBy || null;
  const nextSinger = nextUpItem?.singer || nextUpItem?.requestedBy || null;
  const isNextUpSinger = Boolean(
    currentUserId && nextSinger && nextSinger.id === currentUserId
  );
  const isNextUpRequester = Boolean(
    currentUserId && nextRequester && nextRequester.id === currentUserId
  );

  // Performer stage status
  const currentPerformerState: 'singing' | 'paused' | 'preparing' | 'ended' | 'idle' = useMemo(() => {
    if (!playback || !currentItem) return 'idle';
    if (playback.status === 'playing') return 'singing';
    if (playback.status === 'paused') return 'paused';
    if (playback.status === 'loading') return 'preparing';
    if (playback.status === 'ended') return 'ended';
    return 'idle';
  }, [playback, currentItem]);

  // 6. Mutations with Optimistic Updates & Error Handling
  const addMutation = useMutation({
    mutationFn: (payload: AddQueueItemDto) => karaokeApi.addToQueue(roomId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.karaoke.queue(roomId), data.queue);
      queryClient.setQueryData(queryKeys.karaoke.playback(roomId), data.playback);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.queue(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.playback(roomId) });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => karaokeApi.removeFromQueue(roomId, itemId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.karaoke.queue(roomId), data.queue);
      queryClient.setQueryData(queryKeys.karaoke.playback(roomId), data.playback);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.queue(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.playback(roomId) });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (payload: ReorderQueueDto) => karaokeApi.reorderQueue(roomId, payload),
    onSuccess: (updatedQueue) => {
      queryClient.setQueryData(queryKeys.karaoke.queue(roomId), updatedQueue);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.queue(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.playback(roomId) });
    },
  });

  const commandMutation = useMutation({
    mutationFn: (payload: PlaybackCommandDto) => karaokeApi.executePlaybackCommand(roomId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.karaoke.playback(roomId), data.playback);
      queryClient.setQueryData(queryKeys.karaoke.queue(roomId), data.queue);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.playback(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.queue(roomId) });
    },
  });

  // Action methods
  const addToQueue = useCallback(
    (songId: string, singerId?: string) => {
      return addMutation.mutateAsync({ songId, singerId });
    },
    [addMutation]
  );

  const removeFromQueue = useCallback(
    (itemId: string) => {
      return removeMutation.mutateAsync(itemId);
    },
    [removeMutation]
  );

  const reorderQueue = useCallback(
    (itemIds: string[]) => {
      return reorderMutation.mutateAsync({
        itemIds,
        expectedQueueVersion: queue?.queueVersion,
      });
    },
    [reorderMutation, queue?.queueVersion]
  );

  const sendPlaybackCommand = useCallback(
    (command: PlaybackCommandType, positionMs?: number) => {
      return commandMutation.mutateAsync({
        command,
        positionMs,
        expectedPlaybackVersion: playback?.playbackVersion,
      });
    },
    [commandMutation, playback?.playbackVersion]
  );

  const play = useCallback(() => sendPlaybackCommand('play'), [sendPlaybackCommand]);
  const pause = useCallback(() => sendPlaybackCommand('pause'), [sendPlaybackCommand]);
  const seek = useCallback(
    (targetMs: number) => sendPlaybackCommand('seek', targetMs),
    [sendPlaybackCommand]
  );
  const skip = useCallback(() => sendPlaybackCommand('skip'), [sendPlaybackCommand]);
  const stop = useCallback(() => sendPlaybackCommand('stop'), [sendPlaybackCommand]);

  const requestSync = useCallback(() => {
    const socket = socketManager.getSocket();
    if (socket?.connected) {
      socket.emit(SOCKET_EVENTS.CLIENT.KARAOKE_STATE_REQUEST, { roomId });
    } else {
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.queue(roomId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.karaoke.playback(roomId) });
    }
  }, [roomId, queryClient]);

  return {
    queue,
    playback,
    currentPositionMs,
    currentItem,
    currentSinger,
    currentRequester,
    currentSingerId,
    currentSingerName,
    currentPerformerState,
    isCurrentSinger,
    isCurrentRequester,
    isNextUpSinger,
    isNextUpRequester,
    nextUpItem,
    nextSinger,
    nextRequester,
    canControlPlayback,
    canAddSongs,
    isHost,
    isLoading: queueQuery.isLoading || playbackQuery.isLoading,
    isError: queueQuery.isError || playbackQuery.isError,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    play,
    pause,
    seek,
    skip,
    stop,
    requestSync,
    clockOffsetMs: clockSyncService.getOffsetMs(),
    estimatedRttMs: clockSyncService.getEstimatedRttMs(),
    isMutating:
      addMutation.isPending ||
      removeMutation.isPending ||
      reorderMutation.isPending ||
      commandMutation.isPending,
  };
}
