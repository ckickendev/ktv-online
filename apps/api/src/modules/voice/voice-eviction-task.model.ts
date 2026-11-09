import mongoose, { Schema, Document, Model } from 'mongoose';

export type VoiceEvictionTargetType = 'user' | 'family' | 'room';
export type VoiceEvictionTaskStatus = 'pending' | 'completed' | 'exhausted';

export interface IVoiceEvictionTask {
  targetType: VoiceEvictionTargetType;
  targetId: string; // userId, familyId, or roomId
  roomId?: string;
  participantIdentity?: string;
  attemptCount: number;
  maxAttempts: number;
  status: VoiceEvictionTaskStatus;
  nextAttemptAt: Date;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVoiceEvictionTaskDocument extends IVoiceEvictionTask, Document {}

const VoiceEvictionTaskSchema = new Schema<IVoiceEvictionTaskDocument>(
  {
    targetType: {
      type: String,
      enum: ['user', 'family', 'room'],
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      index: true,
    },
    participantIdentity: {
      type: String,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'exhausted'],
      default: 'pending',
      index: true,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
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

// Query index for pending tasks sweep
VoiceEvictionTaskSchema.index({ status: 1, nextAttemptAt: 1 });

// TTL retention index: automatically purge historical eviction tasks after 24 hours
VoiceEvictionTaskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const VoiceEvictionTaskModel: Model<IVoiceEvictionTaskDocument> =
  (mongoose.models.VoiceEvictionTask as Model<IVoiceEvictionTaskDocument>) ||
  mongoose.model<IVoiceEvictionTaskDocument>('VoiceEvictionTask', VoiceEvictionTaskSchema);
