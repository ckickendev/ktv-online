import { Router } from 'express';
import { invitationController } from './invitation.controller.js';
import { requireAuth, optionalAuth } from '../../middlewares/auth.middleware.js';
import { invitationPreviewRateLimiter } from '../../middlewares/rate-limiter.middleware.js';

export const invitationRoutes = Router();

// Public / rate-limited invitation preview
invitationRoutes.get('/:token', invitationPreviewRateLimiter, optionalAuth, (req, res, next) => {
  invitationController.previewInvitation(req, res, next);
});

// Authenticated join via invitation token
invitationRoutes.post('/:token/join', requireAuth, (req, res, next) => {
  invitationController.joinViaInvitation(req, res, next);
});
