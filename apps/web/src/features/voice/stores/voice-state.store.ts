import { create } from 'zustand';
import {
  RoomVoiceParticipantStateDto,
  VoiceConnectionState,
  VoiceParticipantUpdatedPayload,
} from '@ktv/contracts';
import { VoiceParticipantInfo } from '../types/voice.types';

export interface VirtualRoomVoiceAdapterEntry {
  userId: string;
  isSpeaking: boolean;
  isMuted: boolean;
  connectionState: VoiceConnectionState;
}

export type VirtualRoomVoiceAdapterMap = Map<string, VirtualRoomVoiceAdapterEntry>;

interface VoiceStateStore {
  roomId: string | null;
  connectionState: VoiceConnectionState;
  isAudioBlocked: boolean;
  errorMessage: string | null;
  liveKitParticipants: Record<string, VoiceParticipantInfo>;
  socketVoicePresence: Record<string, RoomVoiceParticipantStateDto>;

  setRoomId: (roomId: string | null) => void;
  setConnectionState: (connectionState: VoiceConnectionState) => void;
  setIsAudioBlocked: (isAudioBlocked: boolean) => void;
  setErrorMessage: (errorMessage: string | null) => void;
  setLiveKitParticipants: (participants: VoiceParticipantInfo[]) => void;
  applyVoiceSnapshot: (roomId: string, participants: RoomVoiceParticipantStateDto[]) => void;
  applyVoiceParticipantUpdate: (payload: VoiceParticipantUpdatedPayload) => void;
  reset: () => void;
}

export const useVoiceStateStore = create<VoiceStateStore>((set) => ({
  roomId: null,
  connectionState: 'idle',
  isAudioBlocked: false,
  errorMessage: null,
  liveKitParticipants: {},
  socketVoicePresence: {},

  setRoomId: (roomId) =>
    set((state) => {
      if (state.roomId === roomId) return state;
      return {
        roomId,
        connectionState: 'idle',
        isAudioBlocked: false,
        errorMessage: null,
        liveKitParticipants: {},
        socketVoicePresence: {},
      };
    }),

  setConnectionState: (connectionState) => set({ connectionState }),
  setIsAudioBlocked: (isAudioBlocked) => set({ isAudioBlocked }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  setLiveKitParticipants: (participants) =>
    set(() => {
      const next: Record<string, VoiceParticipantInfo> = {};
      for (const p of participants) {
        const existing = next[p.userId];
        if (!existing) {
          next[p.userId] = { ...p };
        } else {
          // Aggregate multiple sessions/tabs for the same userId
          next[p.userId] = {
            ...existing,
            isSpeaking: existing.isSpeaking || p.isSpeaking,
            isMuted: existing.isMuted && p.isMuted,
            isLocal: existing.isLocal || p.isLocal,
          };
        }
      }
      return { liveKitParticipants: next };
    }),

  applyVoiceSnapshot: (roomId, participants) =>
    set((state) => {
      if (state.roomId && state.roomId !== roomId) return state;
      const next: Record<string, RoomVoiceParticipantStateDto> = {};
      for (const p of participants) {
        if (p.isConnected) {
          next[p.userId] = p;
        }
      }
      return { socketVoicePresence: next };
    }),

  applyVoiceParticipantUpdate: (payload) =>
    set((state) => {
      if (state.roomId && state.roomId !== payload.roomId) return state;
      const next = { ...state.socketVoicePresence };
      if (payload.event === 'left' || !payload.participant.isConnected) {
        delete next[payload.participant.userId];
      } else {
        next[payload.participant.userId] = payload.participant;
      }
      return { socketVoicePresence: next };
    }),

  reset: () =>
    set({
      connectionState: 'idle',
      isAudioBlocked: false,
      errorMessage: null,
      liveKitParticipants: {},
      socketVoicePresence: {},
    }),
}));

/**
 * Merges immediate LiveKit SDK participant state with room-wide Socket.IO voice presence
 * into a flat serializable participant list for UI components.
 */
export function mergeVoiceParticipants(
  liveKitParticipants: VoiceParticipantInfo[],
  socketVoicePresence: Record<string, RoomVoiceParticipantStateDto>,
  isLiveKitConnected: boolean
): VoiceParticipantInfo[] {
  const byUserId = new Map<string, VoiceParticipantInfo>();

  // 1. Seed with room-wide Socket.IO voice presence
  for (const s of Object.values(socketVoicePresence)) {
    if (!s.isConnected) continue;
    byUserId.set(s.userId, {
      identity: `socket_${s.userId}`,
      userId: s.userId,
      username: s.username,
      displayName: s.displayName,
      avatarUrl: s.avatarUrl,
      isMuted: s.isMuted,
      isSpeaking: s.isSpeaking,
      isLocal: false,
      joinedAt: s.updatedAt,
    });
  }

  // 2. Overlay authoritative immediate LiveKit SDK state when connected
  if (isLiveKitConnected) {
    for (const p of liveKitParticipants) {
      const existing = byUserId.get(p.userId);
      if (!existing || existing.identity.startsWith('socket_')) {
        byUserId.set(p.userId, { ...p });
      } else {
        byUserId.set(p.userId, {
          ...existing,
          isSpeaking: existing.isSpeaking || p.isSpeaking,
          isMuted: existing.isMuted && p.isMuted,
          isLocal: existing.isLocal || p.isLocal,
        });
      }
    }
  }

  return Array.from(byUserId.values());
}

/**
 * Builds the serializable Virtual Room voice adapter map:
 * Map<userId, { userId, isSpeaking, isMuted, connectionState }>
 */
export function buildVirtualRoomVoiceAdapterMap(params: {
  liveKitParticipants: VoiceParticipantInfo[];
  socketVoicePresence: Record<string, RoomVoiceParticipantStateDto>;
  localUserId?: string | null;
  localConnectionState: VoiceConnectionState;
  isLiveKitConnected: boolean;
}): VirtualRoomVoiceAdapterMap {
  const {
    liveKitParticipants,
    socketVoicePresence,
    localUserId,
    localConnectionState,
    isLiveKitConnected,
  } = params;

  const adapterMap: VirtualRoomVoiceAdapterMap = new Map();

  // 1. Add Socket.IO room voice presence entries
  for (const entry of Object.values(socketVoicePresence)) {
    if (!entry.isConnected) continue;
    adapterMap.set(entry.userId, {
      userId: entry.userId,
      isSpeaking: entry.isMuted ? false : entry.isSpeaking,
      isMuted: entry.isMuted,
      connectionState: entry.connectionState,
    });
  }

  // 2. Overlay live SDK participants (authoritative immediate media state)
  if (isLiveKitConnected) {
    for (const p of liveKitParticipants) {
      adapterMap.set(p.userId, {
        userId: p.userId,
        isSpeaking: p.isMuted ? false : p.isSpeaking,
        isMuted: p.isMuted,
        connectionState: p.isLocal ? localConnectionState : 'connected',
      });
    }
  }

  // 3. Ensure local user's reconnecting/connecting/failed state is represented if active
  if (localUserId && localConnectionState !== 'idle' && localConnectionState !== 'disconnected') {
    const existing = adapterMap.get(localUserId);
    if (existing) {
      adapterMap.set(localUserId, {
        ...existing,
        connectionState: localConnectionState,
      });
    } else if (localConnectionState === 'reconnecting' || localConnectionState === 'connecting') {
      adapterMap.set(localUserId, {
        userId: localUserId,
        isSpeaking: false,
        isMuted: false,
        connectionState: localConnectionState,
      });
    }
  }

  return adapterMap;
}
