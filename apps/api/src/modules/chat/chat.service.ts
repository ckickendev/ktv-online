import { Types } from 'mongoose';
import { RoomMessageModel } from './message.model.js';
import { RoomActivityModel } from './activity.model.js';
import { RoomModel } from '../rooms/room.model.js';
import { RoomMembershipModel } from '../rooms/membership.model.js';
import {
  ChatMessageDto,
  ChatReactionSummaryDto,
  RoomActivityDto,
  RoomActivityType,
  SUPPORTED_REACTION_EMOJIS,
  SupportedReactionEmoji,
} from '@ktv/contracts';
import { logger } from '../../utils/logger.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import { getRoomChannel } from '../../realtime/room.events.js';
import { SOCKET_EVENTS } from '@ktv/contracts';

// In-memory sliding rate limiter per user
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

class UserRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();

  consume(userId: string, maxTokens = 5, refillIntervalMs = 3000): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(userId);

    if (!bucket) {
      bucket = { tokens: maxTokens - 1, lastRefill: now };
      this.buckets.set(userId, bucket);
      return true;
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed > refillIntervalMs) {
      bucket.tokens = maxTokens;
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, b] of this.buckets.entries()) {
      if (now - b.lastRefill > 60000) {
        this.buckets.delete(key);
      }
    }
  }
}

export const chatRateLimiter = new UserRateLimiter();
export const reactionRateLimiter = new UserRateLimiter();

// Periodic rate limiter memory sweep every 5 minutes
setInterval(() => {
  chatRateLimiter.cleanup();
  reactionRateLimiter.cleanup();
}, 300000);

export interface SendMessageResult {
  message: ChatMessageDto;
  isDuplicate: boolean;
}

