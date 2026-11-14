# KTVOnline — Sprint 5.7.1.1: Phase 1 Independent Source-Level Security & Integrity Audit
## Shared Contracts & Social Invitation Foundation

**Audit Document Version:** 1.0.0  
**Audit Target Commit:** `7f12209b5a862beb1655d5b9581296caca714786`  
**Parent Baseline Commit:** `3e137644e345253f720866704b6ba70ae342cfc9`  
**Audit Mode:** Read-Only Source Inspection (Strict Code-Only Development Policy)  
**Database Target:** `test` (Preserved)

---

## 1. Executive Summary

An independent source-level security, architecture, and regression audit was conducted on **Sprint 5.7 Phase 1: Shared Contracts & Social Invitation Foundation** at commit `7f12209`.

Phase 1 introduced the backend and shared contracts required for social karaoke invitations:
- `POST /api/friends/invite-lounge-batch/:roomId` (Batch friend invitations)
- `GET /api/friends/invitations/pending` (Authenticated recipient invitation inbox)
- `POST /api/friends/invitations/:id/dismiss` (Recipient-only invitation dismissal)
- `POST /api/rooms/:id/join` (Dual-credential private room join supporting both `inviteToken` and `invitationId`)
- Additive compound index `{ recipientId: 1, status: 1, expiresAt: 1 }`
- Shared Zod schemas in `@ktv/contracts`

### Audit Outcome
The audit confirms that Sprint 5.7 Phase 1 adheres strictly to KTVOnline's security and social integrity standards. All authorization checks, recipient-bound identity verifications, rate-limiting policies, and privacy masking rules were independently verified directly in the source code.

**Final Audit Verdict:**
### **AUDIT PASSED WITH LIMITATIONS — PHASE 2 APPROVED CONDITIONALLY**

**Summary of Limitations:**
1. Single-node in-memory rate limiting is retained without Redis (consistent with technical debt **HIST-03**).
2. Automated abandoned room cleanup remains unautomated (consistent with technical debt **HIST-01**).
3. The compound index declaration requires operational execution in environments where MongoDB `autoIndex` is disabled.

---

## 2. Repository & Baseline Integrity

### 2.1 Commit Ancestry & Working Tree Verification
- **Verified HEAD:** `7f12209b5a862beb1655d5b9581296caca714786`
- **Parent Commit:** `3e137644e345253f720866704b6ba70ae342cfc9` (`docs(sprint-5.7.1): establish pre-implementation architecture clarifications and update planning report`)
- **Working Tree:** Clean (`git status` reports zero uncommitted files).
- **Target Implementation Files Inspected:**
  1. `apps/api/src/modules/friends/friendship.controller.ts`
  2. `apps/api/src/modules/friends/friendship.routes.ts`
  3. `apps/api/src/modules/friends/friendship.service.ts`
  4. `apps/api/src/modules/rooms/invitation.model.ts`
  5. `apps/api/src/modules/rooms/invitation.service.ts`
  6. `apps/api/src/modules/rooms/room.controller.ts`
  7. `apps/api/src/modules/rooms/room.service.ts`
  8. `apps/web/src/features/friends/components/invitation-notification-listener.tsx`
  9. `packages/contracts/src/friendship.ts`
  10. `packages/contracts/src/invitation.ts`

---

## 3. Detailed Audit Findings by Capability

### 3.1 Audit A — Batch Invitation Security (`POST /api/friends/invite-lounge-batch/:roomId`)

The entire execution graph (`route -> middleware -> controller -> service -> model -> realtime`) was audited:

