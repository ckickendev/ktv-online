import { MicOwnershipSnapshotDto } from '@ktv/contracts';
import {
  EMPTY_STAGE_PRESENTATION,
  StagePresentation,
} from '@/features/virtual-room/engine/scene-types';

/**
 * Minimal authoritative Mic Ownership snapshot slice consumed by `toStagePresentation`.
 *
 * Directly compatible with both `@ktv/contracts`'s `MicOwnershipSnapshotDto`
 * (REST / Socket.IO payloads) and the room-level state exposed by `useMicOwnership`
 * (`isInitialized` / `ownershipVersion` guards initial pre-hydration state).
 */
export type MicStageAdapterInput = Pick<
  MicOwnershipSnapshotDto,
  'state' | 'currentSinger' | 'currentSingerId' | 'pendingRequests'
> & {
  ownershipVersion?: number;
  isInitialized?: boolean;
};

/**
 * Pure, deterministic adapter transforming authoritative S3 Mic Ownership state
 * into the S1 Virtual Room `StagePresentation` contract.
 *
 * Domain invariants:
 * - Never consults Karaoke playback or LiveKit voice state.
 * - Never returns `undefined` (returns `EMPTY_STAGE_PRESENTATION` on null/loading/invalid input).
 * - Never returns `'occupied'` without a validated `userId` and `username`.
 * - If `'OCCUPIED'` has missing or inconsistent singer identity, fails safely to `'empty'`
 *   with `singer: null` while preserving the authoritative `pendingCount`.
 */
export function toStagePresentation(
  micSnapshot: MicStageAdapterInput | null | undefined
): StagePresentation {
  if (!micSnapshot || typeof micSnapshot !== 'object') {
    return EMPTY_STAGE_PRESENTATION;
  }

  if (micSnapshot.isInitialized === false) {
    return EMPTY_STAGE_PRESENTATION;
  }

  if (
    typeof micSnapshot.ownershipVersion === 'number' &&
    micSnapshot.ownershipVersion <= 0
  ) {
    return EMPTY_STAGE_PRESENTATION;
  }

  const pendingCount = Array.isArray(micSnapshot.pendingRequests)
    ? micSnapshot.pendingRequests.length
    : 0;

  switch (micSnapshot.state) {
    case 'AVAILABLE':
    case 'REQUEST_PENDING': {
      if (pendingCount > 0) {
        return {
          status: 'requested',
          singer: null,
          pendingCount,
        };
      }
      return EMPTY_STAGE_PRESENTATION;
    }

    case 'OCCUPIED': {
      const rawSinger = micSnapshot.currentSinger;
      const singerUserId =
        rawSinger && typeof rawSinger.userId === 'string'
          ? rawSinger.userId.trim()
          : '';
      const snapshotSingerId =
        typeof micSnapshot.currentSingerId === 'string'
          ? micSnapshot.currentSingerId.trim()
          : '';
      const username =
        rawSinger && typeof rawSinger.username === 'string'
          ? rawSinger.username.trim()
          : '';

      // Defensive guard: never emit 'occupied' without a valid, consistent singer identity
      if (
        !rawSinger ||
        !singerUserId ||
        !snapshotSingerId ||
        singerUserId !== snapshotSingerId ||
        !username
      ) {
        return pendingCount > 0
          ? { status: 'empty', singer: null, pendingCount }
          : EMPTY_STAGE_PRESENTATION;
      }

      const trimmedDisplayName =
        typeof rawSinger.displayName === 'string'
          ? rawSinger.displayName.trim()
          : '';
      const displayName =
        trimmedDisplayName.length > 0 ? trimmedDisplayName : username;

      const trimmedAvatar =
        typeof rawSinger.avatar === 'string' ? rawSinger.avatar.trim() : '';
      const avatar = trimmedAvatar.length > 0 ? trimmedAvatar : null;

      return {
        status: 'occupied',
        singer: {
          userId: singerUserId,
          username,
          displayName,
          avatar,
        },
        pendingCount,
      };
    }

    default:
      return EMPTY_STAGE_PRESENTATION;
  }
}
