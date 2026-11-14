import { PresenceMemberDto } from '@ktv/contracts';

export interface SocketMetadata {
  userId: string;
  username: string;
  avatar?: string | null;
  role: 'host' | 'member' | 'viewer';
  roomId: string;
}

export interface AddSocketResult {
  isFirstConnection: boolean;
  totalOnline: number;
  memberDto: PresenceMemberDto;
}

export interface RemoveSocketResult {
  roomId: string;
  userId: string;
  username: string;
  isLastDisconnection: boolean;
  totalOnline: number;
}

export class RoomPresenceManager {
  // roomId -> Map<userId, Set<socketId>>
  private roomUsers = new Map<string, Map<string, Set<string>>>();

  // socketId -> SocketMetadata
  private socketMeta = new Map<string, SocketMetadata>();

  // userId -> cached user details for DTO representation
  private userDetails = new Map<
    string,
    { username: string; avatar?: string | null; role: 'host' | 'member' | 'viewer' }
  >();

  // Generation-fenced pending disconnect timers: "roomId:userId" -> { timer, generation }
  private pendingDisconnects = new Map<string, { timer: NodeJS.Timeout; generation: number }>();
  private userGenerations = new Map<string, number>();

  private getPresenceKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  private cancelPendingDisconnect(roomId: string, userId: string): void {
    const key = this.getPresenceKey(roomId, userId);
    const pending = this.pendingDisconnects.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingDisconnects.delete(key);
      const nextGen = (this.userGenerations.get(key) || 0) + 1;
      this.userGenerations.set(key, nextGen);
    }
  }

  /**
   * Register a socket into a room's presence.
   */
  addSocket(
    roomId: string,
    userId: string,
    username: string,
    socketId: string,
    role: 'host' | 'member' | 'viewer' = 'member',
    avatar?: string | null
  ): AddSocketResult {
    // If a disconnect grace timer was pending for this user in this room, cancel it immediately
    const presenceKey = this.getPresenceKey(roomId, userId);
    const wasPendingGrace = this.pendingDisconnects.has(presenceKey);
    this.cancelPendingDisconnect(roomId, userId);

    // Room switching cleanup (DEF-PRES-02): If socket was previously in a different room without explicit leave, evict it
    const existingMeta = this.socketMeta.get(socketId);
    if (existingMeta && existingMeta.roomId !== roomId) {
      const prevRoomId = existingMeta.roomId;
      const prevRoomMap = this.roomUsers.get(prevRoomId);
      if (prevRoomMap) {
        const prevUserSockets = prevRoomMap.get(existingMeta.userId);
        if (prevUserSockets) {
          prevUserSockets.delete(socketId);
          if (prevUserSockets.size === 0) {
            prevRoomMap.delete(existingMeta.userId);
          }
        }
        if (prevRoomMap.size === 0) {
          this.roomUsers.delete(prevRoomId);
        }
      }
    }

    // Record socket metadata
    this.socketMeta.set(socketId, { userId, username, avatar, role, roomId });
    this.userDetails.set(userId, { username, avatar, role });

    let roomMap = this.roomUsers.get(roomId);
    if (!roomMap) {
      roomMap = new Map<string, Set<string>>();
      this.roomUsers.set(roomId, roomMap);
    }

    let userSockets = roomMap.get(userId);
    // Only true first connection if the user was neither active nor in grace period
    const isFirstConnection = !wasPendingGrace && (!userSockets || userSockets.size === 0);

    if (!userSockets) {
      userSockets = new Set<string>();
      roomMap.set(userId, userSockets);
    }

    userSockets.add(socketId);

    const memberDto: PresenceMemberDto = {
      userId,
      username,
      avatar: avatar ?? null,
      role,
      isOnline: true,
      deviceCount: userSockets.size,
    };

    return {
      isFirstConnection,
      totalOnline: roomMap.size,
      memberDto,
    };
  }

  /**
   * Remove a socket when it disconnects or leaves a room (explicit immediate removal).
   */
  removeSocket(socketId: string): RemoveSocketResult | null {
    const meta = this.socketMeta.get(socketId);
    if (!meta) {
      return null;
    }

    this.socketMeta.delete(socketId);
    const { roomId, userId, username } = meta;

    // Explicit leave cancels any pending disconnect grace timer immediately
    this.cancelPendingDisconnect(roomId, userId);

    const roomMap = this.roomUsers.get(roomId);
    if (!roomMap) {
      return null;
    }

    const userSockets = roomMap.get(userId);
    if (!userSockets) {
      return null;
    }

    userSockets.delete(socketId);

    const isLastDisconnection = userSockets.size === 0;
    if (isLastDisconnection) {
      roomMap.delete(userId);
    }

    if (roomMap.size === 0) {
      this.roomUsers.delete(roomId);
    }

    const totalOnline = roomMap.size;

    return {
      roomId,
      userId,
      username,
      isLastDisconnection,
      totalOnline,
    };
  }

  /**
   * Handle an unexpected socket disconnect with a generation-fenced grace period.
   * If the disconnecting socket is the user's last socket in the room, a grace period
   * timer is scheduled before emitting member departure. If the user reconnects within
   * the grace period, the timer is cancelled and presence remains uninterrupted.
   */
  handleDisconnect(
    socketId: string,
    gracePeriodMs: number,
    onExpired: (result: RemoveSocketResult) => void
  ): { isPendingGrace: boolean; immediateResult: RemoveSocketResult | null } {
    const meta = this.socketMeta.get(socketId);
    if (!meta) {
      return { isPendingGrace: false, immediateResult: null };
    }

    this.socketMeta.delete(socketId);
    const { roomId, userId, username } = meta;

    const roomMap = this.roomUsers.get(roomId);
    if (!roomMap) {
      return { isPendingGrace: false, immediateResult: null };
    }

    const userSockets = roomMap.get(userId);
    if (!userSockets) {
      return { isPendingGrace: false, immediateResult: null };
    }

    userSockets.delete(socketId);

    // Multi-tab check: if user still has other active sockets in this room, no grace timer is needed
    if (userSockets.size > 0) {
      return {
        isPendingGrace: false,
        immediateResult: {
          roomId,
          userId,
          username,
          isLastDisconnection: false,
          totalOnline: roomMap.size,
        },
      };
    }

    // Last socket disconnected unexpectedly: schedule grace period timer with generation fencing
    const presenceKey = this.getPresenceKey(roomId, userId);
    this.cancelPendingDisconnect(roomId, userId);

    const generation = (this.userGenerations.get(presenceKey) || 0) + 1;
    this.userGenerations.set(presenceKey, generation);

    const timer = setTimeout(() => {
      this.pendingDisconnects.delete(presenceKey);

      // Verify generation has not changed (i.e. user has not reconnected)
      if (this.userGenerations.get(presenceKey) === generation) {
        const rMap = this.roomUsers.get(roomId);
        const uSockets = rMap?.get(userId);

        if (rMap && uSockets && uSockets.size === 0) {
          rMap.delete(userId);
          if (rMap.size === 0) {
            this.roomUsers.delete(roomId);
          }

          onExpired({
            roomId,
            userId,
            username,
            isLastDisconnection: true,
            totalOnline: rMap.size,
          });
        }
      }
    }, gracePeriodMs);

    this.pendingDisconnects.set(presenceKey, { timer, generation });

    return {
      isPendingGrace: true,
      immediateResult: null,
    };
  }

  /**
   * Return presence snapshot for a room.
   */
  getRoomPresence(roomId: string): PresenceMemberDto[] {
    const roomMap = this.roomUsers.get(roomId);
    if (!roomMap) {
      return [];
    }

    const members: PresenceMemberDto[] = [];
    for (const [userId, sockets] of roomMap.entries()) {
      const details = this.userDetails.get(userId);
      members.push({
        userId,
        username: details?.username ?? 'Anonymous',
        avatar: details?.avatar ?? null,
        role: details?.role ?? 'member',
        isOnline: true,
        deviceCount: sockets.size,
      });
    }

    return members;
  }

  /**
   * Check if a specific user is currently online in a room.
   */
  isUserOnlineInRoom(roomId: string, userId: string): boolean {
    const roomMap = this.roomUsers.get(roomId);
    if (!roomMap) return false;
    const sockets = roomMap.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  /**
   * Get all active socket IDs for a given user across all rooms.
   */
  getUserSocketIds(userId: string): string[] {
    const result: string[] = [];
    for (const [socketId, meta] of this.socketMeta.entries()) {
      if (meta.userId === userId) {
        result.push(socketId);
      }
    }
    return result;
  }

  /**
   * Remove a user entirely from a room's presence (e.g. kicked or evicted).
   */
  removeUserFromRoom(roomId: string, userId: string): { totalOnline: number; username: string } | null {
    this.cancelPendingDisconnect(roomId, userId);

    const roomMap = this.roomUsers.get(roomId);
    if (!roomMap) return null;

    const userSockets = roomMap.get(userId);
    if (!userSockets) return null;

    let username = 'Anonymous';
    for (const socketId of userSockets) {
      const meta = this.socketMeta.get(socketId);
      if (meta) {
        username = meta.username;
        this.socketMeta.delete(socketId);
      }
    }

    roomMap.delete(userId);
    if (roomMap.size === 0) {
      this.roomUsers.delete(roomId);
    }

    return {
      totalOnline: roomMap.size,
      username,
    };
  }

  /**
   * Clear all presence in a room (e.g. room closed).
   */
  clearRoom(roomId: string): void {
    for (const [key, pending] of this.pendingDisconnects.entries()) {
      if (key.startsWith(`${roomId}:`)) {
        clearTimeout(pending.timer);
        this.pendingDisconnects.delete(key);
      }
    }

    const roomMap = this.roomUsers.get(roomId);
    if (roomMap) {
      for (const [, sockets] of roomMap.entries()) {
        for (const sId of sockets) {
          this.socketMeta.delete(sId);
        }
      }
      this.roomUsers.delete(roomId);
    }
  }

  /**
   * Check if a user is currently present in any active room.
   */
  getUserRoom(userId: string): { roomId: string; role: 'host' | 'member' | 'viewer' } | null {
    for (const [roomId, userMap] of this.roomUsers.entries()) {
      const userSockets = userMap.get(userId);
      if (userSockets && userSockets.size > 0) {
        const details = this.userDetails.get(userId);
        return { roomId, role: details?.role || 'member' };
      }
    }
    return null;
  }

  /**
   * Reset all presence state.
   */
  clear(): void {
    for (const pending of this.pendingDisconnects.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingDisconnects.clear();
    this.userGenerations.clear();
    this.roomUsers.clear();
    this.socketMeta.clear();
    this.userDetails.clear();
  }
}

export const presenceManager = new RoomPresenceManager();
