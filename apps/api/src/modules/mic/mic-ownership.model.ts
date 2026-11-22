import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import {
  MicOwnershipSnapshotDto,
  MicOwnershipState,
  MicPendingRequestDto,
} from '@ktv/contracts';

export const MAX_PENDING_MIC_REQUESTS = 20;

export interface IMicPendingRequest {
  requestId: string;
  userId: Types.ObjectId;
  username: string;
  displayName: string | null;
  avatar: string | null;
  requestedAt: Date;
}

export interface IMicOwnership {
  roomId: Types.ObjectId;
  state: MicOwnershipState;
  currentSingerId: Types.ObjectId | null;
  currentSingerSessionId: string | null;
  currentSingerUsername: string | null;
  currentSingerDisplayName: string | null;
  currentSingerAvatar: string | null;
  pendingRequests: IMicPendingRequest[];
  ownershipVersion: number;
  grantedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMicOwnershipDocument extends IMicOwnership, Document {}

const MicPendingRequestSubSchema = new Schema<IMicPendingRequest>(
  {
    requestId: {
      type: String,
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
    displayName: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    requestedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const MicOwnershipSchema = new Schema<IMicOwnershipDocument>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      unique: true,
      index: true,
    },
    state: {
      type: String,
      enum: ['AVAILABLE', 'REQUEST_PENDING', 'OCCUPIED'],
      default: 'AVAILABLE',
      required: true,
      index: true,
    },
    currentSingerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    currentSingerSessionId: {
      type: String,
      default: null,
    },
    currentSingerUsername: {
      type: String,
      default: null,
    },
    currentSingerDisplayName: {
      type: String,
      default: null,
    },
    currentSingerAvatar: {
      type: String,
      default: null,
    },
    pendingRequests: {
      type: [MicPendingRequestSubSchema],
      default: [],
    },
    ownershipVersion: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    grantedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export function toPendingRequestDto(req: IMicPendingRequest): MicPendingRequestDto {
  return {
    requestId: req.requestId,
    userId: req.userId.toString(),
    username: req.username,
    displayName: req.displayName ?? null,
    avatar: req.avatar ?? null,
    requestedAt:
      req.requestedAt instanceof Date
        ? req.requestedAt.toISOString()
        : new Date(req.requestedAt).toISOString(),
  };
}

export function toMicOwnershipSnapshot(
  doc: IMicOwnership | IMicOwnershipDocument
): MicOwnershipSnapshotDto {
  const singerId = doc.currentSingerId ? doc.currentSingerId.toString() : null;
  const grantedAtIso = doc.grantedAt
    ? doc.grantedAt instanceof Date
      ? doc.grantedAt.toISOString()
      : new Date(doc.grantedAt).toISOString()
    : null;
  const expiresAtIso = doc.expiresAt
    ? doc.expiresAt instanceof Date
      ? doc.expiresAt.toISOString()
      : new Date(doc.expiresAt).toISOString()
    : null;
  const updatedAtIso = doc.updatedAt
    ? doc.updatedAt instanceof Date
      ? doc.updatedAt.toISOString()
      : new Date(doc.updatedAt).toISOString()
    : new Date().toISOString();

  return {
    roomId: doc.roomId.toString(),
    state: doc.state,
    currentSinger:
      singerId && doc.currentSingerUsername
        ? {
            userId: singerId,
            username: doc.currentSingerUsername,
            displayName: doc.currentSingerDisplayName ?? null,
            avatar: doc.currentSingerAvatar ?? null,
            sessionId: doc.currentSingerSessionId ?? null,
            grantedAt: grantedAtIso,
          }
        : null,
    currentSingerId: singerId,
    currentSingerSessionId: doc.currentSingerSessionId ?? null,
    pendingRequests: (doc.pendingRequests || []).map(toPendingRequestDto),
    ownershipVersion: doc.ownershipVersion || 1,
    grantedAt: grantedAtIso,
    expiresAt: expiresAtIso,
    updatedAt: updatedAtIso,
  };
}

export const MicOwnershipModel: Model<IMicOwnershipDocument> =
  (mongoose.models.MicOwnership as Model<IMicOwnershipDocument>) ||
  mongoose.model<IMicOwnershipDocument>('MicOwnership', MicOwnershipSchema);
