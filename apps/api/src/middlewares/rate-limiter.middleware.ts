import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response.js';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 'Too many requests from this IP, please try again later', 429);
  },
});

export const invitationPreviewRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 invitation preview lookups per 15 min window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 'Too many invitation preview requests, please try again later', 429);
  },
});

export function createVoiceTokenRateLimiter(max = 30, windowMs = 60 * 1000) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip || 'anonymous'),
    validate: false,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 'Too many voice token requests, please try again shortly', 429);
    },
  });
}

export const voiceTokenRateLimiter = createVoiceTokenRateLimiter();
