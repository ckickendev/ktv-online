import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  renderHook,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MicOwnershipSnapshotDto,
  MicPendingRequestDto,
  RoomMembershipDto,
  SOCKET_EVENTS,
} from '@ktv/contracts';
import { SocketConnectionStatus } from '@/lib/socket/socket-client';
import {
  INITIAL_MIC_STORE_DATA,
  MAX_PENDING_MIC_REQUESTS,
  MicOwnershipBar,
  micSocketAdapter,
  useMicOwnership,
  useMicStore,
} from '@/features/mic';
import { RoomMemberList } from '@/components/shared/room-member-list';
import { useRoomState } from '@/hooks/use-room-state';

const {
  mockListeners,
  statusSubscribers,
  mockSocket,
  mockSocketState,
  mockGetMicSnapshot,
  mockGetRoomState,
  mockGetRoomVersion,
} = vi.hoisted(() => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const statusSubs = new Set<(status: SocketConnectionStatus) => void>();
  const state = {
    status: 'connected' as SocketConnectionStatus,
    socketEnabled: true,
  };

  const sock = {
    connected: true,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return sock;
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
      return sock;
    }),
    emit: vi.fn(),
  };

  return {
    mockListeners: listeners,
    statusSubscribers: statusSubs,
    mockSocket: sock,
    mockSocketState: state,
    mockGetMicSnapshot: vi.fn(),
    mockGetRoomState: vi.fn(),
    mockGetRoomVersion: vi.fn(),
  };
});

vi.mock('@/lib/socket/socket-client', () => ({
  socketManager: {
    getSocket: () => (mockSocketState.socketEnabled ? mockSocket : null),
    connect: () => (mockSocketState.socketEnabled ? mockSocket : null),
    getStatus: () => mockSocketState.status,
    subscribeStatus: (cb: (status: SocketConnectionStatus) => void) => {
      statusSubscribers.add(cb);
      cb(mockSocketState.status);
      return () => {
        statusSubscribers.delete(cb);
      };
    },
  },
}));

vi.mock('@/features/mic/api/mic-api', () => ({
  getMicSnapshot: (...args: unknown[]) => mockGetMicSnapshot(...args),
  micApi: {
    getMicSnapshot: (...args: unknown[]) => mockGetMicSnapshot(...args),
  },
}));

vi.mock('@/lib/api/endpoints/rooms', () => ({
  roomApi: {
    getRoomState: (...args: unknown[]) => mockGetRoomState(...args),
    getRoomVersion: (...args: unknown[]) => mockGetRoomVersion(...args),
  },
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-member-1', username: 'member1' },
    isAuthenticated: true,
  }),
}));

const ROOM_A = '65f000000000000000000001';
const ROOM_B = '65f000000000000000000002';
const BASE_ISO = '2026-11-25T16:00:00.000Z';

function buildPendingRequest(
  index: number,
  overrides: Partial<MicPendingRequestDto> = {}
): MicPendingRequestDto {
  return {
    requestId: `req-${index}`,
    userId: `user-${index}`,
    username: `singer_${index}`,
    displayName: `Singer ${index}`,
    avatar: null,
    requestedAt: BASE_ISO,
    ...overrides,
  };
}

function buildSnapshot(
  overrides: Partial<MicOwnershipSnapshotDto> = {}
): MicOwnershipSnapshotDto {
  return {
    roomId: ROOM_A,
    state: 'AVAILABLE',
    currentSinger: null,
    currentSingerId: null,
    currentSingerSessionId: null,
    pendingRequests: [],
    ownershipVersion: 1,
    grantedAt: null,
    expiresAt: null,
    updatedAt: BASE_ISO,
    ...overrides,
  };
}

function emitServerEvent(event: string, payload: unknown) {
  const cbs = mockListeners[event] ? [...mockListeners[event]] : [];
  for (const cb of cbs) {
    cb(payload);
  }
}

function setSocketStatus(status: SocketConnectionStatus, connected: boolean) {
  mockSocketState.status = status;
  mockSocket.connected = connected;
  for (const sub of Array.from(statusSubscribers)) {
    sub(status);
  }
}

