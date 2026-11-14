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

  // Generation-fenced pending disconnect timers: userId -> { timer, generation }
  private pendingDisconnects = new Map<string, { timer: NodeJS.Timeout; generation: number }>();
  private userGenerations = new Map<string, number>();

  private cancelPendingDisconnect(userId: string): void {
    const pending = this.pendingDisconnects.get(userId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingDisconnects.delete(userId);
      const nextGen = (this.userGenerations.get(userId) || 0) + 1;
      this.userGenerations.set(userId, nextGen);
    }
  }

  /**
   * Register a user's socket connection.
   */
  addSocket(userId: string, socketId: string): { isFirstConnection: boolean; totalOnline: number } {
    const wasPendingGrace = this.pendingDisconnects.has(userId);
    this.cancelPendingDisconnect(userId);

    let sockets = this.userSockets.get(userId);
    const isFirstConnection = !wasPendingGrace && (!sockets || sockets.size === 0);

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
   * Unregister a user's socket disconnection immediately (explicit logout / eviction).
   */
  removeSocket(userId: string, socketId: string): { isLastDisconnection: boolean; totalOnline: number } {
    this.cancelPendingDisconnect(userId);

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
   * Handle unexpected socket disconnect with a generation-fenced grace period.
   * If the disconnecting socket is the user's last socket, a grace period timer is scheduled.
   * If the user reconnects within gracePeriodMs, the timer is cancelled and presence remains uninterrupted.
   * If grace expires without reconnect, onGraceExpired is called and the user is fully removed from online tracking.
   */
  handleDisconnect(
    userId: string,
    socketId: string,
    gracePeriodMs: number,
    onGraceExpired: () => void
  ): { isPendingGrace: boolean; immediateLastDisconnection: boolean } {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return { isPendingGrace: false, immediateLastDisconnection: false };
    }

    sockets.delete(socketId);

    // If user still has other active sockets (multi-tab/device), no grace period needed
    if (sockets.size > 0) {
      return { isPendingGrace: false, immediateLastDisconnection: false };
    }

    // Last socket disconnected: schedule grace period timer
    this.cancelPendingDisconnect(userId);
    const generation = (this.userGenerations.get(userId) || 0) + 1;
    this.userGenerations.set(userId, generation);

    const timer = setTimeout(() => {
      this.pendingDisconnects.delete(userId);

      // Verify generation has not changed (i.e. user has not reconnected)
      if (this.userGenerations.get(userId) === generation) {
        const remainingSockets = this.userSockets.get(userId);
        if (!remainingSockets || remainingSockets.size === 0) {
          this.userSockets.delete(userId);
          onGraceExpired();
        }
      }
    }, gracePeriodMs);

    this.pendingDisconnects.set(userId, { timer, generation });

    return { isPendingGrace: true, immediateLastDisconnection: false };
  }

  /**
   * Check if a user currently has active socket connections or is within disconnect grace period.
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    const hasSockets = !!sockets && sockets.size > 0;
    const isPendingGrace = this.pendingDisconnects.has(userId);
    return hasSockets || isPendingGrace;
  }

  /**
   * Get all currently online user IDs.
   */
  getOnlineUserIds(): string[] {
    const ids = new Set<string>(this.userSockets.keys());
    for (const id of this.pendingDisconnects.keys()) {
      ids.add(id);
    }
    return Array.from(ids);
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
    for (const pending of this.pendingDisconnects.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingDisconnects.clear();
    this.userGenerations.clear();
    this.userSockets.clear();
  }
}

export const globalPresenceManager = new GlobalPresenceManager();
