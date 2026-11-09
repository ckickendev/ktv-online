import mongoose, { Schema, Document, Model } from 'mongoose';

export type VoiceEvictionTargetType = 'user' | 'family' | 'room';
export type VoiceEvictionTaskStatus =
  | 'pending'
  | 'processing'
  | 'retry_scheduled'
  | 'completed'
  | 'failed_permanent';

export interface IVoiceEvictionTask {
  targetType: VoiceEvictionTargetType;
  targetId: string; // userId, familyId, or roomId
  roomId?: string;
  participantIdentity?: string;
  attemptCount: number;
  maxAttempts: number;
  status: VoiceEvictionTaskStatus;
  claimedBy: string | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date;
  lastError: string | null;
  errorCategory?: 'transient' | 'terminal' | 'unknown';
  correlationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVoiceEvictionTaskDocument extends IVoiceEvictionTask, Document {}

export interface IVoiceEvictionTaskModel extends Model<IVoiceEvictionTaskDocument> {
  claimNextTask(
    instanceId: string,
    leaseDurationMs?: number
  ): Promise<IVoiceEvictionTaskDocument | null>;
}

const VoiceEvictionTaskSchema = new Schema<IVoiceEvictionTaskDocument, IVoiceEvictionTaskModel>(
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
      enum: ['pending', 'processing', 'retry_scheduled', 'completed', 'failed_permanent'],
      default: 'pending',
      index: true,
    },
    claimedBy: {
      type: String,
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
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
    errorCategory: {
      type: String,
      enum: ['transient', 'terminal', 'unknown'],
      default: 'unknown',
    },
    correlationId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Query index for worker scheduling: find ready tasks or expired leases
VoiceEvictionTaskSchema.index({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 });

// TTL retention index: ONLY purge completed tasks after 24 hours.
// Unresolved security tasks ('pending', 'processing', 'retry_scheduled', 'failed_permanent') are NEVER purged by TTL.
VoiceEvictionTaskSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 24 * 60 * 60,
    partialFilterExpression: { status: 'completed' },
  }
);

/**
 * Atomically claims the next eligible task or an abandoned processing task whose lease expired.
 */
VoiceEvictionTaskSchema.statics.claimNextTask = async function (
  instanceId: string,
  leaseDurationMs: number = 30000
): Promise<IVoiceEvictionTaskDocument | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  return this.findOneAndUpdate(
    {
      $or: [
        {
          status: { $in: ['pending', 'retry_scheduled'] },
          nextAttemptAt: { $lte: now },
        },
        {
          status: 'processing',
          leaseExpiresAt: { $lte: now },
        },
      ],
    },
    {
      $set: {
        status: 'processing',
        claimedBy: instanceId,
        claimedAt: now,
        leaseExpiresAt,
      },
    },
    {
      sort: { nextAttemptAt: 1 },
      new: true,
    }
  ).exec();
};

export const VoiceEvictionTaskModel: IVoiceEvictionTaskModel =
  (mongoose.models.VoiceEvictionTask as IVoiceEvictionTaskModel) ||
  mongoose.model<IVoiceEvictionTaskDocument, IVoiceEvictionTaskModel>(
    'VoiceEvictionTask',
    VoiceEvictionTaskSchema
  );
