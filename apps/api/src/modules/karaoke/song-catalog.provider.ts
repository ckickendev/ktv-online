import {
  AudioAvailability,
  AudioLicenseClassification,
  LyricsAvailability,
  SongMediaAvailability,
} from '@ktv/contracts';

export interface CatalogSongItem {
  providerSongId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string | null;
  durationMs: number;
  language: string;
  genre: string;
  mediaAvailability: SongMediaAvailability;
  audioAvailability?: AudioAvailability;
  lyricsAvailability?: LyricsAvailability;
  licenseClassification?: AudioLicenseClassification;
}

export interface SongSearchOptions {
  genre?: string;
  language?: string;
  availability?: string;
  limit?: number;
  offset?: number;
}

export interface ISongCatalogProvider {
  readonly providerName: string;
  searchSongs(
    query: string,
    options?: SongSearchOptions
  ): Promise<{ songs: CatalogSongItem[]; total: number }>;
  getSongById(providerSongId: string): Promise<CatalogSongItem | null>;
  getPlaybackAvailability(providerSongId: string): Promise<SongMediaAvailability>;
}

/**
 * Fixture catalog provider for development and testing.
 * Provides curated, royalty-free and public domain metadata entries.
 * Explicitly marks mediaAvailability as 'fixture_mock' to distinguish from commercial streaming.
 */
export class FixtureCatalogProvider implements ISongCatalogProvider {
  public readonly providerName = 'fixture';

