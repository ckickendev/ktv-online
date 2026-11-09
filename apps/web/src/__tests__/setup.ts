import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('socket.io-client', () => {
  const createMockSocket = () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const socket = {
      connected: false,
      auth: {},
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        return socket;
      }),
      off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((fn) => fn !== cb);
        }
        return socket;
      }),
      emit: vi.fn(),
      connect: vi.fn(() => {
        socket.connected = true;
        return socket;
      }),
      disconnect: vi.fn(() => {
        socket.connected = false;
        return socket;
      }),
      removeAllListeners: vi.fn(() => {
        for (const k of Object.keys(listeners)) delete listeners[k];
        return socket;
      }),
      io: {
        on: vi.fn(),
      },
    };
    return socket;
  };

  return {
    io: vi.fn(() => createMockSocket()),
  };
});