export class ChatService {
  /**
   * Send a text message in a room with database-enforced idempotency.
   */
  async sendMessage(
    roomId: string,
    user: { id: string; username: string; displayName?: string | null; avatar?: string | null },
    content: string,
    clientMessageId?: string
  ): Promise<SendMessageResult> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ROOM_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const userObjectId = new Types.ObjectId(user.id);
    const room = await RoomModel.findById(roomObjectId).select('status visibility ownerId isChatEnabled').exec();

    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }

    if (room.status === 'closed') {
      throw new Error('ROOM_CLOSED');
    }

    const isHost = room.ownerId.toString() === user.id;

    // Verify room chat is enabled (if disabled, only host may send)
    if (room.isChatEnabled === false && !isHost) {
      throw new Error('CHAT_DISABLED');
    }

    // Rate limiting check: keyed by authenticated user ID (shared across tabs)
    if (!chatRateLimiter.consume(user.id, 5, 3000)) {
      throw new Error('RATE_LIMITED');
    }

    // Verify active membership
    const isMember = await RoomMembershipModel.exists({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
    });

    if (!isMember && !isHost) {
      throw new Error('FORBIDDEN_NOT_A_MEMBER');
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new Error('MESSAGE_EMPTY');
    }

    if (trimmedContent.length > 1000) {
      throw new Error('MESSAGE_TOO_LONG');
    }

    // Fast pre-check for existing clientMessageId if provided
    if (clientMessageId) {
      const existing = await RoomMessageModel.findOne({
        roomId: roomObjectId,
        senderId: userObjectId,
        clientMessageId,
      }).exec();

      if (existing) {
        logger.info(
          { roomId, messageId: existing.id, senderId: user.id, clientMessageId },
          'Idempotent message send detected before insert: returning existing record'
        );
        return {
          message: existing.toJSON() as unknown as ChatMessageDto,
          isDuplicate: true,
        };
      }
    }

    const senderRole = isHost ? 'host' : 'member';

    try {
      const messageDoc = await RoomMessageModel.create({
        roomId: roomObjectId,
        senderId: userObjectId,
        senderUsername: user.displayName || user.username,
        senderAvatar: user.avatar ?? null,
        senderRole,
        content: trimmedContent,
        messageType: 'text',
        clientMessageId: clientMessageId ?? null,
        reactions: [],
      });

      const dto = messageDoc.toJSON() as unknown as ChatMessageDto;

      logger.info(
        { roomId, messageId: dto.id, senderId: user.id },
        'Room chat message persisted successfully'
      );

      return { message: dto, isDuplicate: false };
    } catch (err: unknown) {
      // Catch MongoDB duplicate key error (code 11000) on (roomId, senderId, clientMessageId)
      if (
        clientMessageId &&
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === 11000
      ) {
        logger.warn(
          { roomId, senderId: user.id, clientMessageId },
          'Idempotent duplicate message send caught by MongoDB unique index constraint'
        );

        const existingDoc = await RoomMessageModel.findOne({
          roomId: roomObjectId,
          senderId: userObjectId,
          clientMessageId,
        }).exec();

        if (existingDoc) {
          return {
            message: existingDoc.toJSON() as unknown as ChatMessageDto,
            isDuplicate: true,
          };
        }
      }

      throw err;
    }
  }

  /**
   * Create an authoritative server-side system message.
   */
  async createSystemMessage(roomId: string, content: string): Promise<ChatMessageDto> {
    const roomObjectId = new Types.ObjectId(roomId);

    const messageDoc = await RoomMessageModel.create({
      roomId: roomObjectId,
      senderId: null,
      senderUsername: 'System',
      senderAvatar: null,
      senderRole: 'system',
      content: content.trim(),
      messageType: 'system',
      reactions: [],
    });

    return messageDoc.toJSON() as unknown as ChatMessageDto;
  }

  /**
   * Retrieve message history with deterministic compound cursor pagination (createdAt_id).
   */
  async getMessages(
    roomId: string,
    requestingUserId?: string,
    limit = 50,
    before?: string
  ): Promise<{ messages: ChatMessageDto[]; nextCursor?: string }> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ROOM_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const room = await RoomModel.findById(roomObjectId).select('visibility ownerId').exec();

    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }

    // Private room access check
    if (room.visibility === 'private') {
      if (!requestingUserId) {
        throw new Error('UNAUTHORIZED');
      }

      const isHost = room.ownerId.toString() === requestingUserId;
      if (!isHost) {
        const isMember = await RoomMembershipModel.exists({
          roomId: roomObjectId,
          userId: new Types.ObjectId(requestingUserId),
          status: 'active',
        });

        if (!isMember) {
          throw new Error('FORBIDDEN_PRIVATE_ROOM');
        }
      }
    }

    const boundedLimit = Math.min(100, Math.max(1, limit));
    const query: Record<string, unknown> = { roomId: roomObjectId };

    if (before) {
      if (before.includes('_')) {
        const parts = before.split('_');
        const dateStr = parts[0];
        const idStr = parts[1];
        if (!dateStr || !idStr) {
          throw new Error('INVALID_CURSOR');
        }
        const parsedDate = new Date(dateStr);
        if (isNaN(parsedDate.getTime()) || !Types.ObjectId.isValid(idStr)) {
          throw new Error('INVALID_CURSOR');
        }
        query.$or = [
          { createdAt: { $lt: parsedDate } },
          { createdAt: parsedDate, _id: { $lt: new Types.ObjectId(idStr) } },
        ];
      } else {
        // Fallback for legacy single-field cursors
        const parsedDate = new Date(before);
        if (!isNaN(parsedDate.getTime())) {
          query.createdAt = { $lt: parsedDate };
        } else if (Types.ObjectId.isValid(before)) {
          query._id = { $lt: new Types.ObjectId(before) };
        } else {
          throw new Error('INVALID_CURSOR');
        }
      }
    }

    const docs = await RoomMessageModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(boundedLimit + 1)
      .exec();

    const hasMore = docs.length > boundedLimit;
    const items = hasMore ? docs.slice(0, boundedLimit) : docs;

    // Convert to DTOs and reverse so client receives chronological order [oldest ... newest]
    const messages = items
      .map((d) => d.toJSON() as unknown as ChatMessageDto)
      .reverse();
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem && lastItem.createdAt && lastItem._id
        ? `${lastItem.createdAt.toISOString()}_${lastItem._id.toString()}`
        : undefined;

    return { messages, nextCursor };
  }

  /**
   * Host deletes a message (soft deletion).
   */
  async deleteMessage(
    roomId: string,
    messageId: string,
    requestingUserId: string
  ): Promise<{ success: boolean; messageId: string }> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(messageId)) {
      throw new Error('INVALID_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const messageObjectId = new Types.ObjectId(messageId);

    const room = await RoomModel.findById(roomObjectId).select('ownerId').exec();
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }

    // Only room host can delete messages
    if (room.ownerId.toString() !== requestingUserId) {
      throw new Error('FORBIDDEN_NOT_HOST');
    }

    const message = await RoomMessageModel.findOne({
      _id: messageObjectId,
      roomId: roomObjectId,
    }).exec();

    if (!message) {
      throw new Error('MESSAGE_NOT_FOUND');
    }

    message.deletedAt = new Date();
    message.deletedBy = new Types.ObjectId(requestingUserId);
    await message.save();

    logger.info({ roomId, messageId, hostId: requestingUserId }, 'Message soft-deleted by host');

    return { success: true, messageId };
  }

  /**
   * Add emoji reaction to a message.
   */
  async addReaction(
    roomId: string,
    messageId: string,
    user: { id: string; username: string },
    emoji: string
  ): Promise<ChatReactionSummaryDto[]> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(messageId)) {
      throw new Error('INVALID_ID');
    }

    if (!SUPPORTED_REACTION_EMOJIS.includes(emoji as SupportedReactionEmoji)) {
      throw new Error('INVALID_EMOJI');
    }

    if (!reactionRateLimiter.consume(user.id, 10, 5000)) {
      throw new Error('RATE_LIMITED');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const messageObjectId = new Types.ObjectId(messageId);
    const userObjectId = new Types.ObjectId(user.id);

    // Verify room exists and active membership or host status
    const room = await RoomModel.findById(roomObjectId).select('status ownerId').exec();
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }

    if (room.status === 'closed') {
      throw new Error('ROOM_CLOSED');
    }

    const isHost = room.ownerId.toString() === user.id;
    const isMember = await RoomMembershipModel.exists({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
    });

    if (!isMember && !isHost) {
      throw new Error('FORBIDDEN_NOT_A_MEMBER');
    }

    // Atomic conditional addition: push reaction only if user has not already reacted with this emoji
    const updateResult = await RoomMessageModel.updateOne(
      {
        _id: messageObjectId,
        roomId: roomObjectId,
        deletedAt: null,
        reactions: {
          $not: {
            $elemMatch: { emoji, userId: userObjectId },
          },
        },
      },
      {
        $push: {
          reactions: {
            emoji,
            userId: userObjectId,
            username: user.username,
            createdAt: new Date(),
          },
        },
      }
    ).exec();

    if (updateResult.matchedCount === 0) {
      const existing = await RoomMessageModel.findOne({
        _id: messageObjectId,
        roomId: roomObjectId,
      }).select('deletedAt reactions').exec();

      if (!existing) {
        throw new Error('MESSAGE_NOT_FOUND');
      }

      if (existing.deletedAt) {
        throw new Error('CANNOT_REACT_DELETED_MESSAGE');
      }

      // If user already reacted with this emoji, treat as idempotent duplicate
      logger.info(
        { roomId, messageId, userId: user.id, emoji },
        'Idempotent duplicate reaction add detected'
      );
    }

    const updated = await RoomMessageModel.findById(messageObjectId).exec();
    if (!updated) {
      throw new Error('MESSAGE_NOT_FOUND');
    }

    const dto = updated.toJSON() as unknown as ChatMessageDto;
    return dto.reactions || [];
  }

  /**
   * Remove emoji reaction from a message with authoritative membership verification.
   */
  async removeReaction(
    roomId: string,
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<ChatReactionSummaryDto[]> {
    if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(messageId)) {
      throw new Error('INVALID_ID');
    }

    if (!SUPPORTED_REACTION_EMOJIS.includes(emoji as SupportedReactionEmoji)) {
      throw new Error('INVALID_EMOJI');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const messageObjectId = new Types.ObjectId(messageId);
    const userObjectId = new Types.ObjectId(userId);

    // Verify room exists and active membership or host status
    const room = await RoomModel.findById(roomObjectId).select('status ownerId').exec();
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const isHost = room.ownerId.toString() === userId;
    const isMember = await RoomMembershipModel.exists({
      roomId: roomObjectId,
      userId: userObjectId,
      status: 'active',
    });

    if (!isMember && !isHost) {
      throw new Error('FORBIDDEN_NOT_A_MEMBER');
    }

    const updated = await RoomMessageModel.findOneAndUpdate(
      {
        _id: messageObjectId,
        roomId: roomObjectId,
      },
      { $pull: { reactions: { emoji, userId: userObjectId } } },
      { new: true }
    ).exec();

    if (!updated) {
      throw new Error('MESSAGE_NOT_FOUND');
    }

    const dto = updated.toJSON() as unknown as ChatMessageDto;
    return dto.reactions || [];
  }

  /**
   * Record a room domain activity and broadcast to room channel.
   */
  async recordActivity(
    roomId: string,
    type: RoomActivityType,
    actor: { id: string; username: string; avatar?: string | null; role?: string },
    message: string,
    target?: { id: string; username: string },
    metadata?: Record<string, unknown>
  ): Promise<RoomActivityDto> {
    const roomObjectId = new Types.ObjectId(roomId);

    const doc = await RoomActivityModel.create({
      roomId: roomObjectId,
      type,
      actor: {
        id: new Types.ObjectId(actor.id),
        username: actor.username,
        avatar: actor.avatar ?? null,
        role: actor.role ?? 'member',
      },
      target: target
        ? {
            id: new Types.ObjectId(target.id),
            username: target.username,
          }
        : undefined,
      message,
      metadata: metadata || {},
    });

    const dto = doc.toJSON() as unknown as RoomActivityDto;

    // Broadcast in real time
    const io = getSocketServer();
    if (io) {
      const channel = getRoomChannel(roomId);
      io.to(channel).emit(SOCKET_EVENTS.SERVER.ACTIVITY_NEW, {
        roomId,
        activity: dto,
      });
    }

    return dto;
  }

  /**
   * Retrieve recent room activities.
   */
  async getActivities(roomId: string, requestingUserId?: string, limit = 50): Promise<RoomActivityDto[]> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new Error('INVALID_ROOM_ID');
    }

    const roomObjectId = new Types.ObjectId(roomId);
    const room = await RoomModel.findById(roomObjectId).select('visibility ownerId').exec();

    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }

    if (room.visibility === 'private') {
      if (!requestingUserId) {
        throw new Error('UNAUTHORIZED');
      }

      const isHost = room.ownerId.toString() === requestingUserId;
      if (!isHost) {
        const isMember = await RoomMembershipModel.exists({
          roomId: roomObjectId,
          userId: new Types.ObjectId(requestingUserId),
          status: 'active',
        });

        if (!isMember) {
          throw new Error('FORBIDDEN_PRIVATE_ROOM');
        }
      }
    }

    const boundedLimit = Math.min(100, Math.max(1, limit));
    const docs = await RoomActivityModel.find({ roomId: roomObjectId })
      .sort({ createdAt: -1 })
      .limit(boundedLimit)
      .exec();

    return docs.map((d) => d.toJSON() as unknown as RoomActivityDto);
  }
}

export const chatService = new ChatService();
