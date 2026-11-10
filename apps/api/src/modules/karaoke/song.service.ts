import { Types } from 'mongoose';
import { SongDto, SongSearchQuery, SongSearchResponse } from '@ktv/contracts';
import { SongModel } from './song.model.js';
import { FixtureCatalogProvider, ISongCatalogProvider } from './song-catalog.provider.js';
import { logger } from '../../utils/logger.js';

export class SongService {
  private primaryProvider: ISongCatalogProvider;

  constructor(provider?: ISongCatalogProvider) {
    this.primaryProvider = provider || new FixtureCatalogProvider();
  }

  public getPrimaryProvider(): ISongCatalogProvider {
    return this.primaryProvider;
  }

  /**
   * Idempotently seeds default song catalog fixtures into MongoDB on startup.
   */
  public async ensureSeedSongs(): Promise<void> {
    try {
      const count = await SongModel.countDocuments().exec();
      if (count > 0) {
        return; // Already seeded
      }

      logger.info('Populating initial song catalog fixtures into database...');
      const seedItems =
        this.primaryProvider instanceof FixtureCatalogProvider
          ? this.primaryProvider.getSeedItems()
          : [];
      const providerName = this.primaryProvider.providerName;

      for (const item of seedItems) {
        await SongModel.updateOne(
          { provider: providerName, providerSongId: item.providerSongId },
          {
            $setOnInsert: {
              provider: providerName,
              providerSongId: item.providerSongId,
              title: item.title,
              artist: item.artist,
              thumbnailUrl: item.thumbnailUrl,
              durationMs: item.durationMs,
              language: item.language,
              genre: item.genre,
              mediaAvailability: item.mediaAvailability,
            },
          },
          { upsert: true }
        ).exec();
      }

      logger.info({ count: seedItems.length }, 'Song catalog initialized with fixture entries');
    } catch (err: unknown) {
      logger.error({ err }, 'Failed to seed song catalog fixtures');
    }
  }

  /**
   * Searches songs from database catalog matching title/artist, genre, and language.
   */
  public async searchSongs(query: SongSearchQuery): Promise<SongSearchResponse> {
    const filter: Record<string, unknown> = {};

    if (query.q && query.q.trim().length > 0) {
      const searchRegex = new RegExp(query.q.trim(), 'i');
      filter.$or = [{ title: searchRegex }, { artist: searchRegex }];
    }

    if (query.genre && query.genre !== 'all') {
      filter.genre = query.genre.toLowerCase();
    }

    if (query.language && query.language !== 'all') {
      filter.language = query.language.toLowerCase();
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [total, songs] = await Promise.all([
      SongModel.countDocuments(filter).exec(),
      SongModel.find(filter).sort({ title: 1 }).skip(skip).limit(limit).exec(),
    ]);

    const songDtos: SongDto[] = songs.map((s) => s.toJSON() as unknown as SongDto);

    return {
      songs: songDtos,
      total,
      page,
      limit,
      hasMore: skip + songs.length < total,
    };
  }

  /**
   * Resolves a song by its MongoDB ID.
   */
  public async getSongById(id: string): Promise<SongDto | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const song = await SongModel.findById(id).exec();
    if (!song) return null;

    return song.toJSON() as unknown as SongDto;
  }
}

export const songService = new SongService();
