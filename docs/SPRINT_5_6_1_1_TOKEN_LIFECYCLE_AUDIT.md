# Sprint 5.6.1.1: Invitation Token Isolation & Lifecycle Audit

## 1. Objective & Scope

Audit token structure, persistence, isolation, expiration, revocation, preview, and redemption logic across:
- `apps/api/src/modules/rooms/invitation.types.ts`
- `apps/api/src/modules/rooms/invitation.model.ts`
- `apps/api/src/modules/rooms/invitation.service.ts`
- `apps/api/src/modules/rooms/room.service.ts`

---

## 2. Token Lifecycle & Isolation Verification

### 2.1 Distinct Semantics: General vs Recipient-Bound Invitations
**Status: VERIFIED.**
- General shareable links (`recipientId: null`):
  - Created by `createInvitation(roomId, hostUserId, expiresInHours)`.
  - Revokes only previous general links (`recipientId: null, revokedAt: null`).
  - Does NOT revoke friend-bound invitations.
- Dedicated friend invitations (`recipientId: friendObjectId`):
  - Created by `createFriendInvitation(roomId, hostUserId, friendUserId, expiresInHours)`.
  - Sets `recipientId: new Types.ObjectId(friendUserId)`.
  - Revokes only previous invitations issued to that exact friend in that room (`{ roomId, recipientId: friendObjectId, revokedAt: null }`).

### 2.2 Multi-Friend Isolation
**Status: VERIFIED.**
Inviting Friend B creates an invitation with `recipientId: friendB_id`. It queries and revokes only `{ roomId, recipientId: friendB_id }`. Friend A's invitation has `recipientId: friendA_id` and remains active.

### 2.3 Cryptographic Token Storage
**Status: VERIFIED.**
Raw tokens are generated using 32 random bytes (`randomBytes(32).toString('hex')`). They are hashed with SHA-256 (`createHash('sha256').update(rawToken.trim()).digest('hex')`) prior to storage in MongoDB. Raw tokens are never persisted or logged in server logs.

### 2.4 Expiration and Revocation Enforcement
**Status: VERIFIED.**
- In `validateInvitation`:
  - `invitation.revokedAt || invitation.status === 'revoked'` returns `INVITATION_REVOKED`.
  - `invitation.expiresAt < new Date()` returns `INVITATION_EXPIRED`.
- In `previewInvitation`:
  - Revoked tokens return `{ invitation: { status: 'revoked' } }`.
  - Expired tokens return `{ invitation: { status: 'expired' } }`.

### 2.5 Capacity & Concurrency Enforcement on Redemption
**Status: VERIFIED.**
In `room.service.ts` (`joinRoom`):
Capacity is reserved using an atomic MongoDB update:
```typescript
const updatedRoom = await RoomModel.findOneAndUpdate(
  {
    _id: roomObjectId,
    status: { $ne: 'closed' },
    $expr: { $lt: ['$currentParticipantsCount', '$capacity'] },
  },
  { $inc: { currentParticipantsCount: 1 } },
  { new: true }
).exec();
```
Concurrent join requests cannot exceed `room.capacity`.

---

## 3. Findings

### Finding AUD-INV-01: Unauthenticated Recipient Guard Bypass in Token Validation & Preview
- **Finding ID:** `AUD-INV-01`
- **Severity:** Medium (Security & Data Exposure)
- **Source Files:**
  - `apps/api/src/modules/rooms/invitation.service.ts#L267-L276`
  - `apps/api/src/modules/rooms/invitation.service.ts#L404-L410`
- **Actual Source Behavior:**
  In `previewInvitation`:
  ```typescript
  // Line 266-276
  // Recipient-bound check: if invitation is dedicated to a friend, verify identity
  if (invitation.recipientId && requestingUserId) {
    if (invitation.recipientId.toString() !== requestingUserId) {
      return {
        success: true,
        data: {
          invitation: { status: 'invalid' },
        },
      };
    }
  }
  ```
  In `validateInvitation`:
  ```typescript
  // Line 404-410
  // Recipient-bound validation: if token is bound to a specific friend, verify caller identity
  if (invitation.recipientId && requestingUserId) {
    if (invitation.recipientId.toString() !== requestingUserId) {
      return { valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
    }
  }
  ```
- **Reproduction Scenario & Failure Condition:**
  1. Host generates a dedicated, recipient-bound invitation for Friend A to a private lounge.
  2. An unauthenticated third party (or unauthenticated browser session) navigates to `/api/rooms/invitations/preview/:token` without providing an `Authorization` Bearer token (`requestingUserId` is `undefined`).
  3. Because `requestingUserId` is `undefined`, the compound condition `if (invitation.recipientId && requestingUserId)` evaluates to `false`.
  4. The code completely skips the recipient identity check and returns a full `InvitationPreviewDto` containing the private room's title, description, category, and host profile details.
  5. Furthermore, if `validateInvitation(rawToken, roomId)` is invoked by any caller without supplying `requestingUserId`, `validateInvitation` returns `{ valid: true }` despite `recipientId` being set.
- **Security & Product Impact:**
  - **Information Disclosure:** Unauthenticated users can preview private room metadata using friend-targeted links intended solely for a specific user.
  - **Defensive Inconsistency:** Recipient isolation is gated on the presence of `requestingUserId`, making the guard optional rather than mandatory for recipient-bound tokens.
- **Recommended Remediation:**
  For recipient-bound invitations, if `requestingUserId` is missing, the request must fail the recipient match:
  In `previewInvitation`:
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
  In `validateInvitation`:
  ```typescript
  if (invitation.recipientId) {
    if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
      return { valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
    }
  }
  ```
