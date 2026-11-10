import { SongLyricsDto } from '@ktv/contracts';
import { SongModel } from './song.model.js';
import { ILyricsProvider } from './lyrics.types.js';
import { FixtureLyricsProvider } from './fixture-lyrics.provider.js';
import { logger } from '../../utils/logger.js';

export class LyricsService {
  private providers = new Map<string, ILyricsProvider>();

  constructor() {
    this.registerProvider(new FixtureLyricsProvider());
  }

  public registerProvider(provider: ILyricsProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  /**
   * Retrieves synchronized lyrics for a song by MongoDB ID.
   * If track has no timed lyrics, returns a structured DTO with hasTimedLyrics: false.
   */
  public async getLyrics(songId: string): Promise<SongLyricsDto> {
    const song = await SongModel.findById(songId).exec();
    if (!song) {
      throw new Error('SONG_NOT_FOUND');
    }

    const provider = this.providers.get(song.provider) || this.providers.get('fixture');
    if (!provider) {
      logger.warn({ songId, provider: song.provider }, 'No lyrics provider registered for song');
      return {
        songId,
        provider: song.provider,
        lines: [],
        language: song.language || 'en',
        hasTimedLyrics: false,
        attribution: 'Lyrics unavailable',
      };
    }

    const lyrics = await provider.getLyrics(song);
    if (!lyrics) {
      return {
        songId,
        provider: song.provider,
        lines: [],
        language: song.language || 'en',
        hasTimedLyrics: false,
        attribution: 'Lyrics unavailable',
      };
    }

    return lyrics;
  }
}

export const lyricsService = new LyricsService();
