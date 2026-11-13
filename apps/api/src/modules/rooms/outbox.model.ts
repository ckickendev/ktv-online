import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { RoomStateEventType } from '@ktv/contracts';

export interface IRoomStateOutbox {
  roomId: Types.ObjectId;
  version: number;
  eventId: string;
  type: RoomStateEventType;
  payload: Record<string, unknown>;
  publishedAt: Date | null;
  expiresAt?: Date | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomStateOutboxDocument extends IRoomStateOutbox, Document {}

const RoomStateOutboxSchema = new Schema<IRoomStateOutboxDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Idempotency constraint: exactly one outbox event per (roomId, version)
RoomStateOutboxSchema.index({ roomId: 1, version: 1 }, { unique: true });

// Sweep index for pending/unacknowledged publication retries
RoomStateOutboxSchema.index({ publishedAt: 1, createdAt: 1 });

// TTL retention index: prune ONLY successfully published outbox records after their explicit expiresAt date (7 days post-publish).
// Standard MongoDB TTL index on expiresAt (expireAfterSeconds: 0).
// MongoDB automatically skips documents where expiresAt is null or not a Date.
// Pending events (publishedAt === null) and failed/retryable events (expiresAt === null) are NEVER purged by TTL.
RoomStateOutboxSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    name: 'expiresAt_1_ttl',
  }
);

export const RoomStateOutboxModel: Model<IRoomStateOutboxDocument> =
  (mongoose.models.RoomStateOutbox as Model<IRoomStateOutboxDocument>) ||
  mongoose.model<IRoomStateOutboxDocument>('RoomStateOutbox', RoomStateOutboxSchema);