```
[HTTP Request]
       │
       ▼
[friendship.routes.ts:52] ──> requireAuth (JWT verification & active user check in MongoDB)
       │
       ▼
[friendship.controller.ts:304] ──> Zod parse: BatchLoungeInviteSchema
       │
       ▼
[friendship.service.ts:756] ──> inviteLoungeBatch
       │
       ├─► 1. Authenticate host caller (hostUserId validation)
       ├─► 2. Validate roomId and friendUserIds (1..20 ObjectIds)
       ├─► 3. In-memory deduplication of friendUserIds
       ├─► 4. Reject self-invitation: CANNOT_INVITE_SELF
       ├─► 5. Load Room (1 query) ──> Reject closed (ROOM_CLOSED) or locked (ROOM_LOCKED)
       ├─► 6. Authoritative host check: room.ownerId === hostUserId (FORBIDDEN_NOT_HOST)
       ├─► 7. Active host membership check: RoomMembershipModel.findOne (HOST_NOT_ACTIVE_MEMBER)
       ├─► 8. HostBatchInviteRateLimiter check (1 batch / 5s; max 60 / 10m)
       ├─► 9. Batch friendship query: FriendshipModel.find (1 query)
       ├─► 10. Batch room membership query: RoomMembershipModel.find (1 query)
       ├─► 11. Recipient-isolated creation loop (invitationService.createFriendInvitation)
       ├─► 12. Socket.IO notification to online recipient only
       └─► 13. Return structured partial failure result: BatchLoungeInviteResultDto
```

#### Detailed Verification Checklist:
1. **Mandatory Authentication:** Enforced by `requireAuth` middleware (`friendship.routes.ts:52`) and verified in controller (`friendship.controller.ts:306`) and service (`friendship.service.ts:764`). **PASSED.**
2. **Server-Derived Caller Identity:** `hostUserId` is sourced strictly from `req.user.id` (populated by `requireAuth`). Client payload cannot supply or spoof host identity. **PASSED.**
3. **Authoritative Room Ownership:** Verified against database record: `room.ownerId.toString() !== hostUserId` returns 403 `FORBIDDEN_NOT_HOST` (`friendship.service.ts:813`). **PASSED.**
4. **Active Host Membership:** Verified against database record: `RoomMembershipModel.findOne({ roomId, userId: hostUserId, status: 'active' })` (`friendship.service.ts:818`). If absent, returns 403 `HOST_NOT_ACTIVE_MEMBER`. **PASSED.**
5. **Closed Rooms Rejected:** `room.status === 'closed'` returns 400 `ROOM_CLOSED` (`friendship.service.ts:803`). **PASSED.**
6. **Locked Rooms Rejected:** `room.isLocked === true` returns 400 `ROOM_LOCKED` (`friendship.service.ts:808`). **PASSED.**
7. **Database Friendship Validation:** Single batch query `FriendshipModel.find({ pairKey: { $in: pairKeys }, status: 'accepted' })` (`friendship.service.ts:840`). Non-friends fail with reason `'NOT_FRIENDS'`. **PASSED.**
8. **Self-Invitation Rejected:** `if (uniqueRecipientIds.includes(hostUserId))` returns 400 `CANNOT_INVITE_SELF` (`friendship.service.ts:792`). **PASSED.**
9. **Deduplication:** `Array.from(new Set(friendUserIds.map((id) => id.trim())))` (`friendship.service.ts:789`). **PASSED.**
10. **Recipient ID Validation:** Iterates and validates `Types.ObjectId.isValid(id.trim())` for every entry (`friendship.service.ts:782`). Malformed entries return 400 `INVALID_RECIPIENT_ID`. **PASSED.**
11. **Active Room Membership Handling:** Single batch query `RoomMembershipModel.find({ roomId, userId: { $in: targetObjectIds }, status: 'active' })` (`friendship.service.ts:851`). Active members fail with reason `'ALREADY_IN_ROOM'`. **PASSED.**
12. **Idempotent Pending Invitation Handling:** In `invitationService.createFriendInvitation` (`invitation.service.ts:131`), any prior active invitation for that specific `(roomId, friendObjectId)` is revoked before new insertion. **PASSED.**
13. **Recipient Isolation:** Every recipient receives an independent 192-bit token and distinct `RoomInvitation` document bound to their `recipientId`. **PASSED.**
14. **Cross-Recipient Revocation Immunity:** `updateMany` filter strictly includes `recipientId: friendObjectId`. Inviting friend A cannot revoke friend B's invitation. **PASSED.**
15. **Side-Effect-Free Pre-Authorization:** All authorization checks (steps 1–10) complete prior to any invitation creation or database writes. **PASSED.**
16. **Accurate Partial Success Representation:** Returns HTTP 200 with `{ summary: { total, sent, failed }, results: [...] }`. Each recipient receives a stable machine-readable status (`sent` or `failed`) and reason (`NOT_FRIENDS`, `ALREADY_IN_ROOM`, `CREATION_FAILED`). **PASSED.**
17. **Targeted Realtime Notifications:** Socket.IO dispatch `emitFriendInvitationReceived(io, recipientId, payload)` routes exclusively to `user:${recipientId}` channel. Zero room broadcasts. **PASSED.**

