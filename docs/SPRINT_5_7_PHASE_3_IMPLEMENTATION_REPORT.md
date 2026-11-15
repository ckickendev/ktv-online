# KTVOnline — Sprint 5.7 Phase 3: Social Session Starter Implementation Report

## 1. Executive Summary

- **Sprint:** Sprint 5.7 — Phase 3 (Social Session Starter Implementation)
- **Baseline Commit:** `e3a1bcb` (docs: complete Sprint 5.7.2.2 final independent remediation verification)
- **Planning Baseline:** `bf31037` (docs: create Sprint 5.7 Phase 3 Social Session Starter architecture and implementation plan)
- **Current HEAD:** `35729ed`
- **Target Branch:** `main`
- **Database:** `test` (zero database writes, mutations, or migrations executed)
- **Final Verdict:** `PHASE 3 COMPLETE — STATIC VERIFICATION PASSED`

Sprint 5.7 Phase 3 delivers the **Social Session Starter** experience on `/friends`. Users can select multiple accepted friends (up to 20), choose to create a brand new lounge or select an eligible existing active lounge, and dispatch lounge invitations using the batch invitation API introduced in Phase 1 (`POST /api/friends/invite-lounge-batch/:roomId`).

---

## 2. Mandatory Pre-Implementation Checks & Resolutions

### 2.1. Room Category Discrepancy Resolution
- **Source Inspection:**
  - `packages/contracts/src/room.ts`: `RoomCategorySchema = z.enum(['all', 'pop', 'anime', 'rock', 'ballad', 'hiphop', 'rnb'])` with default `'all'`.
  - `apps/api/src/modules/rooms/room.model.ts`: `category: { type: String, enum: ['all', 'pop', 'anime', 'rock', 'ballad', 'hiphop', 'rnb'], default: 'all' }`.
- **Resolution:**
  - Earlier planning documents referenced an unsupported `'general'` category.
  - The implementation strictly uses the canonical supported default `'all'` in `use-social-session-starter.ts` and `start-social-session-dialog.tsx`.

### 2.2. Retry Failed Semantics & Rate Limiting Verification
- **Source Inspection:**
  - `apps/api/src/modules/rooms/invitation.service.ts`: `createFriendInvitation` executes:
    ```typescript
    await RoomInvitationModel.updateMany(
      { roomId: roomObjectId, recipientId: friendObjectId, status: 'active', revokedAt: null },
      { $set: { status: 'revoked', revokedAt: new Date() } }
    ).exec();
    ```
    This selectively revokes prior invitations **only for that specific friend in that specific room**. Previously successful invitations issued to other recipients in the batch are untouched and remain active.
  - `apps/api/src/modules/friends/friendship.service.ts`: `HostBatchInviteRateLimiter` enforces 1 batch per 5 seconds and 60 recipients per 10 minutes per host.
- **Resolution:**
  - `use-social-session-starter.ts` filters `batchResult.results` for only `failed` recipients (`status === 'failed'`).
  - Guards against concurrent submissions with `isSubmitting`.
  - If a retry triggers a rate limit (HTTP 429), existing sent invitations are preserved and the summary view remains intact, presenting the server message and enabling safe retry after the 5-second window.

### 2.3. Friend Card Invite Integration
- **Source Inspection:**
  - `FriendActivityCard` for online friends renders an "Invite" action button calling `onInviteToSession(friend.id)`.
  - `FriendActivitySection` receives `friendId` and opens `<StartSocialSessionDialog>` with `initialFriendId={starterFriendId}`.
- **Resolution:**
  - `StartSocialSessionDialog` passes `initialFriendId` to `useSocialSessionStarter.open(initialFriendId)`.
  - The target friend is preselected while reusing the exact same orchestration pipeline, eligibility filtering, and backend authorization. No duplicate or bypass invitation logic exists.

---

## 3. Exact Files Modified & Created

```text
created:
  apps/web/src/features/friends/components/start-social-session-dialog.tsx
  apps/web/src/features/friends/hooks/use-social-session-starter.ts
  docs/SPRINT_5_7_PHASE_3_IMPLEMENTATION_REPORT.md

modified:
  apps/web/src/features/friends/api/friends-api.ts
  apps/web/src/features/friends/components/friend-activity-card.tsx
  apps/web/src/features/friends/components/friend-activity-section.tsx
  apps/web/src/features/friends/index.ts
  apps/web/tsconfig.tsbuildinfo
  docs/SPRINT_5_7_FINAL_PLANNING_REPORT.md
  docs/SPRINT_5_7_PHASE_3_PLANNING_REPORT.md
```

---

## 4. Architectural & Implementation Details

### 4.1. Batch API Integration (`friends-api.ts`)
- Added `inviteLoungeBatch(roomId: string, friendUserIds: string[])`:
  - Calls `POST /api/friends/invite-lounge-batch/${roomId}` with payload `{ friendUserIds }`.
  - Returns typed `BatchLoungeInviteResultDto` from `@ktv/contracts`.

