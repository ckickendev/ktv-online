import crypto from 'crypto';
import mongoose, { Schema, Model, model, Document, Types } from 'mongoose';
import { PlaybackStatus } from '@ktv/contracts';

export interface IRoomPlaybackState {
  roomId: Types.ObjectId;
  currentQueueItemId?: Types.ObjectId | null;
  status: PlaybackStatus;
  positionMs: number;
  anchorStartedAt?: Date | null;
  pausedAt?: Date | null;
  playbackExpiresAt?: Date | null;
  playbackVersion: number;
  queueVersion: number;
  lastTransitionId?: string | null;
  claimedBy?: string | null;
  claimedAt?: Date | null;
  leaseExpiresAt?: Date | null;
  leaseToken?: string | null;
  leaseVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomPlaybackStateDocument extends IRoomPlaybackState, Document {}

export interface IRoomPlaybackStateModel extends Model<IRoomPlaybackStateDocument> {
  claimDuePlayback(
    instanceId: string,
    leaseDurationMs?: number
  ): Promise<IRoomPlaybackStateDocument | null>;
  releasePlaybackLease(
    roomId: Types.ObjectId | string,
    leaseToken: string
  ): Promise<boolean>;
}

const RoomPlaybackStateSchema = new Schema<IRoomPlaybackStateDocument, IRoomPlaybackStateModel>(
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
      index: true,
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
    playbackExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    playbackVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    queueVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastTransitionId: {
      type: String,
      default: null,
    },
    claimedBy: {
      type: String,
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    leaseToken: {
      type: String,
      default: null,
    },
    leaseVersion: {
      type: Number,
      default: 0,
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
        delete ret.claimedBy;
        delete ret.claimedAt;
        delete ret.leaseExpiresAt;
        delete ret.leaseToken;
        delete ret.leaseVersion;
        return ret;
      },
    },
  }
);

// Worker polling index: find playing rooms where playback has naturally expired and lease is free/expired
RoomPlaybackStateSchema.index({ status: 1, playbackExpiresAt: 1, leaseExpiresAt: 1 });

/**
 * Atomically claims the next due playing room for natural completion processing.
 * Prevents multiple worker instances from processing the same room simultaneously.
 */
RoomPlaybackStateSchema.statics.claimDuePlayback = async function (
  instanceId: string,
  leaseDurationMs: number = 15000
): Promise<IRoomPlaybackStateDocument | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
  const leaseToken = crypto.randomUUID();

  return this.findOneAndUpdate(
    {
      status: 'playing',
      playbackExpiresAt: { $lte: now },
      $or: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        claimedBy: instanceId,
        claimedAt: now,
        leaseExpiresAt,
        leaseToken,
      },
      $inc: { leaseVersion: 1 },
    },
    { new: true }
  ).exec();
};

/**
 * Releases a worker lease after execution.
 */
RoomPlaybackStateSchema.statics.releasePlaybackLease = async function (
  roomId: Types.ObjectId | string,
  leaseToken: string
): Promise<boolean> {
  const roomObjectId = typeof roomId === 'string' ? new Types.ObjectId(roomId) : roomId;
  const result = await this.updateOne(
    { roomId: roomObjectId, leaseToken },
    {
      $set: {
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
      },
    }
  ).exec();

  return result.modifiedCount > 0;
};

export const RoomPlaybackStateModel: IRoomPlaybackStateModel =
  (mongoose.models.RoomPlaybackState as unknown as IRoomPlaybackStateModel) ||
  model<IRoomPlaybackStateDocument, IRoomPlaybackStateModel>('RoomPlaybackState', RoomPlaybackStateSchema);
