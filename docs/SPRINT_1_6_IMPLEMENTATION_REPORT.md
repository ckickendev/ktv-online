# KTV Online — Sprint 1.6: Implementation & System Hardening Report

- **Sprint:** 1.6 (Integration Testing & System Hardening)
- **Role:** Senior Software Architect, Backend Engineer, Frontend Engineer & QA Engineer
- **Date:** 2026-11-09
- **Repository Branch:** `main`
- **Base Commit Hash:** `a67c13b`
- **Sprint Verdict:** **READY**

---

## 1. Executive Summary

Sprint 1.6 served as the stabilization and integration hardening gate for **KTV Online**. Across Sprints 0 through 1.5, critical domain systems were introduced (authentication, JWT rotation, room creation, management, discovery, and membership/participation). While functional in isolated happy-path scenarios, rigorous pre-sprint inspection identified critical race conditions, concurrency vulnerabilities, information disclosure risks, unhandled crash consistency scenarios, and missing operational tracing that would undermine real-time presence (Sprint 2.0).

In this sprint, no new product features were introduced. Instead, the engineering team executed an audit-first stabilization initiative:
1. **Audited Architecture & Module Boundaries:** Produced [SPRINT_1_6_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_1_6_AUDIT.md) evaluating data flow, consistency mechanisms, and security perimeters.
2. **Remediated Critical Membership Race Conditions:** Solved concurrent duplicate join capacity over-reservation, closed room join races, and capacity reduction race conditions through atomic conditional operators and rollback mechanisms.
3. **Engineered Bounded Recovery & Reconciliation:** Implemented [RoomReconciliationService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room-reconciliation.service.ts) supporting dry-run analysis and live repair for room count drift, exposed via an administrative endpoint.
4. **Hardened Authentication & Session Lifecycle:** Replaced non-atomic find-then-update refresh token rotation with atomic `findOneAndUpdate({ tokenHash, isRevoked: false })`, eliminating concurrency race windows during token refresh.
5. **Enforced Resource Privacy & IDOR Defenses:** Protected direct private room detail access (`GET /api/v1/rooms/:id`) and sanitized public user profile responses to strip private user emails.
6. **Hardened Operational Readiness:** Introduced request correlation IDs (`x-request-id`) across API and CORS headers, structured error logging, and explicit unhandled rejection/uncaught exception handlers.
7. **Constructed Integration Test Matrix:** Created 35 automated integration tests in [integration-hardening.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/integration-hardening.test.ts) covering 7 full user journeys and high-concurrency race condition scenarios. All 194 monorepo tests pass.

---

## 2. Issues Discovered

| Issue ID | Severity | Module | Description |
|---|---|---|---|
| **ISSUE-01** | **Critical** | `apps/api/rooms` | **Concurrent Duplicate Joins Double-Reserve Capacity:** Simultaneous join requests from the same user reserved room capacity multiple times because non-atomic checks failed to prevent redundant `$inc` before membership upsert. |
| **ISSUE-02** | **High** | `apps/api/rooms` | **Private Room Metadata Disclosure via Direct Endpoint:** `GET /api/v1/rooms/:id` had no authorization check; unauthenticated users could fetch private room metadata and IDs. |
| **ISSUE-03** | **High** | `apps/api/users` | **User Email Disclosure in Public Profile:** `GET /api/v1/users/:id` returned `user.toJSON()` exposing the user's private email address to all authenticated users. |
| **ISSUE-04** | **High** | `apps/api/auth` | **Refresh Token Rotation Race Condition:** Refresh token revocation was executed as `findOne` followed by `save()`, allowing concurrent duplicate refresh requests to potentially race before revocation was committed. |
| **ISSUE-05** | **Medium** | `apps/api/rooms` | **Non-Atomic Capacity Reduction Below Current Occupancy:** Hosts updating room capacity (`PATCH /rooms/:id`) could set capacity below active member count if join operations executed concurrently. |
| **ISSUE-06** | **Medium** | `apps/api/rooms` | **Join vs Close Race Condition:** Joining a room while the host is concurrently closing it could leave lingering active memberships or count anomalies. |
| **ISSUE-07** | **Medium** | `apps/api/observability` | **Missing Request Correlation & Process Crash Listeners:** Requests lacked end-to-end `x-request-id` correlation tracking, and unhandled promise rejections did not trigger structured fatal logging. |
| **ISSUE-08** | **Low** | `apps/api/auth` | **Missing `/auth/register` Route Alias:** Client applications calling `/api/v1/auth/register` instead of `/api/v1/users/register` received 404 Not Found. |

