# KTV Online – Sprint 0.2: Critical Security & Domain Remediation Report

**Date:** November 6, 2026  
**Author:** Senior Backend Engineer, Security Engineer & Database Architect  
**Project:** KTV Online Monorepo  
**Status:** Approved & Remediated  

---

## 1. Executive Summary

During the Sprint 0.1 Architecture Gate Review, eight critical security, domain integrity, database design, and operational issues were identified across the KTV Online codebase (`docs/SPRINT_0_1_ARCHITECTURE_REVIEW.md`). 

The objective of Sprint 0.2 was to remediate all identified vulnerabilities, race conditions, and architectural deficiencies prior to commencing Sprint 1 product feature development.

### Key Outcomes
1. **Zero-Trust Identity**: Eliminated spoofing through `x-user-id`. Authenticated identity is exclusively extracted from cryptographically verified JWT access tokens.
2. **Robust Access Control**: Implemented `requireAuth` and `requireRole` middleware, rejecting forged tokens, expired tokens, and inactive or suspended accounts.
3. **Hardened Refresh Token Architecture**: Implemented a dedicated `Session` model with SHA-256 token hashing, HTTP-only/Secure/SameSite cookies, Refresh Token Rotation (RTR), family-based token tracking, and automatic replay attack detection.
4. **Room Membership Domain & Concurrency Integrity**: Replaced read-then-write race conditions with conditional atomic capacity reservations (`$expr: { $lt: ['$currentParticipantsCount', '$capacity'] }`), automated compensation rollbacks, and partial unique active membership constraints. Verified by real MongoDB concurrency test suites.
5. **Database Index Rationalization**: Pruned redundant indexes on unique fields and prefix overlaps, introducing compound indexes aligned with query filters.
6. **Separated Operational Health Probes**: Decoupled process liveness (`/health/live`) from database-backed readiness (`/health/ready`).

---

## 2. Original Findings and Resolution Status

| Finding ID | Severity | Category | Description | Resolution Status | Implementation Evidence |
|---|---|---|---|---|---|
| **SEC-01** | Critical | Security | Identity spoofing via `x-user-id` header | **RESOLVED** | `apps/api/src/middlewares/auth.middleware.ts`, `apps/api/src/modules/rooms/room.controller.ts` (Lines 14-25), `apps/api/src/__tests__/auth-security.test.ts` |
| **SEC-02** | High | Security | Missing authentication middleware on protected endpoints | **RESOLVED** | `apps/api/src/middlewares/auth.middleware.ts`, `apps/api/src/modules/rooms/room.routes.ts`, `apps/api/src/modules/auth/auth.routes.ts` |
| **SEC-03** | High | Security | Refresh token storage & rotation deficiencies | **RESOLVED** | `apps/api/src/modules/auth/session.model.ts`, `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/__tests__/refresh-sessions.test.ts` |
| **SEC-04** | High | Security | Insecure production secret fallbacks | **RESOLVED** | `apps/api/src/config/env.ts` (Zod `superRefine` enforcing 32+ char distinct secrets without dev defaults in production), `apps/api/src/__tests__/auth-security.test.ts` |
| **SEC-06** | Medium | Security | Suspended/inactive user authentication | **RESOLVED** | Status check in `auth.service.ts` (login/refresh) and `auth.middleware.ts` (`requireAuth` rejects non-active users with 403 Forbidden) |
| **DB-01** | Medium | Database | Redundant and overlapping database indexes | **RESOLVED** | `apps/api/src/modules/users/user.model.ts`, `apps/api/src/modules/rooms/room.model.ts`, `apps/api/src/modules/rooms/membership.model.ts` |
| **DB-02** | High | Database | Room membership race condition & lack of domain model | **RESOLVED** | `apps/api/src/modules/rooms/membership.model.ts`, `apps/api/src/modules/rooms/room.service.ts` (atomic `$inc` capacity check and rollback), `apps/api/src/__tests__/room-membership.test.ts` |
| **OPS-01** | Medium | Operations | Lack of separated readiness and liveness health checks | **RESOLVED** | `apps/api/src/routes/health.routes.ts` (`/health/live`, `/health/ready`, `/health`), `apps/api/src/__tests__/api.test.ts` |

