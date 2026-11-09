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
    // Record socket metadata
    this.socketMeta.set(socketId, { userId, username, avatar, role, roomId });
    this.userDetails.set(userId, { username, avatar, role });

    let roomMap = this.roomUsers.get(roomId);
    if (!roomMap) {
      roomMap = new Map<string, Set<string>>();
      this.roomUsers.set(roomId, roomMap);
    }

    let userSockets = roomMap.get(userId);
    const isFirstConnection = !userSockets || userSockets.size === 0;

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
   * Remove a socket when it disconnects or leaves a room.
   */
  removeSocket(socketId: string): RemoveSocketResult | null {
    const meta = this.socketMeta.get(socketId);
    if (!meta) {
      return null;
    }

    this.socketMeta.delete(socketId);
    const { roomId, userId, username } = meta;

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
   * Clear all presence in a room (e.g. room closed).
   */
  clearRoom(roomId: string): void {
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
   * Reset all presence state.
   */
  clear(): void {
    this.roomUsers.clear();
    this.socketMeta.clear();
    this.userDetails.clear();
  }
}

export const presenceManager = new RoomPresenceManager();
