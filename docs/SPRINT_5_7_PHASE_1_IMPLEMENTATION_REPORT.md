# KTVOnline — Sprint 5.7, Phase 1: Implementation Report
## Shared Contracts & Social Invitation Foundation

**Document Version:** 1.0.0  
**Status:** Implemented & Statically Verified  
**Baseline Commit:** `3e13764`  
**Target Database:** `test` (Preserved)  
**Strict Policy:** Code-Only Implementation (No test runners, no production builds, no live DB mutations)

---

## 1. Executive Summary

Sprint 5.7 Phase 1 establishes the backend authorization, persistence, rate limiting, and shared-contract foundation for Social Karaoke Sessions.

This implementation resolves the critical pre-implementation gaps identified in Sprint 5.7.1 by delivering:
1. **Batch Lounge Invitations (`POST /api/friends/invite-lounge-batch/:roomId`):** An optimized, host-authorized batch invitation pipeline (up to 20 recipients) eliminating N+1 queries, enforcing host room presence, and preserving recipient isolation with partial failure semantics.
2. **Authenticated Pending Invitation Inbox (`GET /api/friends/invitations/pending`):** An inbox enabling offline recipients to discover active invitations upon login without storing or exposing raw bearer tokens or token hashes.
3. **Recipient-Only Invitation Dismissal (`POST /api/friends/invitations/:id/dismiss`):** An atomic, idempotent dismissal operation restricted strictly to the invited recipient.
4. **Dual-Credential Room Join (`POST /api/rooms/:id/join`):** Support for both public `inviteToken` links and authenticated `invitationId` inbox entries without ambiguous credentials or capacity leaks.
5. **Database Index Declaration:** Additive Mongoose schema compound index `{ recipientId: 1, status: 1, expiresAt: 1 }` with deterministic index naming.

---

## 2. Modified & Created Files

| File Path | Type | Description |
| :--- | :--- | :--- |
| `packages/contracts/src/friendship.ts` | Shared Contract | Added `BatchLoungeInviteSchema`, `BatchLoungeInviteResultSchema`, `PendingInvitationItemSchema`, `PendingInvitationsResponseSchema`, `DismissInvitationResponseSchema`, updated `FriendInvitationReceivedPayloadSchema`. |
| `packages/contracts/src/invitation.ts` | Shared Contract | Updated `JoinRoomWithInviteSchema` to support optional `invitationId` with mutual exclusivity refinement. |
| `apps/api/src/modules/rooms/invitation.model.ts` | Backend Model | Added compound index `{ recipientId: 1, status: 1, expiresAt: 1 }` (`idx_room_invitations_recipient_status_expires`). |
| `apps/api/src/modules/rooms/invitation.service.ts` | Backend Service | Implemented `validateRecipientInvitationById`, `getPendingInvitationsForRecipient`, and `dismissInvitationByRecipient`. |
| `apps/api/src/modules/rooms/room.service.ts` | Backend Service | Extended `joinRoom` signature to accept credentials object `{ inviteToken?: string; invitationId?: string }`; added `'AMBIGUOUS_INVITATION_CREDENTIALS'` to `JoinRoomResult`. |
| `apps/api/src/modules/rooms/room.controller.ts` | Backend Controller | Parsed `inviteToken` and `invitationId` in `joinRoom`; handled mutual exclusivity and error mapping. |
| `apps/api/src/modules/friends/friendship.service.ts` | Backend Service | Implemented `inviteLoungeBatch` pipeline with `HostBatchInviteRateLimiter`, batch friendship lookup, batch membership lookup, and recipient-isolated invitation creation. |
| `apps/api/src/modules/friends/friendship.controller.ts` | Backend Controller | Added `inviteLoungeBatch`, `getPendingInvitations`, and `dismissInvitation` handlers. |
| `apps/api/src/modules/friends/friendship.routes.ts` | Backend Routes | Registered `/invitations/pending`, `/invitations/:id/dismiss`, and `/invite-lounge-batch/:roomId` before parameterized user routes. |
| `apps/web/src/features/friends/components/invitation-notification-listener.tsx` | Web Component | Updated realtime listener to support both `invitationId` and `invitationToken` payloads. |

---

## 3. API Contracts & Behavior

### 3.1 Batch Lounge Invitations
- **Route:** `POST /api/friends/invite-lounge-batch/:roomId`
- **Middleware:** `requireAuth`
- **Request Body (`BatchLoungeInviteSchema`):**
  ```json
  {
    "friendUserIds": ["674f1...", "674f2..."]
  }
  ```
- **Constraints:**
  - `1 <= friendUserIds.length <= 20`
  - Valid MongoDB ObjectId strings only.
  - Deterministically deduplicated: `Array.from(new Set(body.friendUserIds))`.
  - Self-invitation explicitly rejected: `CANNOT_INVITE_SELF` (400 Bad Request).
