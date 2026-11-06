import { ApiErrorDetail } from '@ktv/contracts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export interface RequestConfig extends Omit<RequestInit, 'body' | 'method'> {
  method?: HttpMethod;
  headers?: Record<string, string>;
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  skipAuth?: boolean;
  skipAuthRefresh?: boolean;
  isRetry?: boolean;
}

export interface ApiClientOptions {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}

export interface ApiErrorShape {
  status: number;
  message: string;
  code?: string;
  details?: ApiErrorDetail[];
  isNetworkError?: boolean;
}
