'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GiftId,
  GiftNewPayload,
  GIFT_CATALOG,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { socketManager } from '@/lib/socket/socket-client';

export interface UseVirtualGiftsOptions {
  enabled?: boolean;
  currentUserId?: string;
}

const MAX_ACTIVE_GIFTS = 5;
const DEDUP_CACHE_SIZE = 50;
const GIFT_ANIMATION_TTL_MS = 4200;

export function useVirtualGifts(roomId: string, options: UseVirtualGiftsOptions = {}) {
  const { enabled = true, currentUserId } = options;
  const [activeGifts, setActiveGifts] = useState<GiftNewPayload[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Bounded deduplication queue
  const seenIdsQueueRef = useRef<string[]>([]);
  const seenIdsSetRef = useRef<Set<string>>(new Set());

  // Listen to prefers-reduced-motion media query
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  const markIdSeen = useCallback((id: string): boolean => {
    if (seenIdsSetRef.current.has(id)) return false;
    seenIdsSetRef.current.add(id);
    seenIdsQueueRef.current.push(id);
    if (seenIdsQueueRef.current.length > DEDUP_CACHE_SIZE) {
      const oldest = seenIdsQueueRef.current.shift();
      if (oldest) {
        seenIdsSetRef.current.delete(oldest);
      }
    }
    return true;
  }, []);

  const pushActiveGift = useCallback((gift: GiftNewPayload) => {
    setActiveGifts((prev) => [...prev.slice(-(MAX_ACTIVE_GIFTS - 1)), gift]);

    setTimeout(() => {
      setActiveGifts((prev) => prev.filter((g) => g.id !== gift.id));
    }, GIFT_ANIMATION_TTL_MS);
  }, []);

  // Real-time socket listener for incoming room gift broadcasts
  useEffect(() => {
    if (!enabled || !roomId) return;

    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleGiftNew = (payload: GiftNewPayload) => {
      if (!payload || payload.roomId !== roomId) return;

      // Deduplication check
      if (payload.clientGiftId && seenIdsSetRef.current.has(payload.clientGiftId)) {
        return;
      }

      if (!markIdSeen(payload.id)) {
        return;
      }

      pushActiveGift(payload);
    };

    socket.on(SOCKET_EVENTS.SERVER.GIFT_NEW, handleGiftNew);

    return () => {
      socket.off(SOCKET_EVENTS.SERVER.GIFT_NEW, handleGiftNew);
    };
  }, [enabled, roomId, markIdSeen, pushActiveGift]);

  // Send a gift to the active performer
  const sendGift = useCallback(
    async (
      giftId: GiftId,
      recipientUserId?: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!roomId) {
        return { success: false, error: 'Room ID is missing' };
      }

      const socket = socketManager.getSocket();
      if (!socket || !socket.connected) {
        return {
          success: false,
          error: 'Connection to lounge server is currently unavailable',
        };
      }

      setIsSending(true);
      setSendError(null);

      const clientGiftId = `cg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      markIdSeen(clientGiftId);

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          setIsSending(false);
          const errorMsg = 'Gift request timed out. Please try again.';
          setSendError(errorMsg);
          resolve({ success: false, error: errorMsg });
        }, 6000);

        socket.emit(
          SOCKET_EVENTS.CLIENT.GIFT_SEND,
          {
            roomId,
            giftId,
            clientGiftId,
            recipientUserId,
          },
          (res?: SocketAckResponse<{ id: string; duplicate?: boolean }>) => {
            clearTimeout(timeout);
            setIsSending(false);

            if (!res || !res.success) {
              const errorMsg = res?.error?.message || 'Failed to send gift to performer';
              setSendError(errorMsg);
              resolve({ success: false, error: errorMsg });
              return;
            }

            if (res.data?.id) {
              markIdSeen(res.data.id);
            }
            resolve({ success: true });
          }
        );
      });
    },
    [roomId, markIdSeen]
  );

  const clearError = useCallback(() => {
    setSendError(null);
  }, []);

  return {
    activeGifts,
    sendGift,
    isSending,
    sendError,
    clearError,
    catalog: GIFT_CATALOG,
    prefersReducedMotion,
    currentUserId,
  };
}
