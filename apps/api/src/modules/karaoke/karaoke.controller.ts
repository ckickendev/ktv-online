import { Request, Response, NextFunction } from 'express';
import {
  AddQueueItemDtoSchema,
  PlaybackCommandDtoSchema,
  ReorderQueueDtoSchema,
  SongSearchQuerySchema,
} from '@ktv/contracts';
import { songService } from './song.service.js';
import { karaokeService } from './karaoke.service.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import {
  broadcastKaraokePlaybackUpdated,
  broadcastKaraokeQueueUpdated,
} from '../../realtime/karaoke.events.js';
import { sendError } from '../../utils/response.js';
import { UnsupportedTopologyError } from '../../database/transaction.js';
import { audioSourceService } from './audio-source.service.js';
import { lyricsService } from './lyrics.service.js';

export class KaraokeController {
  /**
   * GET /api/v1/songs/search
   */
  public async searchSongs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = SongSearchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(res, parsed.error.issues[0]?.message || 'Invalid search query', 400);
        return;
      }

      const results = await songService.searchSongs(parsed.data);
      res.status(200).json(results);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/rooms/:roomId/queue
   */
  public async getQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const queue = await karaokeService.getQueueSnapshot(roomId);
      res.status(200).json(queue);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'INVALID_ROOM_ID') {
        sendError(res, 'Invalid room ID format', 400);
        return;
      }
      next(err);
    }
  }

  /**
   * POST /api/v1/rooms/:roomId/queue
   */
  public async addToQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const user = req.user;
      if (!user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const parsed = AddQueueItemDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, parsed.error.issues[0]?.message || 'Invalid queue request', 400);
        return;
      }

      const result = await karaokeService.addToQueue(roomId, user.id, parsed.data);

      // Broadcast changes via Socket.IO
      const io = getSocketServer();
      if (io) {
        broadcastKaraokeQueueUpdated(io, roomId, result.queue, 'added', result.addedItem.id);
        broadcastKaraokePlaybackUpdated(io, roomId, result.playback);
      }

      res.status(201).json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'FORBIDDEN_NOT_MEMBER') {
        sendError(res, 'You must be an active room member to queue songs', 403);
        return;
      }
      if (msg === 'FORBIDDEN_ROOM_CLOSED') {
        sendError(res, 'Room is closed', 400);
        return;
      }
      if (msg === 'SONG_NOT_FOUND') {
        sendError(res, 'Song not found in catalog', 404);
        return;
      }
      if (msg === 'SONG_NOT_PLAYABLE' || msg === 'SONG_AUDIO_UNAVAILABLE') {
        sendError(
          res,
          'This song does not have an approved karaoke audio track and cannot be queued for playback.',
          400
        );
        return;
      }
      if (msg === 'MAX_QUEUE_SIZE_EXCEEDED') {
        sendError(res, 'Room queue capacity reached (maximum 50 songs)', 400);
        return;
      }
      next(err);
    }
  }

  /**
   * DELETE /api/v1/rooms/:roomId/queue/:itemId
   */
  public async removeFromQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId;
      const itemId = req.params.itemId;
      if (!roomId || !itemId) {
        sendError(res, 'Room ID and Item ID are required', 400);
        return;
      }

      const user = req.user;
      if (!user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const result = await karaokeService.removeFromQueue(roomId, user.id, itemId);

      const io = getSocketServer();
      if (io) {
        broadcastKaraokeQueueUpdated(io, roomId, result.queue, 'removed', itemId);
        broadcastKaraokePlaybackUpdated(io, roomId, result.playback);
      }

      res.status(200).json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'QUEUE_ITEM_NOT_FOUND') {
        sendError(res, 'Queue item not found', 404);
        return;
      }
      if (msg === 'FORBIDDEN_UNAUTHORIZED_REMOVE') {
        sendError(res, 'You can only remove your own songs unless you are the room host', 403);
        return;
      }
      if (msg === 'FORBIDDEN_NOT_MEMBER') {
        sendError(res, 'You must be an active room member', 403);
        return;
      }
      next(err);
    }
  }

  /**
   * POST /api/v1/rooms/:roomId/queue/reorder
   */
  public async reorderQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const user = req.user;
      if (!user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const parsed = ReorderQueueDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, parsed.error.issues[0]?.message || 'Invalid reorder payload', 400);
        return;
      }

      const updatedQueue = await karaokeService.reorderQueue(roomId, user.id, parsed.data);

      const io = getSocketServer();
      if (io) {
        broadcastKaraokeQueueUpdated(io, roomId, updatedQueue, 'reordered');
      }

      res.status(200).json(updatedQueue);
    } catch (err: unknown) {
      if (err instanceof UnsupportedTopologyError) {
        sendError(res, err.message, 501);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNSUPPORTED_TOPOLOGY')) {
        sendError(res, msg, 501);
        return;
      }
      if (msg === 'FORBIDDEN_HOST_ONLY') {
        sendError(res, 'Only the room host can reorder the song queue', 403);
        return;
      }
      if (msg === 'STALE_QUEUE_VERSION') {
        sendError(res, 'Queue state was modified concurrently. Please refresh.', 409);
        return;
      }
      if (msg === 'INVALID_REORDER_ITEM_COUNT') {
        sendError(res, 'Reorder payload must account for all active queued items without duplicates', 400);
        return;
      }
      if (msg === 'INVALID_REORDER_ITEM_ID') {
        sendError(res, 'One or more song IDs in reorder payload are invalid or not currently queued', 400);
        return;
      }
      next(err);
    }
  }

  /**
   * GET /api/v1/rooms/:roomId/playback
   */
  public async getPlayback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const playback = await karaokeService.getPlaybackSnapshot(roomId);
      res.status(200).json(playback);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'INVALID_ROOM_ID') {
        sendError(res, 'Invalid room ID format', 400);
        return;
      }
      next(err);
    }
  }

  /**
   * POST /api/v1/rooms/:roomId/playback/command
   */
  public async executePlaybackCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = req.params.roomId;
      if (!roomId) {
        sendError(res, 'Room ID is required', 400);
        return;
      }

      const user = req.user;
      if (!user) {
        sendError(res, 'Authentication required', 401);
        return;
      }

      const parsed = PlaybackCommandDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, parsed.error.issues[0]?.message || 'Invalid playback command', 400);
        return;
      }

      const result = await karaokeService.executePlaybackCommand(roomId, user.id, parsed.data);

      const io = getSocketServer();
      if (io) {
        broadcastKaraokePlaybackUpdated(io, roomId, result.playback, parsed.data.command, user.id);
        broadcastKaraokeQueueUpdated(io, roomId, result.queue, 'status_changed');
      }

      res.status(200).json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'FORBIDDEN_PLAYBACK_CONTROL') {
        sendError(res, 'Only the host or current active singer can control playback', 403);
        return;
      }
      if (msg === 'STALE_PLAYBACK_VERSION') {
        sendError(res, 'Playback state was modified concurrently. Please refresh.', 409);
        return;
      }
      if (msg === 'FORBIDDEN_NOT_MEMBER') {
        sendError(res, 'You must be an active room member', 403);
        return;
      }
      if (msg === 'FORBIDDEN_ROOM_CLOSED') {
        sendError(res, 'Room is closed', 400);
        return;
      }
      if (msg === 'SONG_AUDIO_UNAVAILABLE') {
        res.status(400).json({ code: 'SONG_AUDIO_UNAVAILABLE', message: 'Audio stream is unavailable for this song' });
        return;
      }
      next(err);
    }
  }

  /**
   * GET /api/v1/songs/:songId
   */
  public async getSongById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const songId = req.params.songId;
      if (!songId) {
        sendError(res, 'Song ID is required', 400);
        return;
      }

      const song = await songService.getSongById(songId);
      if (!song) {
        sendError(res, 'Song not found', 404);
        return;
      }

      res.status(200).json(song);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/songs/:songId/audio/resolve
   * GET /api/v1/songs/:songId/audio/resolve
   */
  public async resolveAudioSource(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const songId = req.params.songId;
      if (!songId) {
        sendError(res, 'Song ID is required', 400);
        return;
      }

      const baseUrl = `${req.protocol}://${req.get('host') || ''}`;
      const audioSource = await audioSourceService.resolveAudioSource(songId, baseUrl);
      res.status(200).json(audioSource);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SONG_NOT_FOUND') {
        sendError(res, 'Song not found', 404);
        return;
      }
      if (msg === 'SONG_AUDIO_UNAVAILABLE') {
        res.status(400).json({ code: 'SONG_AUDIO_UNAVAILABLE', message: 'Audio stream is unavailable for this song' });
        return;
      }
      next(err);
    }
  }

  /**
   * GET /api/v1/songs/:songId/audio/stream
   */
  public async streamAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const songId = req.params.songId;
      if (!songId) {
        sendError(res, 'Song ID is required', 400);
        return;
      }

      await audioSourceService.streamAudio(songId, req, res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/songs/:songId/lyrics
   */
  public async getLyrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const songId = req.params.songId;
      if (!songId) {
        sendError(res, 'Song ID is required', 400);
        return;
      }

      const lyrics = await lyricsService.getLyrics(songId);
      res.status(200).json(lyrics);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'SONG_NOT_FOUND') {
        sendError(res, 'Song not found', 404);
        return;
      }
      next(err);
    }
  }

  /**
   * GET /api/v1/time
   * Lightweight server timestamp endpoint for client NTP-style clock offset estimation.
   */
  public getServerTime(_req: Request, res: Response): void {
    const now = Date.now();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Date', new Date(now).toUTCString());
    res.status(200).json({
      serverTime: now,
      serverIso: new Date(now).toISOString(),
    });
  }
}

export const karaokeController = new KaraokeController();
