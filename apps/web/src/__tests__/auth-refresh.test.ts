import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../lib/api/client';
import { tokenStore } from '../lib/api/token-store';
import { authRefreshCoordinator } from '../lib/api/auth-refresh';
import { authApi } from '../lib/api/endpoints/auth';

describe('Authentication & Refresh Lifecycle (Phase 2)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStore.clearAccessToken();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('automatically attaches Bearer access token when present in tokenStore', async () => {
    tokenStore.setAccessToken('initial_access_token_123');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: { id: 'u1', username: 'tester' },
      }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    await client.get('/auth/me');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.ktv.test/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer initial_access_token_123',
        }),
      })
    );
  });

  it('omits Authorization header when skipAuth is true', async () => {
    tokenStore.setAccessToken('initial_access_token_123');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: {} }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    await client.get('/public-info', { skipAuth: true });

    const mockFetch = vi.mocked(global.fetch);
    const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  it('intercepts 401 response, calls /auth/refresh with credentials: include, and retries original request', async () => {
    tokenStore.setAccessToken('expired_access_token');
    const newAccessToken = 'fresh_rotated_access_token_456';

    let requestCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      // 1. First call: original request returns 401
      if (url.endsWith('/rooms') && requestCount === 0) {
        requestCount++;
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            message: 'Authentication token has expired',
          }),
        });
      }

      // 2. Second call: refresh request returns 200 with new token
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'Tokens refreshed successfully',
            data: {
              accessToken: newAccessToken,
              expiresIn: '15m',
            },
          }),
        });
      }

      // 3. Third call: retried original request with new token
      if (url.endsWith('/rooms') && requestCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: [{ id: 'room-1' }],
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    const result = await client.get('/rooms');

    expect(result).toEqual([{ id: 'room-1' }]);
    expect(tokenStore.getAccessToken()).toBe(newAccessToken);
    expect(global.fetch).toHaveBeenCalledTimes(3);

    // Verify refresh call had credentials: 'include'
    const mockFetch = vi.mocked(global.fetch);
    const refreshCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).endsWith('/auth/refresh')
    );
    expect(refreshCall).toBeDefined();
    expect((refreshCall?.[1] as RequestInit).credentials).toBe('include');

    // Verify retried request used new access token
    const retriedCall = mockFetch.mock.calls[2];
    expect(retriedCall[0]).toBe('http://api.ktv.test/api/v1/rooms');
    const retriedHeaders = (retriedCall[1] as RequestInit).headers as Record<string, string>;
    expect(retriedHeaders.Authorization).toBe(`Bearer ${newAccessToken}`);
  });

  it('guarantees single-flight refresh: concurrent 401 responses trigger exactly ONE refresh call', async () => {
    tokenStore.setAccessToken('expired_token');
    const newAccessToken = 'single_flight_fresh_token';

    let refreshCallsCount = 0;

    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const headers = (options?.headers ?? {}) as Record<string, string>;
      if (url.endsWith('/auth/refresh')) {
        refreshCallsCount++;
        // Add artificial delay to simulate realistic network latency
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                success: true,
                data: {
                  accessToken: newAccessToken,
                  expiresIn: '15m',
                },
              }),
            });
          }, 30);
        });
      }

      // If called with old token, return 401
      if (headers.Authorization === 'Bearer expired_token') {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            message: 'Token expired',
          }),
        });
      }

      // If called with new token, succeed
      if (headers.Authorization === `Bearer ${newAccessToken}`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { url, success: true },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });

    // Launch 5 concurrent requests that will all encounter 401 at the same time
    const [res1, res2, res3, res4, res5] = await Promise.all([
      client.get('/rooms/1'),
      client.get('/rooms/2'),
      client.get('/rooms/3'),
      client.get('/users/profile'),
      client.get('/auth/me'),
    ]);

    expect(res1).toHaveProperty('success', true);
    expect(res2).toHaveProperty('success', true);
    expect(res3).toHaveProperty('success', true);
    expect(res4).toHaveProperty('success', true);
    expect(res5).toHaveProperty('success', true);

    // CRITICAL: Exactly ONE refresh call must have occurred to avoid replay attack invalidation!
    expect(refreshCallsCount).toBe(1);
    expect(tokenStore.getAccessToken()).toBe(newAccessToken);
  });

  it('clears token store and invokes sessionExpired listener when refresh fails', async () => {
    tokenStore.setAccessToken('expired_token');
    const sessionExpiredSpy = vi.fn();
    const unsubscribe = authRefreshCoordinator.onSessionExpired(sessionExpiredSpy);

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/rooms')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            message: 'Token expired',
          }),
        });
      }

      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: false,
            message: 'Invalid or expired refresh token',
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });

    await expect(client.get('/rooms')).rejects.toThrow();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(sessionExpiredSpy).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('does not attempt to refresh when skipAuthRefresh is set (e.g. login/refresh endpoints)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        message: 'Invalid email or password',
      }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });

    await expect(
      client.post('/auth/login', { email: 'a@b.com', password: 'bad' }, { skipAuthRefresh: true })
    ).rejects.toThrow();

    // Only 1 call happened (no subsequent refresh attempt)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('logout notifies session expiration and clears token store', async () => {
    tokenStore.setAccessToken('user_token_abc');
    const sessionExpiredSpy = vi.fn();
    const unsubscribe = authRefreshCoordinator.onSessionExpired(sessionExpiredSpy);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: null,
      }),
    });

    await authApi.logout();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(sessionExpiredSpy).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
