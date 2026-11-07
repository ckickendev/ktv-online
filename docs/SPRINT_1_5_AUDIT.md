# KTV Online — Sprint 1.5: Mandatory Architecture Audit
**Room Membership & Participation Experience**

---

## 1. Executive Summary

Sprint 1.5 delivers a production-grade, concurrency-safe **Room Membership & Participation Experience** for KTV Online.
This audit provides an exhaustive inspection of the actual source code across backend (`apps/api`), frontend (`apps/web`), shared contracts (`packages/contracts`), and database indexing patterns.

The objective is to enable authenticated users to:
1. Discover and preview virtual karaoke lounges.
2. Join an available public lounge atomically without overbooking.
3. Access their membership status and explore the current member roster.
4. Leave a lounge safely with guaranteed single-release capacity decrements.
5. Prevent hosts from abandoning active lounges into an ownerless state.
6. Enforce strict privacy so private room rosters cannot be queried by unauthorized visitors.
7. Return to already joined lounges idempotently.
8. Receive clear, actionable feedback when rooms are full, closed, or private.

---

## 2. Answers to Audit Questions

### 2.1 Section A — Membership Domain

| # | Question | Current State & Authoritative Analysis |
|---|---|---|
| **A.1** | **What fields currently exist in `RoomMembershipModel`?** | `roomId` (`ObjectId`, ref Room, required), `userId` (`ObjectId`, ref User, required), `role` (`'host' \| 'member'`, default `'member'`), `status` (`'active' \| 'left'`, default `'active'`), `joinedAt` (`Date`, default `Date.now`), `leftAt` (`Date`, default `null`), timestamps (`createdAt`, `updatedAt`). |
| **A.2** | **How is active membership represented?** | Represented by `status: 'active'`. When leaving, `status` transitions to `'left'` and `leftAt` is recorded. |
| **A.3** | **Is there a membership status enum?** | Yes, `RoomMembershipStatus` defined in `@ktv/contracts`: `'active' \| 'left'`. |
| **A.4** | **Does the model support waiting, approved, rejected, left, kicked, or banned states?** | **No.** Only `'active'` and `'left'` are defined in the schema. In accordance with architectural principles, we will not fabricate unsupported waiting/kicked/banned states without a real domain model. |
| **A.5** | **How is the unique active membership index implemented?** | Implemented as a compound partial unique index: `RoomMembershipSchema.index({ roomId: 1, userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })`. This guarantees a user can have at most one active membership in a given room, while permitting historical records with `status: 'left'`. |
| **A.6** | **Is membership history retained?** | Leaving sets `status: 'left'` and preserves the document. However, `joinRoom` uses `findOneAndUpdate` with `{ upsert: true }` which reactivates the previous record (`leftAt: null, joinedAt: new Date()`) rather than appending unbounded historical rows. |
| **A.7** | **Can one user join multiple rooms simultaneously?** | Yes. The partial unique index is scoped to `{ roomId: 1, userId: 1 }`, not `{ userId: 1 }`. There is currently no restriction preventing a user from participating in multiple lounges across tabs or sessions. |
| **A.8** | **What is the actual relationship between room ownership and membership?** | `RoomModel.ownerId` specifies the room creator. When a room is created in `roomService.create()`, the system immediately creates an active membership record with `role: 'host'` for `ownerId`. During `joinRoom()`, if `room.ownerId.toString() === userId`, the role is assigned `'host'`, otherwise `'member'`. |

---

### 2.2 Section B — Capacity Consistency