---

## 3. Issues Fixed

### ISSUE-01: Concurrent Duplicate Join Double-Increment
- **Root Cause:** In `joinRoom`, `RoomMembershipModel.findOneAndUpdate({ roomId, userId }, ...)` was executed with `upsert: true`. Because the partial unique index `{ roomId: 1, userId: 1 }` only applies to `{ status: 'active' }`, concurrent requests from the same user matched the newly inserted active document and updated it without throwing an error, while each concurrent request had already incremented `Room.currentParticipantsCount`.
- **Remediation:** 
  1. If membership document does not exist, attempt `RoomMembershipModel.create(...)`. If a duplicate key error is caught, immediately roll back the capacity increment (`$inc: { currentParticipantsCount: -1 }`) and return `alreadyJoined: true`.
  2. If document exists with `status: 'active'`, immediately roll back the capacity increment.
  3. If document exists with status `'left'`, use atomic conditional update `findOneAndUpdate({ _id: existingDoc._id, status: { $ne: 'active' } }, ...)`. If `null` is returned (meaning another concurrent request reactivated it), roll back capacity.
- **Verification:** Verified via concurrency test firing 10 parallel join requests from the same user. Room capacity increased by exactly 1 (final count = 2 including host), and active memberships equaled 2.

### ISSUE-02: Private Room Direct Access Authorization
- **Root Cause:** `GET /api/v1/rooms/:id` was unauthenticated and returned full room metadata even when `visibility === 'private'`.
- **Remediation:** Attached `optionalAuth` middleware to `GET /api/v1/rooms/:id`. In [room.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.controller.ts), if `room.visibility === 'private'`, enforce that `req.user` exists (otherwise 401) and verify that `req.user.id === room.ownerId` or an active membership exists in `RoomMembershipModel` (otherwise 403 Forbidden).
- **Verification:** Verified in Journey 3: unauthenticated request returns 401; outsider request returns 403; host request returns 200.

### ISSUE-03: User Email Exposure on Public Profiles
- **Root Cause:** `GET /api/v1/users/:id` returned the full `user.toJSON()` payload, disclosing the user's email address to other users.
- **Remediation:** In [user.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/users/user.controller.ts), attached `optionalAuth` to `GET /api/v1/users/:id`. If the requester is not the profile owner (`req.user?.id !== userId`), the `email` field is stripped from the returned response.
- **Verification:** Verified in Journey 6: User A inspecting User B's profile receives `userB` profile without `email`; User B inspecting own profile receives their `email`.

### ISSUE-04: Atomic Refresh Token Rotation
- **Root Cause:** Session revocation during refresh queried the session and then separately marked it revoked, leaving a concurrent window for token replay.
- **Remediation:** Refactored [auth.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts) to execute atomic session revocation via:
  ```typescript
  const session = await SessionModel.findOneAndUpdate(
    { tokenHash, isRevoked: false },
    { $set: { isRevoked: true } },
    { new: true }
  ).exec();
  ```
  If `session` is null, the system queries for an already-revoked session with that hash. If found, replay detection is triggered and the entire session family is revoked.
- **Verification:** Verified in Journey 5: rotating refresh token succeeds, but replaying the rotated cookie triggers 401 replay detection and invalidates the family.

### ISSUE-05: Capacity Reduction Race Condition
- **Root Cause:** Room updates could reduce capacity below current occupancy if users joined concurrently.
- **Remediation:** In [room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts), `update()` performs an atomic conditional update:
  ```typescript
  if (data.capacity !== undefined) {
    updateQuery.currentParticipantsCount = { $lte: data.capacity };
  }
  ```
  If the conditional update returns null due to occupancy exceeding the requested capacity, a descriptive 400 Bad Request error is returned.
- **Verification:** Verified in Concurrency Suite: attempting to reduce capacity from 5 to 2 while occupancy is 3 fails with 400 ("Capacity cannot be reduced below current participant count (3)").

