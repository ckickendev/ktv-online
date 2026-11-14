import { Document, Types } from 'mongoose';
import { InvitationStatus } from '@ktv/contracts';

export interface IRoomInvitationDocument extends Document {
  roomId: Types.ObjectId;
  tokenHash: string;
  createdBy: Types.ObjectId;
  recipientId?: Types.ObjectId | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  status: InvitationStatus;
  createdAt: Date;
  updatedAt: Date;
}
