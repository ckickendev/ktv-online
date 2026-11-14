import { Types } from 'mongoose';
import {
  FriendshipDto,
  FriendRequestDto,
  FriendUserDto,
  FriendQueryDto,
  FriendRequestQueryDto,
  UserSearchQueryDto,
  UserSearchResultDto,
  FriendInvitationReceivedPayload,
  BatchLoungeInviteResultDto,
  BatchLoungeInviteResultItemDto,
} from '@ktv/contracts';
import { FriendshipModel, computePairKey } from './friendship.model.js';
import { UserModel } from '../users/user.model.js';
import { RoomModel } from '../rooms/room.model.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import { invitationService } from '../rooms/invitation.service.js';
import { globalPresenceManager } from '../../realtime/global-presence.manager.js';
import {
  emitFriendRequestReceived,
  emitFriendRequestAccepted,
  emitFriendInvitationReceived,
} from '../../realtime/friend.events.js';
import { getSocketServer } from '../../realtime/socket.server.js';

interface HostInviteRateState {
  lastBatchTime: number;
  recipientsTimeline: number[];
}

export class HostBatchInviteRateLimiter {
  private hosts = new Map<string, HostInviteRateState>();

  checkLimit(
    hostUserId: string,
    recipientCount: number
  ): { allowed: boolean; error?: string; retryAfterSeconds?: number } {
    const now = Date.now();
    const state = this.hosts.get(hostUserId) || { lastBatchTime: 0, recipientsTimeline: [] };

    // 1. Minimum 5 seconds between batch requests
    const timeSinceLast = now - state.lastBatchTime;
    if (timeSinceLast < 5000) {
      const waitSeconds = Math.ceil((5000 - timeSinceLast) / 1000);
      return {
        allowed: false,
        error: `Please wait ${waitSeconds}s before sending another batch invitation`,
        retryAfterSeconds: waitSeconds,
      };
    }

    // 2. Maximum 60 invited recipients per rolling 10-minute window
    const tenMinutesAgo = now - 10 * 60 * 1000;
    state.recipientsTimeline = state.recipientsTimeline.filter((ts) => ts > tenMinutesAgo);

    if (state.recipientsTimeline.length + recipientCount > 60) {
      const oldest = state.recipientsTimeline[0] || now;
      const waitSeconds = Math.max(1, Math.ceil((oldest + 10 * 60 * 1000 - now) / 1000));
      return {
        allowed: false,
        error: `Rate limit exceeded: maximum 60 invitations allowed per 10 minutes. Try again in ${waitSeconds}s`,
        retryAfterSeconds: waitSeconds,
      };
    }

    return { allowed: true };
  }

  recordBatch(hostUserId: string, recipientCount: number): void {
    const now = Date.now();
    const state = this.hosts.get(hostUserId) || { lastBatchTime: 0, recipientsTimeline: [] };
    state.lastBatchTime = now;
    for (let i = 0; i < recipientCount; i++) {
      state.recipientsTimeline.push(now);
    }
    this.hosts.set(hostUserId, state);
  }

  clear(): void {
    this.hosts.clear();
  }
}

export const hostBatchInviteRateLimiter = new HostBatchInviteRateLimiter();

export class FriendshipService {
  /**
   * Helper to format a populated or loaded user document into FriendUserDto.
   */
  private formatUserDto(user: any): FriendUserDto {
    return {
      id: user._id ? user._id.toString() : user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      bio: user.bio ?? null,
    };
  }