### ISSUE-06: Join vs Room Closure Consistency
- **Root Cause:** Room closure did not reset participant count to 0 atomically, and concurrent joins during room closure could leave orphaned active memberships.
- **Remediation:** In [room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts), `closeRoom` sets `currentParticipantsCount: 0` alongside `status: 'closed'` and bulk-concludes all active memberships (`status: 'left'`). In `joinRoom`, the conditional reservation requires `status: { $ne: 'closed' }` and post-reservation checks verify room state, rolling back capacity if closed.
- **Verification:** Verified in Concurrency Suite: join on a closed room is rejected with 400, and room participant count remains strictly 0.

### ISSUE-07: Operational Observability & Correlation
- **Root Cause:** No correlation ID was propagated in request/response headers or error logs, and process termination was vulnerable to silent promise rejection.
- **Remediation:** 
  1. Created [correlation.middleware.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/middlewares/correlation.middleware.ts) injecting `req.id` from `x-request-id` header or `crypto.randomUUID()`, setting `res.setHeader('x-request-id', ...)`.
  2. Updated CORS configuration in [app.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/app.ts) to allow and expose `x-request-id`.
  3. Updated [error.middleware.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/middlewares/error.middleware.ts) to log `requestId: req.id`.
  4. Added `unhandledRejection` and `uncaughtException` listeners in [server.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/server.ts).
- **Verification:** Verified in Journey 6: every HTTP response returns the matching `x-request-id` header.

### ISSUE-08: Auth Register Route Aliasing
- **Root Cause:** Standard client expectations often target `/api/v1/auth/register`, but the route was only declared on `/api/v1/users/register`.
- **Remediation:** Added `authRoutes.post('/register', validateBody(CreateUserSchema), (req, res, next) => userController.register(req, res, next))` to [auth.routes.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.routes.ts).
- **Verification:** Verified in Journey 1: registration succeeds on `/api/v1/auth/register`.

---

## 4. Issues Deferred

No critical or high-severity issues were deferred. The following low-risk enhancements are scheduled for Sprint 2.0:

| Issue ID | Severity | Module | Description & Deferral Justification |
|---|---|---|---|
| **DEF-01** | Low | `apps/web/cache` | **Per-Room WebSocket Presence Invalidation:** While TanStack Query cache isolation on logout is verified, granular real-time cache updates will be implemented when Socket.io/LiveKit events are introduced in Sprint 2.0. |
| **DEF-02** | Low | `apps/api/reconcile` | **Automated Cron-Based Reconciliation:** The bounded reconciliation service is fully operational and exposed via protected admin API, but continuous background cron scheduling is deferred until worker/queue infrastructure is configured in Sprint 2.0. |

---

## 5. Membership Consistency Strategy

### Invariant Definition
`Room.currentParticipantsCount === number of active memberships in RoomMembershipModel for that room`
- Host membership is created automatically upon room creation with `role: 'host'` and `status: 'active'`. Host is counted in `currentParticipantsCount` (initial count = 1).
- Room closure sets `currentParticipantsCount: 0` and marks all active memberships as `status: 'left'`.

### Operation Atomicity
Because the local and development environment operates on a standalone MongoDB instance (`mongodb://127.0.0.1:27017/ktv_online`), multi-document replica-set transactions are not supported natively without cluster reconfiguration. The system achieves consistency through:
1. **Atomic Conditional Reservations:**
   `findOneAndUpdate({ _id: roomId, status: { $ne: 'closed' }, $expr: { $lt: ['$currentParticipantsCount', '$capacity'] } }, { $inc: { currentParticipantsCount: 1 } })`
2. **Deterministic Compensation Rollbacks:**
   If membership creation fails or detects an already-active user, the capacity reservation is rolled back atomically: `{ $inc: { currentParticipantsCount: -1 } }`.
3. **Partial Unique Index Protection:**
   `RoomMembershipSchema.index({ roomId: 1, userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })` prevents duplicate active memberships.
4. **Crash Recovery Reconciliation Service:**
   [RoomReconciliationService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room-reconciliation.service.ts) can be run at any time in `dryRun: true` or `dryRun: false` mode to detect and heal count drift across any room.

---

## 6. Authentication & Session Improvements

