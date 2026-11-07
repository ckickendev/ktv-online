# KTV Online — Sprint 1.5 Implementation Report
## Room Membership & Participation Experience

**Date:** 2026-11-07  
**Branch:** `main`  
**Base Commit:** `a40c31ca300d742fe2674181ce770911b4615de9`  
**Verdict:** **READY**

---

## 1. Executive Summary

Sprint 1.5 successfully implements the **Room Membership & Participation Experience** for KTV Online, closing the participation gap between room discovery (Sprint 1.4) and upcoming realtime stages (Sprint 2/3).

Users can now seamlessly discover virtual karaoke lounges, view live lobby details, join available rooms with atomic concurrency guarantees, inspect the server-confirmed member roster, and leave lounges with exact-once capacity release. Host ownership privileges and room security are preserved under concurrent operations, ensuring that room counts never drift or exceed capacity.

Strictly adhering to sprint constraints, no realtime protocols (WebSocket, Socket.io, LiveKit, WebRTC) were introduced. All participant lists and counts are clearly documented and rendered as server snapshots with explicit refresh capabilities.

---

## 2. Implemented Backend Endpoints

All endpoints adhere to REST conventions, strict JWT authentication, role verification, and standardized JSON envelopes (`{ success, message, data, ... }`).

| Method | Endpoint | Auth | Purpose & Domain Behavior |
|---|---|---|---|
| `POST` | `/api/v1/rooms/:id/join` | Required (`requireAuth`) | Joins room. Idempotent: existing active member returns 200 with existing membership. Atomically reserves capacity via conditional `$expr`. Rejects closed (400), full (400), suspended users (403), and private rooms without access (403). Uses compensation rollback on membership creation error. |
| `POST` | `/api/v1/rooms/:id/leave` | Required (`requireAuth`) | Leaves room. Atomically updates active membership to `'left'` and decrements `currentParticipantsCount` exactly once. Rejects non-members (400 `NOT_A_MEMBER`). Enforces host departure policy (400 `HOST_CANNOT_LEAVE`). |
| `GET` | `/api/v1/rooms/:id/members` | Optional (`optionalAuth`) | Returns safe member roster populated with `{ id, username, avatar }`. Public rooms viewable by all. Private rooms require authentication and are restricted to room host and active members (401/403). Internal user secrets and hashes are never exposed. |
| `GET` | `/api/v1/rooms/:id/membership` | Required (`requireAuth`) | Returns current authenticated user's active membership status (`{ isMember: boolean, role?: string, membership?: RoomMembershipDto }`). |
| `GET` | `/api/v1/rooms/joined-rooms` | Required (`requireAuth`) | Returns paginated list of active lounges the current user has joined as a regular member (`role: 'member'`), with populated host data. |

---

## 3. Frontend Components & Pages

| Component / Page | Location | Description |
|---|---|---|
| `RoomMemberList` | `apps/web/src/components/shared/room-member-list.tsx` | Reusable member roster component displaying active members with avatars, usernames, host Crown badges, joined timestamps, and `(You)` indicators. Features loading skeletons, empty state, error handling with retry, and a manual refresh trigger. |
| `LeaveRoomDialog` | `apps/web/src/components/rooms/leave-room-dialog.tsx` | Accessible modal dialog for leave confirmation (`role="dialog"`, `aria-modal="true"`), warning users of stage departure and slot release. |
| `RoomDetailPage` | `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` | Upgraded lounge lobby: displays room metadata, category, capacity meter, availability badges, host controls ("Settings"), member departure CTA ("Leave Lounge"), unauthenticated login redirect (`/login?redirect=...`), and disabled states for full/closed lounges. |
| `MyRoomsPage` | `apps/web/src/app/(platform)/my-rooms/page.tsx` | Enhanced dashboard with dedicated tab switcher distinguishing **Lounges I Host** (owned rooms, stats grid, management controls) from **Lounges I've Joined** (active participation stage entries). |

---

