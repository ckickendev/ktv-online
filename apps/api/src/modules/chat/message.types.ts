import { Document, Types } from 'mongoose';
import { ChatMessageType, SupportedReactionEmoji } from '@ktv/contracts';

export interface IMessageReaction {
  emoji: SupportedReactionEmoji;
  userId: Types.ObjectId;
  username: string;
  createdAt: Date;
}

export interface IRoomMessage {
  roomId: Types.ObjectId;
  senderId?: Types.ObjectId | null;
  senderUsername: string;
  senderAvatar?: string | null;
  senderRole: 'host' | 'member' | 'viewer' | 'system';
  content: string;
  messageType: ChatMessageType;
  clientMessageId?: string | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  reactions: IMessageReaction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomMessageDocument extends IRoomMessage, Document {}