---

## 3. Authentication Architecture (Phase A)

### 3.1 Trust-Free Identity Extraction
The vulnerability where callers could pass arbitrary `x-user-id` headers to set `ownerId` has been completely eliminated. 
- The `requireAuth` middleware verifies incoming `Authorization: Bearer <token>` headers using `jsonwebtoken.verify()` against `env.JWT_ACCESS_SECRET`.
- The subject claim `payload.sub` is verified against the database to confirm the account exists and that `user.status === 'active'`.
- Request context is augmented via TypeScript module declaration:
  ```typescript
  export interface AuthenticatedUser {
    id: string;
    username: string;
    role: UserRole;
  }
  ```
- Controllers access authenticated user context strictly through `req.user.id`. The `x-user-id` header is completely ignored across all endpoints.

### 3.2 Role-Based Access Control (`requireRole`)
`requireRole(...allowedRoles: UserRole[])` guards administrative and privileged actions. If an authenticated user does not possess one of the required roles, a standardized `403 Forbidden` response is returned.

### 3.3 Account Inactivity and Suspension Enforcement (SEC-06)
- Suspended or deactivated users attempting to authenticate via `/login` receive `403 Forbidden` (`Your account is suspended or inactive`).
- Users whose accounts are suspended after token issuance are blocked on their next API call by `requireAuth` because the user document status is re-verified from the database.
- Refreshing tokens for suspended accounts marks the refresh session family as revoked and rejects the request.

### 3.4 Production Secret Hardening (SEC-04)
In `apps/api/src/config/env.ts`, `EnvSchema` is validated on process initialization with strict Zod `.superRefine()` rules:
- In production (`NODE_ENV === 'production'`), neither `JWT_ACCESS_SECRET` nor `JWT_REFRESH_SECRET` can match known development defaults.
- Both secrets must be at least 32 characters in length.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be distinct cryptographic keys.
- Failure to comply halts Node.js process boot immediately with actionable diagnostic error messages.

---

## 4. Refresh Session Architecture (Phase B)

### 4.1 Trade-off Analysis: `tokenVersion` vs Dedicated Session Model
During Phase B design, two architectural patterns for refresh token management were evaluated:

| Feature / Criterion | User `tokenVersion` Approach | Dedicated `Session` Model Approach (Selected) |
|---|---|---|
| **Storage Overhead** | Minimal (single integer on User document) | Moderate (one document per active session in `sessions` collection) |
| **Multi-Device Support** | Poor (invalidating one session invalidates all devices globally) | **Excellent** (independent session per device/browser) |
| **Refresh Token Rotation (RTR)** | Fragile (incrementing version logs out other concurrent tabs/devices) | **Native** (each rotation atomically issues a successor session document) |
| **Replay Attack Detection** | Limited to version mismatch | **Precise** (tracks `familyId` lineage; revokes family if reused) |
| **Granular Revocation** | No (cannot revoke single stolen token without logging out user everywhere) | **Yes** (revoke specific session or entire family) |
| **Token Lifecycle / Expiration** | Unindexed cleanup | **Automated via MongoDB TTL index** (`expiresAt`) |

**Decision:** A dedicated `Session` model was selected. It provides production-grade security, multi-device session separation, and automatic family-wide revocation under replay attacks.

### 4.2 Refresh Token Lifecycle & Rotation
1. **Issuance**: Upon login, a cryptographically random `familyId` (UUID v4) and `jti` are generated. The refresh token is signed and its SHA-256 hash is persisted to MongoDB.
2. **Cookie Scoping**: The refresh token is dispatched exclusively via an HTTP-only cookie:
   - `HttpOnly: true` (inaccessible to JavaScript / XSS)
   - `Secure: true` in production environments
   - `SameSite: 'lax'` (protects against CSRF on cross-site requests)
   - `Path: '/api/v1/auth'` (scoped strictly to auth endpoints, preventing leak to third-party endpoints)
   - `Max-Age: 7 days`
   - Refresh tokens are omitted from response bodies.
