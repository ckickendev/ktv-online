import { describe, it, expect } from 'vitest';
import {
  MicOwnershipSnapshotDto,
  MicOwnershipState,
  MicPendingRequestDto,
  MicSingerDto,
} from '@ktv/contracts';
import {
  EMPTY_STAGE_PRESENTATION,
  VirtualRoomVoiceMap,
} from '@/features/virtual-room';
import {
  MicStageAdapterInput,
  toStagePresentation,
} from '@/features/rooms/adapters';
import { INITIAL_MIC_STORE_DATA } from '@/features/mic';

const ROOM_ID = '65f000000000000000000099';
const ISO_NOW = '2026-11-26T00:00:00.000Z';

function makePending(
  idx: number,
  overrides: Partial<MicPendingRequestDto> = {}
): MicPendingRequestDto {
  return {
    requestId: `req-${idx}`,
    userId: `user-${idx}`,
    username: `requester_${idx}`,
    displayName: `Requester ${idx}`,
    avatar: null,
    requestedAt: ISO_NOW,
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<MicOwnershipSnapshotDto> = {}
): MicOwnershipSnapshotDto {
  return {
    roomId: ROOM_ID,
    state: 'AVAILABLE',
    currentSinger: null,
    currentSingerId: null,
    currentSingerSessionId: null,
    pendingRequests: [],
    ownershipVersion: 1,
    grantedAt: null,
    expiresAt: null,
    updatedAt: ISO_NOW,
    ...overrides,
  };
}

describe('S3.5.2 – Official Singer Scene Adapter (toStagePresentation)', () => {
  // =========================================================================
  // 1. EMPTY & LOADING STATES
  // =========================================================================
  describe('1. Empty and loading states', () => {
    it('returns EMPTY_STAGE_PRESENTATION when snapshot is null', () => {
      const result = toStagePresentation(null);
      expect(result).toBe(EMPTY_STAGE_PRESENTATION);
      expect(result).toEqual({
        status: 'empty',
        singer: null,
        pendingCount: 0,
      });
    });

    it('returns EMPTY_STAGE_PRESENTATION when snapshot is undefined', () => {
      const result = toStagePresentation(undefined);
      expect(result).toBe(EMPTY_STAGE_PRESENTATION);
      expect(result).toEqual({
        status: 'empty',
        singer: null,
        pendingCount: 0,
      });
    });

    it('returns EMPTY_STAGE_PRESENTATION during initial room loading before first snapshot arrives', () => {
      const result = toStagePresentation(INITIAL_MIC_STORE_DATA);
      expect(result).toBe(EMPTY_STAGE_PRESENTATION);

      // Even if a transient uninitialized object had stale fields, isInitialized=false forces empty
      const uninitializedWithFields: MicStageAdapterInput = {
        state: 'OCCUPIED',
        currentSingerId: 'u-1',
        currentSinger: {
          userId: 'u-1',
          username: 'ghost',
          displayName: 'Ghost',
        },
        pendingRequests: [makePending(1)],
        ownershipVersion: 0,
        isInitialized: false,
      };
      expect(toStagePresentation(uninitializedWithFields)).toBe(
        EMPTY_STAGE_PRESENTATION
      );
    });

    it('returns empty presentation when ownership state is AVAILABLE with no pending requests', () => {
      const snapshot = makeSnapshot({
        state: 'AVAILABLE',
        pendingRequests: [],
      });

      const result = toStagePresentation(snapshot);
      expect(result).toBe(EMPTY_STAGE_PRESENTATION);
      expect(result).toEqual({
        status: 'empty',
        singer: null,
        pendingCount: 0,
      });
    });

    it('returns requested presentation when unoccupied ownership state has pending requests', () => {
      const pending = [makePending(1), makePending(2)];

      const fromRequestPending = toStagePresentation(
        makeSnapshot({
          state: 'REQUEST_PENDING',
          pendingRequests: pending,
        })
      );
      expect(fromRequestPending).toEqual({
        status: 'requested',
        singer: null,
        pendingCount: 2,
      });

      const fromAvailableWithQueue = toStagePresentation(
        makeSnapshot({
          state: 'AVAILABLE',
          pendingRequests: [makePending(1)],
        })
      );
      expect(fromAvailableWithQueue).toEqual({
        status: 'requested',
        singer: null,
        pendingCount: 1,
      });
    });

    it('fails safely to empty presentation when REQUEST_PENDING has zero pending items or state is unknown', () => {
      const inconsistentPending = makeSnapshot({
        state: 'REQUEST_PENDING',
        pendingRequests: [],
      });
      expect(toStagePresentation(inconsistentPending)).toBe(
        EMPTY_STAGE_PRESENTATION
      );

      const unknownState = makeSnapshot({
        state: 'UNKNOWN_FUTURE_STATE' as MicOwnershipState,
        pendingRequests: [makePending(1)],
      });
      expect(toStagePresentation(unknownState)).toBe(EMPTY_STAGE_PRESENTATION);
    });
  });

  // =========================================================================
  // 2. OCCUPIED STATES & DEFENSIVE GUARDS
  // =========================================================================
  describe('2. Occupied states', () => {
    it('maps a valid official singer into occupied StagePresentation', () => {
      const snapshot = makeSnapshot({
        state: 'OCCUPIED',
        currentSingerId: 'singer-42',
        currentSingerSessionId: 'sess-abc',
        currentSinger: {
          userId: 'singer-42',
          username: 'neon_diva',
          displayName: 'Neon Diva',
          avatar: 'https://cdn.example.com/avatars/diva.png',
          sessionId: 'sess-abc',
          grantedAt: ISO_NOW,
        },
        ownershipVersion: 5,
        grantedAt: ISO_NOW,
      });

      expect(toStagePresentation(snapshot)).toEqual({
        status: 'occupied',
        singer: {
          userId: 'singer-42',
          username: 'neon_diva',
          displayName: 'Neon Diva',
          avatar: 'https://cdn.example.com/avatars/diva.png',
        },
        pendingCount: 0,
      });
    });

    it('prefers trimmed displayName over username while preserving username', () => {
      const snapshot = makeSnapshot({
        state: 'OCCUPIED',
        currentSingerId: 'u-7',
        currentSingerSessionId: 'sess-7',
        currentSinger: {
          userId: 'u-7',
          username: 'kenji_k',
          displayName: '  Kenji Star  ',
          avatar: null,
        },
      });

      const result = toStagePresentation(snapshot);
      expect(result.status).toBe('occupied');
      expect(result.singer).toEqual({
        userId: 'u-7',
        username: 'kenji_k',
        displayName: 'Kenji Star',
        avatar: null,
      });
    });

    it('falls back to username when displayName is empty, whitespace, null, or undefined', () => {
      for (const emptyDisplay of ['', '   ', null, undefined]) {
        const snapshot = makeSnapshot({
          state: 'OCCUPIED',
          currentSingerId: 'u-8',
          currentSinger: {
            userId: 'u-8',
            username: 'solo_vocal',
            displayName: emptyDisplay,
            avatar: null,
          },
        });

        const result = toStagePresentation(snapshot);
        expect(result.status).toBe('occupied');
        expect(result.singer?.displayName).toBe('solo_vocal');
        expect(result.singer?.username).toBe('solo_vocal');
      }
    });

    it('normalizes missing, null, or blank avatar values to null', () => {
      for (const blankAvatar of [undefined, null, '', '   ']) {
        const snapshot = makeSnapshot({
          state: 'OCCUPIED',
          currentSingerId: 'u-9',
          currentSinger: {
            userId: 'u-9',
            username: 'avatarless',
            displayName: 'Avatarless',
            avatar: blankAvatar,
          },
        });

        const result = toStagePresentation(snapshot);
        expect(result.status).toBe('occupied');
        expect(result.singer?.avatar).toBeNull();
      }
    });

    it('fails safely to empty when state is OCCUPIED but currentSinger is missing', () => {
      const missingSinger = makeSnapshot({
        state: 'OCCUPIED',
        currentSinger: null,
        currentSingerId: 'u-missing',
        pendingRequests: [makePending(1)],
      });

      expect(toStagePresentation(missingSinger)).toEqual({
        status: 'empty',
        singer: null,
        pendingCount: 1,
      });
    });

    it('fails safely to empty when state is OCCUPIED with missing, blank, or mismatched userId', () => {
      const blankSingerUserId = makeSnapshot({
        state: 'OCCUPIED',
        currentSingerId: '',
        currentSinger: {
          userId: '   ',
          username: 'broken_user',
          displayName: 'Broken User',
        } as MicSingerDto,
      });
      expect(toStagePresentation(blankSingerUserId)).toBe(
        EMPTY_STAGE_PRESENTATION
      );

      const nullTopLevelSingerId = makeSnapshot({
        state: 'OCCUPIED',
        currentSingerId: null,
        currentSinger: {
          userId: 'u-1',
          username: 'user1',
        },
      });
      expect(toStagePresentation(nullTopLevelSingerId)).toBe(
        EMPTY_STAGE_PRESENTATION
      );

      const mismatchedIds = makeSnapshot({
        state: 'OCCUPIED',
        currentSingerId: 'u-different',
        currentSinger: {
          userId: 'u-1',
          username: 'user1',
        },
        pendingRequests: [makePending(1), makePending(2)],
      });
      expect(toStagePresentation(mismatchedIds)).toEqual({
        status: 'empty',
        singer: null,
        pendingCount: 2,
      });
    });
  });

  // =========================================================================
  // 3. PENDING QUEUE COUNTS
  // =========================================================================
  describe('3. Pending queue', () => {
    it('derives accurate pendingCount from authoritative pendingRequests array', () => {
      const threePending = makeSnapshot({
        state: 'REQUEST_PENDING',
        pendingRequests: [makePending(1), makePending(2), makePending(3)],
      });
      expect(toStagePresentation(threePending).pendingCount).toBe(3);
    });

    it('preserves pendingCount when an official singer is OCCUPIED', () => {
      const occupiedWithWaiting = makeSnapshot({
        state: 'OCCUPIED',
        currentSingerId: 'singer-1',
        currentSinger: {
          userId: 'singer-1',
          username: 'active_singer',
          displayName: 'Active Singer',
          avatar: null,
        },
        pendingRequests: [makePending(1), makePending(2), makePending(3), makePending(4)],
      });

      const result = toStagePresentation(occupiedWithWaiting);
      expect(result).toEqual({
        status: 'occupied',
        singer: {
          userId: 'singer-1',
          username: 'active_singer',
          displayName: 'Active Singer',
          avatar: null,
        },
        pendingCount: 4,
      });
    });

    it('returns zero pendingCount when pendingRequests is empty', () => {
      expect(toStagePresentation(makeSnapshot({ pendingRequests: [] })).pendingCount).toBe(0);
    });
  });

  // =========================================================================
  // 4. DOMAIN INDEPENDENCE
  // =========================================================================
  describe('4. Domain independence (Karaoke & LiveKit isolation)', () => {
    it('ignores Karaoke performer and LiveKit speaking state when Mic Ownership is unoccupied', () => {
      // Simulate active Karaoke track performer + active LiveKit speaking participant in the room
      const karaokePerformer = {
        currentSongTitle: 'Midnight City',
        karaokeCurrentSingerId: 'karaoke-requester-99',
        karaokeCurrentSingerName: 'Karaoke Requester',
      };
      const voiceMap: VirtualRoomVoiceMap = new Map([
        [
          'karaoke-requester-99',
          {
            userId: 'karaoke-requester-99',
            isSpeaking: true,
            isMuted: false,
            connectionState: 'connected',
          },
        ],
      ]);

      expect(karaokePerformer.karaokeCurrentSingerId).toBeDefined();
      expect(voiceMap.get('karaoke-requester-99')?.isSpeaking).toBe(true);

      // Even if someone spreads unrelated Karaoke/Voice properties onto the input object at runtime,
      // toStagePresentation derives stage state strictly from Mic Ownership fields.
      const pollutedInput = {
        ...makeSnapshot({ state: 'AVAILABLE', pendingRequests: [] }),
        currentSingerName: karaokePerformer.karaokeCurrentSingerName,
        isSingerSpeaking: true,
        voiceParticipantsMap: voiceMap,
      } as MicStageAdapterInput;

      const presentation = toStagePresentation(pollutedInput);
      expect(presentation).toBe(EMPTY_STAGE_PRESENTATION);
      expect(presentation.singer).toBeNull();
    });
  });

  // =========================================================================
  // 5. IMMUTABILITY & DETERMINISM
  // =========================================================================
  describe('5. Immutability and determinism', () => {
    it('is deterministic across repeated calls and never mutates its input snapshot', () => {
      expect(Object.isFrozen(EMPTY_STAGE_PRESENTATION)).toBe(true);

      const singerObj: MicSingerDto = Object.freeze({
        userId: 'u-det',
        username: 'deterministic_user',
        displayName: 'Deterministic User',
        avatar: 'https://cdn.example.com/u.png',
        sessionId: 'sess-det',
        grantedAt: ISO_NOW,
      });
      const pendingArr: MicPendingRequestDto[] = [
        Object.freeze(makePending(1)),
        Object.freeze(makePending(2)),
      ];
      Object.freeze(pendingArr);

      const frozenSnapshot = Object.freeze(
        makeSnapshot({
          state: 'OCCUPIED',
          currentSingerId: 'u-det',
          currentSingerSessionId: 'sess-det',
          currentSinger: singerObj,
          pendingRequests: pendingArr,
          ownershipVersion: 12,
        })
      );

      const beforeClone = JSON.parse(JSON.stringify(frozenSnapshot));

      const first = toStagePresentation(frozenSnapshot);
      const second = toStagePresentation(frozenSnapshot);
      const third = toStagePresentation(frozenSnapshot);

      expect(first).toEqual(second);
      expect(second).toEqual(third);
      expect(JSON.parse(JSON.stringify(frozenSnapshot))).toEqual(beforeClone);
      expect(first.singer).not.toBe(frozenSnapshot.currentSinger);
    });
  });
});
