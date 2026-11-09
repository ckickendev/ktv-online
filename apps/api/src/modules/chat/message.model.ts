import mongoose, { Schema, model, Model } from 'mongoose';
import { IRoomMessageDocument } from './message.types.js';
import { SUPPORTED_REACTION_EMOJIS, ChatReactionSummaryDto } from '@ktv/contracts';

const MessageReactionSchema = new Schema(
  {
    emoji: {
      type: String,
      enum: SUPPORTED_REACTION_EMOJIS,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const RoomMessageSchema = new Schema<IRoomMessageDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    senderUsername: {
      type: String,
      required: true,
      trim: true,
    },
    senderAvatar: {
      type: String,
      default: null,
    },
    senderRole: {
      type: String,
      enum: ['host', 'member', 'viewer', 'system'],
      default: 'member',
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    messageType: {
      type: String,
      enum: ['text', 'system'],
      default: 'text',
    },
    clientMessageId: {
      type: String,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reactions: {
      type: [MessageReactionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        const isDeleted = Boolean(ret.deletedAt);
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        ret.roomId = ret.roomId ? (ret.roomId as { toString(): string }).toString() : undefined;
        ret.senderId = ret.senderId ? (ret.senderId as { toString(): string }).toString() : null;
        ret.deletedBy = ret.deletedBy ? (ret.deletedBy as { toString(): string }).toString() : null;
        ret.isDeleted = isDeleted;

        if (isDeleted) {
          ret.content = '[This message was deleted by the host]';
        }

        // Aggregate reactions into summary counts
        const rawReactions = (ret.reactions as Array<{ emoji: string; userId: { toString(): string } }>) || [];
        const reactionMap = new Map<string, { emoji: string; count: number; userIds: string[] }>();

        for (const r of rawReactions) {
          const uid = r.userId ? r.userId.toString() : '';
          const existing = reactionMap.get(r.emoji);
          if (existing) {
            existing.count += 1;
            if (uid && !existing.userIds.includes(uid)) {
              existing.userIds.push(uid);
            }
          } else {
            reactionMap.set(r.emoji, {
              emoji: r.emoji as any,
              count: 1,
              userIds: uid ? [uid] : [],
            });
          }
        }

        ret.reactions = Array.from(reactionMap.values()) as ChatReactionSummaryDto[];

        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        ret.updatedAt = ret.updatedAt instanceof Date ? ret.updatedAt.toISOString() : ret.updatedAt;
        ret.deletedAt = ret.deletedAt instanceof Date ? ret.deletedAt.toISOString() : ret.deletedAt;

        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index for fast reverse cursor pagination by room
RoomMessageSchema.index({ roomId: 1, createdAt: -1, _id: -1 });

// TTL index: 30 days retention policy (2592000 seconds)
RoomMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const RoomMessageModel: Model<IRoomMessageDocument> =
  (mongoose.models.RoomMessage as Model<IRoomMessageDocument>) ||
  model<IRoomMessageDocument>('RoomMessage', RoomMessageSchema);
