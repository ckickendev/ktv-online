import { FriendPresenceDto, FriendPresenceStatus } from '@ktv/contracts';
import { presenceManager } from './presence.manager.js';
import { RoomModel } from '../modules/rooms/room.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { FriendshipModel, computePairKey } from '../modules/friends/friendship.model.js';
import { karaokeService } from '../modules/karaoke/karaoke.service.js';
import { logger } from '../utils/logger.js';

export class GlobalPresenceManager {
  // userId -> Set<socketId>
  private userSockets = new Map<string, Set<string>>();

  /**
   * Register a user's socket connection.
   */
  addSocket(userId: string, socketId: string): { isFirstConnection: boolean; totalOnline: number } {
    let sockets = this.userSockets.get(userId);
    const isFirstConnection = !sockets || sockets.size === 0;

    if (!sockets) {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);

    return {
      isFirstConnection,
      totalOnline: this.userSockets.size,
    };
  }

  /**
   * Unregister a user's socket disconnection.
   */
  removeSocket(userId: string, socketId: string): { isLastDisconnection: boolean; totalOnline: number } {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return { isLastDisconnection: false, totalOnline: this.userSockets.size };
    }

    sockets.delete(socketId);
    const isLastDisconnection = sockets.size === 0;

    if (isLastDisconnection) {
      this.userSockets.delete(userId);
    }

    return {
      isLastDisconnection,
      totalOnline: this.userSockets.size,
    };
  }

  /**
   * Check if a user currently has active socket connections.
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * Get all currently online user IDs.
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.userSockets.keys());
  }

  /**
   * Calculate dynamic presence for a user, respecting privacy visibility and room masking.
   */
  async getUserPresence(targetUserId: string, viewerUserId?: string): Promise<FriendPresenceDto> {
    const nowIso = new Date().toISOString();

    const offlinePresence: FriendPresenceDto = {
      userId: targetUserId,
      status: 'offline',
      roomId: null,
      roomTitle: null,
      isPrivateLounge: false,
      songTitle: null,
      updatedAt: nowIso,
    };

    try {
      const targetUser = await UserModel.findById(targetUserId)
        .select('preferences')
        .lean()
        .exec();

      if (!targetUser) {
        return offlinePresence;
      }

      const visibility = targetUser.preferences?.presenceVisibility || 'friends';

      // 1. If visibility is 'none' and viewer is not the user themselves -> stealth mode
      if (visibility === 'none' && targetUserId !== viewerUserId) {
        return offlinePresence;
      }

      // 2. If visibility is 'friends' and viewer is not the user themselves, check friendship
      if (visibility === 'friends' && viewerUserId && targetUserId !== viewerUserId) {
        const pairKey = computePairKey(targetUserId, viewerUserId);
        const friendship = await FriendshipModel.findOne({ pairKey, status: 'accepted' })
          .select('_id')
          .lean()
          .exec();

        if (!friendship) {
          return offlinePresence;
        }
      }

      // 3. Check socket connection
      if (!this.isUserOnline(targetUserId)) {
        return offlinePresence;
      }

      // 4. Check active room membership
      const roomPresence = presenceManager.getUserRoom(targetUserId);
      if (!roomPresence) {
        return {
          userId: targetUserId,
          status: 'online',
          roomId: null,
          roomTitle: null,
          isPrivateLounge: false,
          songTitle: null,
          updatedAt: nowIso,
        };
      }

      // User is in a room: fetch room metadata and live karaoke state
      const room = await RoomModel.findById(roomPresence.roomId)
        .select('name visibility status')
        .lean()
        .exec();

      if (!room) {
        return {
          userId: targetUserId,
          status: 'online',
          roomId: null,
          roomTitle: null,
          isPrivateLounge: false,
          songTitle: null,
          updatedAt: nowIso,
        };
      }

      const isPrivate = room.visibility === 'private';
      const isViewerInSameRoom = viewerUserId
        ? presenceManager.getUserRoom(viewerUserId)?.roomId === roomPresence.roomId
        : false;

      // Check singing state from karaokeService
      let status: FriendPresenceStatus = 'in_lounge';
      let songTitle: string | null = null;

      try {
        const playback = await karaokeService.getPlaybackSnapshot(roomPresence.roomId);
        if (playback && playback.status === 'playing' && playback.currentItem) {
          const performerId =
            playback.currentItem.singer?.id || playback.currentItem.requestedBy?.id;
          if (performerId === targetUserId) {
            status = 'singing';
            songTitle = playback.currentItem.song?.title || null;
          }
        }
      } catch (err) {
        logger.debug({ err, roomId: roomPresence.roomId }, 'Could not fetch playback snapshot for presence');
      }

      // Privacy Masking: If private room and viewer is not already in the room, mask roomId and title
      if (isPrivate && !isViewerInSameRoom) {
        return {
          userId: targetUserId,
          status,
          roomId: null,
          roomTitle: 'Private Lounge',
          isPrivateLounge: true,
          songTitle: null, // Do not leak song info from private rooms to outsiders
          updatedAt: nowIso,
        };
      }

      return {
        userId: targetUserId,
        status,
        roomId: roomPresence.roomId,
        roomTitle: room.name,
        isPrivateLounge: isPrivate,
        songTitle,
        updatedAt: nowIso,
      };
    } catch (error) {
      logger.error({ error, targetUserId }, 'Error evaluating user presence');
      return offlinePresence;
    }
  }

  /**
   * Reset all global presence state.
   */
  clear(): void {
    this.userSockets.clear();
  }
}

export const globalPresenceManager = new GlobalPresenceManager();
