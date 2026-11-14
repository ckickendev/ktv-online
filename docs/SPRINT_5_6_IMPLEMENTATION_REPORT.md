# Sprint 5.6 Implementation Report

**Sprint:** 5.6  
**Milestone:** Social Presence & Friendship Experience  
**Date:** November 2026  
**Final Status:** Code Complete — Statically Verified  

---

## 1. Overview of Changes

Sprint 5.6 established a complete social presence and friendship system across the KTVOnline monorepo, covering data contracts, MongoDB models, business services, Socket.IO realtime delivery, and responsive frontend experiences.

---

## 2. File Modification & Creation Inventory

### 2.1. Shared Contracts (`packages/contracts`)
- **`packages/contracts/src/preferences.ts` (Modified):** Added `presenceVisibility: 'everyone' | 'friends' | 'none'` to `UserPreferencesDtoSchema`, `UpdateUserPreferencesSchema`, and `DEFAULT_USER_PREFERENCES`.
- **`packages/contracts/src/realtime.ts` (Modified):** Added `FRIEND_PRESENCE_REQUEST` to client events; added `FRIEND_PRESENCE_UPDATED`, `FRIEND_REQUEST_RECEIVED`, `FRIEND_REQUEST_ACCEPTED`, `FRIEND_INVITATION_RECEIVED` to server events.
- **`packages/contracts/src/friendship.ts` (Created):** Declared schemas and DTO types for `FriendshipStatus`, `FriendPresenceStatus`, `FriendPresenceDto`, `FriendUserDto`, `FriendshipDto`, `FriendRequestDto`, `SendFriendRequestSchema`, `FriendQuerySchema`, `UserSearchQuerySchema`, `UserSearchResultDto`, `SendLoungeInviteToFriendSchema`, and realtime payloads.
- **`packages/contracts/src/index.ts` (Modified):** Re-exported all friendship contracts.

### 2.2. Backend API (`apps/api`)
- **`apps/api/src/modules/users/user.model.ts` (Modified):** Added `preferences.presenceVisibility` enum with default `'friends'`.
- **`apps/api/src/modules/users/user.service.ts` (Modified):** Updated `getUserPreferences` and `updatePreferences` to read/write `presenceVisibility`.
- **`apps/api/src/modules/friends/friendship.model.ts` (Created):** MongoDB model for friendships with `pairKey` canonical ordering, compound unique indexing, and status transitions.
- **`apps/api/src/modules/friends/friendship.service.ts` (Created):** Implemented request sending, mutual auto-acceptance, accept, decline, cancel, remove, search, and direct room invitation dispatch.
- **`apps/api/src/modules/friends/friendship.controller.ts` (Created):** REST endpoints validating schemas and mapping business errors.
- **`apps/api/src/modules/friends/friendship.routes.ts` (Created):** Express router mounted on `/api/v1/friends`.
- **`apps/api/src/realtime/presence.manager.ts` (Modified):** Added `getUserRoom` helper to quickly locate a user's active room.
- **`apps/api/src/realtime/global-presence.manager.ts` (Created):** Tracks connected user sockets globally and calculates live presence (`offline`, `online`, `in_lounge`, `singing`) with privacy masking.
- **`apps/api/src/realtime/friend.events.ts` (Created):** Realtime event registration and emission helpers (`emitFriendPresenceUpdate`, `emitFriendRequestReceived`, `emitFriendRequestAccepted`, `emitFriendInvitationReceived`).
- **`apps/api/src/realtime/socket.server.ts` (Modified):** Connected sockets join `user:${userId}` channels, register into `globalPresenceManager`, and attach friend event listeners.
- **`apps/api/src/routes/index.ts` (Modified):** Mounted `/friends` router.

### 2.3. Frontend Application (`apps/web`)
- **`apps/web/src/hooks/queries/query-keys.ts` (Modified):** Added query keys for `friends.list`, `friends.incoming`, `friends.outgoing`, `friends.search`.
- **`apps/web/src/features/friends/api/friends-api.ts` (Created):** HTTP client functions for all friendship and presence endpoints.
- **`apps/web/src/features/friends/hooks/use-friends.ts` (Created):** React Query hooks and socket subscription listeners for real-time presence cache updates.
- **`apps/web/src/features/friends/components/presence-status-badge.tsx` (Created):** Visual indicator supporting `offline`, `online`, `in_lounge`, and `singing` states.
- **`apps/web/src/features/friends/components/friend-card.tsx` (Created):** Friend item card with presence badge, Join Lounge CTA, and unfriend action.
- **`apps/web/src/features/friends/components/friend-requests-list.tsx` (Created):** Sub-tabs for incoming and outgoing friend requests with Accept/Decline/Cancel actions.
- **`apps/web/src/features/friends/components/user-search-tab.tsx` (Created):** Debounced user search with relationship indicators.
- **`apps/web/src/app/(platform)/friends/page.tsx` (Created):** Dedicated `/friends` hub page with stats pill, tabs, and empty state illustrations.
- **`apps/web/src/components/layout/app-header.tsx` (Modified):** Added "Friends" navigation entry in desktop navbar and mobile drawer.
- **`apps/web/src/components/rooms/invite-friends-dialog.tsx` (Modified):** Added "Direct Invite" mode enabling 1-click room invites to online friends.

---

## 3. Static Verification Results

All packages passed static verification with zero errors:

| Check Command | Package / Scope | Status | Notes |
|---|---|---|---|
| `pnpm --filter @ktv/contracts typecheck` | `@ktv/contracts` | **PASS (Code 0)** | Zero TypeScript errors. |
| `pnpm --filter @ktv/contracts build` | `@ktv/contracts` | **PASS (Code 0)** | ESM & CJS dist generated. |
| `pnpm --filter api typecheck` | `apps/api` | **PASS (Code 0)** | Zero TypeScript errors. |
| `pnpm --filter api lint` | `apps/api` | **PASS (Code 0)** | ESLint clean. |
| `pnpm --filter web typecheck` | `apps/web` | **PASS (Code 0)** | Zero TypeScript errors. |
| `pnpm --filter web lint` | `apps/web` | **PASS (Code 0)** | ESLint clean. |
| `pnpm typecheck` | Workspace (Root) | **PASS (Code 0)** | Clean across all 3 packages. |
| `pnpm lint` | Workspace (Root) | **PASS (Code 0)** | Clean across all 3 packages. |

---

## 4. Adherence to Strict Development Policy

1. **Zero Test Runner Execution:** `pnpm test`, `jest`, `vitest`, `playwright`, `cypress` were **not** executed.
2. **Zero Test File Modification:** No test files were created or edited.
3. **Zero Production Builds:** `pnpm build` was **not** run.
4. **Database Constraint:** MongoDB database name remains strictly `test`.
5. **No External Infrastructure:** Redis was **not** added. Single-node in-memory presence was documented under HIST-03.