3. **Rotation & Replay Detection**:
   - When `/api/v1/auth/refresh` is called, the provided refresh token is hashed and looked up in MongoDB.
   - If `session.isRevoked === true`, **a replay attack is detected** (an already-used token has been re-submitted). The system logs a security warning and revokes all sessions sharing that `familyId`.
   - If valid, the current session is marked `isRevoked: true`, and a new session with a new token is created under the same `familyId`.
4. **Revocation & Logout**:
   - Calling `POST /api/v1/auth/logout` marks the session `isRevoked: true` in MongoDB and clears the HTTP-only cookie using `res.clearCookie('refreshToken')`.

---

## 5. Room Membership Architecture (Phase C)

### 5.1 Domain Separation: Membership vs Ephemeral Presence
Sprint 0 conflated transient WebRTC presence with persistent room membership. Sprint 0.2 creates a clean separation:
- **`RoomMembership` (Persistent Domain)**: Stored in the `room_memberships` collection. Represents a user's authorized role (`host`, `moderator`, `participant`, `listener`), active status, join timestamp, and leave timestamp.
- **Ephemeral Presence (Sprint 2 Realtime)**: Will represent transient peer connections and socket IDs in memory, without mutating database membership records on brief network blips.

### 5.2 Atomic Capacity Reservation & Concurrency Safety
Under concurrent join requests, checking room capacity via `room.currentParticipantsCount >= room.capacity` in application code produces race conditions.

Sprint 0.2 remediates this with a conditional atomic update:
```typescript
const room = await RoomModel.findOneAndUpdate(
  {
    _id: roomId,
    status: { $ne: 'closed' },
    $expr: { $lt: ['$currentParticipantsCount', '$capacity'] },
  },
  { $inc: { currentParticipantsCount: 1 } },
  { new: true }
).exec();
```

### 5.3 Compensation Rollback & Error Handling
1. If the conditional update finds no document, either the room does not exist, the room is closed, or room capacity is exhausted. The request is rejected before any membership writes.
2. If capacity reservation succeeds, the service attempts to create or reactivate the `RoomMembership` record.
3. If membership creation fails (e.g. duplicate active membership partial index conflict or unexpected database fault), the reserved capacity is automatically released via compensation:
   ```typescript
   await RoomModel.findByIdAndUpdate(roomId, {
     $inc: { currentParticipantsCount: -1 }
   }).exec();
   ```
4. On `leaveRoom`, the membership record status is transitioned to `left`, `leftAt` is recorded, and room participant count is safely decremented down to a lower bound of zero using `$max: [0, { $subtract: ['$currentParticipantsCount', 1] }]`.

---

## 6. Database Index Decisions (Phase D)

The database indexes were reviewed against real query patterns to eliminate redundant overhead while preserving unique constraints and query performance.

### 6.1 User Collection (`users`)
- **Kept**:
  - `_id_`: Default primary key.
  - `username_1`: Unique constraint (`unique: true`).
  - `email_1`: Unique constraint (`unique: true`).
  - `role_1_status_1`: Compound index for administrative filtering.
- **Removed**:
  - Explicit duplicate index declaration for `username: 1` and `email: 1` (Mongoose schema options already generate unique indexes).
  - Redundant compound index `{ username: 1, email: 1 }` (queries never filter by both simultaneously).

### 6.2 Room Collection (`rooms`)
- **Kept**:
  - `_id_`: Default primary key.
  - `code_1`: Unique room invitation code index.
  - `ownerId_1`: High-frequency queries for "rooms created by user".
  - `status_1_createdAt_-1`: Room lobby sorting by active status and creation recency.
  - `category_1_visibility_1_createdAt_-1`: Primary query index for public room discovery and filtering.
- **Removed**:
  - Standalone `{ visibility: 1 }` (redundant prefix of the compound discovery index).
  - Standalone `{ category: 1 }` (redundant prefix of `{ category: 1, visibility: 1, createdAt: -1 }`).

