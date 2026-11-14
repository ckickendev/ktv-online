# Sprint 5.6 Source Audit: Social Presence & Friendship Experience

**Sprint:** 5.6  
**Milestone:** Social Presence & Friendship Experience  
**Repository Baseline Commit:** `e5da2f68aea8c0d49cdf379f46d2c41335df5ee9`  
**Target Branch:** `main`  
**Database Target:** `test` (MongoDB)  
**Monorepo Structure:** `pnpm` workspace (`apps/api`, `apps/web`, `packages/contracts`)  
**Audit Date:** November 2026  
**Auditor:** Antigravity Agentic Engineer  

---

## 1. Executive Summary

KTVOnline has successfully delivered rich collaborative features including real-time karaoke queues, synchronized audio/lyrics playback, singer spotlight, audience stage reactions, virtual gifts, session memories, and token-based room invitations (Sprint 5.0 through 5.5). However, until Sprint 5.6, KTVOnline functioned as a room-isolated platform. Users could only interact once they entered the same room. There was no mechanism to:
1. Form and maintain bidirectional friendships.
2. Discover other users or search by username/display name.
3. Observe friends' real-time platform presence (offline, online, in a lounge, actively singing).
4. Invite specific friends directly into a private or public karaoke lounge.
5. Control presence visibility according to granular privacy preferences.

This source audit reviews existing systems, evaluates architectural gaps, and specifies the required contracts, models, services, and UI flows for Sprint 5.6.

---

## 2. Baseline & Monorepo Verification

- **Git Branch:** `main`
- **Git Commit HEAD:** `e5da2f68aea8c0d49cdf379f46d2c41335df5ee9`
- **Working Tree:** Clean (all prior sprints 4.0–5.5 committed cleanly).
- **Database Configuration:** `test` (MongoDB via `env.MONGODB_URI`). No database renaming, dropping, or external migrations permitted.
- **Strict Development Policy:**
  - Zero test files created or modified.
  - Zero test runners invoked (`jest`, `vitest`, `playwright`, `cypress`, `pnpm test`).
  - Zero production builds invoked (`pnpm build`).
  - Permitted static verification: `pnpm typecheck` and `pnpm lint`.
  - Zero Redis or new external infrastructure.
  - Runtime verification status: Unverified in staging/production (`CODE COMPLETE — NOT RUNTIME VERIFIED`).

---

## 3. Audit of Existing Modules

### 3.1. User Profile & Preferences
- **Files Inspected:**
  - `packages/contracts/src/preferences.ts`
  - `packages/contracts/src/user.ts`
  - `apps/api/src/modules/users/user.model.ts`
  - `apps/api/src/modules/users/user.service.ts`
- **Findings:**
  - `UserPreferencesDtoSchema` defines preferences for genre, language, lyrics font size, visual intensity, reaction toggles, onboarding completion, and privacy flags (`isHistoryPublic`, `isSessionsPublic`).
  - **Gap:** Missing `presenceVisibility` setting. Users need the ability to control who can see their online and karaoke lounge activity (`everyone`, `friends`, `none`).

### 3.2. Realtime Presence & Socket.IO
- **Files Inspected:**
  - `apps/api/src/realtime/presence.manager.ts` (`RoomPresenceManager`)
  - `apps/api/src/realtime/socket.server.ts`
  - `apps/api/src/realtime/socket.auth.ts`
- **Findings:**
  - `RoomPresenceManager` manages presence exclusively at the room level: `roomUsers: Map<roomId, Map<userId, Set<socketId>>>`.
  - Sockets are authenticated at handshake (`socket.data.user = { id, username, role, displayName, avatar }`).
  - **Gap 1:** There is no global socket tracker to know whether an authenticated user is currently online on the platform outside of active rooms.
  - **Gap 2:** Sockets do not join a per-user room channel (e.g. `user:<userId>`), making targeted direct notifications (like friend requests or presence status pings) difficult without scanning all connections.
  - **Gap 3:** No status hierarchy exists to identify whether an online user is currently idle/browsing, in a lounge, or actively singing.

### 3.3. Room Invitations (Sprint 5.0 Baseline)
- **Files Inspected:**
  - `apps/api/src/modules/rooms/invitation.model.ts`
  - `apps/api/src/modules/rooms/invitation.service.ts`
  - `apps/web/src/components/rooms/invite-friends-dialog.tsx`
- **Findings:**
  - Sprint 5.0 introduced token-based invitations (`inviteCode` with expiry and max uses).
  - The UI currently provides a shareable URL and token generation.
  - **Gap:** The host must copy the link and manually send it via third-party messaging apps because there is no built-in friend list inside `InviteFriendsDialog` to dispatch invitations directly to online friends.

### 3.4. Technical Debt Preservation (HIST-01 through HIST-07)
All previously identified technical debt items remain untouched and documented:
- `HIST-01`: Client-side anchor drift compensation (non-blocking).
- `HIST-02`: Room host migration under rapid reconnections (handled via grace timers).
- `HIST-03`: Single-node in-memory presence and queue management (deliberate constraint; Redis not introduced).
- `HIST-04`: MongoDB `test` database naming convention retained for consistency across test suites.
- `HIST-05`: Outbox collection schema migration unexecuted in runtime (documented in Sprint 4.3).
- `HIST-06`: Untimed lyrics fallback relies on manual scrolling when word timestamps are absent.
- `HIST-07`: LiveKit token generation assumes single-region deployment.

---

## 4. Key Remediation & Enhancement Plan

1. **Contracts Package (`@ktv/contracts`):**
   - Add `presenceVisibility` (`'everyone' | 'friends' | 'none'`) to `UserPreferencesDto`.
   - Create `packages/contracts/src/friendship.ts` declaring types for `FriendshipStatus`, `FriendPresenceStatus`, `FriendDto`, `FriendRequestDto`, `FriendQuery`, `UserSearchQuery`.
   - Add friend socket events to `SOCKET_EVENTS` in `packages/contracts/src/realtime.ts`.

2. **Backend API (`apps/api`):**
   - Create `apps/api/src/modules/friends/friendship.model.ts` with compound indexes on `requester` and `addressee`.
   - Create `apps/api/src/modules/friends/friendship.service.ts` with atomic state transitions (`send`, `accept`, `decline`, `cancel`, `remove`, `block`, `search`).
   - Create `GlobalPresenceManager` tracking connected user sockets and computing dynamic presence status (`offline`, `online`, `in_lounge`, `singing`).
   - Enforce strict privacy checks: private lounge details (room ID, room name) must never leak to non-participants.
   - Mount `/api/v1/friends` router.

3. **Frontend Experience (`apps/web`):**
   - Create `/friends` dedicated hub page with tabs: Friends (with live presence badges), Incoming Requests, Outgoing Requests, Find People.
   - Add "Friends" navigation entry in `AppHeader` and mobile drawer.
   - Extend `InviteFriendsDialog` with a "Send to Friend" action that leverages active invitation tokens.

4. **Static Verification:**
   - Execute `pnpm typecheck` and `pnpm lint` across all packages.