| # | Question | Current State & Authoritative Analysis |
|---|---|---|
| **B.1** | **How does the existing atomic reservation work?** | In `roomService.joinRoom()`, an atomic `RoomModel.findOneAndUpdate` executes with predicate `{ _id: roomObjectId, status: { $ne: 'closed' }, $expr: { $lt: ['$currentParticipantsCount', '$capacity'] } }` and update `{ $inc: { currentParticipantsCount: 1 } }`. |
| **B.2** | **How does it prevent concurrent overbooking?** | MongoDB executes single-document updates atomically. When `currentParticipantsCount` reaches `capacity`, any concurrent join's `$expr` predicate fails immediately and returns `null`. This prevents read-then-write race conditions. |
| **B.3** | **How is the membership record created after reservation?** | After the room count is incremented, `RoomMembershipModel.findOneAndUpdate({ roomId, userId }, { $set: { role, status: 'active', joinedAt: new Date(), leftAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })` creates or reactivates the record. |
| **B.4** | **What happens if membership creation fails?** | A `try/catch` block catches database/validation errors during membership persistence and executes a compensation rollback: `await RoomModel.findByIdAndUpdate(roomObjectId, { $inc: { currentParticipantsCount: -1 } })`. |
| **B.5** | **What happens if the process crashes between reservation and membership creation?** | If the Node.js process crashes (e.g. fatal hardware failure, SIGKILL) in the microsecond between atomic reservation and membership persistence, a count drift could occur (incremented room count without an active membership). A reconciliation helper can synchronize `currentParticipantsCount` to `countDocuments({ roomId, status: 'active' })` when anomalies are detected. |
| **B.6** | **Does leaving a room release capacity exactly once?** | Currently, `leaveRoom()` queries `findOne({ roomId, userId, status: 'active' })`, mutates `status = 'left'`, saves, and then decrements capacity. **Concurrency Risk:** If two leave requests execute concurrently before either saves, both could find `status: 'active'` and decrement capacity twice! **Remediation:** We must execute an atomic `findOneAndUpdate({ roomId, userId, status: 'active' }, { $set: { status: 'left', leftAt: new Date() } })`. Only if this atomic update matches a document do we decrement room capacity! |
| **B.7** | **Can repeated leave requests decrement the participant count multiple times?** | With atomic status transition, the first leave updates the document; subsequent requests match 0 active records, return `NOT_A_MEMBER`, and do not decrement `currentParticipantsCount`. |
| **B.8** | **Can a stale membership cause permanent capacity loss?** | Because realtime WebSockets are not in scope for Sprint 1.5, client disconnections without clicking "Leave" remain active. In addition, when a host calls `closeRoom`, active memberships previously remained in `status: 'active'`. **Remediation:** In `closeRoom`, all active memberships for that room should be bulk-updated to `status: 'left', leftAt: new Date()`, releasing the room completely. |

---

### 2.3 Section C — Authorization & Security

1. **Mandatory Authentication:** `POST /api/v1/rooms/:id/join` and `POST /api/v1/rooms/:id/leave` are strictly protected with `requireAuth`.
2. **Verified Token Claims:** User identity is extracted solely from `req.user.id` (cryptographically validated via JWT signature). Client-supplied user IDs are completely ignored.
3. **No Impersonation:** Clients cannot submit another user's ID as the member.
4. **Private Room Security Vulnerability in Member Inspection:**
   - **Current State:** `GET /api/v1/rooms/:id/members` is currently unauthenticated and lacks visibility checks. Anyone can inspect members of a private lounge!
   - **Remediation:** If a room has `visibility: 'private'`, `getMembers` must require authentication and verify that `req.user.id` is either the room owner or an active member of that private room. Unauthorized requests must return `403 Forbidden` (or `401 Unauthorized`).
5. **Suspended Account Enforcement:** `requireAuth` queries database user status and rejects any user where `status !== 'active'` with `403 Forbidden`.
6. **Closed Room Protection:** `joinRoom` checks `status: { $ne: 'closed' }` atomically. Closed rooms reject joins with `400 Bad Request`.

---

### 2.4 Section D — Existing Room Semantics & Host Behavior

1. **Host Departure Policy:**
   - In KTV Online, the host is `RoomModel.ownerId`. There is no ownership transfer domain model.
   - Allowing a host to leave an active lounge would leave the room orphaned without a host.
   - **Policy:** A room host cannot leave an active lounge. If a host attempts to leave, the backend responds with `400 Bad Request` (`HOST_CANNOT_LEAVE`: "Room hosts cannot leave their active lounge. Please close the lounge to conclude the session."). To leave, the host must close the lounge.
2. **Private Room Join Access:**
   - Private rooms are excluded from public discovery.
   - Without invitation codes or password schemas in the database (which are deferred), non-owners attempting to join a private room directly without authorization must be rejected with `403 Forbidden` (`PRIVATE_ROOM_ACCESS_DENIED`: "Private lounges can only be accessed via direct invitation").
3. **Dedicated User Membership Endpoint:**
   - Currently, the frontend has no direct way to know if the authenticated user is already an active member of a room upon loading `/rooms/[roomId]`.
   - **Solution:** Add `GET /api/v1/rooms/:id/membership` (with `requireAuth`). Returns `{ isMember: boolean, role?: 'host' | 'member', membership?: RoomMembershipDto }`.

---

### 2.5 Section E — Frontend Architecture Audit

1. **Room Detail Page (`/rooms/[roomId]/page.tsx`):**
   - Currently contains mock participants (`MiaSingz`, `Alex Singer`, etc.) and mock queue/chat tabs.
   - Lacks real "Join Lounge" and "Leave Lounge" action buttons wired to API mutations.
   - Does not distinguish whether the current user is an active member, an unauthenticated visitor, or the host.
