import { Server } from 'socket.io';
import {
  SOCKET_EVENTS,
  FriendPresenceUpdatedPayload,
  FriendRequestReceivedPayload,
  FriendRequestAcceptedPayload,
  FriendInvitationReceivedPayload,
} from '@ktv/contracts';
import { AuthenticatedSocket, AuthenticatedSocketData } from './socket.auth.js';
import { globalPresenceManager } from './global-presence.manager.js';
import { logger } from '../utils/logger.js';

export function getUserChannel(userId: string): string {
  return `user:${userId}`;
}

export function registerFriendEvents(
  _io: Server<any, any, any, AuthenticatedSocketData>,
  socket: AuthenticatedSocket
): void {
  const userId = socket.data.user.id;

  // Listen for explicit friend presence requests
  socket.on(SOCKET_EVENTS.CLIENT.FRIEND_PRESENCE_REQUEST, async (data: { targetUserId?: string }) => {
    try {
      if (data?.targetUserId) {
        const presence = await globalPresenceManager.getUserPresence(data.targetUserId, userId);
        socket.emit(SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED, presence);
      }
    } catch (err) {
      logger.error({ err, userId }, 'Error handling friend presence request');
    }
  });
}

/**
 * Emit a realtime presence update to a specific user's channel.
 */
export function emitFriendPresenceUpdate(
  io: Server<any, any, any, AuthenticatedSocketData> | null,
  recipientUserId: string,
  payload: FriendPresenceUpdatedPayload
): void {
  if (!io) return;
  io.to(getUserChannel(recipientUserId)).emit(SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED, payload);
}

/**
 * Emit an incoming friend request notification to the addressee.
 */
export function emitFriendRequestReceived(
  io: Server<any, any, any, AuthenticatedSocketData> | null,
  addresseeId: string,
  payload: FriendRequestReceivedPayload
): void {
  if (!io) return;
  io.to(getUserChannel(addresseeId)).emit(SOCKET_EVENTS.SERVER.FRIEND_REQUEST_RECEIVED, payload);
}

/**
 * Emit a friend request accepted notification to the original requester.
 */
export function emitFriendRequestAccepted(
  io: Server<any, any, any, AuthenticatedSocketData> | null,
  requesterId: string,
  payload: FriendRequestAcceptedPayload
): void {
  if (!io) return;
  io.to(getUserChannel(requesterId)).emit(SOCKET_EVENTS.SERVER.FRIEND_REQUEST_ACCEPTED, payload);
}

/**
 * Emit a direct karaoke lounge invitation to a friend.
 */
export function emitFriendInvitationReceived(
  io: Server<any, any, any, AuthenticatedSocketData> | null,
  friendUserId: string,
  payload: FriendInvitationReceivedPayload
): void {
  if (!io) return;
  io.to(getUserChannel(friendUserId)).emit(SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED, payload);
}
