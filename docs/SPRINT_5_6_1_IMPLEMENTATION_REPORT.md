# Sprint 5.6.1: Implementation Report

## 1. Overview

- **Sprint Mission:** Social Integrity & Invitation Security Remediation
- **Baseline Commit:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`
- **Target Branch:** `main`
- **Database:** `test` (MongoDB database name preserved)
- **Development Policy:** Strict Code-Only (Zero test files created or modified, zero test runners executed, zero production builds, zero database mutations or migrations).

---

## 2. Summary of Source Code Modifications

### 2.1 Backend (`apps/api`)

1. **`src/modules/rooms/invitation.types.ts`**:
   - Added `recipientId?: Types.ObjectId | null` to `IRoomInvitationDocument` interface.

2. **`src/modules/rooms/invitation.model.ts`**:
   - Added `recipientId` field to Mongoose schema: `type: Schema.Types.ObjectId, ref: 'User', default: null`.
   - Added compound index `{ roomId: 1, recipientId: 1, revokedAt: 1 }` for fast lookups.

3. **`src/modules/rooms/invitation.service.ts`**:
   - Updated `createInvitation`: preserves backward compatibility for general bearer links (`recipientId: null`) and only revokes prior general links without revoking direct friend invitations.
   - Added `createFriendInvitation(roomId, createdByUserId, recipientUserId, durationHours)`: issues recipient-bound invitation tokens (`recipientId: friendObjectId`), isolating each friend's link and preventing mutual revocation.
   - Updated `validateInvitation(rawToken, roomId, requestingUserId?)`: validates expiration, revocation, room matching, and enforces recipient identity (`invitation.recipientId.toString() === requestingUserId`) if `recipientId` is set.
   - Updated `previewInvitation(rawToken, requestingUserId?)`: rejects preview if token is recipient-bound and requesting user is not the designated recipient.

4. **`src/modules/rooms/room.service.ts`**:
   - Added `'INVITATION_RECIPIENT_MISMATCH'` to `JoinRoomResult` error union.
   - In `joinRoom`: passed `userId` into `invitationService.validateInvitation(inviteToken, roomId, userId)` and mapped error accordingly.

5. **`src/modules/friends/friendship.service.ts`**:
   - `sendLoungeInviteToFriend` (`DEF-INV-01`, `DEF-INV-02`):
     - Added authoritative host check: `room.visibility === 'private' && room.ownerId.toString() !== userId` returns `'FORBIDDEN_NOT_HOST'`.
     - Calls `createFriendInvitation` to produce recipient-isolated tokens instead of revoking existing invitations.
   - `sendRequest` (`DEF-FR-01`):
     - Wrapped document creation in `try/catch` on `MongoServerError` / code `11000`.
     - Reloads the canonical `pairKey` document; if the other user sent a reciprocal pending request, atomically transitions the document to `accepted` via `findOneAndUpdate`, dispatches `emitFriendRequestAccepted`, and returns the accepted friendship DTO.
   - `acceptRequest`, `declineRequest`, `cancelRequest`, `removeFriend` (`DEF-FR-02`):
     - Replaced non-atomic read-modify-save blocks with atomic `findOneAndUpdate` and `findOneAndDelete` operations.

6. **`src/modules/friends/friendship.controller.ts`**:
   - Mapped `'FORBIDDEN_NOT_HOST'` to HTTP 403 Forbidden with diagnostic error message.

7. **`src/realtime/presence.manager.ts`**:
   - In `addSocket` (`DEF-PRES-02`): added room-switching cleanup check; if socket was previously registered in a different room without an explicit `room:leave`, it is evicted from the previous room before joining the new room.

8. **`src/realtime/global-presence.manager.ts`**:
   - Added `pendingDisconnects = new Map<string, { timer: NodeJS.Timeout; generation: number }>()` and `userGenerations = new Map<string, number>()` (`DEF-PRES-03`).
   - Added `handleDisconnect(userId, socketId, gracePeriodMs, onGraceExpired)` with 10-second generation-fenced grace period.
   - Updated `isUserOnline` and `getOnlineUserIds` to consider users within disconnect grace period as online.
   - Updated `clear()` to cancel all active timers and clear generation tracking.

9. **`src/realtime/friend.events.ts`**:
   - Implemented `broadcastUserPresenceToFriends(io, userId)` (`DEF-PRES-01`): queries accepted friendships, fetches recipient-tailored dynamic presence via `globalPresenceManager.getUserPresence(userId, friendUserId)`, and dispatches `emitFriendPresenceUpdate` to each friend's user channel.
   - Updated explicit presence request handler to attach target username.

10. **`src/realtime/socket.server.ts`**:
    - On socket connection: checks `isFirstConnection`; if true, triggers `broadcastUserPresenceToFriends(io, userId)`.
    - On socket disconnection: calls `globalPresenceManager.handleDisconnect(userId, socket.id, 10000, ...)` and broadcasts offline presence only if grace period expires without reconnection.
    - In `evictKickedMember`: dispatches `broadcastUserPresenceToFriends(ioInstance, userId)` upon kick.

11. **`src/realtime/room.events.ts`**:
    - On `room:join` first connection: triggers `broadcastUserPresenceToFriends(io, user.id)`.
    - On `room:leave` last socket departure: triggers `broadcastUserPresenceToFriends(io, user.id)`.
    - On disconnect grace expiration: triggers `broadcastUserPresenceToFriends(io, expiredResult.userId)`.

12. **`src/realtime/karaoke.events.ts`**:
    - In `broadcastKaraokePlaybackUpdated`: proactively triggers `broadcastUserPresenceToFriends` for active performers transitioning between `in_lounge` and `singing`.

13. **`src/modules/users/user.controller.ts`**:
    - In `updatePreferences`: if `presenceVisibility` is updated, dispatches `broadcastUserPresenceToFriends(io, req.user.id)`.

---

### 2.2 Frontend (`apps/web`)

1. **`src/features/friends/components/invitation-notification-listener.tsx`** (`DEF-INV-03`):
   - Created client-side realtime invitation listener component.
   - Subscribes to `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED`.
   - Renders a floating notification toast with inviter details, room title, private/public badge, "Accept & Join" action, and "Dismiss".
   - Handles token deduplication.

2. **`src/components/auth/auth-initializer.tsx`**:
   - Mounted `<InvitationNotificationListener />` alongside the authentication initializer to provide global coverage across all application views.

---

## 3. Verification Commands & Results

1. **Contracts Package Build:**
   ```bash
   pnpm --filter @ktv/contracts build
   ```
   *Result:* Success (ESM, CJS, and DTS generated with zero errors).

2. **API Static Typecheck:**
   ```bash
   pnpm --filter api typecheck
   ```
   *Result:* Success (zero TypeScript errors).

3. **Web Static Typecheck:**
   ```bash
   pnpm --filter web typecheck
   ```
   *Result:* Success (zero TypeScript errors).

4. **Monorepo Root Typecheck:**
   ```bash
   pnpm typecheck
   ```
   *Result:* Success across all 3 packages (`@ktv/contracts`, `apps/api`, `apps/web`).

5. **API Linter:**
   ```bash
   pnpm --filter api lint
   ```
   *Result:* Success (zero ESLint errors or warnings).

6. **Web Linter:**
   ```bash
   pnpm --filter web lint
   ```
   *Result:* Success (zero ESLint errors or warnings).

7. **Monorepo Root Lint:**
   ```bash
   pnpm lint
   ```
   *Result:* Success across all packages with zero warnings and zero errors.
