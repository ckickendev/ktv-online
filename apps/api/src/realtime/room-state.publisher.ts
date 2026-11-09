import { randomUUID } from 'crypto';
import { getSocketServer } from './socket.server.js';
import { getRoomChannel } from './room.events.js';
import {
  SOCKET_EVENTS,
  RoomStateEventDto,
  RoomStateEventType,
} from '@ktv/contracts';
import { logger } from '../utils/logger.js';

/**
 * Publish an authoritative, versioned room-state transition event to all room channel subscribers.
 */
export function publishRoomStateEvent(
  roomId: string,
  type: RoomStateEventType,
  payload: Record<string, unknown>,
  version: number
): RoomStateEventDto {
  const event: RoomStateEventDto = {
    roomId,
    version,
    eventId: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    payload,
  };

  const io = getSocketServer();
  if (io) {
    const channel = getRoomChannel(roomId);
    io.to(channel).emit(SOCKET_EVENTS.SERVER.ROOM_STATE_EVENT, event);
    logger.info(
      { roomId, version, type, eventId: event.eventId },
      '📢 Published versioned room state event'
    );
  }

  return event;
}
