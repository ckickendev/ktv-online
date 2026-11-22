import { Router } from 'express';
import { micController } from './mic.controller.js';
import { optionalAuth } from '../../middlewares/auth.middleware.js';

export const micRoutes = Router();

/**
 * Authoritative Virtual Microphone Ownership snapshot read endpoint.
 * Mutations execute over Socket.IO in S3.3+.
 */
micRoutes.get('/rooms/:roomId/mic', optionalAuth, (req, res, next) => {
  micController.getMicSnapshot(req, res, next);
});
