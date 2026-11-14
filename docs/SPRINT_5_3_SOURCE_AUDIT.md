# KTVOnline — Sprint 5.3: Source, Lifecycle & State Audit

## 1. Executive Purpose & Baseline

Sprint 5.3 implements **Session Memories & Karaoke History** for KTVOnline under the platform positioning:
> **"Your Virtual Hangout. Your Karaoke Night."**

The objective is to allow users to revisit their karaoke journey, review songs actually performed, browse sessions they attended, view personal singing metrics, and explore session recaps—while respecting user privacy and system reliability.

### Repository Baseline
- **Git Branch:** `main`
- **Starting HEAD Commit:** `287093f` (`feat(discovery): implement Sprint 5.2 karaoke song discovery, catalog filtering, audio preview, and licensing controls`)
- **Database Name:** `test` (strictly preserved)
- **Monorepo Packages:** `@ktv/contracts`, `apps/api`, `apps/web`
- **Development Policy:** Strict Code-Only policy (no test files created/modified, no test runners executed, no production builds; `pnpm typecheck` and `pnpm lint` permitted).

---

## 2. Existing Lifecycle & State Machine Audit

### 2.1 Room Lifecycle (`apps/api/src/modules/rooms/`)
1. **Creation (`room.service.ts` -> `create`):**
   - Creates a `RoomModel` document with `status: 'idle'`, `currentParticipantsCount: 1`, `stateVersion: 1`.
   - Automatically creates the room owner's `RoomMembershipModel` with `role: 'host'`, `status: 'active'`, `joinedAt: new Date()`.
2. **Membership Lifecycle (`joinRoom` & `leaveRoom`):**
   - `joinRoom`: Idempotently claims an active membership slot, increments `currentParticipantsCount`, and records `joinedAt`.
   - `leaveRoom`: Marks membership `status: 'left'`, records `leftAt: new Date()`, and decrements `currentParticipantsCount`.
   - Host transfer: Role changes to `'host'` without resetting membership tenure.
3. **Closure (`closeRoom`):**
   - Sets room `status: 'closed'`, `currentParticipantsCount: 0`.
   - Concludes all active memberships (`status: 'left'`, `leftAt: new Date()`).
   - Invokes `karaokeService.handleRoomClosed(roomId)` to cancel active playback timers and mark queued items removed.
   - Dispatches `room.closed` Socket.IO event.

### 2.2 Playback & Queue Lifecycle (`apps/api/src/modules/karaoke/`)
1. **Queue Item Lifecycle (`RoomQueueItemModel`):**
   - States: `'queued'`, `'playing'`, `'completed'`, `'skipped'`, `'removed'`, `'failed'`.
   - Contains: `roomId`, `songId`, `requestedBy`, `singer` (assigned singer), `position`, `queueVersion`, `addedAt`, `startedAt`, `completedAt`, `removedAt`.
2. **Authoritative Performance Event Boundary:**
   - **Queue Only:** When a song is added to queue (`status: 'queued'`), `startedAt` is `null`. **This is NOT a performance.**
   - **Pre-play Removal / Failure:** If removed from queue (`status: 'removed'`) or fails before playback (`status: 'failed'`), `startedAt` is `null`. **This is NOT a performance.**
   - **Playback Start:** A performance starts ONLY when the item atomically transitions to `status: 'playing'` and `startedAt = now`. This occurs either:
     - Directly upon `addToQueue` if room playback is `idle` and no other song is playing.
     - During `advanceToNextTrack` when the candidate is claimed from `'queued'` to `'playing'`.
   - **Playback Outcome:**
     - `completed`: Song completes naturally (`reason === 'natural_completion'`).
     - `skipped`: Host or singer commands a track skip (`reason === 'host_skip' | 'singer_skip'`).
     - `interrupted`: Room closed or host leaves during an ongoing song (`handleRoomClosed`).
     - `failed`: Audio pipeline fails during playback.

---

## 3. Existing Data Retention & Activity Policies

1. **Activity Feed (`RoomActivityModel`):**
   - Chat and room activity telemetry currently applies a MongoDB TTL index:
     `RoomActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });` (7 days retention).
   - **Audit Finding:** User-facing session memories and song history represent durable personal product data and **must NOT** inherit this 7-day TTL policy.
2. **Auth Refresh Sessions (`SessionModel`):**
   - Uses TTL index on `expiresAt` for security token expiry. This is unrelated to karaoke lounge sessions.
3. **User Profile & Preferences (`UserModel`):**
   - Stores user preferences (`preferredGenres`, `participationStyle`, onboarding flags).
   - Currently lacks history privacy preferences (`isHistoryPublic`, `isSessionsPublic`).
   - Profile UI at `/profile` previously rendered a static placeholder for "Recent Lounge Sing-Alongs".

---

## 4. Minimum Authoritative Event Sources

| Event | Authoritative Origin | Trigger Location | Target State Mutation |
| :--- | :--- | :--- | :--- |
| **Session Started** | Backend `room.service.ts` | `create()` or initial room entry | Create `KaraokeSession` document (`status: 'active'`) |
| **Participant Joined** | Backend `room.service.ts` | `joinRoom()` | Upsert participant subdocument in active session (`joinedAt: now`) |
| **Participant Left** | Backend `room.service.ts` | `leaveRoom()` | Record participant `leftAt: now` |
| **Performance Started** | Backend `karaoke.service.ts` | `addToQueue` (direct) / `advanceToNextTrack` | Create `KaraokePerformance` document (`status: 'playing'`, `startedAt: now`) |
| **Performance Completed** | Backend `karaoke.service.ts` | `advanceToNextTrack` (natural completion) | Update `KaraokePerformance` (`outcome: 'completed'`, `completedAt: now`) |
| **Performance Skipped** | Backend `karaoke.service.ts` | `advanceToNextTrack` (skip) / `executePlaybackCommand` | Update `KaraokePerformance` (`outcome: 'skipped'`, `completedAt: now`) |
| **Performance Interrupted**| Backend `karaoke.service.ts` | `handleRoomClosed` | Update `KaraokePerformance` (`outcome: 'interrupted'`, `completedAt: now`) |
| **Session Ended** | Backend `room.service.ts` | `closeRoom()` | Update `KaraokeSession` (`status: 'completed'`, `endedAt: now`, duration) |

---

## 5. Idempotency & Failure Scenarios Analysis

1. **Duplicate Playback Transitions:**
   - By creating a unique compound index on `{ queueItemId: 1 }` in `KaraokePerformanceModel`, any concurrent retry, worker lease contention, or outbox re-delivery will fail cleanly on duplicate key error (11000) and avoid duplicate history records.
2. **Multi-Tab / Multi-Socket Deduplication:**
   - Participant tracking within a session is keyed strictly on `userId` (`participant.userId`). Multiple tabs or Socket.IO reconnects belong to the same `userId` and update the existing participant interval rather than creating phantom participants.
3. **Preview Viewers:**
   - Room preview (`RoomPreviewDialog`) does not invoke `joinRoom` and creates no membership. Preview viewers are never added to session participant history.
4. **Listener vs. Singer Distinction:**
   - A participant's `songsPerformedCount` increments strictly when that user is the assigned `singer` on an active performance, ensuring non-singing listeners remain accurately identified as listeners.
