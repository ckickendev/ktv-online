'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  RoomStateSnapshotDto,
  RoomSnapshotDto,
  RoomMembershipDto,
  HostDto,
  RoomViewerState,
  RoomStateEventDto,
  RoomPresenceSnapshotPayload,
  RoomMemberJoinedPayload,
  RoomMemberLeftPayload,
  RoomClosedPayload,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { roomApi } from '@/lib/api/endpoints/rooms';
import { socketManager, SocketConnectionStatus } from '@/lib/socket/socket-client';
import { useAuth } from '@/hooks/use-auth';

export type RoomSyncStatus = 'initializing' | 'synced' | 'desynchronized' | 'reconnecting';

export interface UseRoomStateOptions {
  enabled?: boolean;
}

export interface UseRoomStateReturn {
  room: RoomSnapshotDto | null;
  host: HostDto | null;
  members: RoomMembershipDto[];
  onlineUserIds: Set<string>;
  totalOnline: number;
  viewer: RoomViewerState;
  version: number;
  syncStatus: RoomSyncStatus;
  connectionStatus: SocketConnectionStatus;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  roomClosedNotice: string | null;
  isKicked: boolean;
  kickedReason: string | null;
  refreshState: () => Promise<void>;
}

const MAX_BUFFERED_EVENTS = 100;
const LIVENESS_CHECK_INTERVAL_MS = 20000;

