import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVoiceParticipantSequence {
  participantKey: string; // `${roomName}:${participantIdentity}`
  lastEventTimestampMs: number;
  lastEventPrecedence: number;
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
    lastEventPrecedence: {
      type: Number,
      required: true,
      default: 0,
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
 * Returns deterministic precedence ranking for event types when timestamps are identical.
 * Higher number takes precedence over lower number.
 * - participant_left (2): terminal departure takes precedence over arrival.
 * - participant_joined (1): arrival takes precedence over unspecified events.
 * - default (0): generic/other events.
 */
export function getEventTypePrecedence(eventType: string): number {
  switch (eventType) {
    case 'participant_left':
      return 2;
    case 'participant_joined':
      return 1;
    default:
      return 0;
  }
}

/**
 * Atomically checks and records monotonic event ordering for a participant in a room across all instances.
 * Uses atomic conditional MongoDB updates with zero-window race safety.
 *
 * Ordering Invariants:
 * 1. Timestamp precedence: An event with a strictly higher timestamp (eventTimestampMs) is accepted.
 * 2. Equal timestamp tie-breaker: When timestamps are identical, deterministic event precedence
 *    (participant_left > participant_joined) breaks the tie.
 * 3. Atomic conditional update: Concurrent API workers cannot overwrite newer participant state.
 *
 * Returns true if this event was atomically recorded as the newest event.
 * Returns false if a newer event was already recorded (stale/delayed event).
 */
export async function assertMonotonicEventOrder(
  participantKey: string,
  eventTimestampMs: number,
  eventType: string
): Promise<boolean> {
  const incomingPrecedence = getEventTypePrecedence(eventType);

  const conditionalFilter = {
    participantKey,
    $or: [
      { lastEventTimestampMs: { $lt: eventTimestampMs } },
      {
        lastEventTimestampMs: eventTimestampMs,
        lastEventPrecedence: { $lt: incomingPrecedence },
      },
    ],
  };

  const updateDoc = {
    $set: {
      lastEventTimestampMs: eventTimestampMs,
      lastEventPrecedence: incomingPrecedence,
      lastEventType: eventType,
    },
  };

  // 1. Attempt atomic conditional update on an existing record
  const updated = await VoiceParticipantSequenceModel.findOneAndUpdate(
    conditionalFilter,
    updateDoc,
    { new: true }
  ).exec();

  if (updated) {
    return true; // Atomically accepted and advanced sequence
  }

  // 2. If update didn't match, check if document exists or if this is the initial event
  const existing = await VoiceParticipantSequenceModel.findOne({ participantKey }).exec();
  if (existing) {
    // Document already exists, and conditional filter did not match -> incoming event is stale
    return false;
  }

  // 3. Document does not exist yet: insert initial sequence document
  try {
    await VoiceParticipantSequenceModel.create({
      participantKey,
      lastEventTimestampMs: eventTimestampMs,
      lastEventPrecedence: incomingPrecedence,
      lastEventType: eventType,
    });
    return true;
  } catch (err: unknown) {
    // If another API instance concurrently inserted the initial document (E11000 duplicate key)
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      // Retry the atomic conditional update against the newly created document
      const retried = await VoiceParticipantSequenceModel.findOneAndUpdate(
        conditionalFilter,
        updateDoc,
        { new: true }
      ).exec();
      return retried !== null;
    }
    throw err;
  }
}
