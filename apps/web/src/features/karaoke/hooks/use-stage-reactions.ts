'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StageReactionEmoji,
  StageReactionNewPayload,
  STAGE_REACTION_EMOJIS,
  SOCKET_EVENTS,
  SocketAckResponse,
} from '@ktv/contracts';
import { socketManager } from '@/lib/socket/socket-client';

export interface StageReactionParticle {
  id: string;
  emoji: StageReactionEmoji;
  x: number; // percentage (15% - 85%)
  senderName: string;
  senderAvatar?: string | null;
  isSelf?: boolean;
}

export interface UseStageReactionsOptions {
  enabled?: boolean;
  currentUserId?: string;
}

const MAX_PARTICLES = 20;
const DEDUP_CACHE_SIZE = 50;
const PARTICLE_TTL_MS = 2000;

export function useStageReactions(roomId: string, options: UseStageReactionsOptions = {}) {
  const { enabled = true, currentUserId } = options;
  const [particles, setParticles] = useState<StageReactionParticle[]>([]);
  const [lastReaction, setLastReaction] = useState<StageReactionParticle | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Bounded FIFO deduplication set
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

  const spawnParticle = useCallback((particle: StageReactionParticle) => {
    setParticles((prev) => [...prev.slice(-(MAX_PARTICLES - 1)), particle]);
    setLastReaction(particle);

    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== particle.id));
    }, PARTICLE_TTL_MS);
  }, []);

  // Subscribe to real-time stage reaction broadcasts
  useEffect(() => {
    if (!enabled || !roomId) return;

    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleReactionNew = (payload: StageReactionNewPayload) => {
      if (!payload || payload.roomId !== roomId) return;

      // Deduplication check: if seen by clientReactionId (rendered optimistically)
      if (payload.clientReactionId && seenIdsSetRef.current.has(payload.clientReactionId)) {
        return;
      }

      // Check if server ID already processed
      if (!markIdSeen(payload.id)) {
        return;
      }

      const isSelf = Boolean(currentUserId && payload.sender.id === currentUserId);
      const x = 15 + Math.random() * 70; // 15% to 85%

      spawnParticle({
        id: payload.id,
        emoji: payload.emoji,
        x,
        senderName: payload.sender.username,
        senderAvatar: payload.sender.avatar,
        isSelf,
      });
    };

    socket.on(SOCKET_EVENTS.SERVER.STAGE_REACTION_NEW, handleReactionNew);

    return () => {
      socket.off(SOCKET_EVENTS.SERVER.STAGE_REACTION_NEW, handleReactionNew);
    };
  }, [enabled, roomId, currentUserId, markIdSeen, spawnParticle]);

  // Emit cheer to server and optimistically render
  const sendReaction = useCallback(
    (emoji: StageReactionEmoji) => {
      if (!roomId) return;
      const socket = socketManager.getSocket();

      const clientReactionId = `cr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      markIdSeen(clientReactionId);

      // Optimistic local spawn
      const x = 30 + Math.random() * 40; // 30% to 70%
      spawnParticle({
        id: clientReactionId,
        emoji,
        x,
        senderName: 'You',
        isSelf: true,
      });

      // Emit if socket is available and connected
      if (socket && socket.connected) {
        socket.emit(
          SOCKET_EVENTS.CLIENT.STAGE_REACTION_SEND,
          {
            roomId,
            emoji,
            clientReactionId,
          },
          (res?: SocketAckResponse<{ id: string }>) => {
            if (res?.data?.id) {
              markIdSeen(res.data.id);
            }
          }
        );
      }
    },
    [roomId, markIdSeen, spawnParticle]
  );

  return {
    particles,
    lastReaction,
    sendReaction,
    prefersReducedMotion,
    availableEmojis: STAGE_REACTION_EMOJIS,
  };
}