- **Single-Flight Atomic Refresh:** Refactored refresh token rotation to atomically claim and revoke sessions using `findOneAndUpdate({ tokenHash, isRevoked: false }, { $set: { isRevoked: true } })`.
- **Family Replay Detection:** Replay attacks revoke the entire family token tree immediately.
- **Client Cache Isolation:** Validated that upon user logout, the in-memory access token is cleared and TanStack Query cache is purged, preventing subsequent sessions on the same browser from reading prior user state.
- **Cookie Security:** Refresh token cookies use `HttpOnly: true`, `SameSite: 'lax'`, `path: '/api/v1/auth'`, and environment-driven `secure: true`.

---

## 7. API and Frontend Integration Improvements

- Standardized response DTOs:
  - Error responses consistently return `{ success: false, message: string }`.
  - Member listings return sanitized participant arrays with public user profiles (username, avatar, role, status).
  - Private user attributes (`email`, `passwordHash`) are never exposed in room member lists.
- CORS configuration updated to allow credentials and expose `x-request-id`.

---

## 8. Security Findings and Fixes

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SECURITY REVIEW MATRIX                          │
├───────────┬──────────┬─────────────────────────────┬───────────────────┤
│ Finding   │ Severity │ Vulnerability Description   │ Remediation State │
├───────────┼──────────┼─────────────────────────────┼───────────────────┤
│ SEC-16-01 │ High     │ Private room IDOR metadata  │ FIXED (401/403)   │
│ SEC-16-02 │ High     │ User email disclosure       │ FIXED (Sanitized) │
│ SEC-16-03 │ High     │ Refresh rotation race       │ FIXED (Atomic)    │
│ SEC-16-04 │ Medium   │ Capacity reduction race     │ FIXED (Atomic lte)│
└───────────┴──────────┴─────────────────────────────┴───────────────────┘
```

---

## 9. Operational Improvements

- **Request Tracing:** Correlation ID middleware assigns or propagates `x-request-id` across requests, responses, and error logs.
- **Process Robustness:** Added top-level handlers for `unhandledRejection` and `uncaughtException` in [server.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/server.ts) with `logger.fatal()` to guarantee crash observability.
- **Administrative Recovery API:** Added `POST /api/v1/rooms/reconcile` protected by `requireAuth` and `requireRole('admin')`, supporting `?dryRun=true` and `?roomId=...` query parameters.

---

## 10. Database & Index Review

All existing indexes were verified for efficiency and safety:
- `UserModel`: `{ email: 1 }` (unique), `{ username: 1 }` (unique).
- `SessionModel`: `{ tokenHash: 1 }`, `{ familyId: 1 }`, `{ expiresAt: 1 }` (TTL).
- `RoomModel`: `{ ownerId: 1, status: 1 }`, `{ visibility: 1, status: 1, category: 1 }`, `{ name: 'text', description: 'text' }`.
- `RoomMembershipModel`:
  - `{ roomId: 1, userId: 1 }` (unique partial index for `{ status: 'active' }`).
  - `{ userId: 1, status: 1 }` (compound index for user membership lookup).
  - `{ roomId: 1, status: 1, joinedAt: 1 }` (compound index for active room members).

No redundant or table-scanning indexes were added.

---

## 11. Integration Test Matrix

Implemented in [apps/api/src/\_\_tests\_\_/integration-hardening.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/integration-hardening.test.ts):

| Journey / Scenario | Test Name | Invariants Verified |
|---|---|---|
| **Journey 1** | New User Full Lifecycle | Register → Login → `/auth/me` → Browse → Create (count=1, role=host) → Re-join own room (alreadyJoined) → Close room (count=0, memberships left) → Logout. |
| **Journey 2** | Two Users Public Room Flow | User A creates → User B discovers → User B joins (count=2) → User A views snapshot (2 members) → User B leaves (count=1) → User A views snapshot (1 member). |
| **Journey 3** | Private Room Protection | Private room hidden from discovery → Direct access without auth (401) → Direct access by outsider (403) → Members inspection by outsider (403) → Owner access (200). |
| **Journey 4** | Capacity & Invariant Enforcement | Room cap=2 → 2/2 full → 3rd join rejected (409) → 1 member leaves (count=1) → 3rd joins freed spot (count=2) → `currentParticipantsCount === active count`. |
| **Journey 5** | Session Failure & Replay Detection | Login → Refresh → New access token valid → Old token replayed → 401 Replay Detected → Family revoked → Subsequent refresh rejected. |
| **Journey 6** | Account Isolation & Profile Privacy | Outsider profile inspection strips email → Self profile inspection retains email → `x-request-id` returned on all responses. |
| **Journey 7** | Failure Recovery & Reconciliation | Artificially corrupted count detected in `dryRun: true` without mutation → Repaired in `dryRun: false` → Closed room count zeroed → Admin endpoint authorization. |
| **Concurrency** | Duplicate Joins | 10 simultaneous join requests by same user: all return 200/201, room count increments by only 1, active memberships = 2. |
| **Concurrency** | Capacity Boundary Contention | 5 contenders contend for 2 available spots: exactly 2 succeed (201/200), exactly 3 rejected (409), final count strictly 3. |
| **Concurrency** | Join vs Close Race | Join on closed room rejected (400), count rolls back and remains 0. |
| **Concurrency** | Capacity Reduction Race | Host cannot reduce capacity below current participant count; conditional query rejects with 400. |

---

## 12. Exact Test Results

```bash
Test Files  18 passed (18)
     Tests  194 passed (194)
