import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { LoginSchema, RefreshTokenSchema } from './auth.validation.js';

import { userController } from '../users/user.controller.js';
import { CreateUserSchema } from '../users/user.validation.js';

export const authRoutes = Router();

authRoutes.post('/register', validateBody(CreateUserSchema), (req, res, next) => {
  userController.register(req, res, next);
});

authRoutes.post('/login', validateBody(LoginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

authRoutes.post('/refresh', validateBody(RefreshTokenSchema), (req, res, next) => {
  authController.refresh(req, res, next);
});

authRoutes.post('/logout', (req, res, next) => {
  authController.logout(req, res, next);
});

authRoutes.get('/me', requireAuth, (req, res) => {
  authController.me(req, res);
});
