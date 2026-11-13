# KTVOnline — Sprint 4.0 Phase 3: Implementation Report
## Database Retention & Outbox Lifecycle (INT-02)

**Date:** November 2026  
**Baseline Commit:** `d66dc95fed5ce5d496e6761bc227560da4ea92bb` (Sprint 4.0 Phase 2 HEAD)  
**Milestone:** Sprint 4.0 — Phase 3: Database Retention & Outbox Lifecycle  
**Status:** Audit Complete — Policy Approval Required  
**Database Name:** `test` (Preserved)

---

## 1. Executive Summary & Audit Context

In Sprint 4.0 Phase 0 Architecture Audit, item **INT-02** was characterized as:
> *"RoomStateOutboxModel, RoomMessageModel, and RoomActivityModel lack automated TTL indexing or scheduled archiving. Implement 30-day TTL index."*

Phase 3 performed a rigorous, line-by-line inspection of all 13 Mongoose models, their database indexes, write pathways, and read consumers.

### Major Audit Findings:
1. **Factual Correction to Phase 0 Report:**
   - Both `RoomMessageModel` and `RoomActivityModel` **already possessed TTL indexes** in the source code (added during Sprint 2.1 / 2.1.1):
     - `RoomMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });` (30 days)
     - `RoomActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });` (7 days)
   - `RoomStateOutboxModel` also already possessed a TTL index:
     - `RoomStateOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });` (7 days)
2. **Critical Outbox Safety Defect Discovered (INT-02A):**
   - The existing outbox index operated indiscriminately on `{ createdAt: 1 }`.
   - **Pending, unbroadcast, or failed outbox records were subject to permanent deletion 7 days after creation**, destroying delivery and audit guarantees.
3. **Data Safety Remediation:**
   - Immediately fixed INT-02A by replacing the generic `{ createdAt: 1 }` TTL with an explicit, safe `expiresAt` Date field and `partialFilterExpression: { expiresAt: { $type: 'date' } }`.
   - Pending and failed events now have `expiresAt: null` and are **never deleted**.
4. **Policy Approval Gate:**
   - In accordance with the project directives (*"Do not introduce arbitrary retention periods or destructive TTL indexes without product approval"*), automated deletion policies for chat, activity logs, and completed queue items are presented as structured policy options awaiting formal product-owner decision.

---

## 2. Comprehensive Collection Lifecycle Audit

