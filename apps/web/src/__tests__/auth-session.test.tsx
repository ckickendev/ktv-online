import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from '../stores/use-auth-store';
import { tokenStore } from '../lib/api/token-store';

describe('Authentication State & Session Lifecycle (Sprint 1.2 Phase 1 & 2)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStore.clearAccessToken();
    useAuthStore.getState().resetAuth();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('starts in initializing state and transitions to authenticated after successful session restoration', async () => {
    const newAccessToken = 'restored_access_token_123';
    const mockUser = { id: 'u1', username: 'StageKing', role: 'user' };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { accessToken: newAccessToken, expiresIn: '15m' },
          }),
        });
      }

      if (url.endsWith('/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: mockUser,
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const store = useAuthStore.getState();
    await store.initializeSession();

    const updatedState = useAuthStore.getState();
    expect(updatedState.status).toBe('authenticated');
    expect(updatedState.isAuthenticated).toBe(true);
    expect(updatedState.isInitialized).toBe(true);
    expect(updatedState.user).toEqual(mockUser);
    expect(tokenStore.getAccessToken()).toBe(newAccessToken);
  });

  it('transitions to unauthenticated when refresh endpoint returns 401 (no active cookie or expired)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        message: 'Invalid or expired refresh token',
      }),
    });

    const store = useAuthStore.getState();
    await store.initializeSession();

    const updatedState = useAuthStore.getState();
    expect(updatedState.status).toBe('unauthenticated');
    expect(updatedState.isAuthenticated).toBe(false);
    expect(updatedState.isInitialized).toBe(true);
    expect(updatedState.user).toBeNull();
    expect(tokenStore.getAccessToken()).toBeNull();
  });

  it('handles network failure during session restoration without marking session permanently revoked', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const store = useAuthStore.getState();
    await store.initializeSession();

    const updatedState = useAuthStore.getState();
    expect(updatedState.status).toBe('unauthenticated');
    expect(updatedState.isAuthenticated).toBe(false);
    expect(updatedState.isNetworkError).toBe(true);
    expect(updatedState.isInitialized).toBe(true);
  });

  it('prevents duplicate concurrent refresh calls during initialization (e.g. React Strict Mode)', async () => {
    let refreshCalls = 0;
    const newAccessToken = 'strict_mode_token';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({
                success: true,
                data: { accessToken: newAccessToken, expiresIn: '15m' },
              }),
            });
          }, 30);
        });
      }

      if (url.endsWith('/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { id: 'u1', username: 'StrictModeTester', role: 'user' },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const store = useAuthStore.getState();

    // Trigger double initialization concurrently
    await Promise.all([store.initializeSession(), store.initializeSession()]);

    expect(refreshCalls).toBe(1);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('login updates in-memory token, sets authenticated status and user profile', async () => {
    const mockUser = {
      id: 'usr-1',
      username: 'LegendSinger',
      email: 'legend@ktv.test',
      role: 'user',
    };
    const mockToken = 'login_jwt_token_999';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        message: 'Login successful',
        data: {
          user: mockUser,
          tokens: { accessToken: mockToken, expiresIn: '15m' },
        },
      }),
    });

    const store = useAuthStore.getState();
    await store.login({ email: 'legend@ktv.test', password: 'Password123!' });

    const updatedState = useAuthStore.getState();
    expect(updatedState.status).toBe('authenticated');
    expect(updatedState.isAuthenticated).toBe(true);
    expect(updatedState.user).toEqual(mockUser);
    expect(tokenStore.getAccessToken()).toBe(mockToken);
  });

  it('register creates user and performs seamless auto-login', async () => {
    const mockCreatedUser = {
      id: 'usr-new',
      username: 'NewArtist',
      email: 'artist@ktv.test',
      role: 'user',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const mockToken = 'registered_auto_token';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/users/register')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'User created successfully',
            data: mockCreatedUser,
          }),
        });
      }

      if (url.endsWith('/auth/login')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'Login successful',
            data: {
              user: mockCreatedUser,
              tokens: { accessToken: mockToken, expiresIn: '15m' },
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected call: ${url}`));
    });

    const store = useAuthStore.getState();
    await store.register(
      {
        username: 'NewArtist',
        email: 'artist@ktv.test',
        password: 'Password123!',
      },
      true
    );

    const updatedState = useAuthStore.getState();
    expect(updatedState.status).toBe('authenticated');
    expect(updatedState.user).toEqual(mockCreatedUser);
    expect(tokenStore.getAccessToken()).toBe(mockToken);
  });

  it('logout calls backend endpoint and clears tokenStore and local state', async () => {
    tokenStore.setAccessToken('active_session_token');
    useAuthStore.getState().setAuth({ id: 'u1', username: 'LeavingUser', role: 'user' }, 'active_session_token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: null,
      }),
    });

    const store = useAuthStore.getState();
    await store.logout();

    const updatedState = useAuthStore.getState();
    expect(updatedState.status).toBe('unauthenticated');
    expect(updatedState.isAuthenticated).toBe(false);
    expect(updatedState.user).toBeNull();
    expect(tokenStore.getAccessToken()).toBeNull();
  });
});
