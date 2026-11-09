import http from 'http';
import { Server, ServerOptions } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { socketAuthMiddleware, AuthenticatedSocketData } from './socket.auth.js';
import { registerRoomEvents, getRoomChannel } from './room.events.js';
import { presenceManager } from './presence.manager.js';
import { SOCKET_EVENTS } from '@ktv/contracts';

let ioInstance: Server<any, any, any, AuthenticatedSocketData> | null = null;

export function createSocketServer(
  httpServer: http.Server,
  customOptions?: Partial<ServerOptions>
): Server<any, any, any, AuthenticatedSocketData> {
  const allowedOrigins = [
    env.FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];

  const io = new Server<any, any, any, AuthenticatedSocketData>(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6, // 1MB payload ceiling
    transports: ['websocket', 'polling'],
    ...customOptions,
  });

  // Attach handshake authentication middleware
  io.use(socketAuthMiddleware);

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.data.user.id, username: socket.data.user.username },
      '⚡ Socket.IO client connected and authenticated'
    );

    // Register room event handlers
    registerRoomEvents(io, socket);
  });

  ioInstance = io;
  return io;
}

export function getSocketServer(): Server<any, any, any, AuthenticatedSocketData> | null {
  return ioInstance;
}

/**
 * Broadcast room closure notification to all connected clients and clean up room presence.
 */
export async function broadcastRoomClosed(roomId: string, reason = 'Room has been closed by host'): Promise<void> {
  if (!ioInstance) return;

  const channel = getRoomChannel(roomId);
  logger.info({ roomId, reason }, '📢 Broadcasting room:closed event to channel');

  // Emit room:closed event to all sockets in channel
  ioInstance.to(channel).emit(SOCKET_EVENTS.SERVER.ROOM_CLOSED, {
    roomId,
    reason,
  });

  // Clear presence state for this room
  presenceManager.clearRoom(roomId);

  // Force all sockets to leave the closed room channel
  const socketsInRoom = await ioInstance.in(channel).fetchSockets();
  for (const s of socketsInRoom) {
    s.leave(channel);
  }
}

/**
 * Disconnect all active sockets for a specific user (e.g. upon account suspension or logout).
 */
export async function disconnectUserSockets(userId: string): Promise<void> {
  if (!ioInstance) return;

  const sockets = await ioInstance.fetchSockets();
  for (const s of sockets) {
    if (s.data?.user?.id === userId) {
      s.disconnect(true);
    }
  }
}

/**
 * Gracefully close the Socket.IO server.
 */
export function closeSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!ioInstance) {
      resolve();
      return;
    }

    presenceManager.clear();
    ioInstance.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing Socket.IO server');
      } else {
        logger.info('🛑 Socket.IO server closed cleanly');
      }
      ioInstance = null;
      resolve();
    });
  });
}
