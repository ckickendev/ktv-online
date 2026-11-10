import { Document } from 'mongoose';
import { SongMediaAvailability } from '@ktv/contracts';

export interface ISong {
  provider: string;
  providerSongId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string | null;
  durationMs: number;
  language: string;
  genre: string;
  mediaAvailability: SongMediaAvailability;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISongDocument extends ISong, Document {}
