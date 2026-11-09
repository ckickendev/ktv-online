import { Document, Types } from 'mongoose';
import { RoomActivityType } from '@ktv/contracts';

export interface IRoomActivityActor {
  id: Types.ObjectId;
  username: string;
  avatar?: string | null;
  role?: string;
}

export interface IRoomActivityTarget {
  id: Types.ObjectId;
  username: string;
}

export interface IRoomActivity {
  roomId: Types.ObjectId;
  type: RoomActivityType;
  actor: IRoomActivityActor;
  target?: IRoomActivityTarget | null;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface IRoomActivityDocument extends IRoomActivity, Document {}
