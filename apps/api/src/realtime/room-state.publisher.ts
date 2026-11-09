import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { getSocketServer } from './socket.server.js';
import { getRoomChannel } from './room.events.js';
import {
  SOCKET_EVENTS,
  RoomStateEventDto,
  RoomStateEventType,
} from '@ktv/contracts';
import { RoomStateOutboxModel } from '../modules/rooms/outbox.model.js';
import { logger } from '../utils/logger.js';

/**
 * Publish an authoritative, versioned room-state transition event to all room channel subscribers.
 * Uses RoomStateOutbox for durable publication and recovery.
 */
export async function publishRoomStateEvent(
  roomId: string,
  type: RoomStateEventType,
  payload: Record<string, unknown>,
  version: number
): Promise<RoomStateEventDto> {
  const eventId = randomUUID();
  const occurredAt = new Date().toISOString();

  const event: RoomStateEventDto = {
    roomId,
    version,
    eventId,
    type,
    occurredAt,
    payload,
  };

  // 1. Persist to durable outbox
  try {
    if (Types.ObjectId.isValid(roomId)) {
      await RoomStateOutboxModel.findOneAndUpdate(
        { roomId: new Types.ObjectId(roomId), version },
        {
          $setOnInsert: {
            eventId,
            type,
            payload,
            attemptCount: 0,
            publishedAt: null,
          },
        },
        { upsert: true }
      ).exec();
    }
  } catch (err: unknown) {
    logger.warn(
      { err, roomId, version, eventId },
      '⚠️ Failed to record event to RoomStateOutbox; proceeding with live broadcast'
    );
  }

  // 2. Broadcast via Socket.IO
  const io = getSocketServer();
  if (io) {
    try {
      const channel = getRoomChannel(roomId);
      io.to(channel).emit(SOCKET_EVENTS.SERVER.ROOM_STATE_EVENT, event);

      // Mark outbox record as published
      if (Types.ObjectId.isValid(roomId)) {
        await RoomStateOutboxModel.updateOne(
          { roomId: new Types.ObjectId(roomId), version },
          { $set: { publishedAt: new Date() }, $inc: { attemptCount: 1 } }
        ).exec();
      }

      logger.info(
        { roomId, version, type, eventId },
        '📢 Published versioned room state event'
      );
    } catch (err: unknown) {
      logger.error(
        { err, roomId, version, eventId },
        '❌ Error during Socket.IO broadcast of room state event'
      );
      if (Types.ObjectId.isValid(roomId)) {
        await RoomStateOutboxModel.updateOne(
          { roomId: new Types.ObjectId(roomId), version },
          {
            $inc: { attemptCount: 1 },
            $set: { lastError: err instanceof Error ? err.message : 'Broadcast error' },
          }
        ).exec();
      }
    }
  } else {
    logger.warn(
      { roomId, version, type, eventId },
      '⚠️ Socket server not ready; event remains pending in outbox'
    );
  }

  return event;
}

/**
 * Retry broadcasting any unacknowledged or pending outbox records.
 */
export async function retryPendingOutboxEvents(batchSize = 50): Promise<number> {
  const io = getSocketServer();
  if (!io) return 0;

  const pending = await RoomStateOutboxModel.find({
    publishedAt: null,
    attemptCount: { $lt: 5 },
  })
    .sort({ createdAt: 1 })
    .limit(batchSize)
    .exec();

  if (pending.length === 0) return 0;

  let retriedCount = 0;

  for (const record of pending) {
    try {
      const roomIdStr = record.roomId.toString();
      const channel = getRoomChannel(roomIdStr);
      const event: RoomStateEventDto = {
        roomId: roomIdStr,
        version: record.version,
        eventId: record.eventId,
        type: record.type,
        occurredAt: record.createdAt.toISOString(),
        payload: record.payload,
      };

      io.to(channel).emit(SOCKET_EVENTS.SERVER.ROOM_STATE_EVENT, event);

      record.publishedAt = new Date();
      record.attemptCount += 1;
      await record.save();
      retriedCount += 1;
    } catch (err: unknown) {
      record.attemptCount += 1;
      record.lastError = err instanceof Error ? err.message : 'Retry broadcast error';
      await record.save();
    }
  }

  if (retriedCount > 0) {
    logger.info({ retriedCount }, '🔁 Retried pending room state outbox events');
  }

  return retriedCount;
}

/**
 * Retrieve durable outbox events for a room between two versions.
 */
export async function getOutboxEventsSince(
  roomId: string,
  afterVersion: number,
  limit = 50
): Promise<RoomStateEventDto[]> {
  if (!Types.ObjectId.isValid(roomId)) return [];

  const records = await RoomStateOutboxModel.find({
    roomId: new Types.ObjectId(roomId),
    version: { $gt: afterVersion },
  })
    .sort({ version: 1 })
    .limit(limit)
    .exec();

  return records.map((r) => ({
    roomId: r.roomId.toString(),
    version: r.version,
    eventId: r.eventId,
    type: r.type,
    occurredAt: r.createdAt.toISOString(),
    payload: r.payload,
  }));
}