---

### 3.2 Audit B — Invitation Inbox Privacy (`GET /api/friends/invitations/pending`)

- **Authentication:** Enforced by `requireAuth` (`friendship.routes.ts:42`).
- **Recipient Scoping:** Database query is hard-scoped to `recipientId: new Types.ObjectId(req.user.id)` (`invitation.service.ts:503`). Users cannot query or inspect other users' inboxes.
- **Status & Expiry Filtering:** Query condition requires `{ status: 'active', revokedAt: null, expiresAt: { $gt: now } }`.
- **Closed Room Filtering:** Memory filter explicitly removes invitations for closed rooms (`invitation.service.ts:520`).
- **Privacy Masking & Credential Leakage Prevention:**
  - `tokenHash` is omitted from projection and stripped by Mongoose `toJSON`.
  - Raw bearer tokens are never stored and cannot be returned.
  - Room metadata is restricted to public display properties (`name, category, visibility, capacity, currentParticipantsCount, status, atmospherePreset, host`). Song queues, chat history, and attendee rosters are not leaked.
- **Unbounded Response Protection:** Query capped with `.limit(50)`.
- **Deterministic Sort:** `.sort({ createdAt: -1 })`.
- **Compound Index Alignment:** The declared index `{ recipientId: 1, status: 1, expiresAt: 1 }` directly covers the equality filters (`recipientId`, `status`) and range filter (`expiresAt`).

---

### 3.3 Audit C — Invitation Dismissal (`POST /api/friends/invitations/:id/dismiss`)

- **Authentication:** Enforced by `requireAuth` (`friendship.routes.ts:47`).
- **Recipient-Only Authorization:** Verified in `invitation.service.ts:585`:
  ```typescript
  if (!invitation.recipientId || invitation.recipientId.toString() !== recipientUserId) {
    return { success: false, error: 'FORBIDDEN_NOT_RECIPIENT' };
  }
  ```
- **Atomic Conditional Mutation:**
  ```typescript
  await RoomInvitationModel.findOneAndUpdate(
    { _id: invitationObjectId, recipientId: recipientObjectId, status: 'active', revokedAt: null },
    { $set: { status: 'revoked', revokedAt: new Date() } },
    { new: true }
  );
  ```
  Guarantees that dismissal cannot race or corrupt state.
- **Idempotency:** If the invitation is already revoked/dismissed, `dismissInvitationByRecipient` returns `{ success: true }`, which maps to HTTP 200 `{ success: true, invitationId, status: 'revoked' }`.

#### Status Semantics Evaluation:
The audit evaluated whether reusing `status: 'revoked'` for recipient dismissal introduces semantic ambiguity versus adding a new status `'dismissed'`.
- *Finding:* All existing verification points (`previewInvitation`, `validateInvitation`, `validateRecipientInvitationById`, and `getPendingInvitationsForRecipient`) treat `revoked` and `revokedAt != null` as terminal invalidation.
- *Recommendation:* Keeping `status: 'revoked'` is correct, requires zero database migrations, avoids enum fragmentation, and guarantees fail-closed behavior across all existing access paths. Actor semantics are distinguished by comparing `revokedAt` against `recipientId` context.

---

### 3.4 Audit D — Dual-Credential Private Room Join (`POST /api/rooms/:id/join`)

The complete join pipeline in `room.service.ts` and `room.controller.ts` was audited:

```
[Client POST /api/rooms/:id/join]
             │
             ├─► Both inviteToken AND invitationId present? ──> Reject 400 Bad Request
             │
             ├─► inviteToken present?
             │     └─► validateInvitation(rawToken) via SHA-256 hash lookup
             │
             ├─► invitationId present?
             │     └─► validateRecipientInvitationById(invitationId) via primary key lookup:
             │           ├─► Verifies invitation.recipientId === authenticatedUserId
             │           ├─► Verifies status === 'active' && !revokedAt && expiresAt > now
             │           └─► Verifies invitation.roomId === roomId
             │
             └─► Neither present for private room? ──> Reject 403 PRIVATE_ROOM
```

#### Detailed Lifecycle & Concurrency Audit:
1. **Mutual Exclusivity:** Verified at three distinct layers:
   - Zod schema refinement: `JoinRoomWithInviteSchema.refine(...)`.
   - Controller guard: `if (inviteToken && invitationId) sendError(res, ..., 400)` (`room.controller.ts:127`).
   - Service guard: `if (inviteToken && invitationId) return { error: 'AMBIGUOUS_INVITATION_CREDENTIALS' }` (`room.service.ts:366`).
2. **Public Token Flow Intact:** The `inviteToken` path continues to hash with SHA-256 and validates public bearer tokens and recipient-bound tokens without regression.
3. **Fail-Closed Recipient Binding in `invitationId` Path:**
   ```typescript
   if (!invitation.recipientId || invitation.recipientId.toString() !== requestingUserId) {
     return { valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
   }
   ```
   If an invitation has `recipientId: null` (public link), attempting to pass its `_id` as an `invitationId` is rejected. Public link invitations must use `inviteToken`.
4. **Capacity Reservation Atomicity:**
   Invitation validation does not reserve capacity. Capacity is strictly reserved atomically by the existing `RoomModel.findOneAndUpdate` with `$expr: { $lt: ['$currentParticipantsCount', '$capacity'] }` (`room.service.ts:446`).
5. **Membership Idempotency:**
   Active members rejoining receive `{ success: true, alreadyJoined: true }` without duplicate capacity increments or duplicate memberships.

---

### 3.5 Audit E — `HostBatchInviteRateLimiter`

- **Host Isolation:** Memory store is keyed by `hostUserId` (`req.user.id`).
- **Burst Protection:** Minimum 5 seconds between batch requests per host (`friendship.service.ts:47`).
- **Recipient Cap:** Sliding window enforces maximum 60 invited recipients per rolling 10-minute window (`friendship.service.ts:58`).
- **Batch Size Cap:** Schema enforces maximum 20 recipients per request (`BatchLoungeInviteSchema`).
- **Order of Evaluation:** Rate limit check is evaluated after room ownership check but before batch friendship and membership lookups (`friendship.service.ts:829`), preventing computational abuse.
- **Quota Accounting:** Quota is consumed only for successfully invited recipients via `recordBatch(hostUserId, sentCount)` (`friendship.service.ts:940`).
- **Multi-Tab Immunity:** Because keys are server-side `hostUserId` values from verified JWTs, opening multiple browser tabs cannot bypass the rate limit.

---

### 3.6 Audit F — Shared Contracts & API Integrity

- **Zod Schema Alignment:** `@ktv/contracts` exports `BatchLoungeInviteSchema`, `BatchLoungeInviteResultSchema`, `PendingInvitationItemSchema`, `PendingInvitationsResponseSchema`, `DismissInvitationResponseSchema`, and `JoinRoomWithInviteSchema`.
- **Package Verification:** Rebuilt via `tsup` into ESM, CJS, and DTS bundles without errors.
- **Field Consistency:** DTO schemas enforce strict string IDs and ISO 8601 timestamps.
- **Informational Capacity:** `roomCurrentlyFull` in `BatchLoungeInviteResultDto` is confirmed purely informational; it does not block invitation creation or reserve capacity.

---

### 3.7 Audit G — Database & Operational Safety