describe('S3.4.2 Virtual Microphone Ownership – Store, Socket, Hook & UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockListeners)) {
      delete mockListeners[key];
    }
    statusSubscribers.clear();
    mockSocketState.status = 'connected';
    mockSocketState.socketEnabled = true;
    mockSocket.connected = true;
    useMicStore.getState().reset();
    mockGetMicSnapshot.mockResolvedValue(buildSnapshot({ ownershipVersion: 1 }));
  });

  afterEach(() => {
    useMicStore.getState().reset();
  });

  // =========================================================================
  // 1. ZUSTAND STORE TESTS
  // =========================================================================
  describe('1. Zustand Store (useMicStore)', () => {
    it('starts with clean, plain serializable initial state', () => {
      const state = useMicStore.getState();
      expect(state.roomId).toBeNull();
      expect(state.state).toBe('AVAILABLE');
      expect(state.currentSinger).toBeNull();
      expect(state.currentSingerId).toBeNull();
      expect(state.currentSingerSessionId).toBeNull();
      expect(state.pendingRequests).toEqual([]);
      expect(state.ownershipVersion).toBe(0);
      expect(state.isInitialized).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.actionStatus).toBe('idle');

      // Plain serializable check
      const serialized = JSON.parse(JSON.stringify(INITIAL_MIC_STORE_DATA));
      expect(serialized).toEqual(INITIAL_MIC_STORE_DATA);
    });

    it('initializes room state and resets cleanly when switching rooms or calling reset()', () => {
      const store = useMicStore.getState();
      store.initRoom(ROOM_A);

      expect(useMicStore.getState().roomId).toBe(ROOM_A);
      expect(useMicStore.getState().isLoading).toBe(true);
      expect(useMicStore.getState().ownershipVersion).toBe(0);

      store.applySnapshot(
        buildSnapshot({
          roomId: ROOM_A,
          state: 'OCCUPIED',
          currentSingerId: 'u-singer',
          currentSingerSessionId: 'sess-1',
          currentSinger: {
            userId: 'u-singer',
            username: 'vocalist',
            displayName: 'Vocalist',
            sessionId: 'sess-1',
          },
          ownershipVersion: 4,
        })
      );

      expect(useMicStore.getState().ownershipVersion).toBe(4);
      expect(useMicStore.getState().currentSingerId).toBe('u-singer');

      // Re-initializing same room is idempotent
      useMicStore.getState().initRoom(ROOM_A);
      expect(useMicStore.getState().ownershipVersion).toBe(4);

      // Switching to ROOM_B clears ROOM_A state
      useMicStore.getState().initRoom(ROOM_B);
      expect(useMicStore.getState().roomId).toBe(ROOM_B);
      expect(useMicStore.getState().state).toBe('AVAILABLE');
      expect(useMicStore.getState().currentSingerId).toBeNull();
      expect(useMicStore.getState().ownershipVersion).toBe(0);
      expect(useMicStore.getState().isInitialized).toBe(false);

      // Explicit reset() returns to INITIAL_MIC_STORE_DATA
      useMicStore.getState().reset();
      expect(useMicStore.getState().roomId).toBeNull();
      expect(useMicStore.getState().isLoading).toBe(false);
    });

    it('enforces monotonic ownershipVersion, rejects stale snapshots, and treats duplicates idempotently', () => {
      useMicStore.getState().initRoom(ROOM_A);

      const v2Snapshot = buildSnapshot({
        roomId: ROOM_A,
        state: 'REQUEST_PENDING',
        pendingRequests: [buildPendingRequest(1)],
        ownershipVersion: 2,
      });
      expect(useMicStore.getState().applySnapshot(v2Snapshot)).toBe(true);
      expect(useMicStore.getState().ownershipVersion).toBe(2);

      // Stale snapshot (version 1 < 2) MUST be rejected
      const staleV1 = buildSnapshot({
        roomId: ROOM_A,
        state: 'AVAILABLE',
        pendingRequests: [],
        ownershipVersion: 1,
      });
      expect(useMicStore.getState().applySnapshot(staleV1)).toBe(false);
      expect(useMicStore.getState().ownershipVersion).toBe(2);
      expect(useMicStore.getState().state).toBe('REQUEST_PENDING');
      expect(useMicStore.getState().pendingRequests).toHaveLength(1);

      // Duplicate snapshot (version 2 === 2) is idempotent and does NOT overwrite state
      const duplicateMutatedV2 = buildSnapshot({
        roomId: ROOM_A,
        state: 'OCCUPIED',
        currentSingerId: 'rogue',
        currentSingerSessionId: 'rogue-sess',
        currentSinger: { userId: 'rogue', username: 'rogue' },
        ownershipVersion: 2,
      });
      expect(useMicStore.getState().applySnapshot(duplicateMutatedV2)).toBe(true);
      expect(useMicStore.getState().state).toBe('REQUEST_PENDING');
      expect(useMicStore.getState().currentSingerId).toBeNull();

      // Strictly newer snapshot (version 3 > 2) advances cleanly
      const v3Snapshot = buildSnapshot({
        roomId: ROOM_A,
        state: 'OCCUPIED',
        currentSingerId: 'user-1',
        currentSingerSessionId: 'sess-v3',
        currentSinger: {
          userId: 'user-1',
          username: 'singer_1',
          displayName: 'Singer 1',
          sessionId: 'sess-v3',
        },
        ownershipVersion: 3,
        grantedAt: BASE_ISO,
      });
      expect(useMicStore.getState().applySnapshot(v3Snapshot)).toBe(true);
      expect(useMicStore.getState().ownershipVersion).toBe(3);
      expect(useMicStore.getState().currentSingerId).toBe('user-1');
    });

    it('rejects snapshots belonging to a different room', () => {
      useMicStore.getState().initRoom(ROOM_A);

      const foreignSnapshot = buildSnapshot({
        roomId: ROOM_B,
        state: 'OCCUPIED',
        currentSingerId: 'foreign-user',
        currentSingerSessionId: 'foreign-sess',
        currentSinger: { userId: 'foreign-user', username: 'foreign' },
        ownershipVersion: 99,
      });

      expect(useMicStore.getState().applySnapshot(foreignSnapshot)).toBe(false);
      expect(useMicStore.getState().ownershipVersion).toBe(0);
      expect(useMicStore.getState().currentSingerId).toBeNull();
    });
  });

  // =========================================================================
  // 2. SOCKET ADAPTER & HOOK TESTS
  // =========================================================================
  describe('2. Socket Adapter & useMicOwnership Hook', () => {
    it('registers and cleans up all 4 server listeners cleanly', () => {
      const unsubscribe = micSocketAdapter.subscribe({
        onMicState: vi.fn(),
        onRequestCreated: vi.fn(),
        onRequestCancelled: vi.fn(),
        onOwnershipChanged: vi.fn(),
      });

      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_STATE]).toHaveLength(1);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED]).toHaveLength(1);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED]).toHaveLength(1);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED]).toHaveLength(1);

      unsubscribe();

      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_STATE]).toHaveLength(0);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED]).toHaveLength(0);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED]).toHaveLength(0);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED]).toHaveLength(0);
    });

    it('registers zero duplicate listeners under React.StrictMode', async () => {
      const strictWrapper = ({ children }: { children: React.ReactNode }) => (
        <React.StrictMode>{children}</React.StrictMode>
      );

      const { unmount } = renderHook(
        () =>
          useMicOwnership({
            roomId: ROOM_A,
            enabled: true,
            currentUserId: 'user-1',
            isRoomChannelJoined: true,
            connectionStatus: 'connected',
            isMember: true,
            isHost: false,
            isMuted: false,
          }),
        { wrapper: strictWrapper }
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_STATE]).toHaveLength(1);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED]).toHaveLength(1);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED]).toHaveLength(1);
      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED]).toHaveLength(1);

      unmount();

      expect(mockListeners[SOCKET_EVENTS.SERVER.MIC_STATE]).toHaveLength(0);
    });

    it('hydrates from initial REST snapshot and Socket MIC_STATE, while auxiliary events only emit notices', async () => {
      mockGetMicSnapshot.mockResolvedValueOnce(
        buildSnapshot({
          roomId: ROOM_A,
          state: 'REQUEST_PENDING',
          pendingRequests: [buildPendingRequest(1, { userId: 'user-1' })],
          ownershipVersion: 2,
        })
      );

      const { result } = renderHook(() =>
        useMicOwnership({
          roomId: ROOM_A,
          enabled: true,
          currentUserId: 'user-1',
          isRoomChannelJoined: true,
          connectionStatus: 'connected',
          isMember: true,
          isHost: false,
          isMuted: false,
        })
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
        expect(result.current.ownershipVersion).toBe(2);
        expect(result.current.myQueuePosition).toBe(1);
      });

      // Auxiliary MIC_OWNERSHIP_CHANGED without MIC_STATE MUST NOT alter ownership state
      act(() => {
        emitServerEvent(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED, {
          roomId: ROOM_A,
          previousSingerId: null,
          previousSingerSessionId: null,
          currentSinger: {
            userId: 'user-1',
            username: 'singer_1',
            displayName: 'Singer 1',
            sessionId: 'sess-aux',
          },
          currentSingerId: 'user-1',
          currentSingerSessionId: 'sess-aux',
          pendingRequests: [],
          state: 'OCCUPIED',
          reason: 'approved',
          ownershipVersion: 3,
          grantedAt: BASE_ISO,
          occurredAt: BASE_ISO,
        });
      });

      // Ownership stays at v2 until authoritative MIC_STATE arrives; notice is set
      expect(result.current.ownershipVersion).toBe(2);
      expect(result.current.state).toBe('REQUEST_PENDING');
      expect(result.current.lastNotice).toContain('official Stage Mic');

      // Authoritative MIC_STATE v3 updates ownership
      act(() => {
        emitServerEvent(
          SOCKET_EVENTS.SERVER.MIC_STATE,
          buildSnapshot({
            roomId: ROOM_A,
            state: 'OCCUPIED',
            currentSingerId: 'user-1',
            currentSingerSessionId: 'sess-v3',
            currentSinger: {
              userId: 'user-1',
              username: 'singer_1',
              displayName: 'Singer 1',
              sessionId: 'sess-v3',
            },
            pendingRequests: [],
            ownershipVersion: 3,
            grantedAt: BASE_ISO,
          })
        );
      });

      expect(result.current.ownershipVersion).toBe(3);
      expect(result.current.state).toBe('OCCUPIED');
      expect(result.current.isCurrentSinger).toBe(true);
    });

    it('prevents older late REST response from overwriting a newer Socket.IO MIC_STATE snapshot', async () => {
      let resolveRest!: (snap: MicOwnershipSnapshotDto) => void;
      mockGetMicSnapshot.mockImplementationOnce(
        () =>
          new Promise<MicOwnershipSnapshotDto>((resolve) => {
            resolveRest = resolve;
          })
      );

      const { result } = renderHook(() =>
        useMicOwnership({
          roomId: ROOM_A,
          enabled: true,
          currentUserId: 'user-1',
          isRoomChannelJoined: true,
          connectionStatus: 'connected',
          isMember: true,
          isHost: false,
          isMuted: false,
        })
      );

      // Newer Socket.IO MIC_STATE (v5) arrives first
      act(() => {
        emitServerEvent(
          SOCKET_EVENTS.SERVER.MIC_STATE,
          buildSnapshot({
            roomId: ROOM_A,
            state: 'OCCUPIED',
            currentSingerId: 'user-2',
            currentSingerSessionId: 'sess-5',
            currentSinger: {
              userId: 'user-2',
              username: 'singer_2',
              displayName: 'Singer 2',
              sessionId: 'sess-5',
            },
            ownershipVersion: 5,
            grantedAt: BASE_ISO,
          })
        );
      });

      expect(result.current.ownershipVersion).toBe(5);
      expect(result.current.currentSingerId).toBe('user-2');

      // Older REST response (v1) resolves later and MUST NOT overwrite v5
      await act(async () => {
        resolveRest(buildSnapshot({ roomId: ROOM_A, ownershipVersion: 1, state: 'AVAILABLE' }));
      });

      expect(result.current.ownershipVersion).toBe(5);
      expect(result.current.state).toBe('OCCUPIED');
      expect(result.current.currentSingerId).toBe('user-2');
    });

    it('enforces room-join readiness in useRoomState + useMicOwnership before enabling or sending mutations', async () => {
      mockGetRoomState.mockResolvedValue({
        room: {
          id: ROOM_A,
          name: 'Test Lounge',
          ownerId: 'host-1',
          roomType: 'vip',
          visibility: 'public',
          capacity: 10,
          status: 'active',
          category: 'pop',
          currentParticipantsCount: 2,
          createdAt: BASE_ISO,
          updatedAt: BASE_ISO,
        },
        host: { id: 'host-1', username: 'host', displayName: 'Host', avatar: null },
        members: [],
        presence: ['user-member-1'],
        viewer: { isMember: true, role: 'member', isMuted: false, isKicked: false },
        version: 1,
      });

      let pendingRoomJoinAck: ((res: unknown) => void) | undefined;
      mockSocket.emit.mockImplementation(
        (event: string, _payload: unknown, ack?: (res: unknown) => void) => {
          if (event === SOCKET_EVENTS.CLIENT.ROOM_JOIN) {
            pendingRoomJoinAck = ack;
          }
        }
      );

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () => {
          const roomState = useRoomState(ROOM_A, { enabled: true });
          const mic = useMicOwnership({
            roomId: ROOM_A,
            enabled: true,
            currentUserId: 'user-member-1',
            isRoomChannelJoined: roomState.isRoomChannelJoined,
            connectionStatus: roomState.connectionStatus,
            isMember: true,
            isHost: false,
            isMuted: false,
          });
          return { roomState, mic };
        },
        { wrapper }
      );

      await waitFor(() => {
        expect(mockGetMicSnapshot).toHaveBeenCalledWith(ROOM_A);
      });

      // Socket is connected and isMember=true, BUT ROOM_JOIN has NOT acknowledged yet!
      expect(result.current.roomState.connectionStatus).toBe('connected');
      expect(result.current.roomState.isRoomChannelJoined).toBe(false);
      expect(result.current.mic.isSocketRoomReady).toBe(false);
      expect(result.current.mic.canRequestMic).toBe(false);

      // Attempting requestMic before room join confirmation is blocked locally without emitting MIC_REQUEST
      let earlyOk = true;
      await act(async () => {
        earlyOk = await result.current.mic.requestMic();
      });
      expect(earlyOk).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        SOCKET_EVENTS.CLIENT.MIC_REQUEST,
        expect.anything(),
        expect.anything()
      );

      // Confirm ROOM_JOIN acknowledgement -> readiness flips to true
      act(() => {
        pendingRoomJoinAck?.({
          success: true,
          data: { roomId: ROOM_A, totalOnline: 1 },
        });
      });

      expect(result.current.roomState.isRoomChannelJoined).toBe(true);
      expect(result.current.mic.isSocketRoomReady).toBe(true);
      expect(result.current.mic.canRequestMic).toBe(true);
    });

    it('waits for room rejoin after reconnection before sending MIC_STATE_REQUEST', async () => {
      mockSocket.emit.mockImplementation(
        (event: string, _payload: unknown, ack?: (res: unknown) => void) => {
          if (event === SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST) {
            ack?.({
              success: true,
              data: buildSnapshot({
                roomId: ROOM_A,
                state: 'OCCUPIED',
                currentSingerId: 'user-reconnected',
                currentSingerSessionId: 'sess-rec',
                currentSinger: {
                  userId: 'user-reconnected',
                  username: 'reconnected_star',
                  displayName: 'Reconnected Star',
                  sessionId: 'sess-rec',
                },
                ownershipVersion: 9,
                grantedAt: BASE_ISO,
              }),
            });
          }
        }
      );

      const { result, rerender } = renderHook(
        (props: { joined: boolean; status: SocketConnectionStatus }) =>
          useMicOwnership({
            roomId: ROOM_A,
            enabled: true,
            currentUserId: 'user-1',
            isRoomChannelJoined: props.joined,
            connectionStatus: props.status,
            isMember: true,
            isHost: false,
            isMuted: false,
          }),
        { initialProps: { joined: true, status: 'connected' as SocketConnectionStatus } }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Simulate disconnect -> socket reconnects BEFORE room rejoin completes
      act(() => {
        setSocketStatus('reconnecting', false);
      });
      rerender({ joined: false, status: 'reconnecting' });

      act(() => {
        setSocketStatus('connected', true);
      });
      rerender({ joined: false, status: 'connected' });

      // Must NOT emit MIC_STATE_REQUEST yet because room rejoin hasn't completed!
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST,
        expect.anything(),
        expect.anything()
      );

      // Once room rejoin completes (joined: true), MIC_STATE_REQUEST fires immediately
      rerender({ joined: true, status: 'connected' });

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith(
          SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST,
          { roomId: ROOM_A },
          expect.any(Function)
        );
        expect(result.current.ownershipVersion).toBe(9);
        expect(result.current.currentSingerId).toBe('user-reconnected');
      });
    });

    it('applies authoritative snapshot on mutation ack success and preserves state on failure', async () => {
      mockSocket.emit.mockImplementationOnce(
        (_event: string, _payload: unknown, ack?: (res: unknown) => void) => {
          ack?.({
            success: true,
            data: buildSnapshot({
              roomId: ROOM_A,
              state: 'REQUEST_PENDING',
              pendingRequests: [buildPendingRequest(1, { userId: 'user-1' })],
              ownershipVersion: 2,
            }),
          });
        }
      );

      const { result } = renderHook(() =>
        useMicOwnership({
          roomId: ROOM_A,
          enabled: true,
          currentUserId: 'user-1',
          isRoomChannelJoined: true,
          connectionStatus: 'connected',
          isMember: true,
          isHost: false,
          isMuted: false,
        })
      );

      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      let ok = false;
      await act(async () => {
        ok = await result.current.requestMic();
      });

      expect(ok).toBe(true);
      expect(result.current.ownershipVersion).toBe(2);
      expect(result.current.myQueuePosition).toBe(1);
      expect(result.current.errorMessage).toBeNull();

      // Simulate failed ack (RATE_LIMIT_EXCEEDED) -> preserves authoritative v2 state
      mockSocket.emit.mockImplementationOnce(
        (_event: string, _payload: unknown, ack?: (res: unknown) => void) => {
          ack?.({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests',
            },
          });
        }
      );

      await act(async () => {
        ok = await result.current.requestMic();
      });

      expect(ok).toBe(false);
      expect(result.current.ownershipVersion).toBe(2);
      expect(result.current.state).toBe('REQUEST_PENDING');
      expect(result.current.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(result.current.errorMessage).toContain('Too many Stage Mic requests');
    });

    it('fences voluntary & force release by session + version, and resynchronizes on STALE_SINGER_SESSION', async () => {
      mockGetMicSnapshot.mockResolvedValueOnce(
        buildSnapshot({
          roomId: ROOM_A,
          state: 'OCCUPIED',
          currentSingerId: 'singer-old',
          currentSingerSessionId: 'sess-old-1',
          currentSinger: {
            userId: 'singer-old',
            username: 'old_singer',
            displayName: 'Old Singer',
            sessionId: 'sess-old-1',
          },
          ownershipVersion: 4,
          grantedAt: BASE_ISO,
        })
      );

      mockSocket.emit.mockImplementation(
        (event: string, _payload: unknown, ack?: (res: unknown) => void) => {
          if (event === SOCKET_EVENTS.CLIENT.MIC_RELEASE) {
            ack?.({
              success: false,
              error: {
                code: 'STALE_SINGER_SESSION',
                message: 'Singer session already changed',
              },
            });
            return;
          }
          if (event === SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST) {
            ack?.({
              success: true,
              data: buildSnapshot({
                roomId: ROOM_A,
                state: 'OCCUPIED',
                currentSingerId: 'singer-new',
                currentSingerSessionId: 'sess-new-2',
                currentSinger: {
                  userId: 'singer-new',
                  username: 'new_singer',
                  displayName: 'New Singer',
                  sessionId: 'sess-new-2',
                },
                ownershipVersion: 6,
                grantedAt: BASE_ISO,
              }),
            });
          }
        }
      );

      const { result } = renderHook(() =>
        useMicOwnership({
          roomId: ROOM_A,
          enabled: true,
          currentUserId: 'host-user',
          isRoomChannelJoined: true,
          connectionStatus: 'connected',
          isMember: true,
          isHost: true,
          isMuted: false,
        })
      );

      await waitFor(() => {
        expect(result.current.ownershipVersion).toBe(4);
      });

      let released = true;
      await act(async () => {
        released = await result.current.forceReleaseMic();
      });

      expect(released).toBe(false);
      // Verify exact session & version fencing sent on MIC_RELEASE (never just userId!)
      expect(mockSocket.emit).toHaveBeenCalledWith(
        SOCKET_EVENTS.CLIENT.MIC_RELEASE,
        {
          roomId: ROOM_A,
          expectedSessionId: 'sess-old-1',
          expectedOwnershipVersion: 4,
        },
        expect.any(Function)
      );

      // Verify automatic resync updated store to newer singer session v6
      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith(
          SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST,
          { roomId: ROOM_A },
          expect.any(Function)
        );
        expect(result.current.ownershipVersion).toBe(6);
        expect(result.current.currentSingerId).toBe('singer-new');
        expect(result.current.currentSingerSessionId).toBe('sess-new-2');
      });
    });
  });

  // =========================================================================
  // 3. UI COMPONENT & MEMBER LIST INTEGRATION TESTS
  // =========================================================================
  describe('3. Stage Mic UI Components & RoomMemberList', () => {
    const baseBarProps = {
      state: 'AVAILABLE' as const,
      currentSinger: null,
      currentUserId: 'user-1',
      pendingRequests: [] as MicPendingRequestDto[],
      isInitialized: true,
      isLoading: false,
      isSocketRoomReady: true,
      isMember: true,
      isHost: false,
      isMuted: false,
      isCurrentSinger: false,
      myQueuePosition: null as number | null,
      isQueueFull: false,
      isVoiceConnected: true,
      isVoiceMuted: false,
      actionStatus: 'idle' as const,
      actingTargetUserId: null,
      canReleaseMic: false,
      canForceRelease: false,
      errorMessage: null,
      lastNotice: null,
      onRequestMic: vi.fn(),
      onCancelRequest: vi.fn(),
      onApproveRequest: vi.fn(),
      onRejectRequest: vi.fn(),
      onReleaseMic: vi.fn(),
      onForceReleaseMic: vi.fn(),
    };

    it('supports member request, waiting #position display, and request cancellation', () => {
      const onRequestMic = vi.fn();
      const onCancelRequest = vi.fn();

      const { rerender } = render(
        <MicOwnershipBar
          {...baseBarProps}
          onRequestMic={onRequestMic}
          onCancelRequest={onCancelRequest}
        />
      );

      expect(screen.getByText('Stage Mic Open')).toBeInTheDocument();
      const reqBtn = screen.getByTestId('mic-request-btn');
      expect(reqBtn).not.toBeDisabled();
      fireEvent.click(reqBtn);
      expect(onRequestMic).toHaveBeenCalledTimes(1);

      // Rerender with member at queue position #2
      rerender(
        <MicOwnershipBar
          {...baseBarProps}
          state="REQUEST_PENDING"
          pendingRequests={[
            buildPendingRequest(1, { userId: 'other-user' }),
            buildPendingRequest(2, { userId: 'user-1' }),
          ]}
          myQueuePosition={2}
          onRequestMic={onRequestMic}
          onCancelRequest={onCancelRequest}
        />
      );

      expect(screen.getByTestId('mic-waiting-position')).toHaveTextContent(
        'Waiting for Host (#2)'
      );
      expect(screen.getByTestId('mic-waiting-count-pill')).toHaveTextContent(
        '2 waiting'
      );

      const cancelBtn = screen.getByTestId('mic-cancel-request-btn');
      fireEvent.click(cancelBtn);
      expect(onCancelRequest).toHaveBeenCalledTimes(1);
    });

    it('disables Request Stage Mic when queue is full (20/20), muted, or viewer read-only', () => {
      const fullQueue = Array.from({ length: MAX_PENDING_MIC_REQUESTS }, (_, idx) =>
        buildPendingRequest(idx + 1, { userId: `queued-${idx + 1}` })
      );

      const { rerender } = render(
        <MicOwnershipBar
          {...baseBarProps}
          state="REQUEST_PENDING"
          pendingRequests={fullQueue}
          isQueueFull={true}
        />
      );

      expect(screen.getByTestId('mic-queue-full-indicator')).toHaveTextContent(
        'Queue Full (20/20)'
      );
      expect(screen.getByTestId('mic-request-btn')).toBeDisabled();

      // Muted member disabled state
      rerender(
        <MicOwnershipBar {...baseBarProps} isMuted={true} isQueueFull={false} />
      );
      expect(screen.getByTestId('mic-member-muted-indicator')).toHaveTextContent(
        'Muted in Lounge'
      );
      expect(screen.getByTestId('mic-request-btn')).toBeDisabled();

      // Viewer read-only state (not an active room member)
      rerender(<MicOwnershipBar {...baseBarProps} isMember={false} />);
      expect(screen.getByTestId('mic-viewer-readonly-badge')).toHaveTextContent(
        'Viewer Mode'
      );
      expect(screen.queryByTestId('mic-request-btn')).not.toBeInTheDocument();
    });

    it('renders host FIFO queue with Approve/Reject actions and disables Approve with explanation when OCCUPIED', () => {
      const onApproveRequest = vi.fn();
      const onRejectRequest = vi.fn();
      const onForceReleaseMic = vi.fn();

      const requests = [
        buildPendingRequest(1, { userId: 'req-u1', displayName: 'Alice' }),
        buildPendingRequest(2, { userId: 'req-u2', displayName: 'Bob' }),
      ];

      const { rerender } = render(
        <MicOwnershipBar
          {...baseBarProps}
          currentUserId="host-1"
          isHost={true}
          state="REQUEST_PENDING"
          pendingRequests={requests}
          onApproveRequest={onApproveRequest}
          onRejectRequest={onRejectRequest}
          onForceReleaseMic={onForceReleaseMic}
        />
      );

      expect(screen.getByTestId('host-mic-request-pos-req-u1')).toHaveTextContent('#1');
      expect(screen.getByTestId('host-mic-request-pos-req-u2')).toHaveTextContent('#2');

      const approveAlice = screen.getByTestId('host-approve-mic-btn-req-u1');
      const rejectBob = screen.getByTestId('host-reject-mic-btn-req-u2');
      expect(approveAlice).not.toBeDisabled();
      expect(rejectBob).not.toBeDisabled();

      fireEvent.click(approveAlice);
      expect(onApproveRequest).toHaveBeenCalledWith('req-u1');

      fireEvent.click(rejectBob);
      expect(onRejectRequest).toHaveBeenCalledWith('req-u2');

      // When OCCUPIED: Approve is disabled + explanation is displayed + Force Release is available
      rerender(
        <MicOwnershipBar
          {...baseBarProps}
          currentUserId="host-1"
          isHost={true}
          state="OCCUPIED"
          currentSinger={{
            userId: 'active-singer',
            username: 'star_vocal',
            displayName: 'Star Vocal',
            sessionId: 'sess-active',
          }}
          pendingRequests={requests}
          canForceRelease={true}
          onApproveRequest={onApproveRequest}
          onRejectRequest={onRejectRequest}
          onForceReleaseMic={onForceReleaseMic}
        />
      );

      expect(screen.getByTestId('host-occupied-explanation')).toHaveTextContent(
        'The current singer must release the Stage Mic first'
      );
      expect(screen.getByTestId('host-approve-mic-btn-req-u1')).toBeDisabled();
      expect(screen.getByTestId('host-approve-mic-btn-req-u2')).toBeDisabled();
      expect(screen.getByTestId('host-reject-mic-btn-req-u2')).not.toBeDisabled();

      const forceReleaseBtn = screen.getByTestId('host-force-release-btn');
      expect(forceReleaseBtn).not.toBeDisabled();
      fireEvent.click(forceReleaseBtn);
      expect(onForceReleaseMic).toHaveBeenCalledTimes(1);
    });

    it('renders SingerControls with voluntary Release Mic and non-blocking LiveKit hints', () => {
      const onReleaseMic = vi.fn();

      const { rerender } = render(
        <MicOwnershipBar
          {...baseBarProps}
          state="OCCUPIED"
          currentUserId="singer-1"
          currentSinger={{
            userId: 'singer-1',
            username: 'singer1',
            displayName: 'Singer One',
            sessionId: 'sess-1',
          }}
          isCurrentSinger={true}
          canReleaseMic={true}
          isVoiceConnected={false}
          isVoiceMuted={false}
          onReleaseMic={onReleaseMic}
        />
      );

      expect(screen.getByTestId('singer-hold-mic-badge')).toHaveTextContent(
        'You Hold Stage Mic'
      );
      expect(
        screen.getByTestId('singer-voice-disconnected-hint')
      ).toHaveTextContent('Join Voice to transmit audio');

      // Connected to LiveKit voice, but microphone muted -> non-blocking Unmute hint
      rerender(
        <MicOwnershipBar
          {...baseBarProps}
          state="OCCUPIED"
          currentUserId="singer-1"
          currentSinger={{
            userId: 'singer-1',
            username: 'singer1',
            displayName: 'Singer One',
            sessionId: 'sess-1',
          }}
          isCurrentSinger={true}
          canReleaseMic={true}
          isVoiceConnected={true}
          isVoiceMuted={true}
          onReleaseMic={onReleaseMic}
        />
      );

      expect(
        screen.queryByTestId('singer-voice-disconnected-hint')
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('singer-voice-muted-hint')).toHaveTextContent(
        'Unmute Voice Mic'
      );

      fireEvent.click(screen.getByTestId('singer-release-mic-btn'));
      expect(onReleaseMic).toHaveBeenCalledTimes(1);
    });

    it('displays Karaoke track performer and Official Stage Mic holder independently in RoomMemberList', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const members: RoomMembershipDto[] = [
        {
          id: 'm-1',
          roomId: ROOM_A,
          userId: 'karaoke-performer',
          user: {
            id: 'karaoke-performer',
            username: 'track_requester',
            displayName: 'Track Requester',
            avatar: null,
          },
          role: 'member',
          status: 'active',
          joinedAt: BASE_ISO,
        },
        {
          id: 'm-2',
          roomId: ROOM_A,
          userId: 'official-mic-holder',
          user: {
            id: 'official-mic-holder',
            username: 'stage_vocalist',
            displayName: 'Stage Vocalist',
            avatar: null,
          },
          role: 'member',
          status: 'active',
          joinedAt: BASE_ISO,
        },
        {
          id: 'm-3',
          roomId: ROOM_A,
          userId: 'waiting-member',
          user: {
            id: 'waiting-member',
            username: 'next_singer',
            displayName: 'Next Singer',
            avatar: null,
          },
          role: 'member',
          status: 'active',
          joinedAt: BASE_ISO,
        },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <RoomMemberList
            roomId={ROOM_A}
            currentUserId="official-mic-holder"
            members={members}
            currentSingerUserId="karaoke-performer"
            currentSingerName="Track Requester"
            officialSingerUserId="official-mic-holder"
            pendingMicRequests={[
              buildPendingRequest(1, { userId: 'waiting-member' }),
            ]}
          />
        </QueryClientProvider>
      );

      // Karaoke performer keeps Singing badge ONLY (not Official Stage Mic)
      expect(
        screen.getByTestId('karaoke-singer-badge-karaoke-performer')
      ).toHaveTextContent('Singing');
      expect(
        screen.queryByTestId('official-stage-mic-badge-karaoke-performer')
      ).not.toBeInTheDocument();

      // Official Stage Mic holder gets Stage Mic badge ONLY (not Karaoke Singing)
      expect(
        screen.getByTestId('official-stage-mic-badge-official-mic-holder')
      ).toHaveTextContent('Stage Mic');
      expect(
        screen.queryByTestId('karaoke-singer-badge-official-mic-holder')
      ).not.toBeInTheDocument();

      // Pending requester shows exact FIFO #1 position badge
      expect(
        screen.getByTestId('mic-requested-badge-waiting-member')
      ).toHaveTextContent('Mic Requested (#1)');
    });
  });
});
