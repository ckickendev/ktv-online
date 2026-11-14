import http from 'http';
import { Server, ServerOptions } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { socketAuthMiddleware, AuthenticatedSocketData } from './socket.auth.js';
import { registerRoomEvents, getRoomChannel } from './room.events.js';
import { registerChatEvents } from './chat.events.js';
import { registerStageReactionEvents } from './stage-reaction.events.js';
import { registerGiftEvents } from './gift.events.js';
import { registerFriendEvents, getUserChannel } from './friend.events.js';
import { globalPresenceManager } from './global-presence.manager.js';
import {
  registerKaraokeEvents,
  broadcastKaraokeQueueUpdated,
  broadcastKaraokePlaybackUpdated,
} from './karaoke.events.js';
import { karaokeService } from '../modules/karaoke/karaoke.service.js';
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
    const userId = socket.data.user.id;
    logger.info(
      { socketId: socket.id, userId, username: socket.data.user.username },
      '⚡ Socket.IO client connected and authenticated'
    );

    // Join per-user channel for targeted direct updates
    socket.join(getUserChannel(userId));

    // Register into global presence tracker
    globalPresenceManager.addSocket(userId, socket.id);

    socket.on('disconnect', () => {
      globalPresenceManager.removeSocket(userId, socket.id);
    });

    // Register room lifecycle and presence event handlers
    registerRoomEvents(io, socket);

    // Register chat, reaction, and moderation event handlers
    registerChatEvents(io, socket);

    // Register karaoke queue and playback event handlers
    registerKaraokeEvents(io, socket);

    // Register ephemeral stage reactions
    registerStageReactionEvents(io, socket);

    // Register virtual gifts & performer appreciation
    registerGiftEvents(io, socket);

    // Register friend presence and social interaction event handlers
    registerFriendEvents(io, socket);
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

  // Clean up karaoke state for closed room
  try {
    await karaokeService.handleRoomClosed(roomId);
  } catch (err) {
    logger.error({ err, roomId }, 'Error cleaning up karaoke for closed room');
  }

  // Clear presence state for this room
  presenceManager.clearRoom(roomId);

  // Force all sockets to leave the closed room channel
  const socketsInRoom = await ioInstance.in(channel).fetchSockets();
  for (const s of socketsInRoom) {
    s.leave(channel);
  }
}

/**
 * Evict a member kicked by the host: notify their sockets, remove them from the channel,
 * clear their presence, clean up their queued songs, and notify the remaining room occupants.
 */
export async function evictKickedMember(
  roomId: string,
  userId: string,
  reason = 'You were removed from the room by the host'
): Promise<void> {
  if (!ioInstance) return;

  const channel = getRoomChannel(roomId);
  logger.info({ roomId, userId, reason }, 'Evicting kicked member from room');

  // 1. Notify user's sockets and force leave channel
  const sockets = await ioInstance.fetchSockets();
  for (const s of sockets) {
    if (s.data?.user?.id === userId) {
      s.emit(SOCKET_EVENTS.SERVER.MEMBER_KICKED, {
        roomId,
        userId,
        reason,
      });
      s.leave(channel);
    }
  }

  // 2. Remove user from room presence
  const presenceResult = presenceManager.removeUserFromRoom(roomId, userId);

  // 3. Clean up user's queued karaoke songs and advance playback if they were singing
  try {
    const departureResult = await karaokeService.handleMemberDeparted(roomId, userId);
    if (departureResult) {
      broadcastKaraokeQueueUpdated(ioInstance, roomId, departureResult.queue, 'removed');
      broadcastKaraokePlaybackUpdated(ioInstance, roomId, departureResult.playback);
    }
  } catch (err) {
    logger.error({ err, roomId, userId }, 'Error cleaning up karaoke for kicked member');
  }

  // 4. Broadcast member:left to remaining occupants
  if (presenceResult) {
    ioInstance.to(channel).emit(SOCKET_EVENTS.SERVER.MEMBER_LEFT, {
      roomId,
      userId,
      username: presenceResult.username,
      totalOnline: presenceResult.totalOnline,
    });
  }
}

/**
 * Disconnect all active sockets for a specific authenticated session family (e.g. upon logout or token replay).
 */
export async function disconnectSessionSockets(familyId: string): Promise<void> {
  if (!ioInstance) return;

  const sockets = await ioInstance.fetchSockets();
  for (const s of sockets) {
    if (s.data?.user?.familyId === familyId) {
      logger.info(
        { socketId: s.id, userId: s.data.user.id, familyId },
        '🔌 Disconnecting socket due to session revocation'
      );
      s.emit(SOCKET_EVENTS.SERVER.CHAT_ERROR, {
        code: 'SESSION_REVOKED',
        message: 'Your session has been logged out or revoked',
      });
      s.disconnect(true);
    }
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
