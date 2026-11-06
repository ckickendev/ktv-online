import mongoose, { Schema, model, Model } from 'mongoose';
import { IRoomDocument } from './room.types.js';

const RoomSchema = new Schema<IRoomDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
      index: true,
    },
    description: {
      type: String,
      default: null,
      maxlength: 250,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roomType: {
      type: String,
      enum: ['standard', 'vip', 'party'],
      default: 'standard',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    capacity: {
      type: Number,
      required: true,
      min: 2,
      max: 50,
      default: 10,
    },
    status: {
      type: String,
      enum: ['idle', 'singing', 'paused', 'closed'],
      default: 'idle',
      index: true,
    },
    category: {
      type: String,
      enum: ['all', 'pop', 'anime', 'rock', 'ballad', 'hiphop', 'rnb'],
      default: 'all',
    },
    currentParticipantsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentSongTitle: {
      type: String,
      default: null,
    },
    currentSingerName: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        if (ret.ownerId && typeof ret.ownerId === 'object') {
          if ('id' in ret.ownerId && typeof (ret.ownerId as { id: unknown }).id === 'string') {
            ret.ownerId = (ret.ownerId as { id: string }).id;
          } else if ('_id' in ret.ownerId && (ret.ownerId as { _id: unknown })._id) {
            ret.ownerId = (ret.ownerId as { _id: { toString(): string } })._id.toString();
          } else {
            ret.ownerId = (ret.ownerId as { toString(): string }).toString();
          }
        } else if (ret.ownerId) {
          ret.ownerId = String(ret.ownerId);
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for room discovery queries and sorting
RoomSchema.index({ visibility: 1, status: 1, createdAt: -1 });
RoomSchema.index({ category: 1, visibility: 1, createdAt: -1 });
RoomSchema.index({ name: 'text', description: 'text' });

export const RoomModel: Model<IRoomDocument> =
  (mongoose.models.Room as Model<IRoomDocument>) || model<IRoomDocument>('Room', RoomSchema);
