# Sprint 5.6.1.2: Invitation Identity & Recipient Enforcement Review

## 1. Overview

This document provides a comprehensive security review of the recipient identity enforcement model implemented during Sprint 5.6.1.2 to resolve defect `AUD-INV-01`.

---

## 2. Token Architecture & Authorization Boundaries

KTVOnline supports two distinct categories of room invitations:
1. **Public Bearer Invitations (`recipientId: null`):**
   - Issued by room hosts for public distribution (e.g. shared in Discord, Telegram, or group chats).
   - Can be previewed by unauthenticated users.
   - Can be redeemed by any authenticated user who meets room eligibility requirements (not kicked, room not full, room not closed).
2. **Recipient-Bound Direct Invitations (`recipientId: ObjectId`):**
   - Issued by room hosts directly to a specific accepted friend via `POST /api/friends/invite-lounge/:roomId`.
   - Bound immutably to `recipientId` in MongoDB `RoomInvitationModel`.
   - Dedicated to that specific recipient; creating an invitation for another friend does not revoke it.
   - **Enforcement Rule:** Must fail closed if the requesting user is unauthenticated or has a different `userId`.

---

## 3. Authoritative Inspection of Inspection Boundaries

### 3.1 Boundary 1: Preview Endpoint (`GET /api/rooms/invitations/:token`)
- **Route Definition:**
  ```typescript
  invitationRoutes.get('/:token', invitationPreviewRateLimiter, optionalAuth, ...);
  ```
- **Controller Logic (`InvitationController.previewInvitation`):**
  Extracts `requestingUserId = req.user?.id` (populated if caller provides a valid Bearer token, otherwise `undefined`).
- **Service Logic (`InvitationService.previewInvitation`):**
  ```typescript
  if (invitation.recipientId) {
    if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
      return {
        success: true,
        data: {
          invitation: { status: 'invalid' },
        },
      };
    }
  }
  ```
- **Information Leakage Analysis:**
  - If an unauthenticated user opens a recipient-bound link: returned payload is `{ invitation: { status: 'invalid' } }`. No room name, host details, or category are exposed.
  - If User B opens a link issued to User A: returned payload is identical `{ invitation: { status: 'invalid' } }`.
  - Attackers cannot probe or enumerate recipient IDs or room presence.

### 3.2 Boundary 2: Redemption Endpoint (`POST /api/rooms/invitations/:token/join`)
- **Route Definition:**
  ```typescript
  invitationRoutes.post('/:token/join', requireAuth, ...);
  ```
- **Controller Logic (`InvitationController.joinViaInvitation`):**
  1. Calls `invitationService.resolveInvitationRoomId(token, req.user.id)`.
     If `invitation.recipientId !== req.user.id`, fails immediately with HTTP 403:
     `'This invitation was issued to another user'`.
  2. Calls `roomService.joinRoom(roomId, req.user.id, token)`.
- **Service Logic (`RoomService.joinRoom`):**
  Calls `invitationService.validateInvitation(token, roomId, req.user.id)`.
  If `recipientId` does not match `req.user.id`, rejects with `'INVITATION_RECIPIENT_MISMATCH'`, which maps to HTTP 403.

### 3.3 Boundary 3: Direct Room Join (`POST /api/rooms/:id/join`)
- **Route Definition:**
  ```typescript
  roomRoutes.post('/:id/join', requireAuth, ...);
  ```
- **Controller Logic (`RoomController.joinRoom`):**
  Passes `inviteToken` from body to `roomService.joinRoom(roomId, req.user.id, inviteToken)`.
- **Service Logic:**
  Authoritative validation in `validateInvitation(inviteToken, roomId, userId)` rejects mismatched recipients with `'INVITATION_RECIPIENT_MISMATCH'`, returned as HTTP 403.

---

## 4. Security Guarantees Summary

| Scenario | Requesting Identity | Expected Result | Source Verification |
| :--- | :--- | :--- | :--- |
| **Public Bearer Preview** | Unauthenticated | Preview returned (valid/expired/revoked) | Verified |
| **Public Bearer Preview** | Authenticated | Preview returned with userState | Verified |
| **Recipient-Bound Preview** | Unauthenticated | `{ invitation: { status: 'invalid' } }` | Verified |
| **Recipient-Bound Preview** | Mismatched User | `{ invitation: { status: 'invalid' } }` | Verified |
| **Recipient-Bound Preview** | Correct Recipient | Full preview returned with userState | Verified |
| **Recipient-Bound Join** | Unauthenticated | HTTP 401 Unauthorized | Verified |
| **Recipient-Bound Join** | Mismatched User | HTTP 403 Forbidden | Verified |
| **Recipient-Bound Join** | Correct Recipient | Successful room membership | Verified |
