import { env } from '../env';
import { ApiResponse } from '@ktv/contracts';
import { ApiError } from './errors';
import { tokenStore } from './token-store';
import { authRefreshCoordinator } from './auth-refresh';
import { ApiClientOptions, HttpMethod, QueryParams, RequestConfig } from './types';

export class ApiClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || env.NEXT_PUBLIC_API_URL).replace(/\/+$/, '');
    this.defaultHeaders = {
      Accept: 'application/json',
      ...options.defaultHeaders,
    };
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }

        if (Array.isArray(value)) {
          value.forEach((v) => {
            if (v !== undefined && v !== null) {
              url.searchParams.append(key, String(v));
            }
          });
        } else {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  async request<T = unknown>(path: string, config: RequestConfig = {}): Promise<T> {
    const method: HttpMethod = config.method || 'GET';
    const url = this.buildUrl(path, config.params);

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...config.headers,
    };

    // Attach Bearer Access Token if not skipped and available
    if (!config.skipAuth) {
      const token = tokenStore.getAccessToken();
      if (token && !headers.Authorization && !headers.authorization) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    // Format body
    let body: BodyInit | undefined = undefined;
    if (config.body !== undefined) {
      if (
        typeof FormData !== 'undefined' && config.body instanceof FormData ||
        typeof Blob !== 'undefined' && config.body instanceof Blob ||
        typeof URLSearchParams !== 'undefined' && config.body instanceof URLSearchParams
      ) {
        body = config.body as BodyInit;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(config.body);
      }
    }

    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: config.signal,
        credentials: config.credentials ?? 'include',
      });
    } catch (networkErr: unknown) {
      throw ApiError.fromNetworkError(networkErr);
    }

    // Handle 401 Unauthorized with single-flight automatic token refresh
    if (response.status === 401 && !config.skipAuthRefresh && !config.isRetry) {
      try {
        const newAccessToken = await authRefreshCoordinator.refreshToken();

        // Retry the original request exactly once with new token
        return await this.request<T>(path, {
          ...config,
          headers: {
            ...config.headers,
            Authorization: `Bearer ${newAccessToken}`,
          },
          isRetry: true,
        });
      } catch {
        // Refresh failed: extract error from original 401 response and rethrow
        const errorData = await this.parseResponseBody(response);
        throw ApiError.fromResponse(response.status, errorData);
      }
    }

    // Parse Error responses (HTTP non-2xx)
    if (!response.ok) {
      const errorData = await this.parseResponseBody(response);
      throw ApiError.fromResponse(response.status, errorData);
    }

    // Handle 204 No Content or empty bodies
    if (response.status === 204) {
      return null as T;
    }

    const data = await this.parseResponseBody(response);

    // If backend envelope wraps in { success: true, data: T }, unpack data
    if (typeof data === 'object' && data !== null && 'success' in data && 'data' in data) {
      const envelope = data as ApiResponse<T>;
      return envelope.data;
    }

    return data as T;
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    try {
      const text = await response.text();
      return text;
    } catch {
      return null;
    }
  }

  get<T = unknown>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'GET' });
  }

  post<T = unknown>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'POST', body });
  }

  put<T = unknown>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'PUT', body });
  }

  patch<T = unknown>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'PATCH', body });
  }

  delete<T = unknown>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
