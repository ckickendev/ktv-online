import { Document, Types } from 'mongoose';
import { RoomMembershipRole, RoomMembershipStatus } from '@ktv/contracts';

export interface IRoomMembership {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  role: RoomMembershipRole;
  status: RoomMembershipStatus;
  joinedAt: Date;
  leftAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomMembershipDocument extends IRoomMembership, Document {}
