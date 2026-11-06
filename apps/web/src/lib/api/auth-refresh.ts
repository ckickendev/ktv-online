import { tokenStore } from './token-store';
import { ApiError } from './errors';
import { env } from '../env';
import { ApiResponse } from '@ktv/contracts';

type SessionExpiredHandler = () => void;

class AuthRefreshCoordinator {
  private inFlightRefreshPromise: Promise<string> | null = null;
  private sessionExpiredHandlers: Set<SessionExpiredHandler> = new Set();

  onSessionExpired(handler: SessionExpiredHandler): () => void {
    this.sessionExpiredHandlers.add(handler);
    return () => {
      this.sessionExpiredHandlers.delete(handler);
    };
  }

  notifySessionExpired(): void {
    tokenStore.clearAccessToken();
    this.sessionExpiredHandlers.forEach((handler) => {
      try {
        handler();
      } catch (err) {
        console.error('Error executing sessionExpired handler:', err);
      }
    });
  }

  async refreshToken(): Promise<string> {
    // If a refresh is already underway, single-flight latch onto the active promise
    if (this.inFlightRefreshPromise) {
      return this.inFlightRefreshPromise;
    }

    this.inFlightRefreshPromise = this.executeRefresh();

    try {
      return await this.inFlightRefreshPromise;
    } finally {
      this.inFlightRefreshPromise = null;
    }
  }

  private async executeRefresh(): Promise<string> {
    const refreshUrl = `${env.NEXT_PUBLIC_API_URL}/auth/refresh`;

    try {
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        // Transmit the HTTP-only refresh cookie
        credentials: 'include',
      });

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }

        const apiError = ApiError.fromResponse(response.status, errorData);
        this.notifySessionExpired();
        throw apiError;
      }

      const payload = (await response.json()) as ApiResponse<{
        accessToken: string;
        expiresIn: string;
      }>;

      if (!payload.data?.accessToken) {
        this.notifySessionExpired();
        throw new ApiError({
          status: 500,
          message: 'Server returned refresh success without access token',
        });
      }

      const newAccessToken = payload.data.accessToken;
      tokenStore.setAccessToken(newAccessToken);
      return newAccessToken;
    } catch (err) {
      if (!(err instanceof ApiError)) {
        this.notifySessionExpired();
      }
      throw err;
    }
  }

  isRefreshing(): boolean {
    return this.inFlightRefreshPromise !== null;
  }
}

export const authRefreshCoordinator = new AuthRefreshCoordinator();
