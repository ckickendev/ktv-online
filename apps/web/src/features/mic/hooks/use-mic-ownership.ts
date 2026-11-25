'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  MicOwnershipChangedPayload,
  MicOwnershipSnapshotDto,
  MicOwnershipState,
  MicPendingRequestDto,
  MicRequestCancelledPayload,
  MicSingerDto,
  SocketAckResponse,
} from '@ktv/contracts';
import { SocketConnectionStatus } from '@/lib/socket/socket-client';
import { micApi } from '../api/mic-api';
import { micSocketAdapter } from '../socket/mic-socket.adapter';
import {
  MAX_PENDING_MIC_REQUESTS,
  MicActionStatus,
  useMicStore,
} from '../store/mic.store';

const STALE_OR_CONFLICT_ERROR_CODES = new Set<string>([
  'STALE_SINGER_SESSION',
  'STALE_OWNERSHIP_VERSION',
  'MIC_ALREADY_OCCUPIED',
  'MIC_NOT_OCCUPIED',
  'REQUEST_NOT_FOUND',
  'ALREADY_CURRENT_SINGER',
  'TARGET_NOT_ACTIVE_MEMBER',
  'TARGET_MEMBERSHIP_LOST',
  'ACK_TIMEOUT',
]);

export function mapMicErrorMessage(code: string, fallbackMessage?: string): string {
  switch (code) {
    case 'MIC_REQUEST_QUEUE_FULL':
      return `Stage Mic queue is full (${MAX_PENDING_MIC_REQUESTS}/${MAX_PENDING_MIC_REQUESTS}). Please wait for a slot to open.`;
    case 'RATE_LIMIT_EXCEEDED':
      return 'Too many Stage Mic requests. Please wait a moment before trying again.';
    case 'FORBIDDEN_USER_MUTED':
      return 'You cannot request or hold the Stage Mic while muted by room moderation.';
    case 'FORBIDDEN_NOT_MEMBER':
      return 'Join the lounge as a member before requesting the Stage Mic.';
    case 'FORBIDDEN_KICKED':
      return 'You have been removed from this lounge and cannot use the Stage Mic.';
    case 'FORBIDDEN_NOT_HOST':
      return 'Only the current lounge host can manage Stage Mic requests.';
    case 'FORBIDDEN_NOT_IN_ROOM':
      return 'Lounge realtime channel is still connecting. Please wait a moment and retry.';
    case 'STALE_SINGER_SESSION':
      return 'The active singer session changed. Syncing the latest Stage Mic state…';
    case 'STALE_OWNERSHIP_VERSION':
      return 'Stage Mic state updated concurrently. Syncing the latest Stage Mic state…';
    case 'MIC_ALREADY_OCCUPIED':
      return 'Another singer already holds the Stage Mic. Wait until the Stage Mic is released.';
    case 'MIC_NOT_OCCUPIED':
      return 'The Stage Mic has already been released.';
    case 'REQUEST_NOT_FOUND':
      return 'That Stage Mic request is no longer pending.';
    case 'ALREADY_CURRENT_SINGER':
      return 'You already hold the official Stage Mic.';
    case 'TARGET_NOT_ACTIVE_MEMBER':
    case 'TARGET_MEMBERSHIP_LOST':
      return 'That member is no longer active in the lounge.';
    case 'TARGET_USER_MUTED':
      return 'Cannot approve Stage Mic for a muted member.';
    case 'FORBIDDEN_ROOM_CLOSED':
      return 'This lounge has been closed.';
    case 'FORCE_RELEASE_FENCING_REQUIRED':
      return 'Cannot force-release without a synchronized singer session. Refreshing state…';
    case 'SOCKET_NOT_CONNECTED':
      return 'Realtime connection is offline. Waiting to reconnect…';
    default:
      return fallbackMessage || 'Unable to update Stage Mic state. Please try again.';
  }
}

export interface UseMicOwnershipOptions {
  roomId: string | undefined;
  enabled?: boolean;
  currentUserId?: string | null;
  isRoomChannelJoined: boolean;
  connectionStatus: SocketConnectionStatus;
  isMember: boolean;
  isHost: boolean;
  isMuted: boolean;
}

