import mongoose, { Schema, Model, model, Document, Types } from 'mongoose';
import { QueueItemStatus } from '@ktv/contracts';

export interface IRoomQueueItem {
  roomId: Types.ObjectId;
  songId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  singer?: Types.ObjectId | null;
  position: number;
  status: QueueItemStatus;
  queueVersion: number;
  addedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  removedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomQueueItemDocument extends IRoomQueueItem, Document {}

const RoomQueueItemSchema = new Schema<IRoomQueueItemDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    songId: {
      type: Schema.Types.ObjectId,
      ref: 'Song',
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    singer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    position: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'playing', 'completed', 'skipped', 'removed', 'failed'],
      default: 'queued',
      index: true,
    },
    queueVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    removedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        ret.roomId = ret.roomId ? (ret.roomId as { toString(): string }).toString() : undefined;
        ret.songId = ret.songId ? (ret.songId as { toString(): string }).toString() : undefined;

        if (ret.requestedBy && typeof ret.requestedBy === 'object') {
          const u = ret.requestedBy as Record<string, unknown>;
          ret.requestedBy = {
            id: u.id || (u._id ? String(u._id) : ''),
            username: u.username || 'Member',
            displayName: u.displayName || u.username || 'Member',
            avatar: u.avatar || null,
          };
        } else if (ret.requestedBy) {
          ret.requestedBy = {
            id: String(ret.requestedBy),
            username: 'Member',
            avatar: null,
          };
        }

        if (ret.singer && typeof ret.singer === 'object') {
          const s = ret.singer as Record<string, unknown>;
          ret.singer = {
            id: s.id || (s._id ? String(s._id) : ''),
            username: s.username || 'Member',
            displayName: s.displayName || s.username || 'Member',
            avatar: s.avatar || null,
          };
        } else if (ret.singer) {
          ret.singer = {
            id: String(ret.singer),
            username: 'Member',
            avatar: null,
          };
        } else if (ret.requestedBy) {
          ret.singer = ret.requestedBy;
        }

        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index for finding and ordering active items in a room
RoomQueueItemSchema.index({ roomId: 1, status: 1, position: 1 });

// User-scoped index for member departure / kick cleanup
RoomQueueItemSchema.index({ roomId: 1, requestedBy: 1, status: 1 });

// Partial unique index: at most ONE playing song per room at any time
RoomQueueItemSchema.index(
  { roomId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'playing' } }
);

export const RoomQueueItemModel: Model<IRoomQueueItemDocument> =
  (mongoose.models.RoomQueueItem as Model<IRoomQueueItemDocument>) ||
  model<IRoomQueueItemDocument>('RoomQueueItem', RoomQueueItemSchema);