| Collection / Model | Schema Fields & Types | Current Indexes in Source | Write Pathways | Read Consumers | Lifecycle & Dependencies | Assessment & Decision |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`RoomStateOutboxModel`** | `roomId`, `version`, `eventId`, `type`, `payload`, `publishedAt`, `expiresAt`, `attemptCount`, `lastError`, timestamps | - `{ roomId: 1, version: 1 }` (unique)<br/>- `{ publishedAt: 1, createdAt: 1 }`<br/>- `{ expiresAt: 1 }` (partialFilter for dates) | `room-state.publisher.ts:publishRoomStateEvent` | `room-state.publisher.ts:retryPendingOutboxEvents`, `getOutboxEventsSince` | Durable store for versioned room state transitions. Used for client snapshot recovery and replay. | **CONFIRMED DEFECT (INT-02A):** Fixed now. Replaced unsafe `{ createdAt: 1 }` TTL with selective `expiresAt` TTL. |
| **`RoomMessageModel`** | `roomId`, `senderId`, `senderUsername`, `senderAvatar`, `senderRole`, `content`, `messageType`, `clientMessageId`, `deletedAt`, `deletedBy`, `reactions`, timestamps | - `{ roomId: 1, createdAt: -1, _id: -1 }`<br/>- `{ roomId: 1, senderId: 1, clientMessageId: 1 }` (unique partial)<br/>- `{ createdAt: 1 }` (expireAfterSeconds: 2592000) | `chat.service.ts:sendMessage`, `deleteMessage`, `toggleReaction` | `chat.service.ts:getMessages` (cursor pagination) | Lounge text chat history and system notices. Deletion terminates cursor pagination cleanly. | **PRODUCT POLICY REQUIRED (INT-02B):** 30-day TTL exists in code. Awaiting product decision on moderation/abuse retention. |
| **`RoomActivityModel`** | `roomId`, `type`, `actor`, `target`, `message`, `metadata`, `createdAt` | - `{ roomId: 1, createdAt: -1 }`<br/>- `{ createdAt: 1 }` (expireAfterSeconds: 604800) | `chat.service.ts:recordActivity` (joins, leaves, kicks, mutes, roles, cheers, gifts) | `chat.service.ts:getActivities` | Lounge activity timeline. Ephemeral cheer events vs. critical moderation kick/mute records. | **PRODUCT POLICY REQUIRED (INT-02C):** 7-day TTL purges kick/mute audit logs. Proposal submitted for tiered retention. |
| **`RoomQueueItemModel`** | `roomId`, `songId`, `requestedBy`, `singer`, `position`, `status`, `queueVersion`, `addedAt`, `startedAt`, `completedAt`, `removedAt`, timestamps | - `{ roomId: 1, status: 1, position: 1 }`<br/>- `{ roomId: 1, requestedBy: 1, status: 1 }`<br/>- `{ roomId: 1, status: 1 }` (unique for `playing`) | `karaoke.service.ts`: queue additions, handoffs, skips, removals | `karaoke.service.ts`: `getQueue` (only queries `queued`, `playing`), `advanceToNextTrack` | Completed, skipped, and removed songs accumulate indefinitely. | **ARCHITECTURAL RISK (INT-02D):** Unbounded historical growth. Proposal submitted for completed track archival/TTL. |
| **`VoiceEvictionTaskModel`** | `targetType`, `targetId`, `roomId`, `attemptCount`, `status`, `claimedBy`, `leaseExpiresAt`, `nextAttemptAt`, timestamps | - `{ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 }`<br/>- `{ updatedAt: 1 }` (expireAfterSeconds: 86400, `partialFilter: { status: 'completed' }`) | `voice.service.ts`, `voice-eviction.worker.ts` | `voice-eviction.worker.ts:claimNextTask` | Asynchronous participant LiveKit WebRTC token revocation and eviction tasks. | **NO FIX REQUIRED (INT-02E):** Exemplary safe design. Only completed tasks are purged; pending/failed are preserved. |
| **`VoiceWebhookEventModel`** | `eventId`, `eventType`, `roomName`, `status`, `claimedBy`, `leaseExpiresAt`, timestamps | - `{ eventId: 1 }` (unique)<br/>- `{ createdAt: 1 }` (expireAfterSeconds: 86400) | `voice-webhook.service.ts:handleWebhook` | `voice-webhook.service.ts` | Idempotent deduplication store for LiveKit media server webhook delivery. | **NO FIX REQUIRED:** 24-hour deduplication window is bounded and appropriate. |
| **`VoiceParticipantSequenceModel`**| `participantKey`, `lastEventTimestampMs`, `lastEventPrecedence`, timestamps | - `{ participantKey: 1 }` (unique)<br/>- `{ updatedAt: 1 }` (expireAfterSeconds: 86400) | `voice-participant-sequence.model.ts:assertMonotonicEventOrder` | Webhook event processing | Monotonic WebRTC arrival/departure ordering tracker. | **NO FIX REQUIRED:** Automatically purged 24h after participant leaves. |
| **`SessionModel`** | `userId`, `tokenHash`, `familyId`, `isRevoked`, `expiresAt`, timestamps | - `{ tokenHash: 1 }` (unique)<br/>- `{ expiresAt: 1 }` (expireAfterSeconds: 0)<br/>- `{ familyId: 1, isRevoked: 1 }` | `auth.service.ts:createSession`, `revokeSession` | `auth.service.ts:validateRefreshToken` | User refresh token sessions. | **NO FIX REQUIRED:** Clean TTL on explicit expiration timestamp (`expiresAt`). |
| **`RoomMembershipModel`** | `roomId`, `userId`, `role`, `status`, `isMuted`, `joinedAt`, `leftAt`, `kickedAt`, timestamps | - `{ roomId: 1, userId: 1 }` (unique partial for `active`)<br/>- `{ userId: 1, status: 1 }`<br/>- `{ roomId: 1, status: 1, joinedAt: 1 }` | `room.service.ts`, `membership.service.ts` | `getRoom`, `getMembers`, authorization middleware | Persistent membership and moderation ban tracking (`kickedAt`). | **NO FIX REQUIRED:** Must NOT have TTL. Deleting kicked memberships would allow banned users to bypass bans. |
| **`RoomPlaybackStateModel`** | `roomId`, `currentQueueItemId`, `status`, `playbackVersion`, `queueVersion`, `leaseToken`, timestamps | - `{ roomId: 1 }` (unique)<br/>- `{ playbackExpiresAt: 1 }` | `karaoke.service.ts`, `karaoke-playback.worker.ts` | `getPlaybackState`, authoritative workers | Authoritative karaoke playback lease and version state. Exactly 1 document per room. | **NO FIX REQUIRED:** Strictly bounded to `O(Number of Rooms)`. Zero unbounded growth. |
| **`RoomModel`** | `name`, `type`, `status`, `ownerId`, `currentParticipantsCount`, `stateVersion`, timestamps | - `{ ownerId: 1 }`<br/>- `{ status: 1 }`, etc. | `room.service.ts` | Room discovery, lobby, lounge entry | Core room entities. Closed rooms have `status: 'closed'`. | **NO FIX REQUIRED:** Lifecycle tied to room closure. Archival is an application-level feature. |
| **`UserModel`** | `username`, `email`, `passwordHash`, `profile`, timestamps | - `{ username: 1 }` (unique)<br/>- `{ email: 1 }` (unique) | `user.service.ts`, `auth.service.ts` | Authentication, profiles, member cards | Persistent user account and profile identity. | **NO FIX REQUIRED:** Permanent user account store. |
| **`SongModel`** | `title`, `artist`, `durationMs`, `audioAvailability`, timestamps | - `{ title: 1, artist: 1 }`, etc. | `song.service.ts` (fixtures and catalog sync) | Song catalog browsing, queue selection | Static fixture song catalog. | **NO FIX REQUIRED:** Curated song database. |

