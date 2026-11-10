import { Router } from 'express';
import { karaokeController } from './karaoke.controller.js';
import { requireAuth, optionalAuth } from '../../middlewares/auth.middleware.js';

export const karaokeRoutes = Router();

// ==========================================
// SONG CATALOG
// ==========================================

// Search song catalog
karaokeRoutes.get('/songs/search', optionalAuth, (req, res, next) => {
  karaokeController.searchSongs(req, res, next);
});

// Get song details by ID
karaokeRoutes.get('/songs/:songId', optionalAuth, (req, res, next) => {
  karaokeController.getSongById(req, res, next);
});

// Resolve playable audio source for a song
karaokeRoutes.post('/songs/:songId/audio/resolve', optionalAuth, (req, res, next) => {
  karaokeController.resolveAudioSource(req, res, next);
});
karaokeRoutes.get('/songs/:songId/audio/resolve', optionalAuth, (req, res, next) => {
  karaokeController.resolveAudioSource(req, res, next);
});

// Stream audio content for a song
karaokeRoutes.get('/songs/:songId/audio/stream', (req, res, next) => {
  karaokeController.streamAudio(req, res, next);
});

// Get timed lyrics for a song
karaokeRoutes.get('/songs/:songId/lyrics', optionalAuth, (req, res, next) => {
  karaokeController.getLyrics(req, res, next);
});

// ==========================================
// ROOM QUEUE
// ==========================================

// Get room queue snapshot
karaokeRoutes.get('/rooms/:roomId/queue', optionalAuth, (req, res, next) => {
  karaokeController.getQueue(req, res, next);
});

// Add song to room queue
karaokeRoutes.post('/rooms/:roomId/queue', requireAuth, (req, res, next) => {
  karaokeController.addToQueue(req, res, next);
});

// Reorder room queue items (host only)
karaokeRoutes.post('/rooms/:roomId/queue/reorder', requireAuth, (req, res, next) => {
  karaokeController.reorderQueue(req, res, next);
});

// Remove song from room queue
karaokeRoutes.delete('/rooms/:roomId/queue/:itemId', requireAuth, (req, res, next) => {
  karaokeController.removeFromQueue(req, res, next);
});

// ==========================================
// ROOM PLAYBACK
// ==========================================

// Get room playback snapshot
karaokeRoutes.get('/rooms/:roomId/playback', optionalAuth, (req, res, next) => {
  karaokeController.getPlayback(req, res, next);
});

// Submit authoritative playback command (host / active singer)
karaokeRoutes.post('/rooms/:roomId/playback/command', requireAuth, (req, res, next) => {
  karaokeController.executePlaybackCommand(req, res, next);
});

// ==========================================
// CLOCK SYNCHRONIZATION
// ==========================================

// Lightweight server timestamp for NTP-style client offset estimation
karaokeRoutes.get('/time', (req, res) => {
  karaokeController.getServerTime(req, res);
});