### 6.3 RoomMembership Collection (`room_memberships`)
- **New Indexes**:
  - `{ roomId: 1, userId: 1 }` with `{ unique: true, partialFilterExpression: { status: 'active' } }`: Guarantees a user cannot hold more than one active membership in the same room simultaneously, while allowing historic log entries for past visits (`status: 'left'`).
  - `{ userId: 1, status: 1 }`: Fast lookup of all active rooms a user is currently participating in.
  - `{ roomId: 1, status: 1 }`: Fast lookup of current members in a room.

---

## 7. API Contract Changes

All contract changes maintain backward compatibility for reading data while locking down write operations:

| Endpoint | Method | Previous Contract (Sprint 0) | Remediated Contract (Sprint 0.2) | Breaking Changes / Notes |
|---|---|---|---|---|
| `/api/v1/rooms` | `POST` | Permitted unauthenticated calls; accepted client `x-user-id` | **Requires `Authorization: Bearer <token>`**. Derives `ownerId` exclusively from token. | **Breaking**: Unauthenticated calls now return `401 Unauthorized`. |
| `/api/v1/rooms/:id/join` | `POST` | Not implemented | **Requires `Authorization: Bearer <token>`**. Atomically reserves capacity and creates membership. | New Endpoint. |
| `/api/v1/rooms/:id/leave` | `POST` | Not implemented | **Requires `Authorization: Bearer <token>`**. Releases capacity and marks membership `left`. | New Endpoint. |
| `/api/v1/rooms/:id/members`| `GET` | Not implemented | Publicly accessible room member list with role and joined status. | New Endpoint. |
| `/api/v1/auth/login` | `POST` | Returned tokens in JSON body | Returns `accessToken` in body; returns `refreshToken` exclusively in **HTTP-only cookie**. | Response body no longer contains plaintext refresh token. |
| `/api/v1/auth/refresh` | `POST` | Expected `refreshToken` in request body | Reads `refreshToken` from HTTP-only cookie (falls back to body if provided). Rotates token and returns new cookie. | Transparent to browser cookie clients. |
| `/api/v1/auth/logout` | `POST` | Not implemented | Revokes session family in database and clears HTTP-only cookie. | New Endpoint. |
| `/api/v1/auth/me` | `GET` | Not implemented | Returns current authenticated user profile (`id`, `username`, `email`, `role`, `status`). | New Endpoint. |
| `/api/v1/health/live` | `GET` | Not implemented | Returns `200 OK` process liveness probe. | New Endpoint. |
| `/api/v1/health/ready` | `GET` | Not implemented | Returns `200 OK` (MongoDB connected) or `503 Service Unavailable` (DB down). | New Endpoint. |
| `/api/v1/health` | `GET` | Returned static 200 payload | Returns `200 OK` or `503 Service Unavailable` with database readiness state. | Status code reflects real DB health. |

---

## 8. Security Tests

The test suite in `apps/api/src/__tests__/auth-security.test.ts` covers all authentication and authorization requirements:
- **Missing Token**: Verifies `401 Unauthorized` (`Authentication token is required`).
- **Invalid Token Signature**: Verifies `401 Unauthorized` (`Invalid authentication token`) on tampered tokens.
- **Expired Token**: Verifies `401 Unauthorized` (`Authentication token has expired`).
- **Suspended User**: Verifies `403 Forbidden` (`User account is suspended or inactive`).
- **Identity Spoofing**: Verifies that when an attacker passes a forged `x-user-id: <victim_id>` header with their token, the server sets `ownerId` to the authenticated caller's identity and ignores the header.
- **Production Secret Validation**:
  - Rejection of development defaults in production mode.
  - Rejection of secret keys under 32 characters in length.
  - Acceptance of distinct 32+ character secrets in production mode.

---

## 9. Database Concurrency Tests

The test suite in `apps/api/src/__tests__/room-membership.test.ts` executes real concurrent operations against MongoDB:
- **Successful Join & Idempotency**: User can join an active room; joining again when already active returns the existing membership without incrementing capacity.
- **Atomic Capacity Enforcement Under High Concurrency**:
  - A room is initialized with `capacity = 3`.
  - Ten (10) simulated users simultaneously invoke `POST /api/v1/rooms/:id/join` via `Promise.all()`.
  - **Result**: Exactly three (3) requests succeed (`200 OK`); exactly seven (7) requests receive `409 Conflict` (`Room is at full capacity`).
  - The final room document has `currentParticipantsCount: 3`, with zero over-allocation.
