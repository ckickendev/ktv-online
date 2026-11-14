# Sprint 5.6.1 Remediation Source Audit: Social Integrity & Invitation Security

**Sprint:** 5.6.1 (Remediation)  
**Repository Baseline Commit:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`  
**Target Branch:** `main`  
**Database Target:** `test` (MongoDB)  
**Monorepo:** `pnpm` workspace (`apps/api`, `apps/web`, `packages/contracts`)  
**Audit Date:** November 2026  
**Auditor:** Antigravity Agentic Security & Architecture Remediation Team  

---

## 1. Executive Summary & Baseline Verification

Before modifying any source code, an authoritative read-only source inspection was performed on commit `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`.

All 6 defects reported in the Sprint 5.6 Post-Implementation Audit were confirmed against the live source tree:
1. **DEF-INV-02 (P1):** `sendLoungeInviteToFriend` does not verify caller room ownership and forges `room.ownerId` when calling `invitationService.createInvitation`.
2. **DEF-INV-01 (P1):** Calling `createInvitation` on every friend invite unconditionally revokes previous active invitations for the room, invalidating tokens of earlier invited friends.
3. **DEF-FR-01 (P1):** Reciprocal friend requests sent concurrently trigger an unhandled MongoDB `E11000` duplicate key exception, crashing with HTTP 500.
4. **DEF-FR-02 (P2):** `acceptRequest` and `cancelRequest` use read-modify-save (`findById` + `.save()`), allowing concurrency race conditions between cancellations and acceptances.
5. **DEF-PRES-01 (P1):** `emitFriendPresenceUpdate` is defined in `friend.events.ts` but never called anywhere in `apps/api`. Real-time presence relies entirely on a 30-second polling fallback.
6. **DEF-INV-03 (P2):** `apps/web` registers no listener for `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED`, dropping incoming realtime room invites.
7. **DEF-PRES-02 (P3):** `presenceManager.addSocket` overwrites socket metadata without removing the socket from the old room's map, leaking presence when users switch rooms without explicit `room:leave`.
8. **DEF-PRES-03 (P3):** Global presence removes sockets immediately upon disconnect while room presence uses a 10-second grace period, causing presence to flicker offline on page refreshes.

---

## 2. Source-Level Defect Confirmation & Source Locations

### 2.1. DEF-INV-02: Invitation Authorization Bypass
- **File:** `apps/api/src/modules/friends/friendship.service.ts#L550-L565`
- **Confirmed Source Behavior:**
  ```typescript
  const room = await RoomModel.findById(roomId).exec();
  if (!room || room.status === 'closed') {
    return { success: false, error: 'ROOM_UNAVAILABLE' };
  }
  // Caller authorization missing!
  const createRes = await invitationService.createInvitation(roomId, room.ownerId.toString(), 48);
  ```
  The caller `userId` is never compared against `room.ownerId`. Furthermore, `friendship.service.ts` passes `room.ownerId.toString()` instead of `userId` to `createInvitation`, forging the owner's credentials to bypass `invitation.service.ts#L55`.

### 2.2. DEF-INV-01: Multi-Friend Invitation Invalidation
- **Files:**
  - `apps/api/src/modules/friends/friendship.service.ts#L561`
  - `apps/api/src/modules/rooms/invitation.service.ts#L59-L63`
- **Confirmed Source Behavior:**
  ```typescript
  // In invitation.service.ts:
  await RoomInvitationModel.updateMany(
    { roomId: roomObjectId, status: 'active', revokedAt: null },
    { $set: { status: 'revoked', revokedAt: new Date() } }
  ).exec();
  ```
  When the host invites Friend A and then Friend B, Friend A's token is immediately revoked in MongoDB before Friend A can redeem it.

### 2.3. DEF-FR-01: Reciprocal Request Race Condition
- **File:** `apps/api/src/modules/friends/friendship.service.ts#L64-L136`
- **Confirmed Source Behavior:**
  `findOne({ pairKey })` returns null for both threads when requests are dispatched simultaneously. The second `FriendshipModel.create` throws `MongoServerError: E11000 duplicate key error`. Without a `try/catch` block handling code 11000, Express's global error handler returns HTTP 500.

### 2.4. DEF-FR-02: Non-Atomic State Transitions
- **File:** `apps/api/src/modules/friends/friendship.service.ts#L168-L186`, `L260-L274`
- **Confirmed Source Behavior:**
  Both `acceptRequest` and `cancelRequest` perform `findById`, followed by `.save()` or `findByIdAndDelete`, without atomic predicate guards.

### 2.5. DEF-PRES-01: Presence Realtime Broadcast Decoupling
- **File:** `apps/api/src/realtime/friend.events.ts#L39-L46`
- **Confirmed Source Behavior:**
  `emitFriendPresenceUpdate` is declared and exported, but grep confirms zero call sites in `apps/api`. Presence transitions (connect, disconnect, room join, room leave, stage singing) do not push events to online friends.