  private readonly fixtureSongs: CatalogSongItem[] = [
    // -------------------------------------------------------------
    // Authorized Development Fixtures (Playable Audio & Timed Lyrics)
    // -------------------------------------------------------------
    {
      providerSongId: 'fix_auld_lang_syne',
      title: 'Auld Lang Syne',
      artist: 'Robert Burns (Traditional Folk)',
      thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
      durationMs: 50000, // 50s
      language: 'en',
      genre: 'folk',
      mediaAvailability: 'available',
      audioAvailability: 'audio_available',
      lyricsAvailability: 'timed_available',
      licenseClassification: 'public_domain',
    },
    {
      providerSongId: 'fix_amazing_grace',
      title: 'Amazing Grace',
      artist: 'John Newton (Instrumental Hymn)',
      thumbnailUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&auto=format&fit=crop&q=80',
      durationMs: 45000, // 45s
      language: 'en',
      genre: 'ballad',
      mediaAvailability: 'available',
      audioAvailability: 'audio_available',
      lyricsAvailability: 'timed_available',
      licenseClassification: 'public_domain',
    },
    {
      providerSongId: 'fix_scarborough_fair',
      title: 'Scarborough Fair',
      artist: 'Traditional English Ballad',
      thumbnailUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80',
      durationMs: 40000, // 40s
      language: 'en',
      genre: 'folk',
      mediaAvailability: 'available',
      audioAvailability: 'audio_available',
      lyricsAvailability: 'timed_available',
      licenseClassification: 'public_domain',
    },
    {
      providerSongId: 'fix_synth_groove',
      title: 'Neon City Synthwave',
      artist: 'KTV Lounge Collective',
      thumbnailUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80',
      durationMs: 60000, // 60s
      language: 'en',
      genre: 'city_pop',
      mediaAvailability: 'available',
      audioAvailability: 'audio_available',
      lyricsAvailability: 'timed_available',
      licenseClassification: 'royalty_free',
    },

    // -------------------------------------------------------------
    // Commercial Music Catalog Fixtures (Metadata Only - No Audio Stream)
    // -------------------------------------------------------------
    {
      providerSongId: 'fix_blinding_lights',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      thumbnailUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80',
      durationMs: 200000, // 3m 20s
      language: 'en',
      genre: 'pop',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_cruel_summer',
      title: 'Cruel Summer',
      artist: 'Taylor Swift',
      thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
      durationMs: 178000, // 2m 58s
      language: 'en',
      genre: 'pop',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_bohemian_rhapsody',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      thumbnailUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&auto=format&fit=crop&q=80',
      durationMs: 355000, // 5m 55s
      language: 'en',
      genre: 'rock',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_hotel_california',
      title: 'Hotel California',
      artist: 'Eagles',
      thumbnailUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&auto=format&fit=crop&q=80',
      durationMs: 390000, // 6m 30s
      language: 'en',
      genre: 'rock',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_stay_with_me',
      title: 'Stay With Me (Mayonaka no Door)',
      artist: 'Miki Matsubara',
      thumbnailUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80',
      durationMs: 304000, // 5m 04s
      language: 'ja',
      genre: 'city_pop',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_gurenge',
      title: 'Gurenge',
      artist: 'LiSA',
      thumbnailUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80',
      durationMs: 236000, // 3m 56s
      language: 'ja',
      genre: 'anime',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_fly_me_to_the_moon',
      title: 'Fly Me to the Moon',
      artist: 'Frank Sinatra',
      thumbnailUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=300&auto=format&fit=crop&q=80',
      durationMs: 147000, // 2m 27s
      language: 'en',
      genre: 'ballad',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_someone_like_you',
      title: 'Someone Like You',
      artist: 'Adele',
      thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80',
      durationMs: 285000, // 4m 45s
      language: 'en',
      genre: 'ballad',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_cant_hold_us',
      title: "Can't Hold Us",
      artist: 'Macklemore & Ryan Lewis',
      thumbnailUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80',
      durationMs: 258000, // 4m 18s
      language: 'en',
      genre: 'hiphop',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_treasure',
      title: 'Treasure',
      artist: 'Bruno Mars',
      thumbnailUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80',
      durationMs: 176000, // 2m 56s
      language: 'en',
      genre: 'rnb',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_unravel',
      title: 'Unravel',
      artist: 'TK from Ling Tosite Sigure',
      thumbnailUrl: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&auto=format&fit=crop&q=80',
      durationMs: 240000, // 4m 00s
      language: 'ja',
      genre: 'anime',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
    {
      providerSongId: 'fix_shape_of_you',
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      thumbnailUrl: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=300&auto=format&fit=crop&q=80',
      durationMs: 233000, // 3m 53s
      language: 'en',
      genre: 'pop',
      mediaAvailability: 'unavailable',
      audioAvailability: 'metadata_only',
      lyricsAvailability: 'unavailable',
      licenseClassification: 'licensed_commercial',
    },
  ];

  public getSeedItems(): CatalogSongItem[] {
    return [...this.fixtureSongs];
  }

  public async searchSongs(
    query: string,
    options?: SongSearchOptions
  ): Promise<{ songs: CatalogSongItem[]; total: number }> {
    const q = query.trim().toLowerCase();
    let filtered = this.fixtureSongs;

    if (q.length > 0) {
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q)
      );
    }

    if (options?.genre && options.genre !== 'all') {
      filtered = filtered.filter(
        (s) => s.genre.toLowerCase() === options.genre!.toLowerCase()
      );
    }

    if (options?.language && options.language !== 'all') {
      filtered = filtered.filter(
        (s) => s.language.toLowerCase() === options.language!.toLowerCase()
      );
    }

    if (options?.availability && options.availability !== 'all') {
      if (options.availability === 'playable') {
        filtered = filtered.filter((s) => s.audioAvailability === 'audio_available');
      } else if (options.availability === 'metadata_only') {
        filtered = filtered.filter((s) => s.audioAvailability === 'metadata_only');
      }
    }

    const total = filtered.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;
    const paginated = filtered.slice(offset, offset + limit);

    return { songs: paginated, total };
  }

  public async getSongById(providerSongId: string): Promise<CatalogSongItem | null> {
    const found = this.fixtureSongs.find((s) => s.providerSongId === providerSongId);
    return found || null;
  }

  public async getPlaybackAvailability(providerSongId: string): Promise<SongMediaAvailability> {
    const found = this.fixtureSongs.find((s) => s.providerSongId === providerSongId);
    return found?.mediaAvailability || 'unavailable';
  }
}
