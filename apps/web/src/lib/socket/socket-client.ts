import { io, Socket } from 'socket.io-client';
import { tokenStore } from '@/lib/api/token-store';
import { env } from '@/lib/env';

export type SocketConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

type StatusListener = (status: SocketConnectionStatus) => void;

function getSocketServerUrl(): string {
  const apiUrl = env.NEXT_PUBLIC_API_URL;
  try {
    const parsed = new URL(apiUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'http://localhost:5001';
  }
}

export class SocketClientManager {
  private socket: Socket | null = null;
  private status: SocketConnectionStatus = 'disconnected';
  private statusListeners: Set<StatusListener> = new Set();
  private tokenUnsubscribe: (() => void) | null = null;

  constructor() {
    // Listen to token changes: update auth or disconnect if token cleared
    if (typeof window !== 'undefined') {
      this.tokenUnsubscribe = tokenStore.subscribe((token) => {
        if (!token) {
          this.disconnect();
        } else if (this.socket) {
          this.socket.auth = { token };
        }
      });
    }
  }

  getStatus(): SocketConnectionStatus {
    return this.status;
  }

  private setStatus(newStatus: SocketConnectionStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusListeners.forEach((listener) => {
      try {
        listener(newStatus);
      } catch (err) {
        console.error('Error in socket status listener:', err);
      }
    });
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    // Immediately invoke with current status
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  connect(): Socket | null {
    if (typeof window === 'undefined') return null;

    const token = tokenStore.getAccessToken();
    if (!token) {
      this.setStatus('disconnected');
      return null;
    }

    if (this.socket?.connected) {
      return this.socket;
    }

    if (!this.socket) {
      const serverUrl = getSocketServerUrl();

      this.socket = io(serverUrl, {
        auth: (cb) => {
          cb({ token: tokenStore.getAccessToken() });
        },
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.setStatus('connected');
      });

      this.socket.on('disconnect', (reason) => {
        if (reason === 'io client disconnect') {
          this.setStatus('disconnected');
        } else {
          this.setStatus('reconnecting');
        }
      });

      this.socket.on('connect_error', () => {
        this.setStatus('error');
      });

      this.socket.io.on('reconnect_attempt', () => {
        this.setStatus('reconnecting');
      });

      this.socket.io.on('reconnect', () => {
        this.setStatus('connected');
      });
    }

    this.setStatus('connecting');
    this.socket.connect();
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  destroy(): void {
    if (this.tokenUnsubscribe) {
      this.tokenUnsubscribe();
      this.tokenUnsubscribe = null;
    }
    this.disconnect();
    this.statusListeners.clear();
  }
}

export const socketManager = new SocketClientManager();
