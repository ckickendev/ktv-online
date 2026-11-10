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
  renewPlaybackLease(
    roomId: Types.ObjectId | string,
    leaseToken: string,
    additionalMs?: number
  ): Promise<boolean>;
  releaseExpiredLeases(): Promise<number>;
  commitConditionalPlaybackTransition(
    roomId: Types.ObjectId | string,
    expectedPlaybackVersion: number,
    update: Partial<IRoomPlaybackState>,
    options?: {
      expectedCurrentQueueItemId?: Types.ObjectId | string | null;
      leaseToken?: string | null;
      session?: mongoose.ClientSession | null;
    }
  ): Promise<IRoomPlaybackStateDocument | null>;
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
 * Fenced strictly by matching roomId and leaseToken to prevent clearing a newer worker's lease.
 */
RoomPlaybackStateSchema.statics.releasePlaybackLease = async function (
  roomId: Types.ObjectId | string,
  leaseToken: string
): Promise<boolean> {
  if (!leaseToken || typeof leaseToken !== 'string') {
    return false;
  }

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
      $inc: { leaseVersion: 1 },
    }
  ).exec();

  return result.modifiedCount > 0;
};

/**
  * Renews an active worker lease. Requires matching leaseToken and an unexpired lease.
  * Cannot extend a different worker's lease or a lease that has already expired and been claimed.
  */
RoomPlaybackStateSchema.statics.renewPlaybackLease = async function (
  roomId: Types.ObjectId | string,
  leaseToken: string,
  additionalMs: number = 15000
): Promise<boolean> {
  const roomObjectId = typeof roomId === 'string' ? new Types.ObjectId(roomId) : roomId;
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + additionalMs);

  const result = await this.updateOne(
    {
      roomId: roomObjectId,
      leaseToken,
      leaseExpiresAt: { $gt: now },
    },
    {
      $set: {
        leaseExpiresAt: newExpiresAt,
      },
      $inc: { leaseVersion: 1 },
    }
  ).exec();

  return result.modifiedCount > 0;
};

/**
 * Sweeps and clears expired worker leases across all rooms.
 * Atomic conditional update matches only truly expired, claimed leases and advances leaseVersion.
 */
RoomPlaybackStateSchema.statics.releaseExpiredLeases = async function (): Promise<number> {
  const now = new Date();
  const result = await this.updateMany(
    {
      leaseExpiresAt: { $lte: now },
      leaseToken: { $ne: null },
    },
    {
      $set: {
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
      },
      $inc: { leaseVersion: 1 },
    }
  ).exec();

  return result.modifiedCount;
};

/**
 * Conditionally commits a playback state transition using optimistic version fencing
 * and worker lease validation. If the expected version or lease token does not match,
 * the write matches zero documents and safely returns null.
 */
RoomPlaybackStateSchema.statics.commitConditionalPlaybackTransition = async function (
  roomId: Types.ObjectId | string,
  expectedPlaybackVersion: number,
  update: Partial<IRoomPlaybackState>,
  options?: {
    expectedCurrentQueueItemId?: Types.ObjectId | string | null;
    leaseToken?: string | null;
    session?: mongoose.ClientSession | null;
  }
): Promise<IRoomPlaybackStateDocument | null> {
  const roomObjectId = typeof roomId === 'string' ? new Types.ObjectId(roomId) : roomId;
  const now = new Date();

  const filter: Record<string, unknown> = {
    roomId: roomObjectId,
    playbackVersion: expectedPlaybackVersion,
  };

  if (options?.expectedCurrentQueueItemId !== undefined) {
    if (options.expectedCurrentQueueItemId === null) {
      filter.currentQueueItemId = null;
    } else {
      filter.currentQueueItemId =
        typeof options.expectedCurrentQueueItemId === 'string'
          ? new Types.ObjectId(options.expectedCurrentQueueItemId)
          : options.expectedCurrentQueueItemId;
    }
  }

  if (options?.leaseToken) {
    filter.leaseToken = options.leaseToken;
    filter.leaseExpiresAt = { $gt: now };
  }

  // Clear any existing worker lease upon successful outcome commit
  const setPayload: Record<string, unknown> = {
    ...update,
    claimedBy: null,
    claimedAt: null,
    leaseExpiresAt: null,
    leaseToken: null,
  };

  return this.findOneAndUpdate(
    filter,
    {
      $set: setPayload,
      $inc: { playbackVersion: 1 },
    },
    {
      new: true,
      session: options?.session || undefined,
    }
  ).exec();
};

export const RoomPlaybackStateModel: IRoomPlaybackStateModel =
  (mongoose.models.RoomPlaybackState as unknown as IRoomPlaybackStateModel) ||
  model<IRoomPlaybackStateDocument, IRoomPlaybackStateModel>('RoomPlaybackState', RoomPlaybackStateSchema);