  /**
   * Send a friend request from userId to targetUserId.
   */
  async sendRequest(
    userId: string,
    targetUserId: string
  ): Promise<{ success: boolean; data?: FriendRequestDto | FriendshipDto; error?: string }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(targetUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    if (userId === targetUserId) {
      return { success: false, error: 'CANNOT_FRIEND_SELF' };
    }

    const targetUser = await UserModel.findById(targetUserId).select('status username displayName avatar bio').exec();
    if (!targetUser || targetUser.status === 'suspended') {
      return { success: false, error: 'TARGET_USER_NOT_FOUND' };
    }

    const currentUser = await UserModel.findById(userId).select('username displayName avatar bio').exec();
    if (!currentUser) {
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    const pairKey = computePairKey(userId, targetUserId);
    const existing = await FriendshipModel.findOne({ pairKey }).exec();

    if (existing) {
      if (existing.status === 'accepted') {
        return { success: false, error: 'ALREADY_FRIENDS' };
      }
      if (existing.status === 'blocked') {
        return { success: false, error: 'USER_BLOCKED' };
      }
      if (existing.status === 'pending') {
        if (existing.requesterId.toString() === userId) {
          return { success: false, error: 'REQUEST_ALREADY_SENT' };
        }
        // Mutual request: The target user already sent a request to current user! Auto-accept.
        existing.status = 'accepted';
        await existing.save();

        const io = getSocketServer();
        emitFriendRequestAccepted(io, targetUserId, {
          friendshipId: existing._id.toString(),
          friend: this.formatUserDto(currentUser),
          acceptedAt: new Date().toISOString(),
        });

        const friendPresence = await globalPresenceManager.getUserPresence(targetUserId, userId);
        const friendUserDto: FriendUserDto = {
          ...this.formatUserDto(targetUser),
          presence: friendPresence,
        };

        const friendshipDto: FriendshipDto = {
          id: existing._id.toString(),
          friend: friendUserDto,
          status: 'accepted',
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        };

        return { success: true, data: friendshipDto };
      }

      // If declined, reset to pending with current user as requester
      existing.requesterId = new Types.ObjectId(userId);
      existing.addresseeId = new Types.ObjectId(targetUserId);
      existing.status = 'pending';
      await existing.save();

      const io = getSocketServer();
      emitFriendRequestReceived(io, targetUserId, {
        requestId: existing._id.toString(),
        requester: this.formatUserDto(currentUser),
        createdAt: existing.updatedAt.toISOString(),
      });

      const requestDto: FriendRequestDto = {
        id: existing._id.toString(),
        requester: this.formatUserDto(currentUser),
        addressee: this.formatUserDto(targetUser),
        status: 'pending',
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      };

      return { success: true, data: requestDto };
    }

    // Create new pending friendship with atomic duplicate-key error handling (DEF-FR-01)
    try {
      const newFriendship = await FriendshipModel.create({
        requesterId: new Types.ObjectId(userId),
        addresseeId: new Types.ObjectId(targetUserId),
        pairKey,
        status: 'pending',
      });

      const io = getSocketServer();
      emitFriendRequestReceived(io, targetUserId, {
        requestId: newFriendship._id.toString(),
        requester: this.formatUserDto(currentUser),
        createdAt: newFriendship.createdAt.toISOString(),
      });

      const requestDto: FriendRequestDto = {
        id: newFriendship._id.toString(),
        requester: this.formatUserDto(currentUser),
        addressee: this.formatUserDto(targetUser),
        status: 'pending',
        createdAt: newFriendship.createdAt.toISOString(),
        updatedAt: newFriendship.updatedAt.toISOString(),
      };

      return { success: true, data: requestDto };
    } catch (err: unknown) {
      // Precise unique-index collision detection for canonical pairKey (AUD-FR-01)
      const isDuplicate =
        (err as { code?: number })?.code === 11000 ||
        (err as { codeName?: string })?.codeName === 'DuplicateKey';

      if (isDuplicate) {
        // Concurrency collision: another request was inserted for this pairKey during the race window.
        // Reload canonical relationship and reconcile state safely.
        const raced = await FriendshipModel.findOne({ pairKey }).exec();
        if (raced) {
          if (raced.status === 'accepted') {
            return { success: false, error: 'ALREADY_FRIENDS' };
          }
          if (raced.status === 'blocked') {
            return { success: false, error: 'USER_BLOCKED' };
          }
          if (raced.status === 'pending') {
            if (raced.requesterId.toString() === userId) {
              return { success: false, error: 'REQUEST_ALREADY_SENT' };
            }
            if (raced.requesterId.toString() === targetUserId) {
              // Reciprocal request detected in race! Atomically transition to accepted.
              const accepted = await FriendshipModel.findOneAndUpdate(
                { _id: raced._id, status: 'pending' },
                { $set: { status: 'accepted' } },
                { new: true }
              ).exec();

              if (accepted) {
                const io = getSocketServer();
                emitFriendRequestAccepted(io, targetUserId, {
                  friendshipId: accepted._id.toString(),
                  friend: this.formatUserDto(currentUser),
                  acceptedAt: new Date().toISOString(),
                });

                const friendPresence = await globalPresenceManager.getUserPresence(targetUserId, userId);
                const friendUserDto: FriendUserDto = {
                  ...this.formatUserDto(targetUser),
                  presence: friendPresence,
                };

                const friendshipDto: FriendshipDto = {
                  id: accepted._id.toString(),
                  friend: friendUserDto,
                  status: 'accepted',
                  createdAt: accepted.createdAt.toISOString(),
                  updatedAt: accepted.updatedAt.toISOString(),
                };

                return { success: true, data: friendshipDto };
              }
            }
          }
        }
      }
      throw err;
    }
  }

  /**
   * Accept an incoming friend request (Atomic Conditional Transition DEF-FR-02).
   */
  async acceptRequest(
    userId: string,
    requestId: string
  ): Promise<{ success: boolean; data?: FriendshipDto; error?: string }> {
    if (!Types.ObjectId.isValid(requestId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const requestObjectId = new Types.ObjectId(requestId);
    const userObjectId = new Types.ObjectId(userId);

    const updated = await FriendshipModel.findOneAndUpdate(
      {
        _id: requestObjectId,
        addresseeId: userObjectId,
        status: 'pending',
      },
      { $set: { status: 'accepted' } },
      { new: true }
    )
      .populate('requesterId', 'username displayName avatar bio preferences')
      .populate('addresseeId', 'username displayName avatar bio preferences')
      .exec();

    if (!updated) {
      const existing = await FriendshipModel.findById(requestObjectId).exec();
      if (!existing) {
        return { success: false, error: 'REQUEST_NOT_FOUND' };
      }
      if (existing.addresseeId.toString() !== userId) {
        return { success: false, error: 'FORBIDDEN_NOT_ADDRESSEE' };
      }
      if (existing.status !== 'pending') {
        return { success: false, error: 'REQUEST_NOT_PENDING' };
      }
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }

    const requesterUser: any = updated.requesterId;
    const addresseeUser: any = updated.addresseeId;

    // Realtime notification to requester
    const io = getSocketServer();
    emitFriendRequestAccepted(io, requesterUser._id.toString(), {
      friendshipId: updated._id.toString(),
      friend: this.formatUserDto(addresseeUser),
      acceptedAt: new Date().toISOString(),
    });

    // Compute requester presence for the accepting user
    const friendPresence = await globalPresenceManager.getUserPresence(
      requesterUser._id.toString(),
      userId
    );

    const friendshipDto: FriendshipDto = {
      id: updated._id.toString(),
      friend: {
        ...this.formatUserDto(requesterUser),
        presence: friendPresence,
      },
      status: 'accepted',
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return { success: true, data: friendshipDto };
  }

  /**
   * Decline an incoming friend request (Atomic Conditional Transition DEF-FR-02).
   */
  async declineRequest(
    userId: string,
    requestId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(requestId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const requestObjectId = new Types.ObjectId(requestId);
    const userObjectId = new Types.ObjectId(userId);

    const updated = await FriendshipModel.findOneAndUpdate(
      {
        _id: requestObjectId,
        addresseeId: userObjectId,
        status: 'pending',
      },
      { $set: { status: 'declined' } },
      { new: true }
    ).exec();

    if (!updated) {
      const existing = await FriendshipModel.findById(requestObjectId).exec();
      if (!existing) {
        return { success: false, error: 'REQUEST_NOT_FOUND' };
      }
      if (existing.addresseeId.toString() !== userId) {
        return { success: false, error: 'FORBIDDEN_NOT_ADDRESSEE' };
      }
      if (existing.status !== 'pending') {
        return { success: false, error: 'REQUEST_NOT_PENDING' };
      }
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }

    return { success: true };
  }

  /**
   * Cancel an outgoing pending request (Atomic Conditional Removal DEF-FR-02).
   */
  async cancelRequest(
    userId: string,
    requestId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(requestId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const requestObjectId = new Types.ObjectId(requestId);
    const userObjectId = new Types.ObjectId(userId);

    const deleted = await FriendshipModel.findOneAndDelete({
      _id: requestObjectId,
      requesterId: userObjectId,
      status: 'pending',
    }).exec();

    if (!deleted) {
      const existing = await FriendshipModel.findById(requestObjectId).exec();
      if (!existing) {
        return { success: false, error: 'REQUEST_NOT_FOUND' };
      }
      if (existing.requesterId.toString() !== userId) {
        return { success: false, error: 'FORBIDDEN_NOT_REQUESTER' };
      }
      if (existing.status !== 'pending') {
        return { success: false, error: 'REQUEST_NOT_PENDING' };
      }
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }

    return { success: true };
  }

  /**
   * Remove a friend (Atomic Conditional Removal DEF-FR-02).
   */
  async removeFriend(
    userId: string,
    friendUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(friendUserId) || !Types.ObjectId.isValid(userId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const pairKey = computePairKey(userId, friendUserId);
    const deleted = await FriendshipModel.findOneAndDelete({
      pairKey,
      status: 'accepted',
    }).exec();

    if (!deleted) {
      return { success: false, error: 'FRIENDSHIP_NOT_FOUND' };
    }

    return { success: true };
  }

  /**
   * Get list of accepted friends with live presence badges.
   */
  async getFriends(
    userId: string,
    query: FriendQueryDto
  ): Promise<{
    items: FriendshipDto[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { requesterId: new Types.ObjectId(userId) },
        { addresseeId: new Types.ObjectId(userId) },
      ],
      status: 'accepted',
    };

    const [total, docs] = await Promise.all([
      FriendshipModel.countDocuments(filter).exec(),
      FriendshipModel.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requesterId', 'username displayName avatar bio preferences')
        .populate('addresseeId', 'username displayName avatar bio preferences')
        .exec(),
    ]);

    const items: FriendshipDto[] = await Promise.all(
      docs.map(async (doc: any) => {
        const isRequester = doc.requesterId._id.toString() === userId;
        const friendUser = isRequester ? doc.addresseeId : doc.requesterId;
        const friendId = friendUser._id.toString();

        const presence = await globalPresenceManager.getUserPresence(friendId, userId);

        return {
          id: doc._id.toString(),
          friend: {
            ...this.formatUserDto(friendUser),
            presence,
          },
          status: 'accepted',
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        };
      })
    );

    return {
      items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Get pending incoming requests.
   */
  async getIncomingRequests(
    userId: string,
    query: FriendRequestQueryDto
  ): Promise<{
    items: FriendRequestDto[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter = {
      addresseeId: new Types.ObjectId(userId),
      status: 'pending',
    };

    const [total, docs] = await Promise.all([
      FriendshipModel.countDocuments(filter).exec(),
      FriendshipModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requesterId', 'username displayName avatar bio')
        .populate('addresseeId', 'username displayName avatar bio')
        .exec(),
    ]);

    const items: FriendRequestDto[] = docs.map((doc: any) => ({
      id: doc._id.toString(),
      requester: this.formatUserDto(doc.requesterId),
      addressee: this.formatUserDto(doc.addresseeId),
      status: 'pending',
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Get pending outgoing requests.
   */
  async getOutgoingRequests(
    userId: string,
    query: FriendRequestQueryDto
  ): Promise<{
    items: FriendRequestDto[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter = {
      requesterId: new Types.ObjectId(userId),
      status: 'pending',
    };

    const [total, docs] = await Promise.all([
      FriendshipModel.countDocuments(filter).exec(),
      FriendshipModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requesterId', 'username displayName avatar bio')
        .populate('addresseeId', 'username displayName avatar bio')
        .exec(),
    ]);

    const items: FriendRequestDto[] = docs.map((doc: any) => ({
      id: doc._id.toString(),
      requester: this.formatUserDto(doc.requesterId),
      addressee: this.formatUserDto(doc.addresseeId),
      status: 'pending',
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Search users by username or displayName, and return relation status relative to userId.
   */
  async searchUsers(
    userId: string,
    query: UserSearchQueryDto
  ): Promise<UserSearchResultDto[]> {
    const q = query.q.trim();
    if (!q) return [];

    const limit = query.limit || 10;
    const regex = new RegExp(q, 'i');

    const users = await UserModel.find({
      _id: { $ne: new Types.ObjectId(userId) },
      status: 'active',
      $or: [{ username: regex }, { displayName: regex }],
    })
      .select('username displayName avatar bio')
      .limit(limit)
      .lean()
      .exec();

    if (users.length === 0) return [];

    const results: UserSearchResultDto[] = await Promise.all(
      users.map(async (u: any) => {
        const otherId = u._id.toString();
        const pairKey = computePairKey(userId, otherId);
        const rel = await FriendshipModel.findOne({ pairKey }).lean().exec();

        let relationship: UserSearchResultDto['relationship'] = 'none';
        let requestId: string | null = null;

        if (rel) {
          if (rel.status === 'accepted') {
            relationship = 'friends';
          } else if (rel.status === 'blocked') {
            relationship = 'blocked';
          } else if (rel.status === 'pending') {
            requestId = rel._id.toString();
            if (rel.requesterId.toString() === userId) {
              relationship = 'pending_outgoing';
            } else {
              relationship = 'pending_incoming';
            }
          }
        }

        return {
          id: otherId,
          username: u.username,
          displayName: u.displayName ?? null,
          avatar: u.avatar ?? null,
          bio: u.bio ?? null,
          relationship,
          requestId,
        };
      })
    );

    return results;
  }

  /**
   * Send a direct room invitation to a friend.
   */
  async sendLoungeInviteToFriend(
    userId: string,
    roomId: string,
    friendUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(friendUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const room = await RoomModel.findById(roomId).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    // Authoritative host check: only the room owner can dispatch direct friend invitations
    if (room.ownerId.toString() !== userId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    // Verify friendship
    const pairKey = computePairKey(userId, friendUserId);
    const friendship = await FriendshipModel.findOne({ pairKey, status: 'accepted' }).exec();
    if (!friendship) {
      return { success: false, error: 'NOT_FRIENDS' };
    }

    const inviter = await UserModel.findById(userId).select('username displayName avatar').exec();
    if (!inviter) {
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    // Generate dedicated, recipient-bound invitation token for this friend
    const createRes = await invitationService.createFriendInvitation(roomId, userId, friendUserId, 48);
    if (!createRes.success || !createRes.data) {
      return { success: false, error: createRes.error || 'INVITATION_GENERATION_FAILED' };
    }
    const inviteToken = createRes.data.token;

    const io = getSocketServer();
    const payload: FriendInvitationReceivedPayload = {
      invitationId: createRes.data.id,
      invitationToken: inviteToken,
      roomId,
      roomTitle: room.name,
      isPrivate: room.visibility === 'private',
      inviter: {
        id: userId,
        username: inviter.username,
        displayName: inviter.displayName ?? null,
        avatar: inviter.avatar ?? null,
      },
      sentAt: new Date().toISOString(),
    };

    emitFriendInvitationReceived(io, friendUserId, payload);
    return { success: true };
  }

  /**
   * Batch invite friends to a lounge (host-only, optimized batch pipeline).
   */
  async inviteLoungeBatch(
    hostUserId: string,
    roomId: string,
    friendUserIds: string[]
  ): Promise<{
    success: boolean;
    data?: BatchLoungeInviteResultDto;
    error?: string;
    message?: string;
  }> {
    // 1. Authenticate caller (hostUserId must be valid ObjectId)
    if (!Types.ObjectId.isValid(hostUserId)) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // 2. Validate request payload and room ID
    if (!Types.ObjectId.isValid(roomId)) {
      return { success: false, error: 'INVALID_ROOM_ID' };
    }

    if (!Array.isArray(friendUserIds) || friendUserIds.length === 0) {
      return { success: false, error: 'RECIPIENTS_REQUIRED' };
    }

    if (friendUserIds.length > 20) {
      return { success: false, error: 'BATCH_SIZE_EXCEEDED' };
    }

    // Validate that every recipient ID is a valid ObjectId string
    for (const id of friendUserIds) {
      if (!id || typeof id !== 'string' || !Types.ObjectId.isValid(id.trim())) {
        return { success: false, error: 'INVALID_RECIPIENT_ID' };
      }
    }

    // Deduplicate IDs deterministically
    const uniqueRecipientIds = Array.from(new Set(friendUserIds.map((id) => id.trim())));

    // Self-invitation rejection
    if (uniqueRecipientIds.includes(hostUserId)) {
      return { success: false, error: 'CANNOT_INVITE_SELF' };
    }

    // 3. Load the room (single query)
    const room = await RoomModel.findById(roomId).exec();
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    // 4. Verify room is not closed
    if (room.status === 'closed') {
      return { success: false, error: 'ROOM_CLOSED' };
    }

    // 5. Verify room is unlocked
    if (room.isLocked) {
      return { success: false, error: 'ROOM_LOCKED' };
    }

    // 6. Verify room.ownerId === hostUserId (host-only authorization)
    if (room.ownerId.toString() !== hostUserId) {
      return { success: false, error: 'FORBIDDEN_NOT_HOST' };
    }

    // 7. Verify host has active membership in the room (single query)
    const hostMembership = await RoomMembershipModel.findOne({
      roomId: room._id,
      userId: new Types.ObjectId(hostUserId),
      status: 'active',
    }).exec();

    if (!hostMembership) {
      return { success: false, error: 'HOST_NOT_ACTIVE_MEMBER' };
    }

    // 8. Server-side rate limit check (1 batch / 5s; max 60 / 10m per host)
    const rateLimitCheck = hostBatchInviteRateLimiter.checkLimit(hostUserId, uniqueRecipientIds.length);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: rateLimitCheck.error,
      };
    }

    // 9. Load accepted friendships in a single batch query
    const pairKeys = uniqueRecipientIds.map((targetId) => computePairKey(hostUserId, targetId));
    const friendships = await FriendshipModel.find({
      pairKey: { $in: pairKeys },
      status: 'accepted',
    })
      .select('pairKey')
      .lean()
      .exec();
    const acceptedPairKeySet = new Set(friendships.map((f) => f.pairKey));

    // 10. Load existing active room memberships in a single batch query
    const targetObjectIds = uniqueRecipientIds.map((id) => new Types.ObjectId(id));
    const activeMembers = await RoomMembershipModel.find({
      roomId: room._id,
      userId: { $in: targetObjectIds },
      status: 'active',
    })
      .select('userId')
      .lean()
      .exec();
    const activeMemberIdSet = new Set(activeMembers.map((m) => m.userId.toString()));

    // 11. Fetch inviter profile once for realtime notifications
    const inviter = await UserModel.findById(hostUserId).select('username displayName avatar').lean().exec();

    const io = getSocketServer();
    const results: BatchLoungeInviteResultItemDto[] = [];
    let sentCount = 0;

    for (const recipientId of uniqueRecipientIds) {
      const pairKey = computePairKey(hostUserId, recipientId);

      if (!acceptedPairKeySet.has(pairKey)) {
        results.push({
          friendUserId: recipientId,
          status: 'failed',
          error: 'NOT_FRIENDS',
        });
        continue;
      }

      if (activeMemberIdSet.has(recipientId)) {
        results.push({
          friendUserId: recipientId,
          status: 'failed',
          error: 'ALREADY_IN_ROOM',
        });
        continue;
      }

      // Create isolated recipient-bound invitation
      try {
        const createRes = await invitationService.createFriendInvitation(
          roomId,
          hostUserId,
          recipientId,
          48
        );

        if (createRes.success && createRes.data) {
          sentCount++;
          results.push({
            friendUserId: recipientId,
            status: 'sent',
            invitationId: createRes.data.id,
          });

          // Dispatch targeted realtime notification to online recipient only
          if (io) {
            const payload: FriendInvitationReceivedPayload = {
              invitationId: createRes.data.id,
              roomId,
              roomTitle: room.name,
              isPrivate: room.visibility === 'private',
              inviter: {
                id: hostUserId,
                username: inviter?.username || '',
                displayName: inviter?.displayName ?? null,
                avatar: inviter?.avatar ?? null,
              },
              sentAt: new Date().toISOString(),
            };
            emitFriendInvitationReceived(io, recipientId, payload);
          }
        } else {
          results.push({
            friendUserId: recipientId,
            status: 'failed',
            error: createRes.error || 'CREATION_FAILED',
          });
        }
      } catch {
        results.push({
          friendUserId: recipientId,
          status: 'failed',
          error: 'CREATION_FAILED',
        });
      }
    }

    // Record rate limit consumption only after batch execution
    hostBatchInviteRateLimiter.recordBatch(hostUserId, sentCount);

    return {
      success: true,
      data: {
        success: true,
        summary: {
          total: uniqueRecipientIds.length,
          sent: sentCount,
          failed: results.filter((r) => r.status === 'failed').length,
        },
        results,
        roomCurrentlyFull: room.currentParticipantsCount >= room.capacity,
      },
    };
  }
}

export const friendshipService = new FriendshipService();
