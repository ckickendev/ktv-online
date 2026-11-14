import mongoose, { Schema, Model } from 'mongoose';
import { IRoomInvitationDocument } from './invitation.types.js';

const RoomInvitationSchema = new Schema<IRoomInvitationDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        ret.roomId = ret.roomId ? (ret.roomId as { toString(): string }).toString() : undefined;
        ret.createdBy = ret.createdBy ? (ret.createdBy as { toString(): string }).toString() : undefined;

        // Dynamic status resolution
        if (ret.revokedAt) {
          ret.status = 'revoked';
        } else if (ret.expiresAt && new Date(ret.expiresAt as Date | string) < new Date()) {
          ret.status = 'expired';
        }

        ret.expiresAt = ret.expiresAt instanceof Date ? ret.expiresAt.toISOString() : ret.expiresAt;
        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        ret.revokedAt = ret.revokedAt instanceof Date ? ret.revokedAt.toISOString() : (ret.revokedAt ?? null);

        // Security: Never leak tokenHash in JSON responses
        delete ret.tokenHash;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
RoomInvitationSchema.index({ roomId: 1, status: 1 });
RoomInvitationSchema.index({ roomId: 1, createdAt: -1 });

export const RoomInvitationModel: Model<IRoomInvitationDocument> =
  (mongoose.models.RoomInvitation as Model<IRoomInvitationDocument>) ||
  mongoose.model<IRoomInvitationDocument>('RoomInvitation', RoomInvitationSchema);
