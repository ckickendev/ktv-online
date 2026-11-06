import { Router } from 'express';
import { userController } from './user.controller.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { CreateUserSchema } from './user.validation.js';

export const userRoutes = Router();

userRoutes.post('/register', validateBody(CreateUserSchema), (req, res, next) => {
  userController.register(req, res, next);
});

userRoutes.get('/:id', (req, res, next) => {
  userController.getProfile(req, res, next);
});