---

## 3. Outbox Lifecycle & Safety Remediation (INT-02A)

### 3.1 Defect Analysis
In `apps/api/src/modules/rooms/outbox.model.ts`, the previous schema declared:
```typescript
// Unsafe index: pruned historical outbox records after 7 days based on createdAt
RoomStateOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
```
This index created a critical failure mode:
1. When an outbox event is created, `publishedAt` is initialized to `null`.
2. If the Socket.IO cluster was temporarily disconnected, or an unhandled broadcast error occurred, the event remained `publishedAt: null`.
3. Exactly 7 days after `createdAt`, MongoDB's asynchronous TTL monitor deleted the document.
4. If a client subsequently requested state recovery (`getOutboxEventsSince`) or a worker attempted retry sweeps (`retryPendingOutboxEvents`), the event was permanently lost.

### 3.2 Invariants Enforced
- **Invariant 1 (Pending Protection):** Pending events (`publishedAt === null`) must never expire.
- **Invariant 2 (Failure Recovery):** Failed or retryable events (`lastError !== null`) must remain available indefinitely for manual/automated triage.
- **Invariant 3 (Active Processing Safety):** Events currently undergoing retry must not disappear mid-execution.
- **Invariant 4 (Conclusive Delivery Gate):** Only events with confirmed, successful subscriber publication receive an expiration date.
- **Invariant 5 (Deterministic Expiration):** Expiration is computed explicitly as `publishedAt + 7 days`, never derived from document creation time.

### 3.3 Implemented Remediation

