import { Router } from 'express';
import { roomController } from './room.controller.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { CreateRoomSchema, RoomQuerySchema } from './room.validation.js';

export const roomRoutes = Router();

roomRoutes.get('/', validateQuery(RoomQuerySchema), (req, res, next) => {
  roomController.getRooms(req, res, next);
});

roomRoutes.get('/:id', (req, res, next) => {
  roomController.getRoomById(req, res, next);
});

roomRoutes.post('/', validateBody(CreateRoomSchema), (req, res, next) => {
  roomController.createRoom(req, res, next);
});