### 2.6. DEF-INV-03: Realtime Invitation Dropped on Client
- **File:** `apps/web/src/features/friends/`
- **Confirmed Source Behavior:**
  No component or hook in `apps/web` subscribes to `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED`. The socket receives the packet and drops it.

### 2.7. DEF-PRES-02: Room Switching Presence Leak
- **File:** `apps/api/src/realtime/presence.manager.ts#L74`
- **Confirmed Source Behavior:**
  When a socket joins `roomB` without calling `room:leave` on `roomA`, `socketMeta` overwrites the room metadata with `roomB`, but `this.roomUsers.get('roomA')` still holds the socket ID. Subsequent `getUserRoom` calls return `roomA` indefinitely.

### 2.8. DEF-PRES-03: Global Disconnect Grace Period Asymmetry
- **File:** `apps/api/src/realtime/socket.server.ts#L65-L67`
- **Confirmed Source Behavior:**
  `globalPresenceManager.removeSocket` immediately deletes the socket from `userSockets`. If a user reloads their page, their presence flips to `offline` for ~1 second before reconnecting.

---

## 3. Mandatory Design Audit: Invitation Token Architecture

### 3.1. Comparison of Options

| Architectural Attribute | Option A: Reused Shared Room Invitation | Option B: Recipient-Bound Invitations (**Selected**) |
|---|---|---|
| **Token Retrieval** | Impossible without storing raw tokens in DB (breaching security principle) | Generates a fresh raw token and stores `tokenHash` per recipient |
| **Token Collision** | All friends share the exact same token | Each friend receives an isolated, unique token |
| **Revocation Granularity**| Revoking the link revokes access for all invited friends simultaneously | Host can revoke a single friend's invitation or all invitations |
| **Theft Protection** | Any bearer who intercepts the link can join the private room | Token can only be redeemed by the authenticated recipient user (`recipientId`) |
| **Database Migration** | No schema change | Optional `recipientId` field added to Mongoose schema (zero migrations required) |
| **Sprint 5.0 Compatibility**| Preserved | 100% Preserved. Public share links retain `recipientId: null`. |

### 3.2. Architecture Decision: Option B (Recipient-Bound Invitations)

**Decision:** We adopt **Option B** as the smallest secure, backward-compatible design:
1. `RoomInvitationSchema` is extended with an optional field:
   ```typescript
   recipientId: {
     type: Schema.Types.ObjectId,
     ref: 'User',
     default: null,
     index: true,
   }
   ```
2. When the host creates a general shareable link via `createInvitation`, `recipientId` is `null`. Existing Sprint 5.0 behavior is 100% preserved.
3. When the host invites a friend via `sendLoungeInviteToFriend`:
   - It verifies that the caller is the authoritative room host (`room.ownerId.toString() === userId`).
   - It revokes only any previous active invitation for that specific `{ roomId, recipientId: friendUserId }`.
   - It creates a dedicated invitation for `{ roomId, recipientId: friendUserId }`.
   - It leaves the general share link (`recipientId: null`) and other friends' invitations completely untouched!
4. During redemption (`validateInvitation` / `acceptInvitation`):
   - If `invitation.recipientId` is set, the service verifies that `requestingUserId === invitation.recipientId.toString()`.
   - An intercepted token cannot be used by anyone other than the intended recipient.
5. **No raw tokens are stored in the database.** Only `tokenHash` (SHA-256) is persisted.

---

## 4. Remediation Plan & Execution Sequence

1. **Step 1:** Extend `RoomInvitation` with `recipientId` and implement `createFriendInvitation` in `invitation.service.ts` with recipient validation.
2. **Step 2:** Fix `sendLoungeInviteToFriend` in `friendship.service.ts` to enforce host authorization (`room.ownerId.toString() === userId`).
3. **Step 3:** Remediate reciprocal friend request race condition (DEF-FR-01) by catching MongoDB `E11000` and auto-transitioning to `accepted`.
4. **Step 4:** Replace non-atomic transitions in `acceptRequest`, `cancelRequest`, `declineRequest` with atomic conditional queries (`findOneAndUpdate` / `findOneAndDelete`).
5. **Step 5:** Wire presence realtime events (`emitFriendPresenceUpdate` and `broadcastUserPresenceToFriends`) across connection, disconnection, room join, room leave, kick, and singing status transitions.
6. **Step 6:** Implement client-side invitation listener and interactive toast/modal in `apps/web`.
7. **Step 7:** Fix room switching cleanup in `presence.manager.ts`.
8. **Step 8:** Align global presence disconnect grace period with 10-second timer and generation fencing.
9. **Step 9:** Execute static verification (`pnpm typecheck` and `pnpm lint`).
10. **Step 10:** Compile final documentation reports.
