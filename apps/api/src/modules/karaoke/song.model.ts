import mongoose, { Schema, Model, model } from 'mongoose';
import { ISongDocument } from './song.types.js';

const SongSchema = new Schema<ISongDocument>(
  {
    provider: {
      type: String,
      required: true,
      default: 'fixture',
      index: true,
    },
    providerSongId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    artist: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      required: true,
      min: 1000,
    },
    language: {
      type: String,
      default: 'en',
      index: true,
    },
    genre: {
      type: String,
      default: 'pop',
      index: true,
    },
    mediaAvailability: {
      type: String,
      enum: ['available', 'restricted', 'unavailable', 'fixture_mock'],
      default: 'fixture_mock',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound unique index per provider + external song ID
SongSchema.index({ provider: 1, providerSongId: 1 }, { unique: true });

// Text search index for title and artist queries
SongSchema.index({ title: 'text', artist: 'text' });

export const SongModel: Model<ISongDocument> =
  (mongoose.models.Song as Model<ISongDocument>) ||
  model<ISongDocument>('Song', SongSchema);
