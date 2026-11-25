import { create } from 'zustand';
import {
  MicOwnershipSnapshotDto,
  MicOwnershipState,
  MicPendingRequestDto,
  MicSingerDto,
} from '@ktv/contracts';

export const MAX_PENDING_MIC_REQUESTS = 20;

export type MicActionStatus =
  | 'idle'
  | 'requesting'
  | 'cancelling'
  | 'approving'
  | 'rejecting'
  | 'releasing';

export interface MicOwnershipStoreData {
  roomId: string | null;
  state: MicOwnershipState;
  currentSinger: MicSingerDto | null;
  currentSingerId: string | null;
  currentSingerSessionId: string | null;
  pendingRequests: MicPendingRequestDto[];
  ownershipVersion: number;
  grantedAt: string | null;
  updatedAt: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  actionStatus: MicActionStatus;
  actingTargetUserId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastNotice: string | null;
}

export interface MicOwnershipStoreState extends MicOwnershipStoreData {
  initRoom: (roomId: string) => void;
  applySnapshot: (snapshot: MicOwnershipSnapshotDto) => boolean;
  setLoading: (isLoading: boolean) => void;
  setActionStatus: (
    actionStatus: MicActionStatus,
    actingTargetUserId?: string | null
  ) => void;
  setError: (errorCode: string | null, errorMessage: string | null) => void;
  setNotice: (notice: string | null) => void;
  reset: () => void;
}

export const INITIAL_MIC_STORE_DATA: MicOwnershipStoreData = {
  roomId: null,
  state: 'AVAILABLE',
  currentSinger: null,
  currentSingerId: null,
  currentSingerSessionId: null,
  pendingRequests: [],
  ownershipVersion: 0,
  grantedAt: null,
  updatedAt: null,
  isInitialized: false,
  isLoading: false,
  actionStatus: 'idle',
  actingTargetUserId: null,
  errorCode: null,
  errorMessage: null,
  lastNotice: null,
};

export const useMicStore = create<MicOwnershipStoreState>()((set, get) => ({
  ...INITIAL_MIC_STORE_DATA,

  initRoom: (roomId: string) => {
    const current = get();
    if (current.roomId === roomId) {
      return;
    }

    set({
      ...INITIAL_MIC_STORE_DATA,
      roomId,
      isLoading: true,
    });
  },

  applySnapshot: (snapshot: MicOwnershipSnapshotDto): boolean => {
    const current = get();

    // 1. Reject snapshots when uninitialized for a room or belonging to another room
    if (!current.roomId || snapshot.roomId !== current.roomId) {
      return false;
    }

    // 2. Reject stale snapshots with lower ownershipVersion
    if (snapshot.ownershipVersion < current.ownershipVersion) {
      return false;
    }

    // 3. Treat duplicate ownershipVersion as idempotent (never let late REST overwrite Socket.IO)
    if (
      current.isInitialized &&
      snapshot.ownershipVersion === current.ownershipVersion
    ) {
      if (current.isLoading) {
        set({ isLoading: false });
      }
      return true;
    }

    // 4. Apply strictly newer (or first authoritative) snapshot without fabricating transitions
    set({
      state: snapshot.state,
      currentSinger: snapshot.currentSinger
        ? { ...snapshot.currentSinger }
        : null,
      currentSingerId: snapshot.currentSingerId,
      currentSingerSessionId: snapshot.currentSingerSessionId,
      pendingRequests: snapshot.pendingRequests.map((req) => ({ ...req })),
      ownershipVersion: snapshot.ownershipVersion,
      grantedAt: snapshot.grantedAt,
      updatedAt: snapshot.updatedAt,
      isInitialized: true,
      isLoading: false,
    });

    return true;
  },

  setLoading: (isLoading: boolean) => {
    set({ isLoading });
  },

  setActionStatus: (
    actionStatus: MicActionStatus,
    actingTargetUserId: string | null = null
  ) => {
    set({ actionStatus, actingTargetUserId });
  },

  setError: (errorCode: string | null, errorMessage: string | null) => {
    set({ errorCode, errorMessage });
  },

  setNotice: (lastNotice: string | null) => {
    set({ lastNotice });
  },

  reset: () => {
    set({ ...INITIAL_MIC_STORE_DATA });
  },
}));
