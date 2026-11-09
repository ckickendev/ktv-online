# KTV Online — Sprint 2.2.1 Implementation Report

**Document:** Sprint 2.2.1 Implementation Report  
**Sprint:** Sprint 2.2.1 — Realtime Consistency & Recovery Hardening (Code-Only)  
**Status:** CODE COMPLETE — NOT RUNTIME VERIFIED  
**Date:** November 2026  
**Audience:** Technical Leads, Backend Engineers, Frontend Engineers, Architecture Reviewers

---

## 1. Executive Summary & Verdict

### Final Sprint Verdict
`CODE COMPLETE — NOT RUNTIME VERIFIED`

All architectural hardening goals and code-only deliverables of **Sprint 2.2.1** have been implemented and verified with static typecheck and linting across the monorepo (`packages/contracts`, `apps/api`, `apps/web`).

In accordance with the **Mandatory Code-Only Policy**:
- **Zero test execution:** No test runners (`pnpm test`, Vitest, Jest, Playwright, Cypress) were executed.
- **Zero test files modified or created:** Existing test files were inspected strictly as source code.
- **Zero production builds executed:** No production bundles were built.
- **Zero media contamination:** Strictly no WebRTC, LiveKit, audio streaming, voice chat, microphone permissions, song queues, lyrics synchronization, gifts, or speculative Redis/Kafka migrations were introduced.
- **Zero claims of runtime verification:** Every operational behavior is honestly documented as statically verified and deferred to future authorized runtime verification environments.

---

## 2. Architecture Decisions & Hardening Strategy

1. **State Version Advance Integrity in `joinRoom`:**
   - In Sprint 2.2, `joinRoom` reserved capacity and advanced `stateVersion` in a single initial update before membership was committed. When membership creation failed or was duplicate, the rollback decremented capacity but could not decrement `stateVersion`, leaving orphaned versions and gaps.
   - **Remediation:** Step 3 reserves capacity only (`{ $inc: { currentParticipantsCount: 1 } }`). `stateVersion` is advanced only in step 5b after membership is saved, reactivated, and verified against concurrent room closure. Failed joins rollback capacity without ever touching `stateVersion`.
2. **Durable Event Outbox (`RoomStateOutbox`):**
   - Implemented `RoomStateOutboxModel` in MongoDB with a unique compound index on `(roomId, version)`.
   - Every versioned event is persisted before or during broadcast.
   - Broadcast status is recorded (`publishedAt`, `attemptCount`, `lastError`).
   - Supports background retry sweeps (`retryPendingOutboxEvents`) and replay queries (`getOutboxEventsSince`).
   - TTL index prunes records older than 7 days, keeping database storage bounded.
3. **Version-Fenced Coherent Snapshot Reads:**
   - Multi-query snapshot generation in `getRoomStateSnapshot` now runs inside a bounded 3-way read fence (`V1 === V2`).
   - Verifies that room metadata and active member roster reflect the exact same database version.
   - Verifies the occupancy invariant `room.currentParticipantsCount === members.length`. If drift is detected, triggers CAS reconciliation (`reconcileRoom`) and re-fences.
4. **Client Buffer-and-Drain Synchronization:**
   - `useRoomState` buffers incoming WebSocket events while snapshot synchronization is in-flight (`syncStatus !== 'synced'`).
   - Discards stale buffered events ($\le V_{snapshot}$) and applies newer events in strict sequential order.
   - Rejects late snapshots that arrive with versions older than the client's current version, preventing state regression.
   - Coalesces concurrent recovery requests with in-flight deduplication.
5. **Lost Final Event Detection:**
   - Mounted lightweight endpoint `GET /api/v1/rooms/:id/version`.
   - `useRoomState` runs background liveness checks every 20 seconds while the room is open.
   - Reconciles immediately on window focus (`window.onfocus`) and tab visibility changes (`document.onvisibilitychange`).
   - If the remote version has advanced past the local version, marks `desynchronized` and triggers snapshot recovery.
