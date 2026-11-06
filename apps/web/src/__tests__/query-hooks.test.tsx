import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRooms } from '../hooks/queries/use-rooms';
import { useRoom, useJoinRoom } from '../hooks/queries/use-room';
import { useCurrentUser } from '../hooks/queries/use-current-user';
import { tokenStore } from '../lib/api/token-store';
import { useAuthStore } from '../stores/use-auth-store';
import { makeQueryClient } from '../providers/query-provider';
import { ApiError } from '../lib/api/errors';

describe('TanStack Query Integration & Hooks (Phase 4 & 5)', () => {
  const originalFetch = global.fetch;
  let testQueryClient: QueryClient;

  const createWrapper = (client: QueryClient) => {
    function QueryWrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    QueryWrapper.displayName = 'QueryWrapper';
    return QueryWrapper;
  };

  beforeEach(() => {
    tokenStore.clearAccessToken();
    useAuthStore.getState().resetAuth();
    testQueryClient = makeQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    testQueryClient.clear();
  });

  it('useRooms fetches and returns paginated room list data from API', async () => {
    const mockRoomsResponse = {
      items: [
        { id: 'r1', name: 'Tokyo Pop', category: 'pop', capacity: 10, currentParticipantsCount: 3 },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        message: 'Rooms retrieved',
        data: mockRoomsResponse,
      }),
    });

    const { result } = renderHook(() => useRooms({ category: 'pop' }), {
      wrapper: createWrapper(testQueryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockRoomsResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/rooms?category=pop'),
      expect.anything()
    );
  });

  it('useRoom fetches single room details and respects enabled flag', async () => {
    const mockRoom = { id: 'room-123', name: 'Acoustic Den', capacity: 8 };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockRoom,
      }),
    });

    // 1. With enabled = false, it should not fetch
    const { result: disabledResult } = renderHook(() => useRoom('room-123', { enabled: false }), {
      wrapper: createWrapper(testQueryClient),
    });
    expect(disabledResult.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();

    // 2. With enabled = true, it fetches room details
    const { result: enabledResult } = renderHook(() => useRoom('room-123'), {
      wrapper: createWrapper(testQueryClient),
    });

    await waitFor(() => expect(enabledResult.current.isSuccess).toBe(true));
    expect(enabledResult.current.data).toEqual(mockRoom);
  });

  it('useCurrentUser is disabled when no token exists, but fetches and syncs auth store when token is set', async () => {
    const mockUser = { id: 'usr-999', username: 'Rockstar', role: 'user' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: mockUser,
      }),
    });

    // 1. No token -> query is disabled
    const { result: unauthenticatedResult } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(testQueryClient),
    });
    expect(unauthenticatedResult.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();

    // 2. Set token in store
    tokenStore.setAccessToken('valid_jwt_token');

    const { result: authenticatedResult } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(testQueryClient),
    });

    await waitFor(() => expect(authenticatedResult.current.isSuccess).toBe(true));
    expect(authenticatedResult.current.data).toEqual(mockUser);
    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('QueryProvider retry policy rejects retries on 401, 403, 404, and 400 ApiErrors immediately', () => {
    const client = makeQueryClient();
    const retryFn = client.getDefaultOptions().queries?.retry;

    expect(typeof retryFn).toBe('function');
    if (typeof retryFn === 'function') {
      const authError = new ApiError({ status: 401, message: 'Unauthorized' });
      const forbiddenError = new ApiError({ status: 403, message: 'Forbidden' });
      const notFoundError = new ApiError({ status: 404, message: 'Not Found' });
      const validationError = new ApiError({
        status: 400,
        message: 'Validation failed',
        details: [{ field: 'name', message: 'required' }],
      });
      const serverError = new ApiError({ status: 500, message: 'Internal Server Error' });

      expect(retryFn(1, authError)).toBe(false);
      expect(retryFn(1, forbiddenError)).toBe(false);
      expect(retryFn(1, notFoundError)).toBe(false);
      expect(retryFn(1, validationError)).toBe(false);

      // 500 errors are allowed to retry up to failureCount < 2
      expect(retryFn(0, serverError)).toBe(true);
      expect(retryFn(1, serverError)).toBe(true);
      expect(retryFn(2, serverError)).toBe(false);
    }
  });

  it('useJoinRoom mutation invalidates room detail and room lists cache on success', async () => {
    const invalidateSpy = vi.spyOn(testQueryClient, 'invalidateQueries');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: { id: 'm1', roomId: 'target-room-1', role: 'member', status: 'active' },
      }),
    });

    const { result } = renderHook(() => useJoinRoom(), {
      wrapper: createWrapper(testQueryClient),
    });

    result.current.mutate('target-room-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['rooms', 'detail', 'target-room-1']) })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['rooms', 'list']) })
    );
  });
});
