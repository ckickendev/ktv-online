import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokenStore } from '@/lib/api/token-store';
import { socketManager } from '@/lib/socket/socket-client';
import { useRoomSocket } from '@/hooks/use-room-socket';
import { SOCKET_EVENTS } from '@ktv/contracts';

// Mock socket.io-client
const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketEmit = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();
const mockSocketRemoveAllListeners = vi.fn();

const eventCallbacks: Record<string, ((...args: unknown[]) => void)[]> = {};

interface MockSocket {
  connected: boolean;
  auth: Record<string, unknown>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  io: {
    on: ReturnType<typeof vi.fn>;
  };
}

const fakeSocket: MockSocket = {
  connected: false,
  auth: {},
  on: vi.fn((event, cb) => {
    mockSocketOn(event, cb);
    if (!eventCallbacks[event]) eventCallbacks[event] = [];
    eventCallbacks[event].push(cb);
  }),
  off: vi.fn((event, cb) => {
    mockSocketOff(event, cb);
    if (eventCallbacks[event]) {
      eventCallbacks[event] = eventCallbacks[event].filter((fn) => fn !== cb);
    }
  }),
  emit: vi.fn((...args: unknown[]) => {
    mockSocketEmit(...args);
  }),
  connect: vi.fn(() => {
    fakeSocket.connected = true;
    mockSocketConnect();
    // Trigger connect listeners
    (eventCallbacks['connect'] || []).forEach((fn) => fn());
  }),
  disconnect: vi.fn(() => {
    fakeSocket.connected = false;
    mockSocketDisconnect();
    (eventCallbacks['disconnect'] || []).forEach((fn) => fn('io client disconnect'));
  }),
  removeAllListeners: vi.fn(() => {
    mockSocketRemoveAllListeners();
    for (const key of Object.keys(eventCallbacks)) {
      delete eventCallbacks[key];
    }
  }),
  io: {
    on: vi.fn(),
  },
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

describe('Sprint 2.0: Frontend Realtime Client Integration', () => {
  let queryClient: QueryClient;

  function createWrapper() {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(eventCallbacks)) {
      delete eventCallbacks[key];
    }
    fakeSocket.connected = false;
    tokenStore.clearAccessToken();
    socketManager.disconnect();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    tokenStore.clearAccessToken();
    socketManager.disconnect();
  });

  describe('1. Socket Client Lifecycle & Authentication', () => {
    it('does not establish socket connection if access token is missing', () => {
      tokenStore.clearAccessToken();
      const socket = socketManager.connect();
      expect(socket).toBeNull();
      expect(socketManager.getStatus()).toBe('disconnected');
    });

    it('initializes and connects socket when access token is present', () => {
      tokenStore.setAccessToken('valid.mock.token');
      const socket = socketManager.connect();
      expect(socket).toBeDefined();
      expect(mockSocketConnect).toHaveBeenCalled();
      expect(socketManager.getStatus()).toBe('connected');
    });

    it('clearing access token automatically disconnects socket', () => {
      tokenStore.setAccessToken('valid.mock.token');
      socketManager.connect();
      expect(socketManager.getStatus()).toBe('connected');

      // User logs out or token expires
      act(() => {
        tokenStore.clearAccessToken();
      });

      expect(mockSocketDisconnect).toHaveBeenCalled();
      expect(socketManager.getStatus()).toBe('disconnected');
    });

    it('updating access token on refresh updates socket authentication payload', () => {
      tokenStore.setAccessToken('token_version_1');
      const socket = socketManager.connect();
      expect(socket).toBeDefined();

      // Silent token refresh completes
      act(() => {
        tokenStore.setAccessToken('token_version_2');
      });

      expect(fakeSocket.auth).toEqual({ token: 'token_version_2' });
    });

    it('disconnecting socket cleans up all event listeners safely', () => {
      tokenStore.setAccessToken('mock_token');
      socketManager.connect();
      socketManager.disconnect();

      expect(mockSocketDisconnect).toHaveBeenCalled();
      expect(mockSocketRemoveAllListeners).toHaveBeenCalled();
      expect(socketManager.getSocket()).toBeNull();
      expect(socketManager.getStatus()).toBe('disconnected');
    });
  });

  describe('2. useRoomSocket Hook Lifecycle & Presence', () => {
    const testRoomId = '60d5ec49f1b2c82d88c66666';

    it('joins room channel and updates status when mounted', () => {
      tokenStore.setAccessToken('mock_jwt');

      const { result } = renderHook(
        () => useRoomSocket(testRoomId, { enabled: true }),
        { wrapper: createWrapper() }
      );

      expect(mockSocketEmit).toHaveBeenCalledWith(SOCKET_EVENTS.CLIENT.ROOM_JOIN, {
        roomId: testRoomId,
      });
      expect(result.current.status).toBe('connected');
    });

    it('processes presence snapshot correctly', () => {
      tokenStore.setAccessToken('mock_jwt');

      const { result } = renderHook(
        () => useRoomSocket(testRoomId, { enabled: true }),
        { wrapper: createWrapper() }
      );

      const snapshotPayload = {
        roomId: testRoomId,
        onlineUsers: [
          { userId: 'u1', username: 'Singer_A', role: 'host' as const, isOnline: true, deviceCount: 1 },
          { userId: 'u2', username: 'Singer_B', role: 'member' as const, isOnline: true, deviceCount: 1 },
        ],
        totalOnline: 2,
      };

      act(() => {
        (eventCallbacks[SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT] || []).forEach((cb) =>
          cb(snapshotPayload)
        );
      });

      expect(result.current.onlineUsers.length).toBe(2);
      expect(result.current.totalOnline).toBe(2);
      expect(result.current.onlineUserIds.has('u1')).toBe(true);
      expect(result.current.onlineUserIds.has('u2')).toBe(true);
    });

    it('dynamically handles room:member:joined and room:member:left', () => {
      tokenStore.setAccessToken('mock_jwt');

      const { result } = renderHook(
        () => useRoomSocket(testRoomId, { enabled: true }),
        { wrapper: createWrapper() }
      );

      // New member joins
      act(() => {
        (eventCallbacks[SOCKET_EVENTS.SERVER.MEMBER_JOINED] || []).forEach((cb) =>
          cb({
            roomId: testRoomId,
            user: { userId: 'u3', username: 'Singer_C', role: 'member', isOnline: true, deviceCount: 1 },
            totalOnline: 1,
          })
        );
      });

      expect(result.current.onlineUsers.length).toBe(1);
      expect(result.current.onlineUserIds.has('u3')).toBe(true);

      // Member leaves
      act(() => {
        (eventCallbacks[SOCKET_EVENTS.SERVER.MEMBER_LEFT] || []).forEach((cb) =>
          cb({
            roomId: testRoomId,
            userId: 'u3',
            totalOnline: 0,
          })
        );
      });

      expect(result.current.onlineUsers.length).toBe(0);
      expect(result.current.onlineUserIds.has('u3')).toBe(false);
    });

    it('handles room:closed event and captures notice', () => {
      tokenStore.setAccessToken('mock_jwt');

      const { result } = renderHook(
        () => useRoomSocket(testRoomId, { enabled: true }),
        { wrapper: createWrapper() }
      );

      act(() => {
        (eventCallbacks[SOCKET_EVENTS.SERVER.ROOM_CLOSED] || []).forEach((cb) =>
          cb({
            roomId: testRoomId,
            reason: 'Host closed the lounge for the night',
          })
        );
      });

      expect(result.current.roomClosedNotice).toBe('Host closed the lounge for the night');
    });

    it('leaves room channel and unbinds listeners on unmount (Strict Mode resilience)', () => {
      tokenStore.setAccessToken('mock_jwt');

      const { unmount } = renderHook(
        () => useRoomSocket(testRoomId, { enabled: true }),
        { wrapper: createWrapper() }
      );

      unmount();

      expect(mockSocketEmit).toHaveBeenCalledWith(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, {
        roomId: testRoomId,
      });
      expect(mockSocketOff).toHaveBeenCalledWith(
        SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT,
        expect.any(Function)
      );
      expect(mockSocketOff).toHaveBeenCalledWith(
        SOCKET_EVENTS.SERVER.MEMBER_JOINED,
        expect.any(Function)
      );
      expect(mockSocketOff).toHaveBeenCalledWith(
        SOCKET_EVENTS.SERVER.MEMBER_LEFT,
        expect.any(Function)
      );
      expect(mockSocketOff).toHaveBeenCalledWith(
        SOCKET_EVENTS.SERVER.ROOM_CLOSED,
        expect.any(Function)
      );
    });
  });
});
