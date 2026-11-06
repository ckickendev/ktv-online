import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../lib/api/client';
import { ApiError } from '../lib/api/errors';
import { tokenStore } from '../lib/api/token-store';

describe('ApiClient (Phase 1 & Phase 3)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenStore.clearAccessToken();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('performs a successful GET request and unwraps ApiResponse.data envelope', async () => {
    const mockData = { id: 'room-1', name: 'Pop Lounge' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        message: 'Room retrieved',
        data: mockData,
      }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    const result = await client.get('/rooms/room-1');

    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.ktv.test/api/v1/rooms/room-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Accept: 'application/json' }),
      })
    );
  });

  it('performs a successful POST request with JSON body and Content-Type header', async () => {
    const postPayload = { name: 'VIP Lounge', capacity: 10 };
    const mockCreated = { id: 'room-2', ...postPayload };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        message: 'Room created',
        data: mockCreated,
      }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    const result = await client.post('/rooms', postPayload);

    expect(result).toEqual(mockCreated);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.ktv.test/api/v1/rooms',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
        body: JSON.stringify(postPayload),
      })
    );
  });

  it('correctly serializes query parameters including arrays, numbers, and filters out null/undefined', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: { items: [] },
      }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    await client.get('/rooms', {
      params: {
        page: 2,
        limit: 10,
        category: 'anime',
        tags: ['rock', 'classic'],
        emptyFilter: undefined,
        nullFilter: null,
      },
    });

    const mockFetch = vi.mocked(global.fetch);
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    const url = new URL(calledUrl);

    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('category')).toBe('anime');
    expect(url.searchParams.getAll('tags')).toEqual(['rock', 'classic']);
    expect(url.searchParams.has('emptyFilter')).toBe(false);
    expect(url.searchParams.has('nullFilter')).toBe(false);
  });

  it('handles request cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      if (options.signal?.aborted) {
        const err = new DOMException('The user aborted a request.', 'AbortError');
        return Promise.reject(err);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      });
    });

    controller.abort();
    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });

    await expect(client.get('/rooms', { signal: controller.signal })).rejects.toThrow();
  });

  it('parses non-JSON responses safely without throwing JSON syntax errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'Plain text response',
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    const result = await client.get('/status');

    expect(result).toBe('Plain text response');
  });

  it('handles 204 No Content response gracefully returning null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });
    const result = await client.delete('/rooms/room-1');

    expect(result).toBeNull();
  });

  it('translates network connection errors into structured ApiError with isNetworkError flag', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });

    try {
      await client.get('/rooms');
      expect.unreachable('Should have thrown an error');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.isNetworkError).toBe(true);
      expect(apiErr.status).toBe(0);
      expect(apiErr.message).toContain('backend server unreachable');
    }
  });

  it('parses structured backend 400 validation error responses with field details', async () => {
    const validationDetails = [
      { field: 'capacity', message: 'Exceeds maximum allowed 50' },
      { field: 'name', message: 'Name is too short' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        message: 'Validation failed',
        errors: validationDetails,
      }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });

    try {
      await client.post('/rooms', { name: 'A', capacity: 999 });
      expect.unreachable('Should have thrown an error');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.isValidationError).toBe(true);
      expect(apiErr.details).toEqual(validationDetails);
      expect(apiErr.message).toBe('Validation failed');
    }
  });

  it('parses 409 Conflict error response when room capacity is exhausted', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        message: 'Room has reached maximum capacity',
        code: 'ROOM_FULL',
      }),
    });

    const client = new ApiClient({ baseUrl: 'http://api.ktv.test/api/v1' });

    try {
      await client.post('/rooms/room-1/join', {});
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.isConflict).toBe(true);
      expect(apiErr.code).toBe('ROOM_FULL');
      expect(apiErr.message).toBe('Room has reached maximum capacity');
    }
  });
});
