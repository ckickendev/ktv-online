import mongoose, { Schema, Model, model } from 'mongoose';
import { IKaraokeSessionDocument } from './history.types.js';

const SessionParticipantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      default: null,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['host', 'moderator', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    songsPerformedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const KaraokeSessionSchema = new Schema<IKaraokeSessionDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    hostId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    hostUsername: {
      type: String,
      required: true,
      trim: true,
    },
    hostDisplayName: {
      type: String,
      default: null,
      trim: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
      index: true,
    },
    roomType: {
      type: String,
      default: 'standard',
    },
    atmospherePreset: {
      type: String,
      default: 'midnight_lounge',
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'completed'],
      default: 'active',
      index: true,
    },
    endedReason: {
      type: String,
      enum: ['host_closed', 'room_abandoned', 'manual'],
      default: null,
    },
    totalSongsPlayed: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalParticipantsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    participants: {
      type: [SessionParticipantSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        ret.roomId = ret.roomId ? (ret.roomId as { toString(): string }).toString() : undefined;
        ret.hostId = ret.hostId ? (ret.hostId as { toString(): string }).toString() : undefined;
        ret.startedAt = ret.startedAt instanceof Date ? ret.startedAt.toISOString() : ret.startedAt;
        ret.endedAt = ret.endedAt instanceof Date ? ret.endedAt.toISOString() : ret.endedAt;
        if (Array.isArray(ret.participants)) {
          ret.participants = ret.participants.map((p: Record<string, unknown>) => ({
            ...p,
            userId: p.userId ? (p.userId as { toString(): string }).toString() : undefined,
            joinedAt: p.joinedAt instanceof Date ? p.joinedAt.toISOString() : p.joinedAt,
            leftAt: p.leftAt instanceof Date ? p.leftAt.toISOString() : p.leftAt,
          }));
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for fast lookup
KaraokeSessionSchema.index({ roomId: 1, status: 1 });
KaraokeSessionSchema.index({ 'participants.userId': 1, startedAt: -1 });
KaraokeSessionSchema.index({ hostId: 1, startedAt: -1 });

export const KaraokeSessionModel: Model<IKaraokeSessionDocument> =
  (mongoose.models.KaraokeSession as Model<IKaraokeSessionDocument>) ||
  model<IKaraokeSessionDocument>('KaraokeSession', KaraokeSessionSchema);