- **Compound Index Declaration:** Declared in `apps/api/src/modules/rooms/invitation.model.ts:77`:
  ```typescript
  RoomInvitationSchema.index(
    { recipientId: 1, status: 1, expiresAt: 1 },
    { name: 'idx_room_invitations_recipient_status_expires' }
  );
  ```
- **Name Determinism:** Explicitly named `idx_room_invitations_recipient_status_expires`.
- **Database Non-Mutation:** No database write, connection, or migration was executed during Phase 1.
- **Operational Requirement:** Documented in Section 5 below.

---

## 4. Audit Findings Register

| Finding ID | Severity | File & Lines | Category | Summary & Recommendation | Phase 2 Blocker? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUD-5.7.1-01** | Low | `invitation.service.ts:131-152` | Concurrency Observation | **Concurrent Multi-Batch Insertion Race:** `createFriendInvitation` executes `updateMany` to revoke prior active invitations followed by `create`. In the theoretical event of two simultaneous requests for the exact same recipient at the exact same millisecond, two active documents could temporarily exist. Mitigated in practice by `HostBatchInviteRateLimiter` (5s inter-batch delay per host) and unique `(roomId, userId)` membership constraints. Recommended for future schema migration: partial unique index on `{ roomId: 1, recipientId: 1 }` where `status: 'active'`. | **No** |
| **AUD-5.7.1-02** | Informational | `friendship.service.ts:38-84` | Resource Management | **In-Memory Rate Limiter Map Pruning:** `HostBatchInviteRateLimiter` does not actively prune inactive host entries from `this.hosts`. Although memory footprint per host is minimal (~60 bytes), an automated hourly sweep or LRU eviction should be added for long-running processes. | **No** |
| **AUD-5.7.1-03** | Informational | `invitation.service.ts:580-610` | Status Semantics | **Reused Revoked Status for Dismissal:** Confirming that `status: 'revoked'` and `revokedAt: Date` correctly represent recipient dismissal without requiring database migrations or breaking query invariants. | **No** |

---

## 5. Operational Requirements for Staging & Production

1. **Compound Index Verification:**
   In environments where MongoDB `autoIndex` is disabled, staging/production database administrators must verify or create the index explicitly:
   ```javascript
   db.roominvitations.createIndex(
     { recipientId: 1, status: 1, expiresAt: 1 },
     { name: "idx_room_invitations_recipient_status_expires", background: true }
   );
   ```
2. **Single-Node Rate Limiter Awareness:**
   `HostBatchInviteRateLimiter` operates in Node.js process memory. In a multi-node horizontal deployment, limits are enforced per instance (aligned with technical debt **HIST-03**).

---

## 6. Regression Verification

- **Sprint 5.0 Public Link Invitations:** Verified intact.
- **Sprint 5.0 Private Lounge Invitations:** Verified intact.
- **Sprint 5.6 Recipient-Bound Invitations:** Verified intact.
- **Sprint 5.6.1.2 Fail-Closed Identity Enforcement (`AUD-INV-01`):** Verified intact in both `validateInvitation` and `validateRecipientInvitationById`.
- **Sprint 5.6.1.3 Social Integrity Guarantees:** Verified intact.
- **Canonical Technical Debt Register (`HIST-01` through `HIST-07`):** Preserved and open.

---

## 7. Static Verification Results

All checks passed cleanly under the read-only audit:

- **Contracts Build:** `pnpm --filter @ktv/contracts build` (ESM: 49.28 KB, CJS: 68.74 KB, DTS: 304.80 KB in 1.6s).
- **TypeScript Static Typecheck:** `pnpm typecheck` passed with 0 errors across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`.
- **ESLint Code Quality Check:** `pnpm lint` passed with 0 warnings or errors across the monorepo.

---

## 8. Final Audit Verdict

### **AUDIT PASSED WITH LIMITATIONS — PHASE 2 APPROVED CONDITIONALLY**

**Condition for Phase 2:**
Phase 2 UI development (`useFriendActivity`, `FriendActivitySection`, `StartSocialSessionDialog`) may proceed against the verified Phase 1 API endpoints and shared contracts. Staging deployment must follow the operational index verification requirement.
