import { Router } from 'express';
import { voiceController } from './voice.controller.js';
import { voiceWebhookController } from './voice-webhook.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { VoiceTokenRequestSchema } from '@ktv/contracts';

export const voiceRoutes = Router();

// Authenticated voice token generation / renewal
voiceRoutes.post(
  '/rooms/:roomId/voice/token',
  requireAuth,
  validateBody(VoiceTokenRequestSchema),
  (req, res, next) => {
    voiceController.getVoiceToken(req, res, next);
  }
);

// LiveKit webhook endpoint
voiceRoutes.post('/webhooks/livekit', (req, res, next) => {
  voiceWebhookController.handleWebhook(req, res, next);
});