export interface UseMicOwnershipReturn {
  roomId: string | null;
  state: MicOwnershipState;
  currentSinger: MicSingerDto | null;
  currentSingerId: string | null;
  currentSingerSessionId: string | null;
  pendingRequests: MicPendingRequestDto[];
  ownershipVersion: number;
  grantedAt: string | null;
  updatedAt: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  actionStatus: MicActionStatus;
  actingTargetUserId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastNotice: string | null;
  isSocketRoomReady: boolean;
  isCurrentSinger: boolean;
  myPendingRequest: MicPendingRequestDto | null;
  myQueuePosition: number | null;
  isQueueFull: boolean;
  canRequestMic: boolean;
  canCancelRequest: boolean;
  canReleaseMic: boolean;
  canForceRelease: boolean;
  requestMic: () => Promise<boolean>;
  cancelRequest: () => Promise<boolean>;
  approveRequest: (targetUserId: string) => Promise<boolean>;
  rejectRequest: (targetUserId: string, reason?: string) => Promise<boolean>;
  releaseMic: () => Promise<boolean>;
  forceReleaseMic: () => Promise<boolean>;
  resyncMicState: () => Promise<void>;
  clearError: () => void;
  clearNotice: () => void;
}

export function useMicOwnership({
  roomId,
  enabled = true,
  currentUserId,
  isRoomChannelJoined,
  connectionStatus,
  isMember,
  isHost,
  isMuted,
}: UseMicOwnershipOptions): UseMicOwnershipReturn {
  const isActive = Boolean(enabled && roomId);

  const storeRoomId = useMicStore((s) => s.roomId);
  const state = useMicStore((s) => s.state);
  const currentSinger = useMicStore((s) => s.currentSinger);
  const currentSingerId = useMicStore((s) => s.currentSingerId);
  const currentSingerSessionId = useMicStore((s) => s.currentSingerSessionId);
  const pendingRequests = useMicStore((s) => s.pendingRequests);
  const ownershipVersion = useMicStore((s) => s.ownershipVersion);
  const grantedAt = useMicStore((s) => s.grantedAt);
  const updatedAt = useMicStore((s) => s.updatedAt);
  const isInitialized = useMicStore((s) => s.isInitialized);
  const isLoading = useMicStore((s) => s.isLoading);
  const actionStatus = useMicStore((s) => s.actionStatus);
  const actingTargetUserId = useMicStore((s) => s.actingTargetUserId);
  const errorCode = useMicStore((s) => s.errorCode);
  const errorMessage = useMicStore((s) => s.errorMessage);
  const lastNotice = useMicStore((s) => s.lastNotice);

  const roomIdRef = useRef<string | undefined>(roomId);
  roomIdRef.current = roomId;

  const currentUserIdRef = useRef<string | null | undefined>(currentUserId);
  currentUserIdRef.current = currentUserId;

  const isRoomChannelJoinedRef = useRef<boolean>(isRoomChannelJoined);
  isRoomChannelJoinedRef.current = isRoomChannelJoined;

  const connectionStatusRef = useRef<SocketConnectionStatus>(connectionStatus);
  connectionStatusRef.current = connectionStatus;

  const hasJoinedOnceRef = useRef<boolean>(false);
  const needsReconnectResyncRef = useRef<boolean>(false);

  const isSocketRoomReady = Boolean(
    isActive && isRoomChannelJoined && connectionStatus === 'connected'
  );

  // Resynchronizes mic state: prefers MIC_STATE_REQUEST when socket channel is joined,
  // falling back to REST GET /rooms/:roomId/mic only when the socket cannot be used.
  const resyncMicState = useCallback(async () => {
    const activeRoomId = roomIdRef.current;
    if (!activeRoomId) return;

    const canUseSocket =
      isRoomChannelJoinedRef.current &&
      connectionStatusRef.current === 'connected';

    if (canUseSocket) {
      const ack = await micSocketAdapter.requestState({ roomId: activeRoomId });
      if (ack.success && ack.data && roomIdRef.current === activeRoomId) {
        useMicStore.getState().applySnapshot(ack.data);
        return;
      }
      // If socket became unusable mid-flight, fall back to REST
      if (
        ack.error?.code === 'SOCKET_NOT_CONNECTED' ||
        ack.error?.code === 'ACK_TIMEOUT'
      ) {
        try {
          const restSnapshot = await micApi.getMicSnapshot(activeRoomId);
          if (roomIdRef.current === activeRoomId) {
            useMicStore.getState().applySnapshot(restSnapshot);
          }
        } catch {
          // Preserve existing authoritative state if fallback fails
        }
      }
      return;
    }

    try {
      const restSnapshot = await micApi.getMicSnapshot(activeRoomId);
      if (roomIdRef.current === activeRoomId) {
        useMicStore.getState().applySnapshot(restSnapshot);
      }
    } catch {
      // Preserve existing authoritative state if offline
    }
  }, []);

  // 1. Initialize store for roomId and reset on room change or unmount
  useEffect(() => {
    hasJoinedOnceRef.current = false;
    needsReconnectResyncRef.current = false;

    if (!isActive || !roomId) {
      useMicStore.getState().reset();
      return;
    }

    useMicStore.getState().initRoom(roomId);

    return () => {
      useMicStore.getState().reset();
    };
  }, [isActive, roomId]);

  // 2. Initial REST hydration (race-safe with automatic room:join MIC_STATE via ownershipVersion)
  useEffect(() => {
    if (!isActive || !roomId) return;

    let cancelled = false;
    const targetRoomId = roomId;

    micApi
      .getMicSnapshot(targetRoomId)
      .then((snapshot) => {
        if (cancelled || roomIdRef.current !== targetRoomId) return;
        useMicStore.getState().applySnapshot(snapshot);
      })
      .catch((err: unknown) => {
        if (cancelled || roomIdRef.current !== targetRoomId) return;
        const store = useMicStore.getState();
        store.setLoading(false);
        if (!store.isInitialized) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Failed to load Stage Mic status.';
          store.setError('INITIAL_LOAD_FAILED', msg);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isActive, roomId]);

  // 3. Attach Socket.IO listeners on singleton socketManager
  useEffect(() => {
    if (!isActive || !roomId) return;

    const targetRoomId = roomId;

    const handleRequestCancelledNotice = (
      payload: MicRequestCancelledPayload
    ) => {
      if (payload.roomId !== targetRoomId) return;
      const viewerId = currentUserIdRef.current;
      if (!viewerId || payload.userId !== viewerId) return;

      const store = useMicStore.getState();
      if (payload.reason === 'rejected') {
        store.setNotice(
          payload.rejectionReason
            ? `Host declined your Stage Mic request: ${payload.rejectionReason}`
            : 'Host declined your Stage Mic request.'
        );
      } else if (payload.reason === 'muted') {
        store.setNotice(
          'Your Stage Mic request was cancelled because you were muted.'
        );
      }
    };

    const handleOwnershipChangedNotice = (
      payload: MicOwnershipChangedPayload
    ) => {
      if (payload.roomId !== targetRoomId) return;
      const viewerId = currentUserIdRef.current;
      if (!viewerId) return;

      const store = useMicStore.getState();
      if (payload.currentSingerId === viewerId && payload.reason === 'approved') {
        store.setNotice('You now hold the official Stage Mic!');
      } else if (
        payload.previousSingerId === viewerId &&
        payload.reason === 'host_forced_release'
      ) {
        store.setNotice('The host released the Stage Mic.');
      } else if (
        payload.previousSingerId === viewerId &&
        payload.reason === 'singer_muted'
      ) {
        store.setNotice(
          'Stage Mic was released because your lounge mic was muted.'
        );
      }
    };

    const unsubscribe = micSocketAdapter.subscribe({
      onMicState: (payload) => {
        if (payload.roomId !== targetRoomId) return;
        const applied = useMicStore.getState().applySnapshot(payload);
        if (applied) {
          const store = useMicStore.getState();
          if (store.errorCode === 'INITIAL_LOAD_FAILED') {
            store.setError(null, null);
          }
        }
      },
      // Auxiliary events MUST NOT mutate ownership state; used strictly for UX notices
      onRequestCancelled: handleRequestCancelledNotice,
      onOwnershipChanged: handleOwnershipChangedNotice,
    });

    return unsubscribe;
  }, [isActive, roomId]);

  // 4. Reconnection resynchronization gated strictly on room rejoin completion
  useEffect(() => {
    if (!isActive || !roomId) return;

    if (isSocketRoomReady) {
      if (!hasJoinedOnceRef.current) {
        hasJoinedOnceRef.current = true;
      } else if (needsReconnectResyncRef.current) {
        needsReconnectResyncRef.current = false;
        void resyncMicState();
      }
    } else if (hasJoinedOnceRef.current) {
      needsReconnectResyncRef.current = true;
    }
  }, [isActive, roomId, isSocketRoomReady, resyncMicState]);

  // 5. Request fresh snapshot when the page becomes visible again
  useEffect(() => {
    if (!isActive || !roomId) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void resyncMicState();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isActive, roomId, resyncMicState]);

  const handleMutationResponse = useCallback(
    (ack: SocketAckResponse<MicOwnershipSnapshotDto>): boolean => {
      const store = useMicStore.getState();
      store.setActionStatus('idle', null);

      if (ack.success && ack.data) {
        store.applySnapshot(ack.data);
        store.setError(null, null);
        return true;
      }

      const code = ack.error?.code ?? 'MIC_COMMAND_FAILED';
      const readableMessage = mapMicErrorMessage(code, ack.error?.message);
      store.setError(code, readableMessage);

      if (STALE_OR_CONFLICT_ERROR_CODES.has(code)) {
        void resyncMicState();
      }

      return false;
    },
    [resyncMicState]
  );

  const ensureMutationReady = useCallback((): string | null => {
    const activeRoomId = roomIdRef.current;
    if (
      !activeRoomId ||
      !isRoomChannelJoinedRef.current ||
      connectionStatusRef.current !== 'connected'
    ) {
      const store = useMicStore.getState();
      store.setError(
        'FORBIDDEN_NOT_IN_ROOM',
        mapMicErrorMessage('FORBIDDEN_NOT_IN_ROOM')
      );
      return null;
    }
    return activeRoomId;
  }, []);

  const requestMic = useCallback(async (): Promise<boolean> => {
    const activeRoomId = ensureMutationReady();
    if (!activeRoomId) return false;

    const store = useMicStore.getState();
    store.setError(null, null);
    store.setNotice(null);
    store.setActionStatus('requesting', null);

    const ack = await micSocketAdapter.requestMic({ roomId: activeRoomId });
    return handleMutationResponse(ack);
  }, [ensureMutationReady, handleMutationResponse]);

  const cancelRequest = useCallback(async (): Promise<boolean> => {
    const activeRoomId = ensureMutationReady();
    if (!activeRoomId) return false;

    const store = useMicStore.getState();
    const viewerId = currentUserIdRef.current;
    const ownReq = viewerId
      ? store.pendingRequests.find((r) => r.userId === viewerId)
      : undefined;

    store.setError(null, null);
    store.setActionStatus('cancelling', null);

    const ack = await micSocketAdapter.cancelMic({
      roomId: activeRoomId,
      ...(ownReq?.requestId ? { requestId: ownReq.requestId } : {}),
    });
    return handleMutationResponse(ack);
  }, [ensureMutationReady, handleMutationResponse]);

  const approveRequest = useCallback(
    async (targetUserId: string): Promise<boolean> => {
      const activeRoomId = ensureMutationReady();
      if (!activeRoomId) return false;

      const store = useMicStore.getState();
      const targetReq = store.pendingRequests.find(
        (r) => r.userId === targetUserId
      );

      store.setError(null, null);
      store.setActionStatus('approving', targetUserId);

      const ack = await micSocketAdapter.approveMic({
        roomId: activeRoomId,
        targetUserId,
        ...(targetReq?.requestId ? { requestId: targetReq.requestId } : {}),
      });
      return handleMutationResponse(ack);
    },
    [ensureMutationReady, handleMutationResponse]
  );

  const rejectRequest = useCallback(
    async (targetUserId: string, reason?: string): Promise<boolean> => {
      const activeRoomId = ensureMutationReady();
      if (!activeRoomId) return false;

      const store = useMicStore.getState();
      const targetReq = store.pendingRequests.find(
        (r) => r.userId === targetUserId
      );

      store.setError(null, null);
      store.setActionStatus('rejecting', targetUserId);

      const ack = await micSocketAdapter.rejectMic({
        roomId: activeRoomId,
        targetUserId,
        ...(targetReq?.requestId ? { requestId: targetReq.requestId } : {}),
        ...(reason ? { reason } : {}),
      });
      return handleMutationResponse(ack);
    },
    [ensureMutationReady, handleMutationResponse]
  );

  const releaseMic = useCallback(async (): Promise<boolean> => {
    const activeRoomId = ensureMutationReady();
    if (!activeRoomId) return false;

    const store = useMicStore.getState();
    const sessionId = store.currentSingerSessionId;
    const version = store.ownershipVersion;

    if (!sessionId || version <= 0) {
      store.setError(
        'STALE_SINGER_SESSION',
        mapMicErrorMessage('STALE_SINGER_SESSION')
      );
      void resyncMicState();
      return false;
    }

    store.setError(null, null);
    store.setActionStatus('releasing', store.currentSingerId);

    const ack = await micSocketAdapter.releaseMic({
      roomId: activeRoomId,
      expectedSessionId: sessionId,
      expectedOwnershipVersion: version,
    });
    return handleMutationResponse(ack);
  }, [ensureMutationReady, handleMutationResponse, resyncMicState]);

  const forceReleaseMic = useCallback(async (): Promise<boolean> => {
    const activeRoomId = ensureMutationReady();
    if (!activeRoomId) return false;

    const store = useMicStore.getState();
    const observedSingerId = store.currentSingerId;
    const observedSessionId = store.currentSingerSessionId;
    const observedVersion = store.ownershipVersion;

    // Never force-release using only a userId: exact displayed session + version required
    if (!observedSingerId || !observedSessionId || observedVersion <= 0) {
      store.setError(
        'FORCE_RELEASE_FENCING_REQUIRED',
        mapMicErrorMessage('FORCE_RELEASE_FENCING_REQUIRED')
      );
      void resyncMicState();
      return false;
    }

    store.setError(null, null);
    store.setActionStatus('releasing', observedSingerId);

    const ack = await micSocketAdapter.releaseMic({
      roomId: activeRoomId,
      expectedSessionId: observedSessionId,
      expectedOwnershipVersion: observedVersion,
    });
    return handleMutationResponse(ack);
  }, [ensureMutationReady, handleMutationResponse, resyncMicState]);

  const clearError = useCallback(() => {
    useMicStore.getState().setError(null, null);
  }, []);

  const clearNotice = useCallback(() => {
    useMicStore.getState().setNotice(null);
  }, []);

  const isCurrentSinger = Boolean(
    currentUserId && currentSingerId && currentUserId === currentSingerId
  );

  const myPendingRequest = useMemo(() => {
    if (!currentUserId) return null;
    return pendingRequests.find((req) => req.userId === currentUserId) ?? null;
  }, [currentUserId, pendingRequests]);

  const myQueuePosition = useMemo(() => {
    if (!currentUserId) return null;
    const idx = pendingRequests.findIndex((req) => req.userId === currentUserId);
    return idx >= 0 ? idx + 1 : null;
  }, [currentUserId, pendingRequests]);

  const isQueueFull = pendingRequests.length >= MAX_PENDING_MIC_REQUESTS;

  const canRequestMic = Boolean(
    isSocketRoomReady &&
      isMember &&
      !isMuted &&
      !isCurrentSinger &&
      !myPendingRequest &&
      !isQueueFull &&
      actionStatus === 'idle'
  );

  const canCancelRequest = Boolean(
    isSocketRoomReady &&
      isMember &&
      Boolean(myPendingRequest) &&
      actionStatus === 'idle'
  );

  const canReleaseMic = Boolean(
    isSocketRoomReady &&
      isMember &&
      isCurrentSinger &&
      Boolean(currentSingerSessionId) &&
      ownershipVersion > 0 &&
      actionStatus === 'idle'
  );

  const canForceRelease = Boolean(
    isSocketRoomReady &&
      isHost &&
      state === 'OCCUPIED' &&
      Boolean(currentSingerId) &&
      Boolean(currentSingerSessionId) &&
      ownershipVersion > 0 &&
      actionStatus === 'idle'
  );

  return {
    roomId: storeRoomId,
    state,
    currentSinger,
    currentSingerId,
    currentSingerSessionId,
    pendingRequests,
    ownershipVersion,
    grantedAt,
    updatedAt,
    isInitialized,
    isLoading,
    actionStatus,
    actingTargetUserId,
    errorCode,
    errorMessage,
    lastNotice,
    isSocketRoomReady,
    isCurrentSinger,
    myPendingRequest,
    myQueuePosition,
    isQueueFull,
    canRequestMic,
    canCancelRequest,
    canReleaseMic,
    canForceRelease,
    requestMic,
    cancelRequest,
    approveRequest,
    rejectRequest,
    releaseMic,
    forceReleaseMic,
    resyncMicState,
    clearError,
    clearNotice,
  };
}
