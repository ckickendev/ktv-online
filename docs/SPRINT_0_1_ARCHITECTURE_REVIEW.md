# KTV Online – Sprint 0.1: Architecture Gate Review & Security Audit

**Document Version:** 1.0.0  
**Audit Role:** Senior Software Architect & Lead Security Engineer  
**Date:** November 6, 2026  
**Status:** Architecture Gate Audit Completed (Read-Only)  
**Target Codebase:** KTV Online Monorepo (`apps/web`, `apps/api`, `packages/contracts`)

---

## 1. Executive Summary

A comprehensive, read-only architectural, security, database, and implementation review of the **Sprint 0** foundation was conducted. 

The monorepo demonstrates strong software engineering fundamentals:
- **Strict TypeScript (ES2022)** passes across all packages with zero compilation errors (`pnpm typecheck`).
- **ESLint v9 flat configuration** passes cleanly with zero warnings or errors (`pnpm lint`).
- **Automated test suites** execute and pass (13/13 tests across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`).
- **Production builds** succeed with optimized bundles (`pnpm build`).
- **Application runtime** boots reliably, gracefully handles database availability states, and renders all frontend routes with HTTP 200.

However, the audit identified **two Critical blockers**, **two High-priority security gaps**, and **several database index redundancies** that must be resolved prior to implementing multi-user features in Sprint 1. Most crucially:
1. **Unauthenticated Room Creation & Identity Spoofing:** `POST /api/v1/rooms` allows callers to spoof their identity via an unverified `x-user-id` header or fall back to a hardcoded placeholder ObjectId.
2. **Absence of Authentication Middleware:** The API currently has zero middleware to extract, verify, and enforce Bearer JWT tokens on protected routes.
3. **Stateless Refresh Tokens Without Revocation:** Refresh tokens are verified solely by cryptographic signature without database persistence, blacklisting, or rotation detection.
4. **Frontend API Disconnect:** While `@tanstack/react-query` is wrapped in a provider, no HTTP client or query hooks exist; all frontend views currently consume local mock datasets.

---

## 2. Verified Implementation Status

The table below contrasts documented claims with source code verification:

| Area | Component | Source Location | Verified Status | Evidence & Test Output |
| :--- | :--- | :--- | :--- | :--- |
| **Monorepo** | pnpm Workspaces | [`pnpm-workspace.yaml`](file:///pnpm-workspace.yaml) | **VERIFIED** | 3 workspaces (`@ktv/contracts`, `@ktv/api`, `@ktv/web`) |
| **Contracts** | Zod Schemas & Types | [`packages/contracts/src`](file:///packages/contracts/src) | **VERIFIED** | Builds dual ESM/CJS; 5/5 Vitest tests pass |
| **API** | Express App & Server | [`apps/api/src/app.ts`](file:///apps/api/src/app.ts) | **VERIFIED** | Helmet, CORS, Rate Limit, Pino logger, Graceful shutdown |
| **API** | Health Check Endpoint | [`apps/api/src/routes/health.routes.ts`](file:///apps/api/src/routes/health.routes.ts) | **VERIFIED** | Responds with JSON payload distinguishing app & DB state |
| **API** | User Registration | [`apps/api/src/modules/users/user.service.ts`](file:///apps/api/src/modules/users/user.service.ts) | **VERIFIED** | bcrypt hash (10 rounds), duplicate email/username check |
| **API** | User Login | [`apps/api/src/modules/auth/auth.service.ts`](file:///apps/api/src/modules/auth/auth.service.ts) | **VERIFIED** | bcrypt compare, issues signed JWT access & refresh tokens |
| **API** | Auth Middleware | `apps/api/src/middlewares/` | **NOT IMPLEMENTED** | Zero token extraction or auth guard middleware exists |
| **Database** | Mongoose Connection | [`apps/api/src/database/connection.ts`](file:///apps/api/src/database/connection.ts) | **VERIFIED** | Singleton connection with lifecycle event logging |
| **Database** | Domain Models | `apps/api/src/modules/*/` | **VERIFIED** | `User` and `Room` Mongoose models with validation & indexes |
| **Frontend** | Next.js 15 App Shell | [`apps/web/src/app/layout.tsx`](file:///apps/web/src/app/layout.tsx) | **VERIFIED** | Tailwind CSS v4 design tokens, Dark-first styling |
| **Frontend** | Landing Page | [`apps/web/src/app/page.tsx`](file:///apps/web/src/app/page.tsx) | **VERIFIED** | Hero, animated sound waves, metrics, feature cards |
| **Frontend** | Room Discovery | [`apps/web/src/app/(platform)/rooms/page.tsx`](file:///apps/web/src/app/(platform)/rooms/page.tsx) | **VERIFIED** | Search, category filters, status filters, mock banner |
| **Frontend** | Room Detail Placeholder | [`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`](file:///apps/web/src/app/(platform)/rooms/[roomId]/page.tsx) | **VERIFIED** | Lyrics display, audio visualizer, queue, chat, mic toggle |
| **Frontend** | User Profile Placeholder| [`apps/web/src/app/(platform)/profile/page.tsx`](file:///apps/web/src/app/(platform)/profile/page.tsx) | **VERIFIED** | Stats grid, recent history, hardware settings mockup |
| **Frontend** | API Client Integration | `apps/web/src/lib/` | **NOT IMPLEMENTED** | No `fetch` wrapper or axios instance; React Query unconsumed |

---

## 3. Report vs Source Code Discrepancies

### Discrepancy 1: Room Ownership and Authentication
- **Sprint 0 Report Claim:** Section 5 & 6 documented: *"User domain foundation ... Room domain foundation ... defines proper references, enums, validation and indexes."*
- **Actual Implementation:** In [`apps/api/src/modules/rooms/room.controller.ts:59-60`](file:///apps/api/src/modules/rooms/room.controller.ts#L59-L60):
  ```typescript
  // In sprint 0 foundation, assume ownerId or default placeholder if not authenticated yet
  const ownerId = (req.headers['x-user-id'] as string) || '60d0fe4f5311236168a109ca';
  ```
  The endpoint extracts `ownerId` from an untrusted, unverified HTTP header `x-user-id` with a fallback to a hardcoded dummy string. It does not verify whether the user exists or whether the caller holds a valid JWT.

### Discrepancy 2: Token Verification in Route Handlers
- **Sprint 0 Report Claim:** Section 2 & 5 documented *"JWT authentication foundation ... Production-minded Express application."*
- **Actual Implementation:** While JWT token *generation* and *verification utilities* were created in [`apps/api/src/utils/jwt.ts`](file:///apps/api/src/utils/jwt.ts), there is **no authentication middleware** anywhere in `apps/api/src/middlewares/`. No routes verify `Authorization: Bearer <token>`.

### Discrepancy 3: Frontend API Consumption
- **Sprint 0 Report Claim:** Section 2 & 4 listed TanStack Query as the server-state management layer.
- **Actual Implementation:** `@tanstack/react-query` is mounted in [`apps/web/src/providers/query-provider.tsx`](file:///apps/web/src/providers/query-provider.tsx), but is **never invoked** across the application. Not a single `useQuery` or `useMutation` hook exists. `NEXT_PUBLIC_API_URL` is never referenced in frontend application code.

### Discrepancy 4: Login Account Status Check
- **Sprint 0 Report Claim:** Section 5 documented User status handling (`active`, `suspended`, `offline`, `online`).
- **Actual Implementation:** In [`apps/api/src/modules/auth/auth.service.ts:9-18`](file:///apps/api/src/modules/auth/auth.service.ts#L9-L18), the `authenticate()` method validates the password hash but **fails to check** whether `user.status === 'active'`. Suspended users can successfully log in and receive valid JWT tokens.

---

## 4. Security Findings

### SEC-01: Identity Spoofing in Room Creation via `x-user-id`
- **Severity:** **CRITICAL**
- **Evidence:** [`apps/api/src/modules/rooms/room.controller.ts:59-60`](file:///apps/api/src/modules/rooms/room.controller.ts#L59-L60)
  ```typescript
  const ownerId = (req.headers['x-user-id'] as string) || '60d0fe4f5311236168a109ca';
  ```
- **Actual Impact:** Any unauthenticated client can craft a `POST /api/v1/rooms` request and impersonate any user in the system by passing their ObjectId in `x-user-id`. If omitted, rooms are assigned to a non-existent placeholder account.
- **Recommended Resolution:** Implement `authenticateToken` middleware that parses `Authorization: Bearer <token>`, attaches `req.user = { id, role }`, and extracts `ownerId` strictly from `req.user.id`.
- **Blocks Sprint 1:** **YES**

---

### SEC-02: Missing Authentication and Authorization Middleware
- **Severity:** **CRITICAL**
- **Evidence:** [`apps/api/src/middlewares/`](file:///apps/api/src/middlewares) contains only `error.middleware.ts`, `not-found.middleware.ts`, `rate-limiter.middleware.ts`, and `validate.middleware.ts`.
- **Actual Impact:** The entire API is unauthenticated. Anyone can read any profile (`GET /api/v1/users/:id`), register unlimited accounts, create rooms, and query rooms without authentication.
- **Recommended Resolution:** Build [`apps/api/src/middlewares/auth.middleware.ts`](file:///apps/api/src/middlewares/) providing:
  1. `requireAuth`: Validates access JWT, rejects expired/tampered tokens with `401 Unauthorized`.
  2. `requireRole(roles: UserRole[])`: Validates permissions, returning `403 Forbidden` if unauthorized.
- **Blocks Sprint 1:** **YES**

---

### SEC-03: Stateless Refresh Tokens Without Revocation or Rotation Detection
- **Severity:** **HIGH**
- **Evidence:** [`apps/api/src/modules/auth/auth.service.ts:44-66`](file:///apps/api/src/modules/auth/auth.service.ts#L44-L66)
  ```typescript
  async refreshToken(token: string): Promise<AuthTokens | null> {
    const decoded = verifyRefreshToken(token);
    const user = await UserModel.findById(decoded.sub).exec();
    ...
    return { accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload), ... };
  }
  ```
- **Actual Impact:** When a refresh token is used, a new refresh token is issued, but the old token is **not invalidated or tracked**. If an attacker steals a refresh token, they can reuse it indefinitely until the 7-day expiration.
- **Recommended Resolution:** 
  1. Store a `tokenVersion` or hashed active refresh token on the `User` document (or Redis).
  2. Implement Refresh Token Rotation (RTR): Invalidate the previous token upon use. If an old token is reused, trigger reuse detection and revoke all active sessions for that user.
- **Blocks Sprint 1:** **NO** (Recommended for Sprint 1 auth completion).

---

### SEC-04: Default Secret Fallbacks in Environment Configuration
- **Severity:** **HIGH**
- **Evidence:** [`apps/api/src/config/env.ts:10-11`](file:///apps/api/src/config/env.ts#L10-L11)
  ```typescript
  JWT_ACCESS_SECRET: z.string().min(16).default('ktv_online_jwt_access_secret_development_key_12345'),
  JWT_REFRESH_SECRET: z.string().min(16).default('ktv_online_jwt_refresh_secret_development_key_67890'),
  ```
- **Actual Impact:** If `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are accidentally omitted from the production `.env`, the Zod validator will silently fall back to known public keys. Anyone reading the repository could forge valid admin tokens.
- **Recommended Resolution:** Use Zod's `.refine()` or conditional schemas: In `NODE_ENV === 'production'`, require secrets to be explicitly set and enforce a minimum of 32 characters without fallback defaults.
- **Blocks Sprint 1:** **NO** (Must fix before staging/production).

---

### SEC-05: Permissive Rate Limiting on Authentication Endpoints
- **Severity:** **MEDIUM**
- **Evidence:** [`apps/api/src/middlewares/rate-limiter.middleware.ts:4-6`](file:///apps/api/src/middlewares/rate-limiter.middleware.ts#L4-L6) & [`apps/api/src/app.ts:27`](file:///apps/api/src/app.ts#L27)
  ```typescript
  windowMs: 15 * 60 * 1000, max: 300
  ```
- **Actual Impact:** A single global rate limit of 300 requests per 15 minutes applies to all endpoints, including `/api/v1/auth/login`. This is too permissive for brute-force and credential-stuffing protection.
- **Recommended Resolution:** Create a dedicated `authRateLimiter` allowing a maximum of 5–10 failed login attempts per 15 minutes per IP.
- **Blocks Sprint 1:** **NO**

---

### SEC-06: Suspended Accounts Can Authenticate
- **Severity:** **MEDIUM**
- **Evidence:** [`apps/api/src/modules/auth/auth.service.ts:9-18`](file:///apps/api/src/modules/auth/auth.service.ts#L9-L18)
  ```typescript
  const user = await UserModel.findOne({ email: dto.email.toLowerCase() }).select('+passwordHash').exec();
  if (!user) return null;
  const isValid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!isValid) return null;
  // Does not check user.status === 'active'
  ```
- **Actual Impact:** Users flagged as `suspended` can still authenticate via `POST /api/v1/auth/login` and receive valid access tokens.
- **Recommended Resolution:** Add `if (user.status !== 'active') return null;` in `authenticate()`.
- **Blocks Sprint 1:** **NO**

---

### SEC-07: In-Memory Rate Limiting Incompatible with Clustered Runtime
- **Severity:** **LOW**
- **Evidence:** [`apps/api/src/middlewares/rate-limiter.middleware.ts:4`](file:///apps/api/src/middlewares/rate-limiter.middleware.ts#L4)
- **Actual Impact:** `express-rate-limit` uses the default memory store. Hit counters do not synchronize across multiple Node processes or server instances.
- **Recommended Resolution:** Deferred to Sprint 2 when Redis is integrated.
- **Blocks Sprint 1:** **NO**

---

## 5. Database Findings

### DB-01: Redundant Index Declarations in User and Room Schemas
- **Severity:** **HIGH**
- **Evidence:**
  1. [`apps/api/src/modules/users/user.model.ts:6-23, 61-62`](file:///apps/api/src/modules/users/user.model.ts#L6-L23):
     - `username`: defined with `unique: true` AND `index: true`. Mongoose automatically creates an index for `unique: true`. Defining `index: true` is redundant.
     - `email`: defined with `unique: true` AND `index: true`. Redundant.
     - Compound index `UserSchema.index({ email: 1, status: 1 })`: Because `email` is globally unique, querying by `email` will return at most one document. The compound index with `status` provides no performance benefit and wastes write IOPS.
     - Compound index `UserSchema.index({ username: 1, status: 1 })`: Redundant for the same reason.
  2. [`apps/api/src/modules/rooms/room.model.ts:31-36, 50-55, 86-87`](file:///apps/api/src/modules/rooms/room.model.ts#L31-L36):
     - `visibility`: defined with `index: true` AND is the leading field of compound index `{ visibility: 1, status: 1, createdAt: -1 }`. In B-tree indexes, the compound index already satisfies any equality match on `visibility`. The single-field index is completely redundant.
     - `category`: defined with `index: true` AND is the leading field of compound index `{ category: 1, visibility: 1 }`. Redundant.
- **Actual Impact:** Every document write/update incurs overhead updating 4 redundant indexes in MongoDB WiredTiger storage.
- **Recommended Resolution:**
  - In `user.model.ts`: Keep `unique: true` on `email` and `username`. Remove `index: true` and drop compound indexes `{ email: 1, status: 1 }` and `{ username: 1, status: 1 }`.
  - In `room.model.ts`: Remove single-field `index: true` on `visibility` and `category`.
- **Blocks Sprint 1:** **NO** (Recommended before large-scale seeding).

---

### DB-02: Race Condition in Room Participant Capacity
- **Severity:** **HIGH**
- **Evidence:** [`apps/api/src/modules/rooms/room.service.ts:56-65`](file:///apps/api/src/modules/rooms/room.service.ts#L56-L65)
  ```typescript
  const room = new RoomModel({
    ...data,
    ownerId: new Types.ObjectId(ownerId),
    status: 'idle',
    currentParticipantsCount: 1,
  });
  ```
- **Actual Impact:** When users join a room, checking capacity via separate `findById()` and `save()` operations will lead to race conditions under concurrent load, allowing rooms to exceed their declared `capacity`.
- **Recommended Resolution:** In Sprint 1, enforce atomic join operations via MongoDB:
  ```typescript
  RoomModel.findOneAndUpdate(
    { _id: roomId, currentParticipantsCount: { $lt: room.capacity } },
    { $inc: { currentParticipantsCount: 1 } }
  );
  ```
- **Blocks Sprint 1:** **YES** (Must govern room join logic).

---

### DB-03: Storage of Ephemeral Realtime Presence in Persistent Database
- **Severity:** **MEDIUM**
- **Evidence:** [`apps/api/src/modules/rooms/room.model.ts:56-60`](file:///apps/api/src/modules/rooms/room.model.ts#L56-L60) (`currentParticipantsCount`, `currentSongTitle`, `currentSingerName`).
- **Actual Impact:** If the server crashes or users abruptly drop WebSocket/WebRTC connections, integer participant counts remain permanently incremented in MongoDB ("ghost participants").
- **Recommended Resolution:** Establish architectural boundary: Persistent metadata (owner, name, category, capacity) belongs in MongoDB. Transient presence (active socket connections, current singer, live listeners) belongs in Redis / LiveKit in Sprint 2.
- **Blocks Sprint 1:** **NO**

---

### DB-04: Text Search Index vs Compound Sort Conflict
- **Severity:** **MEDIUM**
- **Evidence:** [`apps/api/src/modules/rooms/room.service.ts:35-51`](file:///apps/api/src/modules/rooms/room.service.ts#L35-L51)
  ```typescript
  if (query.search) filter.$text = { $search: query.search };
  RoomModel.find(filter).sort({ createdAt: -1 })
  ```
- **Actual Impact:** MongoDB cannot use index sorting when querying with `$text`. Combining `$text` search with `.sort({ createdAt: -1 })` forces MongoDB to perform a blocking in-memory sort on all matching text search results.
- **Recommended Resolution:** Sort by text relevance score (`{ score: { $meta: 'textScore' } }`) when `query.search` is present, and only sort by `{ createdAt: -1 }` when text search is omitted.
- **Blocks Sprint 1:** **NO**

---

## 6. API Audit

Detailed audit of all 8 endpoints implemented in the Express backend:

### 1. `GET /api/v1/health`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None (Public).
- **Authorization Requirements:** None.
- **Request Validation:** None.
- **Response Structure:** `{ success: true, message: string, data: HealthStatusDto }`.
- **Error Handling:** Graceful fallback reporting `status: "degraded"` when DB is disconnected.
- **Database Interaction:** Inspects `mongoose.connection.readyState`.
- **Finding:** Returns HTTP `200 OK` even when database is disconnected. Breaks container orchestrator readiness probes (should return HTTP `503` for readiness).

### 2. `POST /api/v1/auth/login`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None (Public).
- **Authorization Requirements:** None.
- **Request Validation:** `LoginSchema` (`email` valid format, `password` required).
- **Response Structure:** `{ success: true, message: "Login successful", data: { user, tokens } }`.
- **Error Handling:** Returns `401 Unauthorized` for invalid credentials.
- **Database Interaction:** Queries `UserModel.findOne({ email }).select('+passwordHash')`.
- **Finding:** Fails to check `user.status === 'active'`. Suspended users can authenticate.

### 3. `POST /api/v1/auth/refresh`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None (Valid refresh token in body).
- **Authorization Requirements:** None.
- **Request Validation:** `RefreshTokenSchema` (`refreshToken` string required).
- **Response Structure:** `{ success: true, message: "Tokens refreshed successfully", data: AuthTokens }`.
- **Error Handling:** Returns `401 Unauthorized` on expired or tampered token.
- **Database Interaction:** Queries `UserModel.findById(decoded.sub)`. Verifies `user.status === 'active'`.
- **Finding:** Stateless token reissue without revocation or token rotation tracking.

### 4. `POST /api/v1/users/register`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None (Public).
- **Authorization Requirements:** None.
- **Request Validation:** `CreateUserSchema` (username 3-30 chars regex, email, password min 8 chars).
- **Response Structure:** `{ success: true, message: "User created successfully", data: UserDto }` (HTTP 201).
- **Error Handling:** Returns `400 Bad Request` with field validation errors; `409 Conflict` on duplicate email or username.
- **Database Interaction:** Queries duplicate email/username, hashes password with bcrypt (10 rounds), saves new `UserModel`.
- **Finding:** Correctly implemented.

### 5. `GET /api/v1/users/:id`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None.
- **Authorization Requirements:** None.
- **Request Validation:** Validates `req.params.id`.
- **Response Structure:** `{ success: true, message: "User retrieved successfully", data: UserDto }`.
- **Error Handling:** Returns `404 Not Found` if user does not exist.
- **Database Interaction:** `UserModel.findById(id)`.
- **Finding:** Does not validate if `id` is a valid 24-character hexadecimal `ObjectId`. An invalid string causes an unhandled Mongoose CastError caught by the global error handler.

### 6. `GET /api/v1/rooms`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None (Public discovery).
- **Authorization Requirements:** None.
- **Request Validation:** `RoomQuerySchema` (page, limit, category, status, roomType, visibility, search).
- **Response Structure:** `{ success: true, message: "Rooms retrieved successfully", data: { items: RoomDto[], pagination: PaginationMeta } }`.
- **Error Handling:** Standardized error response on failure.
- **Database Interaction:** `RoomModel.find(filter).sort().skip().limit().populate('ownerId')`.
- **Finding:** Defaults `visibility` to `'public'`. Private rooms are excluded unless specified.

### 7. `GET /api/v1/rooms/:id`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None.
- **Authorization Requirements:** None.
- **Request Validation:** Checks `Types.ObjectId.isValid(id)`.
- **Response Structure:** `{ success: true, message: "Room retrieved successfully", data: RoomDto }`.
- **Error Handling:** Returns `404 Not Found` if room does not exist or ID is invalid.
- **Database Interaction:** `RoomModel.findById(id).populate('ownerId', 'username avatar')`.
- **Finding:** Correctly implemented.

### 8. `POST /api/v1/rooms`
- **Implementation Status:** Fully implemented.
- **Auth Requirements:** None currently enforced.
- **Authorization Requirements:** None.
- **Request Validation:** `CreateRoomSchema` (name 2-60 chars, capacity 2-50, category, roomType).
- **Response Structure:** `{ success: true, message: "Room created successfully", data: RoomDto }` (HTTP 201).
- **Error Handling:** Returns `400 Bad Request` with Zod validation details on schema violations.
- **Database Interaction:** Creates new `RoomModel` and saves to MongoDB.
- **Finding:** **CRITICAL SECURITY FLAW:** Extracts `ownerId` from unverified `x-user-id` header or hardcoded fallback.

---

## 7. Frontend Audit

### App Router Structure
- Well-organized feature separation under `apps/web/src/app/`:
  - `page.tsx`: Marketing landing page.
  - `(platform)/rooms/page.tsx`: Room discovery interface.
  - `(platform)/rooms/[roomId]/page.tsx`: Virtual karaoke room studio placeholder.
  - `(platform)/profile/page.tsx`: User studio profile placeholder.
- Semantic HTML elements (`header`, `main`, `footer`, `section`, `nav`, `aside`) are used properly.

### React Query & API Client
- **Finding:** `QueryClientProvider` is wrapped in [`apps/web/src/providers/query-provider.tsx`](file:///apps/web/src/providers/query-provider.tsx).
- However, there is **no HTTP client configured** (`fetch` wrapper, Axios, or `ky`).
- `NEXT_PUBLIC_API_URL` is completely unused.
- The rooms page (`/rooms`) and room detail page (`/rooms/[roomId]`) purely read from local in-memory data (`MOCK_ROOMS`).

### Zustand Store
- Store defined in [`apps/web/src/stores/use-app-store.ts`](file:///apps/web/src/stores/use-app-store.ts).
- Manages client UI states: `sidebarOpen`, `isMuted`, `volume`, `activeRoomId`.
- Clean implementation with appropriate hook consumption in the Room Detail component.

### Mock Data Boundaries
- Mock rooms are clearly isolated in [`apps/web/src/features/rooms/mock-rooms.ts`](file:///apps/web/src/features/rooms/mock-rooms.ts).
- The discovery page displays a prominent **Sprint 0 Demo Notice Banner** explicitly informing users that datasets are simulated for UI validation.

### Loading & Error States
- Standalone components [`LoadingState`](file:///apps/web/src/components/shared/loading-state.tsx) and [`EmptyState`](file:///apps/web/src/components/shared/empty-state.tsx) are implemented.
- Used on the `/rooms` page when search queries or category filters yield no results.

### Protected Route Strategy
- **Finding:** Currently **zero client-side protection** exists. No Next.js middleware (`middleware.ts`) or auth context guards `/profile` or `/rooms/[roomId]`.

### Component Reuse
- Strong component reuse across all views:
  - [`RoomCard`](file:///apps/web/src/components/shared/room-card.tsx) used in both Landing Page featured lounges and Room Discovery grid.
  - [`RoomStatusBadge`](file:///apps/web/src/components/shared/room-status-badge.tsx) used in cards and room headers.
  - [`UserAvatar`](file:///apps/web/src/components/shared/user-avatar.tsx) used in navbar, participant lists, and profile.
  - [`PageContainer`](file:///apps/web/src/components/layout/page-container.tsx) standardizes max-widths and gutters.

---

## 8. Architecture Risks

### 1. User Identity & Ownership Validation
Allowing room creation or updates without cryptographic verification of user identity will corrupt data integrity once real users join. Sprint 1 must mandate token-verified `req.user.id`.

### 2. Refresh Token Leakage & Indefinite Replay
Returning refresh tokens in response JSON forces clients to store them in `localStorage`, exposing tokens to XSS exfiltration. Without server-side revocation or rotation tracking, stolen tokens cannot be invalidated.

### 3. Room Capacity Under High Concurrency
When real-time audio rooms fill up, multiple users clicking "Join" simultaneously will cause race conditions if capacity checks are not atomic.

### 4. Ephemeral Presence vs Persistent State
Storing `currentParticipantsCount`, `currentSongTitle`, and `currentSingerName` in MongoDB documents will cause state drift during network disconnects or process restarts. Persistent database models should only record durable room configuration; transient presence belongs in Redis / LiveKit.

### 5. Index Redundancy & Cache Bloat
WiredTiger caches indexes in RAM. Having overlapping unique and compound indexes degrades write throughput and increases working set size.

### 6. Health Check Semantics for Kubernetes / Docker
Returning HTTP 200 on `/api/v1/health` when MongoDB is disconnected defeats container orchestrator readiness probes. Load balancers will continue sending traffic to unready API pods.

### 7. Realtime Integration Boundaries (Socket.io, Redis, LiveKit)
Sprint 2 will introduce WebRTC and WebSockets. If room identity and authorization boundaries are not cleanly standardized in HTTP REST during Sprint 1, WebSocket handshake authentication and LiveKit token generation will inherit those vulnerabilities.

---

## 9. Critical Issues That Must Be Fixed

| Issue ID | Severity | Category | Description | Blocks Sprint 1? |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | Security | Identity spoofing via unverified `x-user-id` header in `POST /api/v1/rooms` | **YES** |
| **SEC-02** | **CRITICAL** | Security | Complete absence of JWT authentication middleware on API routes | **YES** |
| **DB-02** | **HIGH** | Database | Non-atomic room capacity increment allowing race conditions on join | **YES** |
| **SEC-03** | **HIGH** | Security | Stateless refresh tokens without rotation detection or revocation | **NO** (Sprint 1 scope) |
| **SEC-04** | **HIGH** | Security | Default secret fallbacks in production environment configuration | **NO** (Pre-prod) |
| **DB-01** | **HIGH** | Database | Redundant single-field and compound indexes in `User` and `Room` | **NO** (Pre-scale) |
| **FE-01** | **MEDIUM** | Frontend | Frontend lacks HTTP client; React Query is mounted but unused | **YES** (Sprint 1 scope) |
| **OPS-01** | **MEDIUM** | Operations | Health check returns HTTP 200 when database is disconnected | **NO** (Sprint 1 scope) |

---

## 10. Recommended Sprint 1 Scope

Based on this audit, Sprint 1 should focus on **Core Platform & Secure Persistence**:

1. **Authentication & Authorization Middleware:**
   - Create `apps/api/src/middlewares/auth.middleware.ts` with `requireAuth` and `requireRole`.
   - Protect `POST /api/v1/rooms` and bind `ownerId` strictly to `req.user.id`.
2. **Refresh Token Security:**
   - Implement HTTP-only, secure cookies for refresh tokens to eliminate `localStorage` XSS risk.
   - Add `tokenVersion` to `UserModel` to support instant single-user session revocation.
3. **Frontend API Integration:**
   - Implement an API client (`apps/web/src/lib/api-client.ts`) with automatic token attachment and 401 refresh interception.
   - Replace `MOCK_ROOMS` on `/rooms` with live TanStack Query hooks (`useRooms`, `useCreateRoom`).
   - Implement the "Host Lounge" creation modal connected to `POST /api/v1/rooms`.
4. **Atomic Room Capacity Checks:**
   - Implement atomic MongoDB operations for room membership and participant joining.
5. **Database Index Cleanup:**
   - Remove redundant single-field and compound index declarations identified in DB-01.

---

## 11. Explicitly Deferred Improvements

The following improvements remain cleanly deferred to subsequent sprints:

| Capability | Deferred To | Rationale |
| :--- | :--- | :--- |
| **Socket.io Realtime Events** | **Sprint 2** | Requires stable HTTP room persistence first. |
| **Redis Cluster & Presence Cache**| **Sprint 2** | Horizontal scaling and distributed rate limiting follow single-node validation. |
| **LiveKit SFU Voice Engine** | **Sprint 2** | Low-latency audio transport requires authenticated room tokens. |
| **Web Audio API & Lyrics Engine** | **Sprint 3** | Audio synchronization and pitch detection require active audio rooms. |
| **React Three Fiber (R3F) Avatars**| **Sprint 4** | 3D visual environments require established room and avatar models. |
| **E2E Browser Automation** | **Sprint 5** | Playwright test suites will test integrated flows once UI communicates with backend. |

---

*Sprint 0.1 Architecture Gate Review concluded.*
