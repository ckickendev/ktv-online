import { Server } from 'socket.io';
import { Types } from 'mongoose';
import {
  SOCKET_EVENTS,
  FriendPresenceUpdatedPayload,
  FriendRequestReceivedPayload,
  FriendRequestAcceptedPayload,
  FriendInvitationReceivedPayload,
} from '@ktv/contracts';
import { AuthenticatedSocket, AuthenticatedSocketData } from './socket.auth.js';
import { globalPresenceManager } from './global-presence.manager.js';
import { FriendshipModel } from '../modules/friends/friendship.model.js';
import { UserModel } from '../modules/users/user.model.js';
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
        const target = await UserModel.findById(data.targetUserId).select('username').lean().exec();
        socket.emit(SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED, {
          ...presence,
          username: target?.username || '',
        });
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

/**
 * Broadcast dynamic presence of target user to all their accepted friends in realtime (DEF-PRES-01).
 * Respects individual friend privacy rules and room masking per viewer perspective.
 */
export async function broadcastUserPresenceToFriends(
  io: Server<any, any, any, AuthenticatedSocketData> | null,
  userId: string
): Promise<void> {
  if (!io || !userId || !Types.ObjectId.isValid(userId)) return;

  try {
    const userObjectId = new Types.ObjectId(userId);
    const friendships = await FriendshipModel.find({
      $or: [
        { requesterId: userObjectId },
        { addresseeId: userObjectId },
      ],
      status: 'accepted',
    })
      .select('requesterId addresseeId')
      .lean()
      .exec();

    if (!friendships || friendships.length === 0) return;

    const userDoc = await UserModel.findById(userId).select('username').lean().exec();
    const username = userDoc?.username || '';

    await Promise.allSettled(
      friendships.map(async (f) => {
        const friendUserId =
          f.requesterId.toString() === userId
            ? f.addresseeId.toString()
            : f.requesterId.toString();

        const presence = await globalPresenceManager.getUserPresence(userId, friendUserId);
        emitFriendPresenceUpdate(io, friendUserId, {
          ...presence,
          username,
        });
      })
    );
  } catch (err) {
    logger.error({ err, userId }, 'Error broadcasting user presence to friends');
  }
}