### 4.2. Orchestration Hook (`use-social-session-starter.ts`)
- **Friend Selection:** Maintains `selectedFriendIds` state with client-side cap of 20 friends.
- **Lounge Selection Flow:**
  - Mode toggle: `'new'` vs `'existing'`.
  - Mode A (New Lounge): Configures room name (default `"[User]'s Karaoke Lounge"`), atmosphere preset (`midnight_lounge`), visibility (`private` default), and category (`all`). Executes `createRoomMutation.mutateAsync`.
  - Mode B (Existing Lounge): Queries `useMyRooms()` and filters rooms satisfying all eligibility criteria: `ownerId === currentUser.id`, `status !== 'closed'`, `!room.isLocked`, and `currentParticipantsCount < room.capacity`.
- **Batch Invitation Dispatch:** Dispatches batch invitation with duplicate submission protection (`isSubmitting` flag).
- **Failure & Retry Handling:**
  - If room creation fails, invitations are not dispatched.
  - If room creation succeeds but invitations fail, room is preserved and user can enter.
  - Handles itemized partial success (`sent` vs `failed`) with specific error codes (`ALREADY_IN_ROOM`, `NOT_FRIENDS`, `CREATION_FAILED`).
  - `retryFailedInvitations()` dispatches only for failed recipient IDs, preserving previously successful invitations.
- **Lounge Navigation:** `navigateToRoom()` transitions the user to `/rooms/:roomId`.

### 4.3. Social Session Dialog (`start-social-session-dialog.tsx`)
- Single, dark-themed responsive modal dialog.
- Friend checklist ordered dynamically by live engagement: `Online` (1) > `In Lounge` (2) > `Singing Now` (3) > `Offline` (4).
- Offline friends selectable (receive authenticated pending inbox invitations).
- Friends already in the selected existing lounge display an `"In this lounge"` badge and have their selection disabled.
- Real-time text search filtering by name and username.
- Atmosphere selector (`Midnight Lounge`, `Neon Stage`, `Cozy Acoustic`, `Classic Karaoke`, `Minimal Studio`).
- Visibility toggle (`Private (Friends Only)` vs `Public Lounge`).
- Post-submission outcome breakdown showing per-recipient statuses, error alerts, retry button, and "Enter Lounge Now" CTA.

### 4.4. Friend Activity Dashboard Integration
- `friend-activity-card.tsx`: Adds "Invite" button with sparkles icon on online friend cards.
- `friend-activity-section.tsx`: Adds "Start a Session" CTA in Section A header and mounts `<StartSocialSessionDialog>`.
- `index.ts`: Exports `useSocialSessionStarter` and `StartSocialSessionDialog`.

---

## 5. Security & Authorization Adherence

| Principle | Implementation Verification |
| :--- | :--- |
| **Recipient-Bound Isolation** | Each batch invite creates a dedicated record in `RoomInvitationModel` with SHA-256 token hash and `recipientId`. |
| **Host-Only Authorization** | Server validates `room.ownerId === hostUserId` and `hostMembership.status === 'active'`. |
| **Room State Guards** | Closed and locked rooms strictly reject batch invitations. |
| **Batch Limit & Deduplication** | Max 20 recipients enforced client-side and server-side; IDs deduplicated before processing. |
| **Rate Limit Compliance** | Sliding window rate limiter (1 batch/5s, max 60 invites/10m) respected; retry protected against spam. |
| **Zero Obsolete Terminology** | Verified 0 occurrences of `"Watch Live"` across all `apps/` and `packages/`. |
| **Session Lifecycle Integrity** | `KaraokeSessionModel` begins on room creation; attendees recorded on join; recaps restricted to completed sessions (`HIST-01`). |

---

## 6. Static Verification Results

### 6.1. TypeScript Compilation (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck: tsc --noEmit (Done in 1.2s)
apps/api typecheck: tsc --noEmit (Done in 2.7s)
apps/web typecheck: tsc --noEmit (Done in 1.9s)
Done with exit code 0.
```

### 6.2. ESLint Verification (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint: eslint src/ (Done in 0.9s)
apps/api lint: eslint src/ (Done in 1.3s)
apps/web lint: next lint (Done in 2.5s - ✔ No ESLint warnings or errors)
Done with exit code 0.
```

### 6.3. Terminology Prohibition Verification
```bash
$ grep -rn -i "Watch Live" apps/ packages/
(0 matches - exit code 1)
```

---

## 7. Known Limitations & Deferred Technical Debt

1. **HIST-01 (Abandoned Room Cleanup):** Background TTL cleanup worker for abandoned rooms remains unautomated. Session recaps remain strictly restricted to explicitly completed sessions.
2. **HIST-03 (Single-Node In-Memory Presence):** Presence and batch rate limiting operate in process memory without Redis.
3. **No Capacity Reservation:** Invitations do not reserve room slots. If a room fills up before an invitee joins, the backend rejects the join with a standard room-full notice.

---

## 8. Runtime Verification Status

- Per the strict code-only development policy, automated test runners were prohibited from execution, and production builds were not triggered.
- Full static compilation (`pnpm typecheck`) and linting (`pnpm lint`) passed with zero errors across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`.
- Runtime verification status: Verified through static inspection and contract conformance without claiming unexecuted runtime tests.

---

## 9. Final Verification Verdict

```text
PHASE 3 COMPLETE — STATIC VERIFICATION PASSED
```
