import { Router } from 'express';
import { friendshipController } from './friendship.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

export const friendshipRoutes = Router();

// Friendship list and live presence
friendshipRoutes.get('/', requireAuth, (req, res, next) => {
  friendshipController.getFriends(req, res, next);
});

// Incoming & Outgoing Friend Requests
friendshipRoutes.get('/requests/incoming', requireAuth, (req, res, next) => {
  friendshipController.getIncomingRequests(req, res, next);
});

friendshipRoutes.get('/requests/outgoing', requireAuth, (req, res, next) => {
  friendshipController.getOutgoingRequests(req, res, next);
});

// Send Friend Request
friendshipRoutes.post('/request', requireAuth, (req, res, next) => {
  friendshipController.sendRequest(req, res, next);
});

// Accept Friend Request
friendshipRoutes.post('/request/:id/accept', requireAuth, (req, res, next) => {
  friendshipController.acceptRequest(req, res, next);
});

// Decline Friend Request
friendshipRoutes.post('/request/:id/decline', requireAuth, (req, res, next) => {
  friendshipController.declineRequest(req, res, next);
});

// Cancel Outgoing Friend Request
friendshipRoutes.post('/request/:id/cancel', requireAuth, (req, res, next) => {
  friendshipController.cancelRequest(req, res, next);
});

// Remove Friend (Unfriend)
friendshipRoutes.delete('/:friendUserId', requireAuth, (req, res, next) => {
  friendshipController.removeFriend(req, res, next);
});

// Search Platform Users with Relationship Info
friendshipRoutes.get('/search', requireAuth, (req, res, next) => {
  friendshipController.searchUsers(req, res, next);
});

// Send Direct Room Invitation to Friend
friendshipRoutes.post('/rooms/:roomId/invite', requireAuth, (req, res, next) => {
  friendshipController.sendLoungeInvite(req, res, next);
});
