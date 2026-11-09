import { Server, Socket } from 'socket.io';
import {
  SendChatMessagePayloadSchema,
  AddReactionPayloadSchema,
  RemoveReactionPayloadSchema,
  DeleteChatMessagePayloadSchema,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { chatService } from '../modules/chat/chat.service.js';
import { getRoomChannel } from './room.events.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedSocketData } from './socket.auth.js';

export function registerChatEvents(io: Server, socket: Socket<any, any, any, AuthenticatedSocketData>): void {
  const user = socket.data.user;

  // 1. Send Chat Message
  socket.on(
    SOCKET_EVENTS.CLIENT.CHAT_MESSAGE_SEND,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = SendChatMessagePayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid chat payload',
          },
        });
        return;
      }

      const { roomId, content, clientMessageId, correlationId } = parsed.data;

      try {
        const { message, isDuplicate } = await chatService.sendMessage(
          roomId,
          {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
          },
          content,
          clientMessageId
        );

        const channel = getRoomChannel(roomId);

        // Broadcast to all sockets in channel only if this is an authoritative new message (not an idempotent duplicate)
        if (!isDuplicate) {
          io.to(channel).emit(SOCKET_EVENTS.SERVER.CHAT_MESSAGE_NEW, {
            roomId,
            message,
            correlationId,
          });
        }

        ack?.({
          success: true,
          data: message,
          correlationId,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'FAILED_TO_SEND_MESSAGE';
        logger.warn({ err, roomId, userId: user.id }, 'Chat message send rejected');

        socket.emit(SOCKET_EVENTS.SERVER.CHAT_ERROR, {
          code: message,
          message: 'Unable to send message',
          clientMessageId,
          correlationId,
        });

        ack?.({
          success: false,
          error: { code: message, message: 'Failed to send message' },
          correlationId,
        });
      }
    }
  );

  // 2. Add Emoji Reaction
  socket.on(
    SOCKET_EVENTS.CLIENT.CHAT_REACTION_ADD,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = AddReactionPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid reaction payload',
          },
        });
        return;
      }

      const { roomId, messageId, emoji, correlationId } = parsed.data;

      try {
        const reactions = await chatService.addReaction(
          roomId,
          messageId,
          { id: user.id, username: user.username },
          emoji
        );

        const channel = getRoomChannel(roomId);

        // Broadcast updated reactions for the message to room occupants
        io.to(channel).emit(SOCKET_EVENTS.SERVER.CHAT_REACTION_UPDATED, {
          roomId,
          messageId,
          reactions,
          correlationId,
        });

        ack?.({
          success: true,
          data: { reactions },
          correlationId,
        });
      } catch (err: unknown) {
        const code = err instanceof Error ? err.message : 'FAILED_TO_ADD_REACTION';
        ack?.({
          success: false,
          error: { code, message: 'Failed to add reaction' },
          correlationId,
        });
      }
    }
  );

  // 3. Remove Emoji Reaction
  socket.on(
    SOCKET_EVENTS.CLIENT.CHAT_REACTION_REMOVE,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = RemoveReactionPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid reaction payload',
          },
        });
        return;
      }

      const { roomId, messageId, emoji, correlationId } = parsed.data;

      try {
        const reactions = await chatService.removeReaction(roomId, messageId, user.id, emoji);

        const channel = getRoomChannel(roomId);

        // Broadcast updated reactions for the message to room occupants
        io.to(channel).emit(SOCKET_EVENTS.SERVER.CHAT_REACTION_UPDATED, {
          roomId,
          messageId,
          reactions,
          correlationId,
        });

        ack?.({
          success: true,
          data: { reactions },
          correlationId,
        });
      } catch (err: unknown) {
        const code = err instanceof Error ? err.message : 'FAILED_TO_REMOVE_REACTION';
        ack?.({
          success: false,
          error: { code, message: 'Failed to remove reaction' },
          correlationId,
        });
      }
    }
  );

  // 4. Host Deletes Message via Socket
  socket.on(
    SOCKET_EVENTS.CLIENT.CHAT_MESSAGE_DELETE,
    async (rawPayload: unknown, ack?: (res: SocketAckResponse) => void) => {
      const parsed = DeleteChatMessagePayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack?.({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid delete payload',
          },
        });
        return;
      }

      const { roomId, messageId, correlationId } = parsed.data;

      try {
        await chatService.deleteMessage(roomId, messageId, user.id);

        const channel = getRoomChannel(roomId);

        // Broadcast deleted notice to room occupants
        io.to(channel).emit(SOCKET_EVENTS.SERVER.CHAT_MESSAGE_DELETED, {
          roomId,
          messageId,
          deletedBy: user.id,
          correlationId,
        });

        ack?.({
          success: true,
          data: { messageId },
          correlationId,
        });
      } catch (err: unknown) {
        const code = err instanceof Error ? err.message : 'FAILED_TO_DELETE_MESSAGE';
        ack?.({
          success: false,
          error: { code, message: 'Failed to delete message' },
          correlationId,
        });
      }
    }
  );
}
