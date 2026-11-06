import { ApiErrorDetail, ApiErrorResponse } from '@ktv/contracts';
import { ApiErrorShape } from './types';

export class ApiError extends Error implements ApiErrorShape {
  readonly status: number;
  readonly code?: string;
  readonly details?: ApiErrorDetail[];
  readonly raw?: unknown;
  readonly isNetworkError: boolean;
  readonly isTimeout: boolean;

  constructor({
    status,
    message,
    code,
    details,
    raw,
    isNetworkError = false,
    isTimeout = false,
  }: {
    status: number;
    message: string;
    code?: string;
    details?: ApiErrorDetail[];
    raw?: unknown;
    isNetworkError?: boolean;
    isTimeout?: boolean;
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.raw = raw;
    this.isNetworkError = isNetworkError;
    this.isTimeout = isTimeout;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isValidationError(): boolean {
    return this.status === 400 && Array.isArray(this.details) && this.details.length > 0;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  static fromResponse(status: number, data: unknown): ApiError {
    if (typeof data === 'object' && data !== null) {
      const errorPayload = data as Partial<ApiErrorResponse> & { code?: string };
      const message = errorPayload.message || `Request failed with status ${status}`;
      const code = errorPayload.code;
      const details = Array.isArray(errorPayload.errors) ? errorPayload.errors : undefined;

      return new ApiError({
        status,
        message,
        code,
        details,
        raw: data,
      });
    }

    const message = typeof data === 'string' && data.trim() !== ''
      ? data
      : `HTTP Error ${status}`;

    return new ApiError({
      status,
      message,
      raw: data,
    });
  }

  static fromNetworkError(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return new ApiError({
        status: 0,
        message: 'Request was cancelled',
        isTimeout: false,
        isNetworkError: true,
        raw: error,
      });
    }

    if (error instanceof Error) {
      const isTimeout = error.name === 'TimeoutError' || error.message.toLowerCase().includes('timeout');
      return new ApiError({
        status: 0,
        message: isTimeout ? 'Request timed out' : 'Network error: backend server unreachable',
        isTimeout,
        isNetworkError: true,
        raw: error,
      });
    }

    return new ApiError({
      status: 0,
      message: 'Unknown network error occurred',
      isNetworkError: true,
      raw: error,
    });
  }
}
