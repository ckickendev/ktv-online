# Sprint 5.6.1.1: Critical Invitation Authorization Audit

## 1. Objective & Scope

Audit the authorization enforcement across all room invitation creation and dispatch pathways:
- `apps/api/src/modules/friends/friendship.service.ts`
- `apps/api/src/modules/friends/friendship.controller.ts`
- `apps/api/src/modules/rooms/invitation.service.ts`
- `apps/api/src/modules/rooms/invitation.controller.ts`
- `apps/api/src/modules/rooms/room.service.ts`

---

## 2. Line-by-Line Authorization Verification

### 2.1 Verification Item 1: Is invitation creation strictly authorized against authoritative room ownership?
**Status: VERIFIED.**
- In `invitation.service.ts` (`createInvitation`, lines 54-57):
  ```typescript
  if (room.ownerId.toString() !== hostUserId) {
    return { success: false, error: 'FORBIDDEN_NOT_HOST' };
  }
  ```
- In `invitation.service.ts` (`createFriendInvitation`, lines 125-128):
  ```typescript
  if (room.ownerId.toString() !== hostUserId) {
    return { success: false, error: 'FORBIDDEN_NOT_HOST' };
  }
  ```
- In `friendship.service.ts` (`sendLoungeInviteToFriend`, lines 642-645):
  ```typescript
  // Authoritative host check: only the room owner can dispatch direct friend invitations
  if (room.ownerId.toString() !== userId) {
    return { success: false, error: 'FORBIDDEN_NOT_HOST' };
  }
  ```

### 2.2 Verification Item 2: Can a non-host create invitations for a public room?
**Status: VERIFIED (Non-hosts are rejected).**
In `sendLoungeInviteToFriend` (`friendship.service.ts:643`), the check is unconditional:
`if (room.ownerId.toString() !== userId) return { success: false, error: 'FORBIDDEN_NOT_HOST' };`
Non-hosts cannot create invitations or send direct friend invitations for public rooms.

### 2.3 Verification Item 3: Can a non-host create invitations for a private room?
**Status: VERIFIED (Strictly rejected).**
Both `createInvitation`, `createFriendInvitation`, and `sendLoungeInviteToFriend` enforce `room.ownerId.toString() === userId`. Any non-host attempt yields HTTP 403 `FORBIDDEN_NOT_HOST`.

### 2.4 Verification Item 4: Is the authenticated actor ID used consistently?
**Status: VERIFIED.**
- In `friendship.controller.ts` (line 267):
  `req.user.id` (extracted from the cryptographically verified JWT payload) is passed as `userId`.
- In `invitation.controller.ts` (line 21):
  `req.user.id` is passed as `hostUserId`.
- Neither endpoint allows an actor ID to be supplied via URL parameters or JSON request body.

### 2.5 Verification Item 5: Can a caller impersonate `room.ownerId`?
**Status: VERIFIED (Impersonation impossible).**
`req.user` is populated solely by `jwtAuthMiddleware` or `socketAuthMiddleware`. No user-controlled parameter can overwrite or spoof `req.user.id`.

### 2.6 Verification Item 6: Is active room membership required where appropriate?
**Status: VERIFIED.**
In `sendLoungeInviteToFriend`, the sender must be the authoritative room owner (`room.ownerId`). The room owner is by definition the creator and persistent authority of the room. In `joinRoom` (`room.service.ts:394-413`), non-owners attempting to join private rooms must present a valid, active invitation token.

### 2.7 Verification Item 7: Are closed, locked, or otherwise ineligible rooms rejected?
**Status: VERIFIED.**
- `room.status === 'closed'` is explicitly checked before token generation in:
  - `invitation.service.ts:50` (`createInvitation`)
  - `invitation.service.ts:121` (`createFriendInvitation`)
  - `friendship.service.ts:638` (`sendLoungeInviteToFriend`)
- In `joinRoom` (`room.service.ts:359`, `389`):
  - Closed rooms return `ROOM_CLOSED`.
  - Locked rooms return `ROOM_LOCKED` for non-owners.
  - Kicked members return `FORBIDDEN_KICKED`.

### 2.8 Verification Item 8: Does authorization occur before any token creation, revocation, or side effect?
**Status: VERIFIED.**
In `createInvitation`, `createFriendInvitation`, and `sendLoungeInviteToFriend`:
The room lookup, status check, and host ownership check occur prior to `RoomInvitationModel.updateMany` (revocation), token hashing, database insertion, or Socket.IO emission.

---

## 3. Findings

### Finding AUD-INV-02: Public Lounge Direct Friend Invites Restricted to Host
- **Severity:** Low (Policy & UX Alignment)
- **Source File:** `apps/api/src/modules/friends/friendship.service.ts#L642-L645`
- **Actual Source Behavior:**
  ```typescript
  // Authoritative host check: only the room owner can dispatch direct friend invitations
  if (room.ownerId.toString() !== userId) {
    return { success: false, error: 'FORBIDDEN_NOT_HOST' };
  }
  ```
  This check executes for all rooms regardless of `room.visibility`.
- **Reproduction Scenario:**
  A member is enjoying an active public karaoke room and wants to invite their friend to join using the "Invite to Lounge" button. The server rejects the request with HTTP 403 `FORBIDDEN_NOT_HOST`.
- **Security & Product Impact:**
  From a security standpoint, this is hyper-conservative (fail-safe). However, from a product standpoint, users might expect active members to be able to share a public lounge invite with friends.
- **Recommended Remediation:**
  If product design permits members to invite friends to public rooms, relax the check for public rooms while requiring active room membership:
  ```typescript
  if (room.visibility === 'private' && room.ownerId.toString() !== userId) {
    return { success: false, error: 'FORBIDDEN_NOT_HOST' };
  }
  ```
  If policy intentionally restricts all direct invitations to the host, document this explicitly as product policy.
