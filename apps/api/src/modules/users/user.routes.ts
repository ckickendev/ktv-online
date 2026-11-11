import { Router } from 'express';
import { userController } from './user.controller.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware.js';
import { CreateUserSchema } from './user.validation.js';
import { UpdateUserPreferencesSchema, UpdateProfileSchema } from '@ktv/contracts';

export const userRoutes = Router();

userRoutes.post('/register', validateBody(CreateUserSchema), (req, res, next) => {
  userController.register(req, res, next);
});

userRoutes.patch('/me', requireAuth, validateBody(UpdateProfileSchema), (req, res, next) => {
  userController.updateProfile(req, res, next);
});

userRoutes.get('/me/preferences', requireAuth, (req, res, next) => {
  userController.getPreferences(req, res, next);
});

userRoutes.patch(
  '/me/preferences',
  requireAuth,
  validateBody(UpdateUserPreferencesSchema),
  (req, res, next) => {
    userController.updatePreferences(req, res, next);
  }
);

userRoutes.get('/:id', optionalAuth, (req, res, next) => {
  userController.getProfile(req, res, next);
});
