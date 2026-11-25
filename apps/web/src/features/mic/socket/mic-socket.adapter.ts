import { z } from 'zod';
import {
  MicApprovePayload,
  MicApprovePayloadSchema,
  MicCancelPayload,
  MicCancelPayloadSchema,
  MicOwnershipChangedPayload,
  MicOwnershipChangedPayloadSchema,
  MicOwnershipSnapshotDto,
  MicOwnershipSnapshotDtoSchema,
  MicRejectPayload,
  MicRejectPayloadSchema,
  MicReleasePayload,
  MicReleasePayloadSchema,
  MicRequestCancelledPayload,
  MicRequestCancelledPayloadSchema,
  MicRequestCreatedPayload,
  MicRequestCreatedPayloadSchema,
  MicRequestPayload,
  MicRequestPayloadSchema,
  MicStatePayload,
  MicStatePayloadSchema,
  MicStateRequestPayload,
  MicStateRequestPayloadSchema,
  SOCKET_EVENTS,
  SocketAckResponse,
  SocketAckResponseSchema,
} from '@ktv/contracts';
import {
  socketManager,
  SocketConnectionStatus,
} from '@/lib/socket/socket-client';

const MIC_ACK_TIMEOUT_MS = 10_000;

export interface MicSocketSubscriptionHandlers {
  onMicState: (payload: MicStatePayload) => void;
  onRequestCreated?: (payload: MicRequestCreatedPayload) => void;
  onRequestCancelled?: (payload: MicRequestCancelledPayload) => void;
  onOwnershipChanged?: (payload: MicOwnershipChangedPayload) => void;
  onStatusChange?: (status: SocketConnectionStatus) => void;
}

type ManagedSocket = NonNullable<ReturnType<typeof socketManager.getSocket>>;

/**
 * Attaches S3 Virtual Microphone Ownership server event listeners to the
 * singleton `socketManager` socket, following the `useVoiceClient` pattern:
 * - `socketManager.subscribeStatus()` tracking
 * - `boundSocket` reference tracking across reconnects/replacements
 * - Idempotent `.off` before `.on` and full cleanup on unmount (React Strict Mode safe)
 */
export function subscribeMicSocket(
  handlers: MicSocketSubscriptionHandlers
): () => void {
  let boundSocket: ManagedSocket | null = null;
  let disposed = false;

  const handleMicState = (raw: unknown) => {
    if (disposed) return;
    const parsed = MicStatePayloadSchema.safeParse(raw);
    if (parsed.success) {
      handlers.onMicState(parsed.data);
    }
  };

  const handleRequestCreated = (raw: unknown) => {
    if (disposed || !handlers.onRequestCreated) return;
    const parsed = MicRequestCreatedPayloadSchema.safeParse(raw);
    if (parsed.success) {
      handlers.onRequestCreated(parsed.data);
    }
  };

  const handleRequestCancelled = (raw: unknown) => {
    if (disposed || !handlers.onRequestCancelled) return;
    const parsed = MicRequestCancelledPayloadSchema.safeParse(raw);
    if (parsed.success) {
      handlers.onRequestCancelled(parsed.data);
    }
  };

  const handleOwnershipChanged = (raw: unknown) => {
    if (disposed || !handlers.onOwnershipChanged) return;
    const parsed = MicOwnershipChangedPayloadSchema.safeParse(raw);
    if (parsed.success) {
      handlers.onOwnershipChanged(parsed.data);
    }
  };

  const detachListeners = (s: ManagedSocket) => {
    s.off(SOCKET_EVENTS.SERVER.MIC_STATE, handleMicState);
    s.off(SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED, handleRequestCreated);
    s.off(SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED, handleRequestCancelled);
    s.off(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED, handleOwnershipChanged);
  };

  const attachListeners = (s: ManagedSocket) => {
    if (boundSocket === s) return;
    if (boundSocket && boundSocket !== s) {
      detachListeners(boundSocket);
    }
    detachListeners(s);
    s.on(SOCKET_EVENTS.SERVER.MIC_STATE, handleMicState);
    s.on(SOCKET_EVENTS.SERVER.MIC_REQUEST_CREATED, handleRequestCreated);
    s.on(SOCKET_EVENTS.SERVER.MIC_REQUEST_CANCELLED, handleRequestCancelled);
    s.on(SOCKET_EVENTS.SERVER.MIC_OWNERSHIP_CHANGED, handleOwnershipChanged);
    boundSocket = s;
  };

  const syncCurrentSocket = () => {
    const currentSocket = socketManager.getSocket();
    if (currentSocket) {
      attachListeners(currentSocket);
    } else if (boundSocket) {
      detachListeners(boundSocket);
      boundSocket = null;
    }
  };

  syncCurrentSocket();

  const unsubscribeStatus = socketManager.subscribeStatus((status) => {
    if (disposed) return;
    syncCurrentSocket();
    handlers.onStatusChange?.(status);
  });

  return () => {
    disposed = true;
    unsubscribeStatus();
    if (boundSocket) {
      detachListeners(boundSocket);
      boundSocket = null;
    }
  };
}

