import mongoose, { Schema, model, Model, Document, Types } from 'mongoose';
import { FriendshipStatus } from '@ktv/contracts';

export interface IFriendship {
  requesterId: Types.ObjectId;
  addresseeId: Types.ObjectId;
  pairKey: string;
  status: FriendshipStatus;
  blockedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFriendshipDocument extends IFriendship, Document {}

export function computePairKey(userA: string | Types.ObjectId, userB: string | Types.ObjectId): string {
  const strA = userA.toString();
  const strB = userB.toString();
  return strA < strB ? `${strA}:${strB}` : `${strB}:${strA}`;
}

const FriendshipSchema = new Schema<IFriendshipDocument>(
  {
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    addresseeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'blocked'],
      default: 'pending',
      index: true,
    },
    blockedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? (ret._id as { toString(): string }).toString() : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

FriendshipSchema.index({ requesterId: 1, status: 1 });
FriendshipSchema.index({ addresseeId: 1, status: 1 });
FriendshipSchema.index({ status: 1, updatedAt: -1 });

export const FriendshipModel: Model<IFriendshipDocument> =
  (mongoose.models.Friendship as Model<IFriendshipDocument>) ||
  model<IFriendshipDocument>('Friendship', FriendshipSchema);