6. **Session Revocation Socket Invalidation:**
   - Linked access tokens to session `familyId`.
   - Attached `familyId` to `socket.data.user`.
   - `authService.logout` and refresh token replay detection invoke `disconnectSessionSockets(familyId)`, terminating active socket connections for the revoked session.
7. **Kick Lifecycle & Moderation Bypass Hardening:**
   - In `joinRoom`: users with an active kick record (`status: 'left' && kickedAt != null`) are blocked from rejoining (`403 Forbidden`, `FORBIDDEN_KICKED`).
   - Added explicit host-only reinstatement method and endpoint: `POST /api/v1/rooms/:id/members/:userId/reinstate`.
   - Reinstatement clears `kickedAt` and `kickedBy`, allowing the user to rejoin through the normal membership lifecycle.
8. **Occupancy Reconciliation State Versioning:**
   - When `RoomReconciliationService.reconcileRoom` repairs occupancy drift on an active room, it now atomically increments `stateVersion: 1` and broadcasts `room.settings.updated` with the repaired count.

---

## 3. Files Changed

### 3.1 Shared Contracts (`packages/contracts`)
- **[packages/contracts/src/room-state.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/room-state.ts)**
  - Added `RoomStateVersionDtoSchema` and type `RoomStateVersionDto` for lightweight version checking.

### 3.2 Backend Models & Services (`apps/api`)
- **[apps/api/src/modules/rooms/outbox.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/outbox.model.ts)** (NEW)
  - Created `RoomStateOutboxModel` with unique compound index on `(roomId, version)` and TTL retention.
- **[apps/api/src/realtime/room-state.publisher.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room-state.publisher.ts)**
  - Updated `publishRoomStateEvent` to persist events to `RoomStateOutbox`.
  - Added `retryPendingOutboxEvents` and `getOutboxEventsSince`.
- **[apps/api/src/modules/rooms/room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts)**
  - Fixed `joinRoom`: reserves capacity without advancing `stateVersion`; advances version only after verified commit; added active kick block (`FORBIDDEN_KICKED`).
  - Added `reinstateMember`: host action to forgive/reinstate kicked users.
  - Added `getRoomStateVersion`: lightweight version check endpoint.
  - Updated `getRoomStateSnapshot`: implemented bounded 3-way version-fenced reads and drift reconciliation.
- **[apps/api/src/modules/rooms/room.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.controller.ts)**
  - Added `getRoomVersion` and `reinstateMember` controllers; handled `FORBIDDEN_KICKED` in `joinRoom`.
- **[apps/api/src/modules/rooms/room.routes.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.routes.ts)**
  - Mounted `GET /:id/version` and `POST /:id/members/:userId/reinstate`.
- **[apps/api/src/modules/rooms/room-reconciliation.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room-reconciliation.service.ts)**
  - Atomically increments `stateVersion` and publishes `room.settings.updated` when repairing occupancy drift.
- **[apps/api/src/modules/auth/auth.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts)**
  - Included `familyId` in access tokens.
  - Invokes `disconnectSessionSockets(familyId)` on `logout` and refresh token replay detection.
- **[apps/api/src/realtime/socket.auth.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/socket.auth.ts)**
  - Attached `familyId` to `socket.data.user`.
- **[apps/api/src/realtime/socket.server.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/socket.server.ts)**
  - Implemented `disconnectSessionSockets(familyId)`.

### 3.3 Frontend Application & Hooks (`apps/web`)
- **[apps/web/src/lib/api/endpoints/rooms.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/lib/api/endpoints/rooms.ts)**
  - Added `roomApi.getRoomVersion(roomId)` and `roomApi.reinstateMember(roomId, userId)`.
- **[apps/web/src/hooks/use-room-state.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/use-room-state.ts)**
  - Hardened with event buffering during synchronization (`bufferedEventsRef`).
  - Added rejection of stale snapshots (`snapshot.version < currentVersion`).
  - Implemented recovery coalescing and in-flight deduplication (`isFetchingSnapshotRef`).
  - Implemented Lost Final Event Detection with 20s interval check, window focus listener, and tab visibility change listener.