- **Leave & Capacity Release**: When an active member leaves, `currentParticipantsCount` decrements to 2, allowing a subsequent user to join.
- **Closed Room Protection**: Attempting to join a room with `status: 'closed'` fails immediately with `400 Bad Request` (`Cannot join a closed room`).

---

## 10. Build and Verification Results

All packages and applications across the workspace passed linting, type-checking, automated testing, and production builds:

### 10.1 Test Execution Summary (`pnpm test`)
```
✓ packages/contracts test (5 tests passed)
✓ apps/api test:
  ✓ src/__tests__/api.test.ts (6 tests)
  ✓ src/__tests__/auth-security.test.ts (8 tests)
  ✓ src/__tests__/refresh-sessions.test.ts (4 tests)
  ✓ src/__tests__/room-membership.test.ts (5 tests)
✓ apps/web test (4 tests passed)

Total: 32 tests passed across 3 workspaces (100% success rate)
```

### 10.2 TypeScript Check (`pnpm typecheck`)
- `@ktv/contracts`: `tsc --noEmit` passed with 0 errors.
- `@ktv/api`: `tsc --noEmit` passed with 0 errors.
- `@ktv/web`: `tsc --noEmit` passed with 0 errors.

### 10.3 Linter (`pnpm lint`)
- `@ktv/contracts`: ESLint passed with 0 warnings or errors.
- `@ktv/api`: ESLint passed with 0 warnings or errors.
- `@ktv/web`: Next.js ESLint passed with 0 warnings or errors.

### 10.4 Production Build (`pnpm build`)
- `@ktv/contracts`: `tsup` compiled ESM and CJS bundles + `.d.ts` declaration maps.
- `@ktv/api`: TypeScript build succeeded to `dist/`.
- `@ktv/web`: Next.js 15 compiled 6 static and dynamic routes successfully.

---

## 11. Remaining Risks & Deferred Items

The following architectural constraints were intentionally deferred according to Sprint 0.2 rules:
1. **In-Memory Rate Limiting**: The current rate limiter uses in-memory tracking. Redis will be introduced in Sprint 2 for distributed horizontal scaling across multiple API pods.
2. **WebSocket Authentication**: Real-time Socket.io token validation will be implemented in Sprint 1/2 as part of the real-time presence layer.
3. **MongoDB Replica Set Transactions**: Atomic conditional updates (`findOneAndUpdate` with `$expr`) currently guarantee capacity integrity without multi-document transactions. When multi-document consistency across room state and chat logs is needed in later sprints, a replica set with transaction support will be configured.

---

## 12. Sprint 1 Readiness Verdict

| Criterion | Requirement | Status |
|---|---|---|
| **Identity Trust Boundary** | Authenticated user identity derived exclusively from verified JWT | **PASS** |
| **Route Protection** | Protected endpoints reject unauthenticated / suspended users | **PASS** |
| **Secret Management** | Production startup fails on missing, weak, or default secrets | **PASS** |
| **Session Security** | Refresh token rotation, replay detection, HTTP-only cookies | **PASS** |
| **Room Domain Integrity** | Dedicated membership model, atomic capacity reservation | **PASS** |
| **Concurrency Safety** | Multi-join race conditions eliminated and verified under test | **PASS** |
| **Database Performance** | Redundant indexes eliminated; query indexes optimized | **PASS** |
| **Operational Probes** | Independent `/health/live` and `/health/ready` endpoints | **PASS** |
| **Quality Gate** | 100% tests passing, clean typecheck, clean lint, clean build | **PASS** |

### **FINAL VERDICT: READY FOR SPRINT 1**

Sprint 0.2 has resolved all critical blockers from the Sprint 0.1 Architecture Gate Review. The technical foundation is secure, resilient to concurrency races, and ready for product feature development in Sprint 1.
