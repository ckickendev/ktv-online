import { Document, Types } from 'mongoose';
import {
  AudioAvailability,
  AudioLicenseClassification,
  LyricsAvailability,
  SongMediaAvailability,
} from '@ktv/contracts';

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
  audioAvailability?: AudioAvailability;
  lyricsAvailability?: LyricsAvailability;
  licenseClassification?: AudioLicenseClassification;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISongDocument extends Document<Types.ObjectId>, ISong {
  _id: Types.ObjectId;
}
