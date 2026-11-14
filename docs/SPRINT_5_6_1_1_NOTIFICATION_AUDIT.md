# Sprint 5.6.1.1: Invitation Notification Audit

## 1. Objective & Scope

Audit the frontend realtime invitation listener and backend notification emission:
- `apps/api/src/modules/friends/friendship.service.ts`
- `apps/api/src/realtime/friend.events.ts`
- `apps/web/src/features/friends/components/invitation-notification-listener.tsx`
- `apps/web/src/components/auth/auth-initializer.tsx`

---

## 2. Verification Checklist

### 2.1 Targeted Notification Dispatch
**Status: VERIFIED.**
In `friendship.service.ts` (line 681):
`emitFriendInvitationReceived(io, friendUserId, payload);`
In `friend.events.ts`:
`io.to(getUserChannel(friendUserId)).emit(SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED, payload);`
The invitation is emitted exclusively to the per-user room `user:${friendUserId}`. No broadcast to other users or room channels occurs.

### 2.2 Event Deduplication
**Status: VERIFIED.**
In `invitation-notification-listener.tsx` (lines 26-32):
```typescript
setInvitations((prev) => {
  // Deduplicate invitations by token
  if (prev.some((inv) => inv.invitationToken === payload.invitationToken)) {
    return prev;
  }
  return [payload, ...prev];
});
```
Duplicate Socket.IO events with the same `invitationToken` are ignored and do not create duplicate toasts.

### 2.3 Dismiss Action Semantics
**Status: VERIFIED.**
`handleDismiss(token)` (line 42):
Only removes the invitation from local component state (`setInvitations((prev) => prev.filter((inv) => inv.invitationToken !== token))`). No backend mutation or redemption is triggered.

### 2.4 Accept & Join Flow
**Status: VERIFIED.**
`handleAccept(token)` (line 46):
Removes the toast and navigates to `/invite/${token}` via `router.push(`/invite/${token}`)`. The destination route invokes `previewInvitation` and allows the authenticated friend to redeem their dedicated token.

### 2.5 Ephemeral Token Storage
**Status: VERIFIED.**
Tokens are stored strictly in volatile React component state (`useState`) during the life of the toast notification. No tokens are written to `localStorage`, `sessionStorage`, or cookies.

### 2.6 Metadata Exposure Prevention
**Status: VERIFIED.**
The notification renders:
- Inviter display name / username
- Inviter avatar
- Room name (`invitation.roomTitle`)
- Lounge type (`Private Lounge` or `Public Lounge`)
Internal MongoDB `roomId`, participant counts, or user rosters are not exposed.

---

## 3. Findings
No source-level defects identified in the notification subsystem.