1. **Schema Update ([`outbox.model.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/outbox.model.ts)):**
   - Added `expiresAt: { type: Date, default: null, index: true }`.
   - Replaced `{ createdAt: 1 }` TTL with:
     ```typescript
     RoomStateOutboxSchema.index(
       { expiresAt: 1 },
       {
         expireAfterSeconds: 0,
         partialFilterExpression: { expiresAt: { $type: 'date' } },
       }
     );
     ```
2. **Publish Pathway Update ([`room-state.publisher.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room-state.publisher.ts#L68-L75)):**
   - On initial insert: `expiresAt: null`.
   - On broadcast failure: `expiresAt: null`.
   - On broadcast success:
     ```typescript
     const publishedAt = new Date();
     const expiresAt = new Date(publishedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
     await RoomStateOutboxModel.updateOne(
       { roomId: new Types.ObjectId(roomId), version },
       { $set: { publishedAt, expiresAt }, $inc: { attemptCount: 1 } }
     ).exec();
     ```
3. **Retry Pathway Update ([`room-state.publisher.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room-state.publisher.ts#L140-L150)):**
   - On successful retry: sets `record.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)`.
   - On retry failure: ensures `record.expiresAt = null`.

---

## 4. Product Policy Decisions & Open Questions

The following decisions require explicit sign-off from Product Management and Trust & Safety before automatic deletion is implemented:

### 4.1 Decision 1: Chat Message Retention Policy (`RoomMessageModel`)
- **Current Technical Reality:** 30-day TTL index on `{ createdAt: 1 }` is active in code.
- **Trade-offs:**
  - *Shorter retention (e.g. 7 days):* Maximizes user privacy; minimizes storage in high-volume public lounges.
  - *Medium retention (30 days — Current):* Allows users to review recent lounge chat; covers standard community reporting windows.
  - *Tiered retention:* 7 days for public rooms, 90 days for private/host lounges.
- **Open Questions for Product Owner:**
  1. Does KTVOnline consider chat messages strictly ephemeral to the karaoke session?
  2. Are room hosts permitted to archive or export chat logs?
  3. What is the required window for users to flag or report abusive messages after a session ends?

### 4.2 Decision 2: Moderation Activity Log Retention (`RoomActivityModel`)
- **Current Technical Reality:** 7-day TTL index on `{ createdAt: 1 }` purges all activity indiscriminately.
- **Problem:** Host moderation actions (`member_kicked`, `member_muted`, `member_role_updated`) are purged after 7 days, leaving no historical audit trail for platform administrators.
- **Recommended Policy:**
  - **Option A (Filter Exemption):** Update `RoomActivityModel` TTL index to only purge non-moderation events:
    `partialFilterExpression: { type: { $nin: ['member_kicked', 'member_muted', 'member_role_updated'] } }`.
  - **Option B (Dedicated Moderation Collection):** Introduce a permanent `RoomModerationAuditModel` for compliance and support investigations.

### 4.3 Decision 3: Karaoke Queue History Retention (`RoomQueueItemModel`)
- **Current Technical Reality:** Completed, skipped, and failed tracks remain in `RoomQueueItemModel` indefinitely.
- **Trade-offs:**
  - *Unbounded growth:* Over months of high usage, millions of dead queue items accumulate.
  - *Future feature conflict:* If Product introduces "Recently Sung Songs" or "Room Highlights", purging completed queue items would destroy historical song metadata.
- **Recommended Policy:**
  - If song history features are approved for Sprint 4.x / 5.0: Retain completed tracks, index on `{ completedAt: -1 }`.
  - If queue is purely ephemeral: Implement a 14-day TTL index on `{ completedAt: 1 }` for non-active statuses (`completed`, `skipped`, `removed`, `failed`).

---

## 5. Files Changed

| File Path | Nature of Change | Description |
| :--- | :--- | :--- |
| [`apps/api/src/modules/rooms/outbox.model.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/outbox.model.ts) | Model / Index | Added `expiresAt` Date field; replaced unsafe `createdAt` TTL with selective `expiresAt` TTL index with `partialFilterExpression`. |
| [`apps/api/src/realtime/room-state.publisher.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room-state.publisher.ts) | Service | Updated `publishRoomStateEvent` and `retryPendingOutboxEvents` to assign `expiresAt` only upon confirmed delivery. |
| [`docs/SPRINT_4_0_INTEGRATION_AUDIT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_4_0_INTEGRATION_AUDIT.md) | Documentation | Appended complete `INT-02 — Database Retention & Outbox Lifecycle Audit` section. |
| [`docs/SPRINT_4_0_PHASE_3_IMPLEMENTATION_REPORT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_4_0_PHASE_3_IMPLEMENTATION_REPORT.md) | Documentation | Created this comprehensive implementation and audit report. |

---

## 6. Static Validation Results

In accordance with the Code-Only Development Policy, non-runtime static verification was executed across the monorepo:

### 6.1 TypeScript Type Checking (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit (Done in 1.0s)
apps/api typecheck$ tsc --noEmit (Done in 2.1s)
apps/web typecheck$ tsc --noEmit (Done in 2.5s)
Result: SUCCESS (0 errors across all workspaces)
```

### 6.2 Code Style & Linting (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/ (Done in 718ms)
apps/api lint$ eslint src/ (Done in 1.1s)
apps/web lint$ next lint (Done in 2.1s)
Result: SUCCESS (✔ No ESLint warnings or errors)
```

---

## 7. Deferred Operational Verification Backlog (10 Scenarios)

Under the Code-Only Development Policy, live database migrations and runtime deletions are strictly deferred. The following 10 scenarios must be verified in a staging environment:

1. **Pending Outbox Survival:** Create an outbox event with `publishedAt: null`. Verify that simulating time advancement past 7 days does not trigger MongoDB TTL deletion.
2. **Failed Outbox Recovery:** Create an outbox record with `lastError: 'Simulated failure'` and `expiresAt: null`. Verify it remains available for retry.
3. **Published Outbox Expiration:** Publish a room state event successfully. Verify `expiresAt` is set to exactly `publishedAt + 7 days` and document is eligible for TTL deletion after that timestamp.
4. **Outbox Worker Non-Interference:** Verify that running `retryPendingOutboxEvents()` concurrently with outbox creation does not produce lock contention or duplicate version publishes.
5. **Concurrent Cleanup Execution:** Verify that MongoDB TTL thread runs cleanly in parallel with API HTTP traffic without impacting transaction commit latency.
6. **Chat Cursor Pagination across Boundaries:** Verify that requesting chat messages near the 30-day boundary returns `hasMore: false` cleanly without client exceptions.
7. **Activity Feed Continuity:** Verify that the frontend `RoomActivityTimeline` handles deleted historical activity entries without breaking the event stream.
8. **Cleanup Failure Isolation:** Verify that database maintenance or TTL index rebuilds do not block karaoke playback precision timers.
9. **TTL Partial Filter Evaluation:** Confirm via MongoDB `explain()` that the TTL index scan only indexes documents matching `{ expiresAt: { $type: 'date' } }`.
10. **Collection Growth Observability:** Establish Prometheus / CloudWatch metrics tracking document count and storage size for `roomstateoutboxes`, `messages`, and `roomqueueitems`.

---

## 8. Final Verdict

**`AUDIT COMPLETE — POLICY APPROVAL REQUIRED`**
