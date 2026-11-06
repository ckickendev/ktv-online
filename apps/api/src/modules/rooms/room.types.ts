import { Document, Types } from 'mongoose';
import { RoomType, RoomVisibility, RoomStatus, RoomCategory } from '@ktv/contracts';

export interface IRoom {
  name: string;
  description?: string | null;
  ownerId: Types.ObjectId;
  roomType: RoomType;
  visibility: RoomVisibility;
  capacity: number;
  status: RoomStatus;
  category: RoomCategory;
  currentParticipantsCount: number;
  currentSongTitle?: string | null;
  currentSingerName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomDocument extends IRoom, Document {}
