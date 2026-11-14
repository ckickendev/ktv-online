import { Router } from 'express';
import { roomController } from './room.controller.js';
import { invitationController } from './invitation.controller.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { requireAuth, optionalAuth, requireRole } from '../../middlewares/auth.middleware.js';
import {
  CreateRoomSchema,
  RoomQuerySchema,
  UpdateRoomSchema,
  UpdateMemberRoleSchema,
  MuteMemberSchema,
  TransferHostSchema,
  LockRoomSchema,
  CreateInvitationSchema,
  JoinRoomWithInviteSchema,
} from './room.validation.js';

export const roomRoutes = Router();

roomRoutes.get('/', validateQuery(RoomQuerySchema), (req, res, next) => {
  roomController.getRooms(req, res, next);
});

// Protected administrative endpoint for room invariant reconciliation
roomRoutes.post('/reconcile', requireAuth, requireRole('admin'), (req, res, next) => {
  roomController.reconcileRooms(req, res, next);
});

// Protected: list rooms owned by current user (must be declared before /:id)
roomRoutes.get('/my-rooms', requireAuth, (req, res, next) => {
  roomController.getMyRooms(req, res, next);
});

// Protected: list rooms joined by current user (must be declared before /:id)
roomRoutes.get('/joined-rooms', requireAuth, (req, res, next) => {
  roomController.getJoinedRooms(req, res, next);
});

roomRoutes.get('/:id', optionalAuth, (req, res, next) => {
  roomController.getRoomById(req, res, next);
});

roomRoutes.get('/:id/state', optionalAuth, (req, res, next) => {
  roomController.getRoomState(req, res, next);
});

roomRoutes.get('/:id/version', optionalAuth, (req, res, next) => {
  roomController.getRoomVersion(req, res, next);
});

roomRoutes.get('/:id/members', optionalAuth, (req, res, next) => {
  roomController.getMembers(req, res, next);
});

roomRoutes.get('/:id/membership', requireAuth, (req, res, next) => {
  roomController.getMyMembership(req, res, next);
});

// Protected room management endpoints
roomRoutes.post('/', requireAuth, validateBody(CreateRoomSchema), (req, res, next) => {
  roomController.createRoom(req, res, next);
});

roomRoutes.patch('/:id', requireAuth, validateBody(UpdateRoomSchema), (req, res, next) => {
  roomController.updateRoom(req, res, next);
});

roomRoutes.post('/:id/close', requireAuth, (req, res, next) => {
  roomController.closeRoom(req, res, next);
});

// Room invitation management (host only)
roomRoutes.post(
  '/:id/invitations',
  requireAuth,
  validateBody(CreateInvitationSchema),
  (req, res, next) => {
    invitationController.createInvitation(req, res, next);
  }
);

roomRoutes.get('/:id/invitations', requireAuth, (req, res, next) => {
  invitationController.getActiveInvitation(req, res, next);
});

roomRoutes.post('/:id/invitations/revoke', requireAuth, (req, res, next) => {
  invitationController.revokeInvitation(req, res, next);
});

roomRoutes.delete('/:id/invitations', requireAuth, (req, res, next) => {
  invitationController.revokeInvitation(req, res, next);
});

roomRoutes.post(
  '/:id/join',
  requireAuth,
  validateBody(JoinRoomWithInviteSchema),
  (req, res, next) => {
    roomController.joinRoom(req, res, next);
  }
);

roomRoutes.post('/:id/leave', requireAuth, (req, res, next) => {
  roomController.leaveRoom(req, res, next);
});

roomRoutes.post('/:id/members/:userId/kick', requireAuth, (req, res, next) => {
  roomController.kickMember(req, res, next);
});

roomRoutes.post(
  '/:id/members/:userId/role',
  requireAuth,
  validateBody(UpdateMemberRoleSchema),
  (req, res, next) => {
    roomController.updateMemberRole(req, res, next);
  }
);

roomRoutes.post(
  '/:id/members/:userId/mute',
  requireAuth,
  validateBody(MuteMemberSchema),
  (req, res, next) => {
    roomController.muteMember(req, res, next);
  }
);

roomRoutes.post(
  '/:id/transfer-host',
  requireAuth,
  validateBody(TransferHostSchema),
  (req, res, next) => {
    roomController.transferHost(req, res, next);
  }
);

roomRoutes.post(
  '/:id/lock',
  requireAuth,
  validateBody(LockRoomSchema),
  (req, res, next) => {
    roomController.setRoomLock(req, res, next);
  }
);

roomRoutes.post('/:id/members/:userId/reinstate', requireAuth, (req, res, next) => {
  roomController.reinstateMember(req, res, next);
});