- **Authorization Flow:**
  1. `req.user.id` verified via JWT.
  2. Room loaded via `RoomModel.findById(roomId)`.
  3. Room verified exists (404 `ROOM_NOT_FOUND`) and not closed (400 `ROOM_CLOSED`).
  4. Room verified unlocked (400 `ROOM_LOCKED`).
  5. Room host ownership verified: `room.ownerId.toString() === req.user.id` (403 `FORBIDDEN_NOT_HOST`).
  6. Active host membership verified: `RoomMembershipModel.findOne({ roomId, userId: hostUserId, status: 'active' })` (403 `HOST_NOT_ACTIVE_MEMBER`).
  7. Host rate limit checked: 1 request / 5s; max 60 recipients / 10m (429 `RATE_LIMIT_EXCEEDED`).
  8. Batch friendship verification: `FriendshipModel.find({ pairKey: { $in: pairKeys }, status: 'accepted' })` in single query.
  9. Batch membership check: `RoomMembershipModel.find({ roomId, userId: { $in: targetObjectIds }, status: 'active' })` in single query.
  10. Creation and socket dispatch loop:
      - Revokes prior active invitation for `(roomId, recipientId)` (preserves recipient isolation).
      - Generates raw 192-bit token + SHA-256 hash.
      - Dispatches `friend:invitation_received` to online recipient only.
- **Partial Success Response (`BatchLoungeInviteResultDto`):**
  ```json
  {
    "success": true,
    "message": "Batch invitations processed successfully",
    "data": {
      "success": true,
      "summary": { "total": 3, "sent": 2, "failed": 1 },
      "results": [
        { "friendUserId": "674f1...", "status": "sent", "invitationId": "675a1..." },
        { "friendUserId": "674f2...", "status": "sent", "invitationId": "675a2..." },
        { "friendUserId": "674f3...", "status": "failed", "error": "ALREADY_IN_ROOM" }
      ],
      "roomCurrentlyFull": false
    }
  }
  ```

### 3.2 Authenticated Pending Invitations Inbox
- **Route:** `GET /api/friends/invitations/pending`
- **Middleware:** `requireAuth`
- **Query:** `RoomInvitationModel.find({ recipientId: req.user.id, status: 'active', revokedAt: null, expiresAt: { $gt: now } })`
- **Filtering:** Filters out invitations whose room has closed (`status: 'closed'`).
- **Response (`PendingInvitationsResponseDto`):**
  ```json
  {
    "success": true,
    "message": "Pending invitations retrieved successfully",
    "data": {
      "items": [
        {
          "id": "675a1...",
          "roomId": "674e1...",
          "room": {
            "id": "674e1...",
            "name": "Tokyo Neon Lounge",
            "category": "karaoke",
            "visibility": "private",
            "capacity": 8,
            "currentParticipantsCount": 3,
            "status": "open",
            "atmospherePreset": "cyberpunk",
            "host": {
              "id": "674d1...",
              "username": "host_user",
              "displayName": "Host",
              "avatar": "https://..."
            }
          },
          "inviter": {
            "id": "674d1...",
            "username": "host_user",
            "displayName": "Host",
            "avatar": "https://..."
          },
          "expiresAt": "2026-11-17T01:50:00.000Z",
          "createdAt": "2026-11-15T01:50:00.000Z"
        }
      ],
      "total": 1
    }
  }
  ```
- **Security:** Zero raw tokens, zero token hashes, zero private song leakage.

### 3.3 Recipient-Only Invitation Dismissal
- **Route:** `POST /api/friends/invitations/:id/dismiss`
- **Middleware:** `requireAuth`
- **Authorization & Atomicity:**
  - Validates `invitation.recipientId.toString() === req.user.id` (403 `FORBIDDEN_NOT_RECIPIENT`).
  - Idempotent: If already revoked/dismissed, immediately returns 200 with `{ success: true, invitationId, status: 'revoked' }`.
  - Atomic conditional update:
    ```typescript
    RoomInvitationModel.findOneAndUpdate(
      { _id: invitationObjectId, recipientId: recipientObjectId, status: 'active', revokedAt: null },
      { $set: { status: 'revoked', revokedAt: new Date() } },
      { new: true }
    );
    ```

### 3.4 Dual-Credential Private Room Join
- **Route:** `POST /api/rooms/:id/join`
- **Middleware:** `requireAuth`
- **Payload (`JoinRoomWithInviteSchema`):**
  - `{ inviteToken?: string; invitationId?: string }`
  - Mutual Exclusivity: If both `inviteToken` and `invitationId` are passed, rejected with 400 Bad Request (`Cannot provide both inviteToken and invitationId`).
- **Validation Paths:**
  - `invitationId` path:
    Calls `invitationService.validateRecipientInvitationById(invitationId, roomId, req.user.id)`:
    - Loads record by primary key `_id`.
    - Confirms `invitation.roomId === roomId`.
    - Confirms `invitation.recipientId === req.user.id` (fail-closed identity binding).
    - Confirms `status === 'active' && !revokedAt && expiresAt > now`.
  - `inviteToken` path:
    Calls `invitationService.validateInvitation(inviteToken, roomId, req.user.id)`:
    - Hashes token using SHA-256.
    - Confirms matching active invitation record and recipient binding if recipientId exists.
- **Capacity & Lifecycle:** Once invitation credentials pass, execution continues through the existing atomic capacity increment (`$inc: { currentParticipantsCount: 1 }`) and membership creation in `room.service.ts`.