export function useRoomState(
  roomId: string | undefined,
  options?: UseRoomStateOptions
): UseRoomStateReturn {
  const enabled = options?.enabled !== false && Boolean(roomId);
  const { user: currentUser } = useAuth();

  const [room, setRoom] = useState<RoomSnapshotDto | null>(null);
  const [host, setHost] = useState<HostDto | null>(null);
  const [members, setMembers] = useState<RoomMembershipDto[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<RoomViewerState>({
    isMember: false,
    role: 'none',
    isKicked: false,
  });
  const [version, setVersion] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus>('initializing');
  const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>(() =>
    socketManager.getStatus()
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roomClosedNotice, setRoomClosedNotice] = useState<string | null>(null);
  const [isKicked, setIsKicked] = useState<boolean>(false);
  const [kickedReason, setKickedReason] = useState<string | null>(null);

  // Mutable refs to prevent stale closures and manage synchronization locks
  const versionRef = useRef<number>(0);
  const roomIdRef = useRef<string | undefined>(roomId);
  roomIdRef.current = roomId;
  const currentUserIdRef = useRef<string | undefined>(currentUser?.id);
  currentUserIdRef.current = currentUser?.id;

  // Synchronization event buffer and recovery coalescing locks
  const syncStatusRef = useRef<RoomSyncStatus>('initializing');
  syncStatusRef.current = syncStatus;
  const bufferedEventsRef = useRef<RoomStateEventDto[]>([]);
  const isFetchingSnapshotRef = useRef<boolean>(false);
  const queuedRecoveryRef = useRef<boolean>(false);

  // Track socket connection status
  useEffect(() => {
    const unsubscribe = socketManager.subscribeStatus((newStatus) => {
      setConnectionStatus(newStatus);
      if (newStatus === 'reconnecting') {
        setSyncStatus('reconnecting');
      }
    });
    return unsubscribe;
  }, []);

  // Apply a single validated domain mutation event
  const applyDomainMutation = useCallback((event: RoomStateEventDto) => {
    versionRef.current = event.version;
    setVersion(event.version);

    switch (event.type) {
      case 'room.settings.updated':
      case 'room.updated': {
        const p = event.payload as Partial<RoomSnapshotDto>;
        setRoom((prev) => (prev ? { ...prev, ...p } : null));
        break;
      }

      case 'member.joined': {
        const memberPayload = event.payload.member as RoomMembershipDto | undefined;
        const newCount = event.payload.currentParticipantsCount as number | undefined;

        if (memberPayload) {
          setMembers((prev) => {
            if (prev.some((m) => m.id === memberPayload.id || m.userId === memberPayload.userId)) {
              return prev.map((m) => (m.userId === memberPayload.userId ? memberPayload : m));
            }
            return [...prev, memberPayload];
          });

          if (currentUserIdRef.current && memberPayload.userId === currentUserIdRef.current) {
            setViewer({
              isMember: true,
              role: memberPayload.role,
              isKicked: false,
            });
          }
        }

        if (typeof newCount === 'number') {
          setRoom((prev) => (prev ? { ...prev, currentParticipantsCount: newCount } : null));
        }
        break;
      }

      case 'member.left': {
        const leftUserId = event.payload.userId as string | undefined;
        const newCount = event.payload.currentParticipantsCount as number | undefined;

        if (leftUserId) {
          setMembers((prev) => prev.filter((m) => m.userId !== leftUserId));
          if (currentUserIdRef.current && leftUserId === currentUserIdRef.current) {
            setViewer({
              isMember: false,
              role: 'viewer',
              isKicked: false,
            });
          }
        }

        if (typeof newCount === 'number') {
          setRoom((prev) => (prev ? { ...prev, currentParticipantsCount: newCount } : null));
        }
        break;
      }

      case 'member.kicked': {
        const kickedUserId = event.payload.userId as string | undefined;
        const reason = event.payload.reason as string | undefined;
        const newCount = event.payload.currentParticipantsCount as number | undefined;

        if (kickedUserId) {
          setMembers((prev) => prev.filter((m) => m.userId !== kickedUserId));
          if (currentUserIdRef.current && kickedUserId === currentUserIdRef.current) {
            setIsKicked(true);
            setKickedReason(reason || 'You were removed from this room by the host.');
            setViewer({
              isMember: false,
              role: 'none',
              isKicked: true,
            });
          }
        }

        if (typeof newCount === 'number') {
          setRoom((prev) => (prev ? { ...prev, currentParticipantsCount: newCount } : null));
        }
        break;
      }

      case 'room.closed': {
        const reason = event.payload.reason as string | undefined;
        setRoomClosedNotice(reason || 'Room has been closed by host');
        setRoom((prev) => (prev ? { ...prev, status: 'closed', currentParticipantsCount: 0 } : null));
        setMembers([]);
        break;
      }
    }
  }, []);

  // Hydrate local synchronized state from authoritative server snapshot
  // Drains buffered events and ignores late snapshots that would roll state backward
  const applySnapshot = useCallback(
    (snapshot: RoomStateSnapshotDto) => {
      // Ordering guard: never let a late, older snapshot overwrite newer applied state
      if (snapshot.version < versionRef.current) {
        return;
      }

      versionRef.current = snapshot.version;
      setVersion(snapshot.version);
      setRoom(snapshot.room);
      setHost(snapshot.host);
      setMembers(snapshot.members);
      setOnlineUserIds(new Set(snapshot.presence));
      setViewer(snapshot.viewer);

      if (snapshot.viewer.isKicked) {
        setIsKicked(true);
        setKickedReason('You have been removed from this room by the host.');
      }
      if (snapshot.room.status === 'closed') {
        setRoomClosedNotice('This room has been closed by the host.');
      }

      // Process buffered events arriving while snapshot was in-flight
      const buffered = bufferedEventsRef.current;
      bufferedEventsRef.current = [];

      // Discard stale buffered events (<= snapshot.version)
      const newerEvents = buffered
        .filter((e) => e.version > snapshot.version)
        .sort((a, b) => a.version - b.version);

      let currentV = snapshot.version;
      let hasGap = false;

      for (const ev of newerEvents) {
        if (ev.version === currentV + 1) {
          applyDomainMutation(ev);
          currentV = ev.version;
        } else if (ev.version > currentV + 1) {
          hasGap = true;
          break;
        }
      }

      if (hasGap) {
        setSyncStatus('desynchronized');
      } else {
        setSyncStatus('synced');
      }

      setIsLoading(false);
      setIsError(false);
      setErrorMessage(null);
    },
    [applyDomainMutation]
  );

  // Fetch fresh authoritative room state snapshot via REST with in-flight coalescing
  const fetchSnapshot = useCallback(async () => {
    if (!roomIdRef.current) return;

    if (isFetchingSnapshotRef.current) {
      queuedRecoveryRef.current = true;
      return;
    }

    isFetchingSnapshotRef.current = true;

    try {
      setIsLoading((prev) => (room ? prev : true));
      const snapshot = await roomApi.getRoomState(roomIdRef.current);
      applySnapshot(snapshot);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve room state snapshot';
      setIsError(true);
      setErrorMessage(msg);
      setIsLoading(false);
    } finally {
      isFetchingSnapshotRef.current = false;
      if (queuedRecoveryRef.current) {
        queuedRecoveryRef.current = false;
        fetchSnapshot();
      }
    }
  }, [applySnapshot, room]);

  // Request fresh snapshot from Socket or REST with coalesced recovery
  const refreshState = useCallback(async () => {
    if (isFetchingSnapshotRef.current) {
      queuedRecoveryRef.current = true;
      return;
    }

    const socket = socketManager.getSocket();
    const currentRoomId = roomIdRef.current;

    if (socket?.connected && currentRoomId) {
      setSyncStatus('desynchronized');
      isFetchingSnapshotRef.current = true;

      socket.emit(
        SOCKET_EVENTS.CLIENT.ROOM_STATE_REQUEST,
        { roomId: currentRoomId },
        (res: SocketAckResponse<RoomStateSnapshotDto>) => {
          isFetchingSnapshotRef.current = false;

          if (res.success && res.data) {
            applySnapshot(res.data);
            if (queuedRecoveryRef.current) {
              queuedRecoveryRef.current = false;
              refreshState();
            }
          } else {
            // Fallback to REST if socket request rejected
            fetchSnapshot();
          }
        }
      );
    } else {
      await fetchSnapshot();
    }
  }, [applySnapshot, fetchSnapshot]);

  // Initial load via REST
  useEffect(() => {
    if (!enabled || !roomId) return;
    fetchSnapshot();
  }, [enabled, roomId, fetchSnapshot]);

  // Lost Final Event Detection: periodic background check and window focus/visibility reconciliation
  useEffect(() => {
    if (!enabled || !roomId) return;

    const checkLiveness = async () => {
      if (!roomIdRef.current || document.visibilityState === 'hidden') return;

      try {
        const verDto = await roomApi.getRoomVersion(roomIdRef.current);

        // Version discrepancy detected without receiving an event (lost final event)
        if (verDto.version > versionRef.current) {
          setSyncStatus('desynchronized');
          refreshState();
        } else if (verDto.status === 'closed' && room?.status !== 'closed') {
          setRoom((prev) => (prev ? { ...prev, status: 'closed', currentParticipantsCount: 0 } : null));
          setRoomClosedNotice('This room has been closed by the host.');
        }
      } catch {
        // Non-blocking background liveness check
      }
    };

    const intervalId = setInterval(checkLiveness, LIVENESS_CHECK_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkLiveness();
      }
    };

    const onWindowFocus = () => {
      checkLiveness();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [enabled, roomId, refreshState, room?.status]);

  // Socket.IO event synchronization layer with event buffering
  useEffect(() => {
    if (!enabled || !roomId) return;

    const socket = socketManager.connect();
    if (!socket) return;

    const targetRoomId = roomId;

    const onConnectOrReconnect = () => {
      if (socket.connected) {
        socket.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: targetRoomId });
        refreshState();
      }
    };

    if (socket.connected) {
      socket.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: targetRoomId });
    }

    socket.on('connect', onConnectOrReconnect);

    // 1. Authoritative Room State Snapshot from server
    const handleRoomStateSnapshot = (snapshot: RoomStateSnapshotDto) => {
      if (snapshot.room.id === targetRoomId) {
        applySnapshot(snapshot);
      }
    };

    // 2. Monotonic Versioned Room State Event with buffer-and-drain
    const handleRoomStateEvent = (event: RoomStateEventDto) => {
      if (event.roomId !== targetRoomId) return;

      // Buffer events while snapshot synchronization is in-flight
      if (syncStatusRef.current !== 'synced') {
        const buffer = bufferedEventsRef.current;
        if (!buffer.some((e) => e.eventId === event.eventId)) {
          if (buffer.length >= MAX_BUFFERED_EVENTS) {
            buffer.shift(); // Bound memory ceiling
          }
          buffer.push(event);
        }
        return;
      }

      const currentVer = versionRef.current;

      // Duplicate or stale event: ignore
      if (event.version <= currentVer) {
        return;
      }

      // Expected next sequential version
      if (event.version === currentVer + 1) {
        applyDomainMutation(event);
        return;
      }

      // Version gap detected (e.g. missed intermediate events)
      // Buffer the gap event and trigger immediate snapshot recovery
      bufferedEventsRef.current.push(event);
      setSyncStatus('desynchronized');
      refreshState();
    };

    // 3. Ephemeral Presence Events (do NOT advance stateVersion)
    const handlePresenceSnapshot = (payload: RoomPresenceSnapshotPayload) => {
      if (payload.roomId === targetRoomId) {
        setOnlineUserIds(new Set(payload.onlineUsers.map((u) => u.userId)));
      }
    };

    const handleMemberJoinedPresence = (payload: RoomMemberJoinedPayload) => {
      if (payload.roomId === targetRoomId) {
        setOnlineUserIds((prev) => new Set(prev).add(payload.user.userId));
      }
    };

    const handleMemberLeftPresence = (payload: RoomMemberLeftPayload) => {
      if (payload.roomId === targetRoomId) {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(payload.userId);
          return next;
        });
      }
    };

    const handleRoomClosedNotice = (payload: RoomClosedPayload) => {
      if (payload.roomId === targetRoomId) {
        setRoomClosedNotice(payload.reason || 'Room has been closed by host');
        setRoom((prev) => (prev ? { ...prev, status: 'closed', currentParticipantsCount: 0 } : null));
      }
    };

    socket.on(SOCKET_EVENTS.SERVER.ROOM_STATE_SNAPSHOT, handleRoomStateSnapshot);
    socket.on(SOCKET_EVENTS.SERVER.ROOM_STATE_EVENT, handleRoomStateEvent);
    socket.on(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
    socket.on(SOCKET_EVENTS.SERVER.MEMBER_JOINED, handleMemberJoinedPresence);
    socket.on(SOCKET_EVENTS.SERVER.MEMBER_LEFT, handleMemberLeftPresence);
    socket.on(SOCKET_EVENTS.SERVER.ROOM_CLOSED, handleRoomClosedNotice);

    return () => {
      socket.off('connect', onConnectOrReconnect);
      socket.off(SOCKET_EVENTS.SERVER.ROOM_STATE_SNAPSHOT, handleRoomStateSnapshot);
      socket.off(SOCKET_EVENTS.SERVER.ROOM_STATE_EVENT, handleRoomStateEvent);
      socket.off(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
      socket.off(SOCKET_EVENTS.SERVER.MEMBER_JOINED, handleMemberJoinedPresence);
      socket.off(SOCKET_EVENTS.SERVER.MEMBER_LEFT, handleMemberLeftPresence);
      socket.off(SOCKET_EVENTS.SERVER.ROOM_CLOSED, handleRoomClosedNotice);
      bufferedEventsRef.current = [];
    };
  }, [enabled, roomId, applySnapshot, applyDomainMutation, refreshState]);

  const totalOnline = useMemo(() => onlineUserIds.size, [onlineUserIds]);

  return {
    room,
    host,
    members,
    onlineUserIds,
    totalOnline,
    viewer,
    version,
    syncStatus,
    connectionStatus,
    isLoading,
    isError,
    errorMessage,
    roomClosedNotice,
    isKicked,
    kickedReason,
    refreshState,
  };
}
