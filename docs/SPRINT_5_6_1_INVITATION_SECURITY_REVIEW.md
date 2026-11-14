# Sprint 5.6.1: Invitation Security Review

## 1. Executive Summary

Sprint 5.6.1 addressed two critical security and token lifecycle defects discovered during the Sprint 5.6 Post-Implementation Audit:
1. **`DEF-INV-02` (Severity: High / P1)**: Non-host room participants or unauthorized users could generate valid invitation tokens for private rooms via the direct friend invitation endpoint `POST /api/friends/invite-lounge`.
2. **`DEF-INV-01` (Severity: Medium-High / P1)**: Creating an invitation for one friend implicitly revoked all existing active invitations for that room, invalidating invitations previously issued to other friends and disrupting multi-friend onboarding.
3. **`DEF-INV-03` (Severity: Medium / P2)**: Web client lacked a realtime listener for incoming invitation events (`friend:invitation:received`).

All three defects have been remediated in source code without migrations or external dependencies.

---

## 2. Authorization Remediation (`DEF-INV-02`)

### 2.1 Vulnerability Analysis
Previously in `sendLoungeInviteToFriend` (`apps/api/src/modules/friends/friendship.service.ts`):
- The service verified room existence and accepted friendship between the inviter and invitee.
- However, for private lounges (`room.visibility === 'private'`), it did NOT verify that `userId` was either the room owner (`room.ownerId.toString() === userId`) or an authorized host.
- As a result, any active room member or third party who knew the `roomId` could issue cryptographically signed invitation tokens to friends, bypassing private room access controls.

### 2.2 Implemented Fix
In `apps/api/src/modules/friends/friendship.service.ts`:
```typescript
// 2. Validate room status and authoritative host ownership
const room = await RoomModel.findById(roomObjectId).select('status visibility ownerId name').exec();
if (!room) {
  return { success: false, error: 'ROOM_NOT_FOUND' };
}
if (room.status === 'closed') {
  return { success: false, error: 'ROOM_CLOSED' };
}

// Authoritative Host Authorization (DEF-INV-02): Only room owner can issue private invitations
if (room.visibility === 'private' && room.ownerId.toString() !== userId) {
  return { success: false, error: 'FORBIDDEN_NOT_HOST' };
}
```
In `apps/api/src/modules/friends/friendship.controller.ts`:
Mapped `'FORBIDDEN_NOT_HOST'` to HTTP 403 Forbidden with clear diagnostic message:
```typescript
case 'FORBIDDEN_NOT_HOST':
  sendError(res, 'Only the room host can invite users to a private lounge', 403);
  return;
```

---

## 3. Token Model & Multi-Friend Isolation (`DEF-INV-01`)

### 3.1 Architectural Root Cause
Previously, `RoomInvitationModel` stored:
- `roomId`
- `tokenHash`
- `createdBy`
- `expiresAt`, `revokedAt`, `usedCount`, `maxUses`

The general invitation service executed `createInvitation`:
```typescript
// Revoke existing active invitations for this room
await RoomInvitationModel.updateMany({ roomId, revokedAt: null }, { $set: { revokedAt: new Date() } });
```
When `sendLoungeInviteToFriend` invoked `createInvitation`, it revoked all existing tokens for `roomId`. If a host invited Friend A, and 10 seconds later invited Friend B, Friend A's token became permanently revoked (`revokedAt != null`) before Friend A could click the link.

### 3.2 Implemented Fix: Option B (Recipient-Bound Invitation Tokens)
In `apps/api/src/modules/rooms/invitation.types.ts` & `invitation.model.ts`:
- Added `recipientId?: Types.ObjectId | null` to the schema and model interface.
- Added compound index `{ roomId: 1, recipientId: 1, revokedAt: 1 }` to support fast lookups.

In `apps/api/src/modules/rooms/invitation.service.ts`:
- **General Invitations (`createInvitation`)**:
  - Sets `recipientId: null`.
  - Only revokes prior general shareable links (`recipientId: null`), leaving direct friend invitations intact.
- **Direct Friend Invitations (`createFriendInvitation`)**:
  - Sets `recipientId: new Types.ObjectId(recipientUserId)`.
  - Only revokes prior active invitations specifically addressed to that recipient (`{ roomId, recipientId, revokedAt: null }`), avoiding cross-friend invalidation.
- **Token Redemption Enforcement (`validateInvitation`)**:
  - Enforces recipient matching:
    ```typescript
    if (invitation.recipientId) {
      if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
        return { valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
      }
    }
    ```
  - In `apps/api/src/modules/rooms/room.service.ts`:
    - `validateInvitation(inviteToken, roomId, userId)` passes the attempting user ID.
    - If a third party attempts to redeem Friend A's private token, redemption is rejected with `'INVITATION_RECIPIENT_MISMATCH'`.

---

## 4. Realtime Direct Invitation Notification (`DEF-INV-03`)

### 4.1 Web Client Notification Listener
- Created `apps/web/src/features/friends/components/invitation-notification-listener.tsx`:
  - Connects to Socket.IO and listens to `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED`.
  - Maintains state of active invitations with token deduplication.
  - Renders a floating, responsive notification toast displaying:
    - Inviter's avatar and name
    - Room title and visibility badge (`Private Lounge` / `Public Lounge`)
    - "Accept & Join" action button directing to `/invite/${token}`
    - "Dismiss" button
- Mounted globally within `apps/web/src/components/auth/auth-initializer.tsx` so all authenticated sessions receive instant invites.

---

## 5. Security Posture Summary

| Security Dimension | Pre-Remediation State | Post-Remediation State |
| :--- | :--- | :--- |
| **Host Authorization** | Non-hosts could invite friends to private rooms | Host-only check strictly enforced (`FORBIDDEN_NOT_HOST`, 403) |
| **Token Isolation** | Inviting Friend B invalidated Friend A's token | Per-recipient token partitioning (`recipientId`); no mutual invalidation |
| **Token Theft Protection** | Bearer tokens could be forwarded to uninvited users | Recipient-bound validation (`INVITATION_RECIPIENT_MISMATCH`) |
| **Realtime Dispatch** | Server emitted event; client had no listener | Global `<InvitationNotificationListener />` mounted in auth root |
