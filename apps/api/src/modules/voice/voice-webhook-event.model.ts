import mongoose, { Schema, Document, Model } from 'mongoose';

export type WebhookProcessingStatus = 'processing' | 'completed' | 'failed';

export interface IVoiceWebhookEvent {
  eventId: string;
  eventType: string;
  roomName: string;
  participantIdentity?: string;
  eventCreatedAtMs: number;
  status: WebhookProcessingStatus;
  claimedBy: string;
  claimedAt: Date;
  leaseExpiresAt: Date;
  processedAt?: Date;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVoiceWebhookEventDocument extends IVoiceWebhookEvent, Document {}

export interface IVoiceWebhookEventModel extends Model<IVoiceWebhookEventDocument> {
  claimEvent(
    eventId: string,
    eventType: string,
    roomName: string,
    eventCreatedAtMs: number,
    instanceId: string,
    participantIdentity?: string,
    leaseDurationMs?: number
  ): Promise<{ claimed: boolean; isDuplicate: boolean; eventDoc?: IVoiceWebhookEventDocument }>;
}

const VoiceWebhookEventSchema = new Schema<IVoiceWebhookEventDocument, IVoiceWebhookEventModel>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    roomName: {
      type: String,
      required: true,
      index: true,
    },
    participantIdentity: {
      type: String,
      index: true,
    },
    eventCreatedAtMs: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
      index: true,
    },
    claimedBy: {
      type: String,
      required: true,
    },
    claimedAt: {
      type: Date,
      default: Date.now,
    },
    leaseExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    processedAt: {
      type: Date,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically prune historical webhook records after 24 hours
VoiceWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

VoiceWebhookEventSchema.statics.claimEvent = async function (
  eventId: string,
  eventType: string,
  roomName: string,
  eventCreatedAtMs: number,
  instanceId: string,
  participantIdentity?: string,
  leaseDurationMs = 30000
): Promise<{ claimed: boolean; isDuplicate: boolean; eventDoc?: IVoiceWebhookEventDocument }> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  // 1. Check if event already exists
  const existing = await this.findOne({ eventId }).exec();
  if (existing) {
    if (existing.status === 'completed') {
      return { claimed: false, isDuplicate: true, eventDoc: existing };
    }
    // If currently being processed and lease is still valid, treat as duplicate in flight
    if (existing.status === 'processing' && existing.leaseExpiresAt > now) {
      return { claimed: false, isDuplicate: true, eventDoc: existing };
    }
    // If lease expired or previous attempt failed, reclaim atomically via conditional update
    const reclaimed = await this.findOneAndUpdate(
      {
        eventId,
        $or: [
          { status: 'failed' },
          { status: 'processing', leaseExpiresAt: { $lte: now } },
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
      { new: true }
    ).exec();

    if (reclaimed) {
      return { claimed: true, isDuplicate: false, eventDoc: reclaimed };
    }

    // Another worker concurrently reclaimed or completed the task
    const current = await this.findOne({ eventId }).exec();
    return { claimed: false, isDuplicate: true, eventDoc: current || undefined };
  }

  // 2. Insert new event claim
  try {
    const created = await this.create({
      eventId,
      eventType,
      roomName,
      participantIdentity,
      eventCreatedAtMs,
      status: 'processing',
      claimedBy: instanceId,
      claimedAt: now,
      leaseExpiresAt,
    });
    return { claimed: true, isDuplicate: false, eventDoc: created };
  } catch (err: unknown) {
    // If duplicate key error raced on create across multiple instances
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      const raced = await this.findOne({ eventId }).exec();
      return { claimed: false, isDuplicate: true, eventDoc: raced || undefined };
    }
    throw err;
  }
};

export const VoiceWebhookEventModel: IVoiceWebhookEventModel =
  (mongoose.models.VoiceWebhookEvent as IVoiceWebhookEventModel) ||
  mongoose.model<IVoiceWebhookEventDocument, IVoiceWebhookEventModel>(
    'VoiceWebhookEvent',
    VoiceWebhookEventSchema
  );