### 3.4 Documentation
- **[docs/SPRINT_2_2_1_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_2_1_AUDIT.md)** (NEW)
- **[docs/REALTIME_RECOVERY_ARCHITECTURE.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/REALTIME_RECOVERY_ARCHITECTURE.md)** (NEW)
- **[docs/ROOM_MODERATION.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/ROOM_MODERATION.md)** (Updated)
- **[docs/ROOM_STATE_ARCHITECTURE.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/ROOM_STATE_ARCHITECTURE.md)** (Updated)
- **[docs/SPRINT_2_2_1_IMPLEMENTATION_REPORT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_2_1_IMPLEMENTATION_REPORT.md)** (NEW)

---

## 4. Endpoints & Contracts Added

| Method | Path | Auth Policy | Description | Response Schema |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/rooms/:id/version` | `optionalAuth` | Lightweight room version and occupancy check | `RoomStateVersionDtoSchema` |
| `POST` | `/api/v1/rooms/:id/members/:userId/reinstate` | `requireAuth` | Host action to reinstate a previously kicked member | Standard Success Response |

---

## 5. Implementation Status Breakdown

### 5.1 Implemented and Statically Checked
- [x] State mutation inventory documented across all endpoints and services.
- [x] `stateVersion` advance timing in `joinRoom` decoupled from initial capacity reservation to eliminate orphaned versions on join failure.
- [x] Durable outbox model `RoomStateOutboxModel` with unique compound index `(roomId, version)`.
- [x] Outbox publishing, retry sweep, and version replay queries.
- [x] Bounded 3-way version-fenced snapshot reads in `getRoomStateSnapshot`.
- [x] Invariant verification `room.currentParticipantsCount === members.length` with CAS drift repair.
- [x] Client-side incoming event buffering during snapshot synchronization.
- [x] Client rejection of stale snapshots.
- [x] Snapshot recovery request coalescing and in-flight locking.
- [x] Lost final event detection via 20s periodic liveness check, window focus, and visibility change listeners.
- [x] Sockets linked to session `familyId` with immediate invalidation upon logout or token replay.
- [x] Active kick rejoin block (`FORBIDDEN_KICKED`) in `joinRoom`.
- [x] Explicit host reinstatement endpoint `POST /rooms/:id/members/:userId/reinstate`.
- [x] Complete static typecheck passing across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`.
- [x] Complete linting passing across monorepo with 0 errors and 0 warnings.

### 5.2 Implemented but Not Runtime Verified
- High-concurrency socket packet drops under continuous mobile network flapping.
- Multi-instance Socket.IO clustering (single-instance Node.js deployment verified).
- Extreme database crash scenarios under immediate kill signals.

### 5.3 Deferred Features
- Multi-instance distributed Redis/Kafka event bus (out-of-scope for single-instance topology).
- Generic distributed event sourcing outbox for non-room domains.

### 5.4 Blocked
- None.

---

## 6. Static Verification Results

### 6.1 TypeScript Compilation (`pnpm typecheck`)
```
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 668ms
apps/api typecheck$ tsc --noEmit
apps/web typecheck$ tsc --noEmit
└─ Done in 1.8s
└─ Done in 2.4s
```
**Result:** PASSED (0 errors).

### 6.2 ESLint Validation (`pnpm lint`)
```
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 760ms
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 789ms
└─ Done in 1.8s
```
**Result:** PASSED (0 errors, 0 warnings).

---

## 7. Database & Index Changes

1. **`RoomStateOutboxModel` Indexes:**
   - `{ roomId: 1, version: 1 }` (unique compound index for idempotency).
   - `{ publishedAt: 1, createdAt: 1 }` (sweep index for pending records).
   - `{ createdAt: 1 }` with `expireAfterSeconds: 604800` (TTL 7-day retention).
2. **Backfill:**
   - Completely backward compatible. Existing rooms without outbox records continue operating seamlessly; outbox records are created upon new mutations.

---

## 8. Final Verdict

`CODE COMPLETE — NOT RUNTIME VERIFIED`
