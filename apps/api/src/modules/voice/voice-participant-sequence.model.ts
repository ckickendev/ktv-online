import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVoiceParticipantSequence {
  participantKey: string; // `${roomName}:${participantIdentity}`
  lastEventTimestampMs: number;
  lastEventType: string;
  updatedAt: Date;
}

export interface IVoiceParticipantSequenceDocument extends IVoiceParticipantSequence, Document {}

const VoiceParticipantSequenceSchema = new Schema<IVoiceParticipantSequenceDocument>(
  {
    participantKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    lastEventTimestampMs: {
      type: Number,
      required: true,
    },
    lastEventType: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to clean up sequence tracking records 24 hours after last activity
VoiceParticipantSequenceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const VoiceParticipantSequenceModel: Model<IVoiceParticipantSequenceDocument> =
  (mongoose.models.VoiceParticipantSequence as Model<IVoiceParticipantSequenceDocument>) ||
  mongoose.model<IVoiceParticipantSequenceDocument>(
    'VoiceParticipantSequence',
    VoiceParticipantSequenceSchema
  );

/**
 * Atomically checks and records monotonic event ordering for a participant in a room across all instances.
 * Returns true if this event is equal to or newer than any previously processed event for this participant.
 * Returns false if a newer event was already recorded (signifying a stale, delayed event).
 */
export async function assertMonotonicEventOrder(
  participantKey: string,
  eventTimestampMs: number,
  eventType: string
): Promise<boolean> {
  const existing = await VoiceParticipantSequenceModel.findOne({ participantKey }).exec();
  if (existing && existing.lastEventTimestampMs > eventTimestampMs) {
    return false; // Stale out-of-order event
  }

  await VoiceParticipantSequenceModel.findOneAndUpdate(
    { participantKey },
    {
      $set: {
        lastEventTimestampMs: eventTimestampMs,
        lastEventType: eventType,
      },
    },
    { upsert: true, new: true }
  ).exec();

  return true;
}
