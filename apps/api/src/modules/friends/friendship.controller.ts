import { Request, Response, NextFunction } from 'express';
import {
  SendFriendRequestSchema,
  FriendQuerySchema,
  FriendRequestQuerySchema,
  UserSearchQuerySchema,
  SendLoungeInviteToFriendSchema,
} from '@ktv/contracts';
import { friendshipService } from './friendship.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class FriendshipController {
  async sendRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const body = SendFriendRequestSchema.parse(req.body);
      const result = await friendshipService.sendRequest(req.user.id, body.targetUserId);

      if (!result.success || !result.data) {
        switch (result.error) {
          case 'CANNOT_FRIEND_SELF':
            sendError(res, 'You cannot send a friend request to yourself', 400);
            return;
          case 'TARGET_USER_NOT_FOUND':
            sendError(res, 'Target user does not exist or is inactive', 404);
            return;
          case 'ALREADY_FRIENDS':
            sendError(res, 'You are already friends with this user', 400);
            return;
          case 'REQUEST_ALREADY_SENT':
            sendError(res, 'Friend request already sent', 400);
            return;
          case 'USER_BLOCKED':
            sendError(res, 'Cannot send friend request to this user', 403);
            return;
          default:
            sendError(res, 'Failed to send friend request', 400);
            return;
        }
      }

      sendSuccess(res, result.data, 'Friend request processed successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async acceptRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { id } = req.params;
      if (!id) {
        sendError(res, 'Request ID is required', 400);
        return;
      }
      const result = await friendshipService.acceptRequest(req.user.id, id);

      if (!result.success || !result.data) {
        switch (result.error) {
          case 'REQUEST_NOT_FOUND':
            sendError(res, 'Friend request not found', 404);
            return;
          case 'REQUEST_NOT_PENDING':
            sendError(res, 'Friend request is not pending', 400);
            return;
          case 'FORBIDDEN_NOT_ADDRESSEE':
            sendError(res, 'You cannot accept a friend request that was not addressed to you', 403);
            return;
          default:
            sendError(res, 'Failed to accept friend request', 400);
            return;
        }
      }

      sendSuccess(res, result.data, 'Friend request accepted successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async declineRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { id } = req.params;
      if (!id) {
        sendError(res, 'Request ID is required', 400);
        return;
      }
      const result = await friendshipService.declineRequest(req.user.id, id);

      if (!result.success) {
        switch (result.error) {
          case 'REQUEST_NOT_FOUND':
            sendError(res, 'Friend request not found', 404);
            return;
          case 'FORBIDDEN_NOT_ADDRESSEE':
            sendError(res, 'You cannot decline a friend request that was not addressed to you', 403);
            return;
          default:
            sendError(res, 'Failed to decline friend request', 400);
            return;
        }
      }

      sendSuccess(res, { success: true }, 'Friend request declined', 200);
    } catch (error) {
      next(error);
    }
  }

  async cancelRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { id } = req.params;
      if (!id) {
        sendError(res, 'Request ID is required', 400);
        return;
      }
      const result = await friendshipService.cancelRequest(req.user.id, id);

      if (!result.success) {
        switch (result.error) {
          case 'REQUEST_NOT_FOUND':
            sendError(res, 'Friend request not found', 404);
            return;
          case 'FORBIDDEN_NOT_REQUESTER':
            sendError(res, 'You can only cancel your own outgoing requests', 403);
            return;
          default:
            sendError(res, 'Failed to cancel friend request', 400);
            return;
        }
      }

      sendSuccess(res, { success: true }, 'Friend request cancelled', 200);
    } catch (error) {
      next(error);
    }
  }

  async removeFriend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { friendUserId } = req.params;
      if (!friendUserId) {
        sendError(res, 'Friend user ID is required', 400);
        return;
      }
      const result = await friendshipService.removeFriend(req.user.id, friendUserId);

      if (!result.success) {
        switch (result.error) {
          case 'FRIENDSHIP_NOT_FOUND':
            sendError(res, 'Friendship not found', 404);
            return;
          default:
            sendError(res, 'Failed to remove friend', 400);
            return;
        }
      }

      sendSuccess(res, { success: true }, 'Friend removed successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  async getFriends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const query = FriendQuerySchema.parse(req.query);
      const data = await friendshipService.getFriends(req.user.id, query);

      sendSuccess(res, data, 'Friends retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getIncomingRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const query = FriendRequestQuerySchema.parse(req.query);
      const data = await friendshipService.getIncomingRequests(req.user.id, query);

      sendSuccess(res, data, 'Incoming friend requests retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getOutgoingRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const query = FriendRequestQuerySchema.parse(req.query);
      const data = await friendshipService.getOutgoingRequests(req.user.id, query);

      sendSuccess(res, data, 'Outgoing friend requests retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const query = UserSearchQuerySchema.parse(req.query);
      const data = await friendshipService.searchUsers(req.user.id, query);

      sendSuccess(res, data, 'Users searched successfully');
    } catch (error) {
      next(error);
    }
  }

  async sendLoungeInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }
      const body = SendLoungeInviteToFriendSchema.parse(req.body);

      const result = await friendshipService.sendLoungeInviteToFriend(
        req.user.id,
        roomId,
        body.friendUserId
      );

      if (!result.success) {
        switch (result.error) {
          case 'NOT_FRIENDS':
            sendError(res, 'You can only send direct lounge invites to friends', 403);
            return;
          case 'ROOM_UNAVAILABLE':
            sendError(res, 'Room is closed or unavailable', 404);
            return;
          default:
            sendError(res, 'Failed to send lounge invitation', 400);
            return;
        }
      }

      sendSuccess(res, { success: true }, 'Lounge invite sent to friend successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const friendshipController = new FriendshipController();
