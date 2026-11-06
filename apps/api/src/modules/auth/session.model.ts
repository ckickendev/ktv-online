import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISession {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  familyId: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISessionDocument extends ISession, Document {}

const SessionSchema = new Schema<ISessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    familyId: {
      type: String,
      required: true,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically purge expired sessions from MongoDB
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for fast family revocation
SessionSchema.index({ familyId: 1, isRevoked: 1 });

export const SessionModel: Model<ISessionDocument> =
  (mongoose.models.Session as Model<ISessionDocument>) ||
  mongoose.model<ISessionDocument>('Session', SessionSchema);
