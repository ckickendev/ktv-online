import mongoose, { Schema, Model, model } from 'mongoose';
import { IKaraokePerformanceDocument } from './history.types.js';

const KaraokePerformanceSchema = new Schema<IKaraokePerformanceDocument>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'KaraokeSession',
      required: true,
      index: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    queueItemId: {
      type: Schema.Types.ObjectId,
      ref: 'RoomQueueItem',
      required: true,
      unique: true, // Idempotency key!
      index: true,
    },
    songId: {
      type: Schema.Types.ObjectId,
      ref: 'Song',
      required: true,
      index: true,
    },
    songTitle: {
      type: String,
      required: true,
      trim: true,
    },
    artist: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    genre: {
      type: String,
      default: 'pop',
      index: true,
    },
    language: {
      type: String,
      default: 'en',
    },
    durationMs: {
      type: Number,
      required: true,
    },
    singerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    singerUsername: {
      type: String,
      required: true,
      trim: true,
    },
    singerDisplayName: {
      type: String,
      default: null,
      trim: true,
    },
    singerAvatar: {
      type: String,
      default: null,
    },
    requestedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationPerformedMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    outcome: {
      type: String,
      enum: ['playing', 'completed', 'skipped', 'failed', 'interrupted'],
      default: 'playing',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        ret.sessionId = ret.sessionId ? (ret.sessionId as { toString(): string }).toString() : undefined;
        ret.roomId = ret.roomId ? (ret.roomId as { toString(): string }).toString() : undefined;
        ret.queueItemId = ret.queueItemId ? (ret.queueItemId as { toString(): string }).toString() : undefined;
        ret.songId = ret.songId ? (ret.songId as { toString(): string }).toString() : undefined;
        ret.singerId = ret.singerId ? (ret.singerId as { toString(): string }).toString() : undefined;
        ret.requestedById = ret.requestedById ? (ret.requestedById as { toString(): string }).toString() : undefined;
        ret.startedAt = ret.startedAt instanceof Date ? ret.startedAt.toISOString() : ret.startedAt;
        ret.completedAt = ret.completedAt instanceof Date ? ret.completedAt.toISOString() : ret.completedAt;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for user performance feeds and session recaps
KaraokePerformanceSchema.index({ singerId: 1, startedAt: -1 });
KaraokePerformanceSchema.index({ sessionId: 1, startedAt: 1 });

export const KaraokePerformanceModel: Model<IKaraokePerformanceDocument> =
  (mongoose.models.KaraokePerformance as Model<IKaraokePerformanceDocument>) ||
  model<IKaraokePerformanceDocument>('KaraokePerformance', KaraokePerformanceSchema);
