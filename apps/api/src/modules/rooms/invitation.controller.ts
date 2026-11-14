import { Request, Response, NextFunction } from 'express';
import { invitationService } from './invitation.service.js';
import { roomService } from './room.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class InvitationController {
  async createInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { id: roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const expiresInHours = req.body?.expiresInHours;
      const result = await invitationService.createInvitation(roomId, req.user.id, expiresInHours);

      if (!result.success || !result.data) {
        switch (result.error) {
          case 'ROOM_NOT_FOUND':
            sendError(res, 'Room not found', 404);
            return;
          case 'FORBIDDEN_NOT_HOST':
            sendError(res, 'Only the room host can create invitation links', 403);
            return;
          case 'ROOM_CLOSED':
            sendError(res, 'Cannot create invitation for a closed room', 400);
            return;
          default:
            sendError(res, 'Failed to create invitation', 400);
            return;
        }
      }

      sendSuccess(res, result.data, 'Invitation link created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getActiveInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { id: roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const result = await invitationService.getActiveInvitation(roomId, req.user.id);
      if (!result.success) {
        switch (result.error) {
          case 'ROOM_NOT_FOUND':
            sendError(res, 'Room not found', 404);
            return;
          case 'FORBIDDEN_NOT_HOST':
            sendError(res, 'Only the room host can view invitation status', 403);
            return;
          default:
            sendError(res, 'Failed to retrieve invitation', 400);
            return;
        }
      }

      sendSuccess(res, result.data, 'Active invitation retrieved');
    } catch (error) {
      next(error);
    }
  }

  async revokeInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const { id: roomId } = req.params;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const result = await invitationService.revokeInvitation(roomId, req.user.id);
      if (!result.success) {
        switch (result.error) {
          case 'ROOM_NOT_FOUND':
            sendError(res, 'Room not found', 404);
            return;
          case 'FORBIDDEN_NOT_HOST':
            sendError(res, 'Only the room host can revoke invitation links', 403);
            return;
          default:
            sendError(res, 'Failed to revoke invitation', 400);
            return;
        }
      }

      sendSuccess(res, null, 'Invitation link revoked successfully');
    } catch (error) {
      next(error);
    }
  }

  async previewInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      if (!token) {
        sendError(res, 'Invitation token is required', 400);
        return;
      }

      const requestingUserId = req.user?.id;
      const result = await invitationService.previewInvitation(token, requestingUserId);

      if (!result.success || !result.data) {
        sendError(res, 'Invalid invitation token', 400);
        return;
      }

      sendSuccess(res, result.data, 'Invitation preview retrieved');
    } catch (error) {
      next(error);
    }
  }

  async joinViaInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'Authentication required to join lounge', 401);
        return;
      }

      const { token } = req.params;
      if (!token) {
        sendError(res, 'Invitation token is required', 400);
        return;
      }

      const resolveResult = await invitationService.resolveInvitationRoomId(token);
      if (!resolveResult.success || !resolveResult.roomId) {
        switch (resolveResult.error) {
          case 'INVITATION_INVALID':
            sendError(res, 'Invitation link is invalid', 403);
            return;
          case 'INVITATION_EXPIRED':
            sendError(res, 'Invitation link has expired', 410);
            return;
          case 'INVITATION_REVOKED':
            sendError(res, 'Invitation link has been revoked by host', 410);
            return;
          default:
            sendError(res, 'Invalid invitation token', 400);
            return;
        }
      }

      const roomId = resolveResult.roomId;
      const joinResult = await roomService.joinRoom(roomId, req.user.id, token);

      if (!joinResult.success) {
        switch (joinResult.error) {
          case 'ROOM_NOT_FOUND':
            sendError(res, 'Room not found', 404);
            return;
          case 'ROOM_CLOSED':
            sendError(res, 'Cannot join closed room', 400);
            return;
          case 'ROOM_FULL':
            sendError(res, 'Room has reached maximum capacity', 409);
            return;
          case 'ROOM_LOCKED':
            sendError(res, 'Room is locked by host', 403);
            return;
          case 'PRIVATE_ROOM':
            sendError(res, 'Cannot join private room without direct invitation', 403);
            return;
          case 'INVITATION_EXPIRED':
            sendError(res, 'Invitation link has expired', 410);
            return;
          case 'INVITATION_REVOKED':
            sendError(res, 'Invitation link has been revoked by host', 410);
            return;
          case 'FORBIDDEN_KICKED':
            sendError(res, 'You were removed from this room by the host and cannot rejoin', 403);
            return;
          default:
            sendError(res, 'Failed to join room', 400);
            return;
        }
      }

      const message = joinResult.alreadyJoined
        ? 'Already an active member of this room'
        : 'Joined room successfully';

      sendSuccess(
        res,
        joinResult.membership.toJSON(),
        message,
        joinResult.alreadyJoined ? 200 : 201
      );
    } catch (error) {
      next(error);
    }
  }
}

export const invitationController = new InvitationController();
