import mongoose, { Schema, model, Model } from 'mongoose';
import { IRoomActivityDocument } from './activity.types.js';
import { RoomActivityTypeSchema } from '@ktv/contracts';

const RoomActivitySchema = new Schema<IRoomActivityDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: RoomActivityTypeSchema.options,
      required: true,
    },
    actor: {
      id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      username: {
        type: String,
        required: true,
      },
      avatar: {
        type: String,
        default: null,
      },
      role: {
        type: String,
        default: 'member',
      },
    },
    target: {
      id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      username: {
        type: String,
        default: null,
      },
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        ret.roomId = ret.roomId ? (ret.roomId as { toString(): string }).toString() : undefined;
        if (ret.actor && typeof ret.actor === 'object') {
          const act = ret.actor as { id?: { toString(): string } };
          if (act.id) ret.actor = { ...ret.actor, id: act.id.toString() };
        }
        if (ret.target && typeof ret.target === 'object') {
          const tgt = ret.target as { id?: { toString(): string } };
          if (tgt.id) ret.target = { ...ret.target, id: tgt.id.toString() };
        }
        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index for querying recent activities by room
RoomActivitySchema.index({ roomId: 1, createdAt: -1 });

// TTL index: 7 days retention policy (604800 seconds)
RoomActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

export const RoomActivityModel: Model<IRoomActivityDocument> =
  (mongoose.models.RoomActivity as Model<IRoomActivityDocument>) ||
  model<IRoomActivityDocument>('RoomActivity', RoomActivitySchema);