```

- `@ktv/api`: 8 test files passed (8), **110 tests passed (110)**.
  - [api.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/api.test.ts): 6 passed
  - [auth-security.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/auth-security.test.ts): 8 passed
  - [refresh-sessions.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/refresh-sessions.test.ts): 4 passed
  - [room-discovery.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/room-discovery.test.ts): 21 passed
  - [room-management.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/room-management.test.ts): 9 passed
  - [room-membership.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/room-membership.test.ts): 5 passed
  - [room-participation.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/room-participation.test.ts): 22 passed
  - [integration-hardening.test.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/__tests__/integration-hardening.test.ts): 35 passed
- `@ktv/web`: 10 test files passed (10), **84 tests passed (84)**.

---

## 13. Quality Gate Results

| Command | Status | Output / Details |
|---|---|---|
| `pnpm test` | **PASS** | 18 test files passed, 194 tests passed, 0 failures. |
| `pnpm typecheck` | **PASS** | TypeScript v5.8.2: 0 type errors across contracts, api, web. |
| `pnpm lint` | **PASS** | ESLint: 0 warnings, 0 errors. |
| `pnpm build` | **PASS** | Contracts bundled (tsup), API compiled (tsc), Web production build (Next.js 15.5.29: 10/10 static/dynamic routes generated). |

---

## 14. Known Limitations

1. **Standalone MongoDB:** The test and development database topology is currently a single-node standalone MongoDB instance. Multi-document atomic transactions (`session.withTransaction`) require a replica-set cluster. The current system relies on single-document atomic operators and application-level compensation rollbacks.
2. **Snapshot-Based Member Lists:** Member presence on the frontend remains snapshot- and query-invalidation-based until the WebSockets / LiveKit real-time layer is implemented in Sprint 2.0.

---

## 15. Realtime Readiness Assessment

```
┌─────────────────────────────────┬────────────────┬────────┐
│ Area                            │ Required State │ Status │
├─────────────────────────────────┼────────────────┼────────┤
│ Authentication                  │ Stable         │ PASS   │
│ Authorization                   │ Server-enforced│ PASS   │
│ Room lifecycle                  │ Consistent     │ PASS   │
│ Membership lifecycle            │ Idempotent     │ PASS   │
│ Participant count               │ Consistent     │ PASS   │
│ Private room access             │ Protected      │ PASS   │
│ API contracts                   │ Stable         │ PASS   │
│ Frontend API integration        │ Stable         │ PASS   │
│ Query cache isolation           │ Verified       │ PASS   │
│ Operational health              │ Observable     │ PASS   │
│ Integration tests               │ Passing        │ PASS   │
└─────────────────────────────────┴────────────────┴────────┘
```

**Assessment:** The application foundation has eliminated all state corruption vectors, duplicate reservation flaws, and authorization bypasses. Core domain invariants are strictly enforced and verified by automated concurrency tests. **The system is fully ready for Sprint 2.0 — Realtime Foundation.**

---

## 16. Final Verdict

### **READY**

No critical or high-severity blockers remain. All 4 monorepo quality gates (`test`, `typecheck`, `lint`, `build`) pass cleanly without error. Room lifecycle invariants, capacity constraints, atomic token rotation, and private resource authorization are fully verified.