## 4. Membership Lifecycle Decisions

1. **State Machine:**
   - Active states: `'active'`
   - Terminal states: `'left'`
   - Role states: `'host'`, `'member'`
2. **Duplicate Joins (Idempotency):**
   - Repeated join requests by an already active member return `200 OK` with the existing membership record. The room's participant count is **not** incremented again.
3. **Host Departure Policy:**
   - A lounge host cannot leave an active room (`HOST_CANNOT_LEAVE`, HTTP 400). In the absence of an explicit ownership transfer model, the host must close the lounge to conclude the session.
4. **Room Closure Cascade:**
   - When a room is closed via `closeRoom`, all currently active memberships are automatically transitioned to `'left'`, preventing stale active states.

---

## 5. Concurrency & Capacity Consistency Strategy

1. **Atomic Capacity Reservation:**
   Capacity is guarded at the database level using a conditional query:
   ```ts
   const room = await RoomModel.findOneAndUpdate(
     {
       _id: roomObjectId,
       status: { $ne: 'closed' },
       $expr: { $lt: ['$currentParticipantsCount', '$capacity'] },
     },
     { $inc: { currentParticipantsCount: 1 } },
     { new: true }
   );
   ```
   No read-then-write race conditions are possible. Even if 100 concurrent requests arrive for 1 available slot, MongoDB atomic document updates guarantee exactly 1 succeeds.

2. **Compensation Rollback:**
   If membership creation fails after capacity increment, a compensation update immediately decrements `currentParticipantsCount`:
   ```ts
   await RoomModel.updateOne(
     { _id: roomObjectId },
     { $inc: { currentParticipantsCount: -1 } }
   );
   ```

3. **Atomic Departure (Exact-Once Decrement):**
   Leaving a room uses an atomic find-and-update targeting status `'active'`:
   ```ts
   const membership = await RoomMembershipModel.findOneAndUpdate(
     { roomId: roomObjectId, userId: userObjectId, status: 'active' },
     { status: 'left', leftAt: new Date() },
     { new: true }
   );
   ```
   Capacity is only decremented if the atomic transition succeeded. Concurrent or repeated leave calls match zero documents and return without double-decrementing.

---

## 6. Authorization & Privacy Controls

1. **JWT Verification:**
   All mutations and user-scoped queries derive user identity exclusively from cryptographically verified tokens via `req.user`. Client-supplied user IDs in query or body parameters are ignored.
2. **Suspended User Rejection:**
   Suspended and inactive users are blocked at the middleware layer and rejected from joining lounges.
3. **Private Room Protection:**
   - Private room joining requires room ownership or authorized access.
   - Private room member rosters (`GET /api/v1/rooms/:id/members`) are protected via `optionalAuth`: guests receive `401 Unauthorized`, and unauthorized non-members receive `403 Forbidden`. No private member roster or identity leaks to public visitors.
4. **Frontend Cache Isolation:**
   `getQueryClient().clear()` is executed on logout and account switching in `useAuthStore`, guaranteeing no cached private lounge memberships or member lists persist across sessions.

---

## 7. Database & Index Changes

- **Collection:** `room_memberships`
- **Reused Index:** Partial unique compound index on `{ roomId: 1, userId: 1 }` where `{ status: 'active' }`.
- **Schema Modifications:** None required. Mongoose `toJSON` transform updated to safely serialize populated `user: { id, username, avatar }` while ensuring `userId` remains a clean string ID.
- **Production Impact:** Zero database migrations required. Existing database indexes preserved.

---

## 8. Test Cases & Exact Results

