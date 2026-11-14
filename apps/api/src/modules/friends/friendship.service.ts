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
} from '@ktv/contracts';
import { FriendshipModel, computePairKey } from './friendship.model.js';
import { UserModel } from '../users/user.model.js';
import { RoomModel } from '../rooms/room.model.js';
import { invitationService } from '../rooms/invitation.service.js';
import { globalPresenceManager } from '../../realtime/global-presence.manager.js';
import {
  emitFriendRequestReceived,
  emitFriendRequestAccepted,
  emitFriendInvitationReceived,
} from '../../realtime/friend.events.js';
import { getSocketServer } from '../../realtime/socket.server.js';

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

    // Create new pending friendship
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
  }

  /**
   * Accept an incoming friend request.
   */
  async acceptRequest(
    userId: string,
    requestId: string
  ): Promise<{ success: boolean; data?: FriendshipDto; error?: string }> {
    if (!Types.ObjectId.isValid(requestId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const friendship = await FriendshipModel.findById(requestId)
      .populate('requesterId', 'username displayName avatar bio preferences')
      .populate('addresseeId', 'username displayName avatar bio preferences')
      .exec();

    if (!friendship) {
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }

    if (friendship.status !== 'pending') {
      return { success: false, error: 'REQUEST_NOT_PENDING' };
    }

    if (friendship.addresseeId._id.toString() !== userId) {
      return { success: false, error: 'FORBIDDEN_NOT_ADDRESSEE' };
    }

    friendship.status = 'accepted';
    await friendship.save();

    const requesterUser: any = friendship.requesterId;
    const addresseeUser: any = friendship.addresseeId;

    // Realtime notification to requester
    const io = getSocketServer();
    emitFriendRequestAccepted(io, requesterUser._id.toString(), {
      friendshipId: friendship._id.toString(),
      friend: this.formatUserDto(addresseeUser),
      acceptedAt: new Date().toISOString(),
    });

    // Compute requester presence for the accepting user
    const friendPresence = await globalPresenceManager.getUserPresence(
      requesterUser._id.toString(),
      userId
    );

    const friendshipDto: FriendshipDto = {
      id: friendship._id.toString(),
      friend: {
        ...this.formatUserDto(requesterUser),
        presence: friendPresence,
      },
      status: 'accepted',
      createdAt: friendship.createdAt.toISOString(),
      updatedAt: friendship.updatedAt.toISOString(),
    };

    return { success: true, data: friendshipDto };
  }

  /**
   * Decline an incoming friend request.
   */
  async declineRequest(
    userId: string,
    requestId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(requestId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const friendship = await FriendshipModel.findById(requestId).exec();
    if (!friendship) {
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }

    if (friendship.status !== 'pending') {
      return { success: false, error: 'REQUEST_NOT_PENDING' };
    }

    if (friendship.addresseeId.toString() !== userId) {
      return { success: false, error: 'FORBIDDEN_NOT_ADDRESSEE' };
    }

    friendship.status = 'declined';
    await friendship.save();

    return { success: true };
  }

  /**
   * Cancel an outgoing pending request.
   */
  async cancelRequest(
    userId: string,
    requestId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(requestId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const friendship = await FriendshipModel.findById(requestId).exec();
    if (!friendship) {
      return { success: false, error: 'REQUEST_NOT_FOUND' };
    }

    if (friendship.status !== 'pending') {
      return { success: false, error: 'REQUEST_NOT_PENDING' };
    }

    if (friendship.requesterId.toString() !== userId) {
      return { success: false, error: 'FORBIDDEN_NOT_REQUESTER' };
    }

    await FriendshipModel.findByIdAndDelete(requestId).exec();
    return { success: true };
  }

  /**
   * Remove a friend.
   */
  async removeFriend(
    userId: string,
    friendUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!Types.ObjectId.isValid(friendUserId)) {
      return { success: false, error: 'INVALID_ID' };
    }

    const pairKey = computePairKey(userId, friendUserId);
    const friendship = await FriendshipModel.findOne({ pairKey, status: 'accepted' }).exec();

    if (!friendship) {
      return { success: false, error: 'FRIENDSHIP_NOT_FOUND' };
    }

    await FriendshipModel.findByIdAndDelete(friendship._id).exec();
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

    // Verify friendship
    const pairKey = computePairKey(userId, friendUserId);
    const friendship = await FriendshipModel.findOne({ pairKey, status: 'accepted' }).exec();
    if (!friendship) {
      return { success: false, error: 'NOT_FRIENDS' };
    }

    const room = await RoomModel.findById(roomId).exec();
    if (!room || room.status === 'closed') {
      return { success: false, error: 'ROOM_UNAVAILABLE' };
    }

    const inviter = await UserModel.findById(userId).select('username displayName avatar').exec();
    if (!inviter) {
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    // Generate or refresh active invitation token
    const createRes = await invitationService.createInvitation(roomId, room.ownerId.toString(), 48);
    if (!createRes.success || !createRes.data) {
      return { success: false, error: 'INVITATION_GENERATION_FAILED' };
    }
    const inviteToken = createRes.data.token;

    const io = getSocketServer();
    const payload: FriendInvitationReceivedPayload = {
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
}

export const friendshipService = new FriendshipService();
