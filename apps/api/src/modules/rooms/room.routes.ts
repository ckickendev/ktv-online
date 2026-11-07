import { Router } from 'express';
import { roomController } from './room.controller.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { requireAuth, optionalAuth } from '../../middlewares/auth.middleware.js';
import { CreateRoomSchema, RoomQuerySchema, UpdateRoomSchema } from './room.validation.js';

export const roomRoutes = Router();

roomRoutes.get('/', validateQuery(RoomQuerySchema), (req, res, next) => {
  roomController.getRooms(req, res, next);
});

// Protected: list rooms owned by current user (must be declared before /:id)
roomRoutes.get('/my-rooms', requireAuth, (req, res, next) => {
  roomController.getMyRooms(req, res, next);
});

// Protected: list rooms joined by current user (must be declared before /:id)
roomRoutes.get('/joined-rooms', requireAuth, (req, res, next) => {
  roomController.getJoinedRooms(req, res, next);
});

roomRoutes.get('/:id', (req, res, next) => {
  roomController.getRoomById(req, res, next);
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

roomRoutes.post('/:id/join', requireAuth, (req, res, next) => {
  roomController.joinRoom(req, res, next);
});

roomRoutes.post('/:id/leave', requireAuth, (req, res, next) => {
  roomController.leaveRoom(req, res, next);
});
