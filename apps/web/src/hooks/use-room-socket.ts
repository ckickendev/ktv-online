'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  PresenceMemberDto,
  RoomPresenceSnapshotPayload,
  RoomMemberJoinedPayload,
  RoomMemberLeftPayload,
  RoomClosedPayload,
  SOCKET_EVENTS,
} from '@ktv/contracts';
import { socketManager, SocketConnectionStatus } from '@/lib/socket/socket-client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/query-keys';

export interface UseRoomSocketOptions {
  enabled?: boolean;
}

export interface UseRoomSocketReturn {
  status: SocketConnectionStatus;
  onlineUsers: PresenceMemberDto[];
  onlineUserIds: Set<string>;
  totalOnline: number;
  roomClosedNotice: string | null;
  refreshPresence: () => void;
}

export function useRoomSocket(
  roomId: string | undefined,
  options?: UseRoomSocketOptions
): UseRoomSocketReturn {
  const enabled = options?.enabled !== false && Boolean(roomId);
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<SocketConnectionStatus>(() => socketManager.getStatus());
  const [onlineUsers, setOnlineUsers] = useState<PresenceMemberDto[]>([]);
  const [roomClosedNotice, setRoomClosedNotice] = useState<string | null>(null);

  // Keep a ref to roomId to avoid stale closures in event listeners
  const currentRoomIdRef = useRef<string | undefined>(roomId);
  currentRoomIdRef.current = roomId;

  // Track status updates from SocketManager
  useEffect(() => {
    const unsubscribe = socketManager.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const refreshPresence = useCallback(() => {
    const socket = socketManager.getSocket();
    if (socket?.connected && currentRoomIdRef.current) {
      socket.emit(SOCKET_EVENTS.CLIENT.PRESENCE_REQUEST, {
        roomId: currentRoomIdRef.current,
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled || !roomId) {
      return;
    }

    const socket = socketManager.connect();
    if (!socket) {
      return;
    }

    const targetRoomId = roomId;

    const joinRoomChannel = () => {
      if (socket.connected) {
        socket.emit(SOCKET_EVENTS.CLIENT.ROOM_JOIN, { roomId: targetRoomId });
      }
    };

    // If socket is already connected, join immediately
    if (socket.connected) {
      joinRoomChannel();
    }

    // Rejoin whenever socket connects or reconnects
    socket.on('connect', joinRoomChannel);

    // 1. Presence snapshot
    const handlePresenceSnapshot = (payload: RoomPresenceSnapshotPayload) => {
      if (payload.roomId === targetRoomId) {
        setOnlineUsers(payload.onlineUsers);
      }
    };

    // 2. Member joined
    const handleMemberJoined = (payload: RoomMemberJoinedPayload) => {
      if (payload.roomId === targetRoomId) {
        setOnlineUsers((prev) => {
          const exists = prev.some((u) => u.userId === payload.user.userId);
          if (exists) {
            return prev.map((u) => (u.userId === payload.user.userId ? payload.user : u));
          }
          return [...prev, payload.user];
        });

        // Invalidate room members query to reflect any new persistent memberships
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(targetRoomId) });
      }
    };

    // 3. Member left
    const handleMemberLeft = (payload: RoomMemberLeftPayload) => {
      if (payload.roomId === targetRoomId) {
        setOnlineUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
      }
    };

    // 4. Room closed
    const handleRoomClosed = (payload: RoomClosedPayload) => {
      if (payload.roomId === targetRoomId) {
        setRoomClosedNotice(payload.reason || 'Room has been closed by host');
        // Invalidate room detail so UI reflects closed status
        queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(targetRoomId) });
      }
    };

    socket.on(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
    socket.on(SOCKET_EVENTS.SERVER.MEMBER_JOINED, handleMemberJoined);
    socket.on(SOCKET_EVENTS.SERVER.MEMBER_LEFT, handleMemberLeft);
    socket.on(SOCKET_EVENTS.SERVER.ROOM_CLOSED, handleRoomClosed);

    return () => {
      // Leave room presence channel on unmount
      if (socket.connected) {
        socket.emit(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, { roomId: targetRoomId });
      }

      socket.off('connect', joinRoomChannel);
      socket.off(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
      socket.off(SOCKET_EVENTS.SERVER.MEMBER_JOINED, handleMemberJoined);
      socket.off(SOCKET_EVENTS.SERVER.MEMBER_LEFT, handleMemberLeft);
      socket.off(SOCKET_EVENTS.SERVER.ROOM_CLOSED, handleRoomClosed);
    };
  }, [enabled, roomId, queryClient]);

  const onlineUserIds = useMemo(() => {
    return new Set(onlineUsers.map((u) => u.userId));
  }, [onlineUsers]);

  return {
    status,
    onlineUsers,
    onlineUserIds,
    totalOnline: onlineUsers.length,
    roomClosedNotice,
    refreshPresence,
  };
}
