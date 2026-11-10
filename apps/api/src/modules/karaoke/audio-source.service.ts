import { Response, Request } from 'express';
import { ResolvedAudioSourceDto } from '@ktv/contracts';
import { SongModel } from './song.model.js';
import { IKaraokeAudioSourceProvider } from './audio-source.types.js';
import { FixtureAudioSourceProvider } from './fixture-audio.provider.js';
import { logger } from '../../utils/logger.js';

export class AudioSourceService {
  private providers = new Map<string, IKaraokeAudioSourceProvider>();

  constructor() {
    this.registerProvider(new FixtureAudioSourceProvider());
  }

  public registerProvider(provider: IKaraokeAudioSourceProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  /**
   * Resolves a streamable audio source for a song by MongoDB ID.
   * Enforces availability check: throws SONG_AUDIO_UNAVAILABLE if track is metadata-only.
   */
  public async resolveAudioSource(songId: string, baseUrl: string = ''): Promise<ResolvedAudioSourceDto> {
    const song = await SongModel.findById(songId).exec();
    if (!song) {
      throw new Error('SONG_NOT_FOUND');
    }

    if (song.audioAvailability !== 'audio_available') {
      logger.warn({ songId, title: song.title, audioAvailability: song.audioAvailability }, 'Attempted to resolve audio for metadata-only song');
      throw new Error('SONG_AUDIO_UNAVAILABLE');
    }

    const provider = this.providers.get(song.provider) || this.providers.get('fixture');
    if (!provider) {
      throw new Error('AUDIO_PROVIDER_UNAVAILABLE');
    }

    const resolved = await provider.resolveAudioSource(song, baseUrl);
    if (!resolved) {
      throw new Error('SONG_AUDIO_UNAVAILABLE');
    }

    return resolved;
  }

  /**
   * Handles HTTP audio streaming with support for Range requests.
   */
  public async streamAudio(songId: string, req: Request, res: Response): Promise<void> {
    const song = await SongModel.findById(songId).exec();
    if (!song) {
      res.status(404).json({ message: 'Song not found' });
      return;
    }

    if (song.audioAvailability !== 'audio_available') {
      res.status(400).json({ code: 'SONG_AUDIO_UNAVAILABLE', message: 'Audio stream is unavailable for this song' });
      return;
    }

    const provider = this.providers.get(song.provider) || this.providers.get('fixture');
    if (!provider) {
      res.status(503).json({ message: 'Audio provider unavailable' });
      return;
    }

    const result = await provider.getAudioStreamBuffer(song.providerSongId, song.durationMs);
    if (!result) {
      res.status(404).json({ message: 'Audio stream buffer not found' });
      return;
    }

    const { buffer, mimeType } = result;
    const totalSize = buffer.length;

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0] || '0', 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.status(416).set('Content-Range', `bytes */${totalSize}`).end();
        return;
      }

      const chunk = buffer.subarray(start, end + 1);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk.length,
        'Content-Type': mimeType,
      });
      res.end(chunk);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      res.end(buffer);
    }
  }
}

export const audioSourceService = new AudioSourceService();
