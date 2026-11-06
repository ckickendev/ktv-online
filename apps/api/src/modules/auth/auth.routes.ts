import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { LoginSchema, RefreshTokenSchema } from './auth.validation.js';

export const authRoutes = Router();

authRoutes.post('/login', validateBody(LoginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

authRoutes.post('/refresh', validateBody(RefreshTokenSchema), (req, res, next) => {
  authController.refresh(req, res, next);
});