2. **TanStack Query Hooks:**
   - `useRoom`, `useRoomMembers`, `useJoinRoom`, `useLeaveRoom` exist in `apps/web/src/hooks/queries/use-room.ts`.
   - Need `useMyRoomMembership(roomId)` to fetch the user's active membership status.
3. **Data Serialization Gap in Member List:**
   - In `apps/api/src/modules/rooms/membership.model.ts`: `toJSON` transforms `ret.userId` into `ret.userId.toString()`, losing the populated `username` and `avatar`!
   - Must safely serialize `ret.user = { id, username, avatar }` in `RoomMembershipModel.toJSON` so the member list can display real usernames and avatars.

---

## 3. Scope Decisions & Proposed Implementation Plan

### Step 1: Shared Contracts (`packages/contracts`)
- Enhance `RoomMembershipDtoSchema` to include optional `user?: HostDtoSchema` (`id`, `username`, `avatar`).
- Define `RoomMyMembershipDtoSchema`: `{ isMember: boolean, role: RoomMembershipRole.optional(), membership: RoomMembershipDto.nullable().optional() }`.

### Step 2: Backend Security & Domain Refinements (`apps/api`)
- In `membership.model.ts`:
  - Enhance `toJSON` to serialize `user: { id, username, avatar }` when `userId` is populated.
- In `room.service.ts`:
  - **Host Leave Guard:** Reject host leave attempts on active rooms with `HOST_CANNOT_LEAVE`.
  - **Private Room Join Guard:** Reject non-owner join attempts on private rooms with `PRIVATE_ROOM`.
  - **Atomic Leave:** Transition status atomically with `findOneAndUpdate({ roomId, userId, status: 'active' }, { $set: { status: 'left', leftAt: new Date() } })`.
  - **Closed Room Cleanup:** When `closeRoom()` is executed, bulk-update all active memberships to `status: 'left', leftAt: new Date()`.
  - **Add `getMyMembership(roomId, userId)`:** Returns active membership for user in room.
  - **Private Room Member Roster Protection:** In `getActiveMembers(roomId, requestingUserId?)`, verify private room authorization.
- In `room.controller.ts` & `room.routes.ts`:
  - Wire `GET /:id/membership` (with `requireAuth`).
  - Wire private room protection in `getMembers`.

### Step 3: Frontend Experience (`apps/web`)
- Create reusable `RoomMemberList` component:
  - Displays actual members from `useRoomMembers(roomId)`.
  - Displays host badge with Crown icon.
  - Loading skeleton, empty state, and refresh action button.
- Upgrade `/rooms/[roomId]/page.tsx`:
  - Header displays room title, category, capacity meter, availability badge.
  - When non-member: displays prominent "Join Lounge" hero button, capacity warning if full/closed, and authentication redirect with return URL.
  - When member: displays active stage status, live member roster, and "Leave Lounge" CTA with confirmation modal.
  - When host: displays "Host Controls / Manage Lounge" and prevents leaving without closing.
- In `/my-rooms/page.tsx`:
  - Add "Lounges I've Joined" tab/section distinguishing owned rooms from participated rooms.

### Step 4: Comprehensive Testing
- Backend tests (`apps/api/src/__tests__/room-participation.test.ts`):
  - Join available room.
  - Unauthenticated join rejection (401).
  - Nonexistent room join (404).
  - Closed room join rejection (400).
  - Full room join rejection (409).
  - Duplicate join idempotency (no double counting).
  - Concurrent joins respect capacity under race conditions.
  - User leaves own membership.
  - User cannot leave if not a member.
  - Repeated/concurrent leave decrements count exactly once.
  - Host cannot leave active room.
  - Private room join rejection for non-owners.
  - Private room member list hidden from unauthorized users.
  - Suspended user rejection (403).
  - Room closure transitions active members.
- Frontend tests (`apps/web/src/__tests__/room-participation.test.tsx`):
  - Join CTA visibility and action.
  - Full room disabled CTA.
  - Closed room state.
  - Leave lounge action with confirmation.
  - Host cannot leave active room banner.
  - Member list rendering with avatars and host badge.
  - Unauthenticated redirect to `/login?redirect=...`.
  - Query invalidation and refresh behavior.

---

## 4. Audit Conclusion

The existing baseline established in Sprints 0.2, 1.3, and 1.4 provides the core models and atomic increment mechanisms. Remediating the atomic leave transition, protecting private room rosters, preventing host abandonment, serializing member profile metadata, and building a responsive lobby UI will deliver a secure, robust room participation experience without introducing premature realtime streaming complexity.