### Backend Integration Tests (`@ktv/api`)
Suite: `apps/api/src/__tests__/room-participation.test.ts` (22 tests) + 6 existing suites:
- Authenticated user can join public room (200).
- Unauthenticated visitor cannot join (401).
- Cannot spoof another user's identity.
- Joining nonexistent room returns 404.
- Joining closed room returns 400 `ROOM_CLOSED`.
- Joining full room returns 400 `ROOM_FULL`.
- Joining private room as outsider returns 403 `FORBIDDEN_PRIVATE_ROOM`.
- Duplicate join is idempotent and does not increment count twice (200).
- Concurrent join operations preserve room capacity under high contention.
- Membership creation failure executes compensation rollback.
- Active member can leave room (200) and releases spot.
- Non-member leaving returns 400 `NOT_A_MEMBER`.
- Repeated leaves do not double-decrement room count.
- Host cannot leave active room (400 `HOST_CANNOT_LEAVE`).
- Public room member list returns safe populated profiles (200).
- Private room member list rejects unauthenticated requests (401).
- Private room member list rejects unauthorized non-members (403).
- Private room host can view private room members (200).
- GET membership returns active status and details.
- GET membership for non-member returns `{ isMember: false }`.
- GET joined-rooms returns paginated lounges.
- Room closure cascades active memberships to `'left'`.

**Backend Total:** **7 suites, 75 tests passed (100% passing)**

### Frontend Tests (`@ktv/web`)
Suite: `apps/web/src/__tests__/room-participation.test.tsx` (13 tests) + 9 existing suites:
- Member list renders avatars, usernames, host indicator, and `(You)` badge.
- Member list empty state rendering.
- Member list error handling with retry trigger.
- Member list manual refresh button triggers query refetch.
- Unauthenticated user clicking join is redirected to `/login?redirect=...`.
- Authenticated non-member sees Join Lounge CTA and triggers join mutation.
- Full room shows capacity notice and disables join action.
- Closed room shows closure notice and disables join action.
- Active member sees Leave Lounge button and confirmation modal.
- Host member sees Host indicator and Settings link without leave action.
- Join error displays clear user-facing alert banner.
- MyRoomsPage tab switcher toggles between Hosted Lounges and Joined Lounges.
- Query cache is cleared on logout to prevent private room data leakage.

**Frontend Total:** **10 suites, 84 tests passed (100% passing)**

**Overall Monorepo Test Summary:** **17 test suites, 159 tests passed (0 failures)**

---

## 9. Quality Gate Results

| Check | Command | Result | Notes |
|---|---|---|---|
| Tests | `pnpm test` | **PASSED** | 159/159 tests passing in 4.3s |
| TypeScript | `pnpm typecheck` | **PASSED** | 0 errors across contracts, api, web |
| ESLint | `pnpm lint` | **PASSED** | 0 errors, 0 warnings across all packages |
| Production Build | `pnpm build` | **PASSED** | Contracts dts bundled, api compiled, Next.js 10 routes compiled & optimized |

---

## 10. Known Limitations

1. **Server Snapshot Model:** Member lists and participant counts reflect server snapshot data. Updates require manual refresh or page navigation; automatic real-time push updates are not present in Sprint 1.5.
2. **Crash-Consistency Window:** If the Node.js process crashes exactly between atomic capacity reservation and membership creation, compensation rollback will not execute until future reconciliation jobs are introduced.

---

## 11. Deferred Work

The following items were explicitly excluded from Sprint 1.5 and are deferred to upcoming sprints:
- **Sprint 2:** Realtime Presence, Socket.io / WebSocket connection lifecycle, LiveKit audio channels, and live microphone states.
- **Sprint 3:** Synchronized karaoke player, lyrics engine, song request queue, and song search modal.
- **Future:** Background reconciliation cron for capacity recovery, member moderation (kick/ban/mute), and lounge ownership transfer.

---

## 12. Conclusion & Verdict

Sprint 1.5 fulfills all requirements:
- Atomic capacity reservation and exact-once departure prevent overbooking and count drift.
- Strict authorization and private room access controls prevent unauthorized member inspections.
- Frontend delivers a lounge lobby experience with clear status feedback, accessible confirmation dialogs, and participation tracking.
- All quality gates (`test`, `typecheck`, `lint`, `build`) passed cleanly.

**Final Verdict:** **READY**