function emitWithMicSnapshotAck<TPayload>(
  eventName: string,
  schema: z.ZodType<TPayload>,
  payload: TPayload
): Promise<SocketAckResponse<MicOwnershipSnapshotDto>> {
  const parsedPayload = schema.safeParse(payload);
  if (!parsedPayload.success) {
    return Promise.resolve({
      success: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message:
          parsedPayload.error.issues[0]?.message || 'Invalid microphone command payload',
      },
    });
  }

  const socket = socketManager.getSocket();
  if (!socket || !socket.connected) {
    return Promise.resolve({
      success: false,
      error: {
        code: 'SOCKET_NOT_CONNECTED',
        message: 'Realtime connection is offline. Please wait to reconnect.',
      },
    });
  }

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        success: false,
        error: {
          code: 'ACK_TIMEOUT',
          message: 'Stage Mic request timed out. Refreshing latest room state…',
        },
      });
    }, MIC_ACK_TIMEOUT_MS);

    socket.emit(eventName, parsedPayload.data, (rawAck: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const ackParsed = SocketAckResponseSchema.safeParse(rawAck);
      if (!ackParsed.success) {
        resolve({
          success: false,
          error: {
            code: 'INVALID_ACK_RESPONSE',
            message: 'Received malformed server acknowledgement.',
          },
        });
        return;
      }

      if (!ackParsed.data.success) {
        resolve({
          success: false,
          error: ackParsed.data.error ?? {
            code: 'MIC_COMMAND_FAILED',
            message: 'Unable to complete Stage Mic action.',
          },
          correlationId: ackParsed.data.correlationId,
        });
        return;
      }

      const snapshotParsed = MicOwnershipSnapshotDtoSchema.safeParse(
        ackParsed.data.data
      );
      if (!snapshotParsed.success) {
        resolve({
          success: false,
          error: {
            code: 'INVALID_SNAPSHOT_PAYLOAD',
            message: 'Server returned an invalid Stage Mic snapshot.',
          },
          correlationId: ackParsed.data.correlationId,
        });
        return;
      }

      resolve({
        success: true,
        data: snapshotParsed.data,
        correlationId: ackParsed.data.correlationId,
      });
    });
  });
}

export const micSocketAdapter = {
  subscribe: subscribeMicSocket,

  requestMic: (
    payload: MicRequestPayload
  ): Promise<SocketAckResponse<MicOwnershipSnapshotDto>> =>
    emitWithMicSnapshotAck(
      SOCKET_EVENTS.CLIENT.MIC_REQUEST,
      MicRequestPayloadSchema,
      payload
    ),

  cancelMic: (
    payload: MicCancelPayload
  ): Promise<SocketAckResponse<MicOwnershipSnapshotDto>> =>
    emitWithMicSnapshotAck(
      SOCKET_EVENTS.CLIENT.MIC_CANCEL,
      MicCancelPayloadSchema,
      payload
    ),

  approveMic: (
    payload: MicApprovePayload
  ): Promise<SocketAckResponse<MicOwnershipSnapshotDto>> =>
    emitWithMicSnapshotAck(
      SOCKET_EVENTS.CLIENT.MIC_APPROVE,
      MicApprovePayloadSchema,
      payload
    ),

  rejectMic: (
    payload: MicRejectPayload
  ): Promise<SocketAckResponse<MicOwnershipSnapshotDto>> =>
    emitWithMicSnapshotAck(
      SOCKET_EVENTS.CLIENT.MIC_REJECT,
      MicRejectPayloadSchema,
      payload
    ),

  releaseMic: (
    payload: MicReleasePayload
  ): Promise<SocketAckResponse<MicOwnershipSnapshotDto>> =>
    emitWithMicSnapshotAck(
      SOCKET_EVENTS.CLIENT.MIC_RELEASE,
      MicReleasePayloadSchema,
      payload
    ),

  requestState: (
    payload: MicStateRequestPayload
  ): Promise<SocketAckResponse<MicOwnershipSnapshotDto>> =>
    emitWithMicSnapshotAck(
      SOCKET_EVENTS.CLIENT.MIC_STATE_REQUEST,
      MicStateRequestPayloadSchema,
      payload
    ),
};
