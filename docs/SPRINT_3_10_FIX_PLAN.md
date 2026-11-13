# KTVOnline — Sprint 3.10: Stabilization Fix Plan

## 1. Overview & Policy

- **Sprint:** 3.10 — Platform-Wide Audit & Stabilization
- **Baseline Commit:** `9db5d8ef428b1440d02031f6476e10509a974abc`
- **Policy:** Strict Code-Only Development. No test files created/modified, no test runners executed, no production build commands run. Allowed static checks: `pnpm typecheck` and `pnpm lint`.
- **Target Subsystems:** Room Lifecycle & Projections, Activity Logging, Karaoke Stage & Queue.

---

## 2. Implementation Checklist

### Step 1: Align Room & Membership Projections (STAB-01)
- [x] **File:** `apps/api/src/modules/rooms/room.service.ts`
- [x] Update `findById`: change `populate('ownerId', 'username avatar')` to `populate('ownerId', 'username displayName avatar')`.
- [x] Update `findRooms`: change `populate('ownerId', 'username avatar')` to `populate('ownerId', 'username displayName avatar')`.
- [x] Update `findRoomsByOwner`: change `populate('ownerId', 'username avatar')` to `populate('ownerId', 'username displayName avatar')`.
- [x] Update `update`: change `populate('ownerId', 'username avatar')` to `populate('ownerId', 'username displayName avatar')`.
- [x] Update `closeRoom`: change `populate('ownerId', 'username avatar')` to `populate('ownerId', 'username displayName avatar')`.
- [x] Update `joinRoom`: update all 6 membership population queries to `populate('userId', 'username displayName avatar role')`.
- [x] Update `getActiveMembers`: update query to `populate('userId', 'username displayName avatar role')`.
- [x] Update `getMyMembership`: update query to `populate('userId', 'username displayName avatar role')`.
- [x] Update `findJoinedRoomsByUser`: update nested owner populate to `select: 'username displayName avatar'`.
- [x] Update `kickMember`: update `ownerId` and `userId` populations to include `displayName`.
- [x] Update `getRoomStateSnapshot`: update both `ownerId` and `userId` population queries across version-fenced read loop to include `displayName`.

### Step 2: Fix Departure Realtime Identity (STAB-02)
- [x] **File:** `apps/api/src/modules/rooms/room.service.ts`
- [x] In `leaveRoom()`: append `.populate('userId', 'username displayName avatar role')` to `RoomMembershipModel.findOneAndUpdate()`.
- [x] Extract `username` and `avatar` using `displayName || username || 'Member'`.
- [x] Publish `member.left` event with accurate departing user identity.

### Step 3: Integrate Room Activity Feed for Joins and Leaves (STAB-03)
- [x] **File:** `apps/api/src/modules/rooms/room.service.ts`
- [x] In `joinRoom()`: add non-blocking `chatService.recordActivity(roomId, 'member_joined', ...)` inside a `try/catch` block.
- [x] In `leaveRoom()`: add non-blocking `chatService.recordActivity(roomId, 'member_left', ...)` inside a `try/catch` block.

### Step 4: Karaoke Immediate Stage Performer Display Name (STAB-04)
- [x] **File:** `apps/api/src/modules/karaoke/karaoke.service.ts`
- [x] In `addToQueue()`: update `UserModel.findById` queries for requester and assigned singer to `.select('username displayName avatar')`.
- [x] Resolve `performerDisplayName` prioritizing `displayName` before falling back to `username`.
- [x] Persist `performerDisplayName` to `room.currentSingerName`.

### Step 5: Queue Track Advance Avatar Projection (STAB-05)
- [x] **File:** `apps/api/src/modules/karaoke/karaoke.service.ts`
- [x] In `advanceToNextTrack()` candidate search: update `.populate('requestedBy')` and `.populate('singer')` to `'username displayName avatar'`.
- [x] In `advanceToNextTrack()` atomic claim: update `.populate('requestedBy')` and `.populate('singer')` to `'username displayName avatar'`.

---

## 3. Static Verification Checklist

- [x] **Monorepo Typecheck:** Execute `pnpm typecheck` (verifies `@ktv/contracts`, `apps/api`, `apps/web`). Result: 0 errors.
- [x] **Monorepo Linting:** Execute `pnpm lint` (verifies ESLint across all packages). Result: 0 errors, 0 warnings.
- [x] **Git Cleanliness:** Ensure only targeted files are modified, no unintended diffs or test modifications.

---

## 4. Deferred Work & Non-Goals for Sprint 3.10

- **ARCH-01:** Redis Adapter for Socket.IO multi-instance clustering -> Deferred to Sprint 4.0 infrastructure milestone.
- **ARCH-02:** Real-time Web Audio API Pitch Shifting -> Deferred to Sprint 4.0 audio DSP enhancements.
- **ARCH-03:** Chat & Activity automated TTL indexing/pruning -> Deferred to Sprint 4.0 data maintenance.
- **RT-01:** LiveKit reconnect mute enforcement -> Requires live media server runtime test.
- **RT-02:** Multi-client playback drift under simulated latency -> Requires multi-client browser harness.

---

## 5. Decision Gate

- **Verdict:** All verified defects (STAB-01 through STAB-05) are low-to-medium risk, fully backward compatible, and isolated.
- **Implementation Status:** Verified and code-complete. Ready for Phase 5 sign-off and milestone closure.

