import { Router } from 'express';
import { chatController } from './chat.controller.js';
import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware.js';

export const chatRoutes = Router();

// Retrieve message history with cursor-based pagination
chatRoutes.get('/rooms/:roomId/messages', optionalAuth, (req, res, next) => {
  chatController.getMessages(req, res, next);
});

// Host deletes a message
chatRoutes.delete('/rooms/:roomId/messages/:messageId', requireAuth, (req, res, next) => {
  chatController.deleteMessage(req, res, next);
});

// Retrieve room activities timeline
chatRoutes.get('/rooms/:roomId/activities', optionalAuth, (req, res, next) => {
  chatController.getActivities(req, res, next);
});
