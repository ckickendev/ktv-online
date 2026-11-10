import mongoose, { Schema, Model, model, Document, Types } from 'mongoose';
import { PlaybackStatus } from '@ktv/contracts';

export interface IRoomPlaybackState {
  roomId: Types.ObjectId;
  currentQueueItemId?: Types.ObjectId | null;
  status: PlaybackStatus;
  positionMs: number;
  anchorStartedAt?: Date | null;
  pausedAt?: Date | null;
  playbackVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomPlaybackStateDocument extends IRoomPlaybackState, Document {}

const RoomPlaybackStateSchema = new Schema<IRoomPlaybackStateDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      unique: true,
      index: true,
    },
    currentQueueItemId: {
      type: Schema.Types.ObjectId,
      ref: 'RoomQueueItem',
      default: null,
    },
    status: {
      type: String,
      enum: ['idle', 'loading', 'playing', 'paused', 'ended', 'error'],
      default: 'idle',
      index: true,
    },
    positionMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    anchorStartedAt: {
      type: Date,
      default: null,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    playbackVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.roomId = ret.roomId ? (ret.roomId as { toString(): string }).toString() : undefined;
        ret.currentQueueItemId = ret.currentQueueItemId
          ? (ret.currentQueueItemId as { toString(): string }).toString()
          : null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const RoomPlaybackStateModel: Model<IRoomPlaybackStateDocument> =
  (mongoose.models.RoomPlaybackState as Model<IRoomPlaybackStateDocument>) ||
  model<IRoomPlaybackStateDocument>('RoomPlaybackState', RoomPlaybackStateSchema);
