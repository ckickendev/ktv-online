import { Router } from 'express';
import { karaokeHistoryController } from './history.controller.js';
import { requireAuth, optionalAuth } from '../../middlewares/auth.middleware.js';

export const historyRoutes = Router();

// Current user history & personal statistics
historyRoutes.get('/my-songs', requireAuth, (req, res, next) => {
  karaokeHistoryController.getMySongs(req, res, next);
});

historyRoutes.get('/my-sessions', requireAuth, (req, res, next) => {
  karaokeHistoryController.getMySessions(req, res, next);
});

historyRoutes.get('/my-stats', requireAuth, (req, res, next) => {
  karaokeHistoryController.getMyStats(req, res, next);
});

// Session recap (supports public & private lounges with attendance check)
historyRoutes.get('/sessions/:sessionId', optionalAuth, (req, res, next) => {
  karaokeHistoryController.getSessionRecap(req, res, next);
});
