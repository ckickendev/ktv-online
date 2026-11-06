import mongoose, { Schema, Model } from 'mongoose';
import { IRoomMembershipDocument } from './membership.types.js';

const RoomMembershipSchema = new Schema<IRoomMembershipDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['host', 'member'],
      default: 'member',
    },
    status: {
      type: String,
      enum: ['active', 'left'],
      default: 'active',
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
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
        ret.userId = ret.userId ? (ret.userId as { toString(): string }).toString() : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Partial unique index: guarantees only one active membership per user per room
RoomMembershipSchema.index(
  { roomId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// Compound index for querying user's active rooms
RoomMembershipSchema.index({ userId: 1, status: 1 });

// Compound index for querying a room's active participants
RoomMembershipSchema.index({ roomId: 1, status: 1, joinedAt: 1 });

export const RoomMembershipModel: Model<IRoomMembershipDocument> =
  (mongoose.models.RoomMembership as Model<IRoomMembershipDocument>) ||
  mongoose.model<IRoomMembershipDocument>('RoomMembership', RoomMembershipSchema);