---

## 4. Rate Limiting Architecture

Implemented via `HostBatchInviteRateLimiter` in `friendship.service.ts`:
- **Scope:** Keyed on `hostUserId` (`req.user.id`).
- **Jitter & Burst Protection:** Minimum 5 seconds between consecutive batch requests for the same host.
- **Recipient Volume Cap:** Sliding window tracking timestamps of invited recipients; maximum 60 invitations per rolling 10-minute window.
- **Batch Size Cap:** Maximum 20 recipients per request enforced by Zod schema.
- **Multi-Tab Immunity:** Because limits are stored per authenticated `hostUserId` (not client IP or socket ID), opening multiple browser tabs or devices cannot circumvent the limits.

---

## 5. Database Index Declaration & Operational Notes

### 5.1 Schema Declaration
In `apps/api/src/modules/rooms/invitation.model.ts`:
```typescript
RoomInvitationSchema.index(
  { recipientId: 1, status: 1, expiresAt: 1 },
  { name: 'idx_room_invitations_recipient_status_expires' }
);
```

### 5.2 Operational Index Verification & Creation Guide
Under the **Strict Code-Only Policy**, index creation was not executed against the live database during development.

**Instructions for Production Operators:**
When deploying to staging or production, verify whether MongoDB `autoIndex` is enabled. If `autoIndex` is disabled in production (recommended practice), create the index explicitly in MongoDB:
```javascript
db.roominvitations.createIndex(
  { recipientId: 1, status: 1, expiresAt: 1 },
  { name: "idx_room_invitations_recipient_status_expires", background: true }
);
```
To verify the index:
```javascript
db.roominvitations.getIndexes();
```

---

## 6. Security & Reliability Review

| Threat / Risk | Mitigation Mechanism in Phase 1 |
| :--- | :--- |
| **Unauthorized Host Invitation** | Authoritative check `room.ownerId.toString() === req.user.id` enforced before any invitation creation. |
| **Non-Member Host Attempt** | Explicit membership check `RoomMembershipModel.findOne({ roomId, userId, status: 'active' })` prevents absent hosts from inviting. |
| **Non-Friend Invitation Attempt** | Batch friendship lookup filters any recipient without an `accepted` friendship status with caller. |
| **Self-Invitation** | Explicit rejection `CANNOT_INVITE_SELF` if `friendUserIds` contains `req.user.id`. |
| **Duplicate Recipients in Batch** | Deterministic in-memory deduplication `Array.from(new Set(friendUserIds))` prevents duplicate creations. |
| **Duplicate Active Invitations** | Existing active invitation for `(roomId, recipientId)` is revoked atomically prior to new invitation insertion. |
| **Cross-Recipient `invitationId` Access** | Fail-closed comparison `invitation.recipientId.toString() !== requestingUserId` returns `INVITATION_RECIPIENT_MISMATCH`. |
| **Token Hash Leakage** | `toJSON` transform on `RoomInvitationModel` strips `tokenHash`. Inbox endpoint only returns clean public DTOs. |
| **Raw Token Storage** | Raw bearer tokens are never stored in plaintext. Offline delivery relies strictly on authenticated `invitationId` inbox. |
| **Dual Credential Ambiguity** | Zod refinement and controller reject requests supplying both `inviteToken` and `invitationId`. |
| **Capacity Exhaustion** | Atomic capacity reservation (`findOneAndUpdate` with `$expr: { $lt: ['$currentParticipantsCount', '$capacity'] }`) remains authoritative. |

---

## 7. Static Verification Results

Verification commands executed:

1. **Shared Contracts Build:**
   ```bash
   pnpm --filter @ktv/contracts build
   ```
   *Result:* ESM (`49.28 KB`), CJS (`68.74 KB`), and DTS (`304.80 KB`) generated cleanly in 1.6s.

2. **TypeScript Static Typecheck:**
   ```bash
   pnpm typecheck
   ```
   *Result:* Zero errors across all 3 monorepo packages (`@ktv/contracts`, `@ktv/api`, `@ktv/web`).

3. **ESLint Code Quality Check:**
   ```bash
   pnpm lint
   ```
   *Result:* Zero warnings or errors across all packages.

---

## 8. Known Limitations & Technical Debt Preservation

1. **HIST-01 Preservation:** Stale/abandoned room cleanup remains an unautomated operational technical debt (**HIST-01**). Closed room checks in `getPendingInvitationsForRecipient` ensure that closed rooms are filtered from the inbox even if abandoned.
2. **HIST-03 Preservation:** Single-node in-memory tracking is retained without Redis for presence and batch rate limiting.
3. **No UI in Phase 1:** In accordance with the Phase 1 scope, no frontend components or visual dialogs were modified beyond reconciling `invitation-notification-listener.tsx` with the updated contract.

---

## 9. Final Phase 1 Verdict

**Verdict:**
### **PHASE 1 COMPLETE — STATIC VERIFICATION PASSED**

*(Note: In accordance with the strict Code-Only Development Policy, static typecheck and linting passed completely. Runtime behavior in production/staging has not been executed or claimed).*
