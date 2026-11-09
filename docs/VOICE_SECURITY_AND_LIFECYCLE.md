# Voice Security & Lifecycle Hardening Specification (Sprint 2.3.2)

## 1. Executive Overview

This document specifies the distributed voice security, lifecycle hardening, and provider failure handling architecture implemented across **Sprint 2.3.1** and **Sprint 2.3.2** for **KTVOnline**.

While Sprint 2.3 introduced the initial LiveKit WebRTC voice capability, and Sprint 2.3.1 introduced session family mapping and audio-only grants, **Sprint 2.3.2** hardens the architecture for distributed and resilient production:
1. **Durable Webhook Idempotency**: Replaced in-memory caches with MongoDB-backed atomic event claiming (`VoiceWebhookEventModel`) and monotonic timestamp sequence tracking (`VoiceParticipantSequenceModel`).
2. **Security-Critical Eviction Reliability**: Upgraded task lifecycle to a 5-state machine with atomic leasing, bounded exponential retries, and partial TTL filtering that guarantees unresolved security evictions (`failed_permanent`) are **never silently deleted**.
3. **Private Metadata Separation**: Stripped internal `familyId` and `tabId` from client-visible LiveKit participant metadata; private mappings remain strictly server-side.
4. **Supported Token Refresh Strategy**: Eliminated reliance on undocumented SDK internals (`room.engine.token`) in favor of supported token state management and re-authorization reconnects.
5. **Centralized Session Revocation**: Wired every session revocation pathway (logout, token replay, user suspension, account deactivation) to synchronous socket disconnects and recoverable voice evictions.
6. **Backend-Controlled Participant Identity**: Derives opaque participant session IDs on the backend (`${userId}_vps_${opaqueSessionId}`), preventing client tab collision and identity reuse.

---

## 2. Invariants & Security Boundaries

1. **Persistent Room Occupancy Invariant**:
   `Room.currentParticipantsCount === count(active RoomMembership records)`.
   LiveKit voice presence is purely ephemeral and **never** mutates persistent room occupancy.
2. **Independent Voice Presence**:
   Joining or leaving voice modifies zero database records. Leaving voice does not revoke room membership; conversely, revoking room membership or kicking immediately severs voice authorization and triggers provider eviction.
3. **Session-Family Scoped Invalidation**:
   Voice sessions are bound to the authenticated user's session family (`familyId`). Revoking a session family (e.g. explicit logout or refresh-token reuse detection) invalidates and evicts only voice sessions associated with that specific family, leaving other concurrent session families of the same user unaffected.
4. **Authoritative Backend Control**:
   The backend derives room names, participant identities, and source-publishing grants. Clients can neither supply arbitrary identities nor claim permissions beyond microphone audio.
5. **Durable Provider Failure Recovery**:
   Persistent room membership and session revocation decisions commit first. LiveKit API failures never roll back database transactions. Unsuccessful evictions are recorded in a durable task queue (`VoiceEvictionTaskModel`) and recovered with exponential backoff.
6. **Zero Secret Exposure**:
   LiveKit API keys, secrets, and raw tokens are never logged or leaked to unauthorized clients.

---

## 3. Participant Metadata & Identity Architecture

### 3.1 Public vs. Private Metadata Separation

```
+---------------------------------------------------------------------------------------------------------+
| Express Backend / In-Memory Registry (VoiceSessionRegistry)                                             |
|                                                                                                         |
|   participantIdentity = `${userId}_vps_${participantSessionId}`                                         |
|                                                                                                         |
|   ActiveVoiceSession {                                                                                  |
|     identity: string;               // e.g. "65f01..._vps_a1b2c3d4e5f6"                                 |
|     participantSessionId: string;   // Opaque backend-generated ID                                      |
|     userId: string;                 // KTVOnline user ID                                                |
|     roomId: string;                 // KTVOnline room ID                                                |
|     familyId: string;               // Session family ID (STRICTLY PRIVATE)                             |
|     tabHint?: string;               // Client tab hint for session reuse (STRICTLY PRIVATE)             |
|     createdAt: Date;                                                                                    |
|     lastRenewedAt: Date;                                                                                |
|   }                                                                                                     |
+---------------------------------------------------------------------------------------------------------+
        |                                                        |
        v                                                        v
+-------------------------------+               +-------------------------------------------------------+
| LiveKit Room JWT Claims       |               | Signed LiveKit Public Metadata (Client-Visible)       |
|                               |               |                                                       |
| {                             |               | {                                                     |
|   "sub": "userId_vps_...",    |               |   "userId": "65f...",                                 |
|   "video": {                  |               |   "username": "MiaSingz",                             |
|     "room": "ktv_room_...",   |               |   "displayName": "Mia Singer",                        |
|     "canPublishSources":      |               |   "avatarUrl": "https://..."                          |
|       ["microphone"]          |               | }                                                     |
|   }                           |               |                                                       |
| }                             |               | * NOTE: familyId, tabHint, and security flags         |
+-------------------------------+               |   are EXCLUDED to prevent credential leakage          |
                                                +-------------------------------------------------------+
```

### 3.2 Backend-Controlled Identity Lifecycle
- Format: `${userId}_vps_${participantSessionId}`.
- `userId` is extracted strictly from verified JWT token context.
- `participantSessionId` is generated using `crypto.randomUUID().replace(/-/g, '').slice(0, 12)`.
- **Session Reuse on Renewal**: When a client requests renewal with `tabId`, `voiceSessionRegistry.findExistingSession(roomId, userId, tabId)` identifies the active session and reuses the assigned `participantIdentity`, preventing duplicate participant instances.
- **Kicked/Revoked Invalidation**: Once kicked or revoked, old participant identities are unregistered and rejected from token generation.

---

## 4. Distributed Webhook Processing & Idempotency

### 4.1 Processing Sequence

```
LiveKit Cloud                      Express API (Instance A)               MongoDB
     |                                        |                              |
     | 1. POST /api/v1/webhooks/livekit       |                              |
     |--------------------------------------->|                              |
     |                                        | 2. Verify HMAC Signature     |
     |                                        |    via WebhookReceiver       |
     |                                        | 3. Compute deterministic ID  |
     |                                        | 4. claimEvent(eventId)       |
     |                                        |----------------------------->|
     |                                        |    (Atomic findOneAndUpdate) |
     |                                        |<-----------------------------|
     |                                        |    { claimed: true/false }   |
     |                                        |                              |
     |                                        | [If already completed/leased]|
     | 5. HTTP 200 { duplicate: true }        |    (Skip side effects)       |
     |<---------------------------------------|                              |
     |                                        |                              |
     |                                        | 6. Monotonic Ordering Check  |
     |                                        |    assertMonotonicEventOrder |
     |                                        |----------------------------->|
     |                                        |<-----------------------------|
     |                                        |    { isMonotonic: true/false}|
     |                                        |                              |
     |                                        | 7. Apply Ephemeral Effects   |
     |                                        |    (e.g. closed-room evict)  |
     |                                        | 8. Mark event 'completed'    |
     |                                        |----------------------------->|
     | 9. HTTP 200 { received: true }         |                              |
     |<---------------------------------------|                              |
```

### 4.2 Durable Deduplication Model (`VoiceWebhookEventModel`)
- **Collection**: `voicewebhookevents`.
- **Unique Index**: `eventId: 1`.
- **Lease Mechanism**: `claimedBy`, `claimedAt`, `leaseExpiresAt: Date` (30-second default).
- If two API instances receive the same webhook concurrently, only one atomically acquires the claim. The second receives `{ claimed: false, isDuplicate: true }` and returns HTTP 200 without duplicate execution.
- If an instance crashes while processing, the 30-second lease expires, allowing another instance or retry to reclaim and process the event.
- **TTL Retention**: Completed events expire after 24 hours.

### 4.3 Monotonic Ordering Across Instances (`VoiceParticipantSequenceModel`)
- **Collection**: `voiceparticipantsequences`.
- **Unique Index**: `participantKey: 1` (`${roomName}:${participantIdentity}`).
- **Sequence Field**: `lastEventTimestampMs`.
- If a delayed `participant_joined` event arrives with a timestamp older than an already-processed `participant_left` event, `assertMonotonicEventOrder` detects the regression atomically and drops the stale event.
- Prevents out-of-order provider deliveries from resurrecting departed participants.

---

## 5. Security-Critical Eviction Task Reliability

### 5.1 Task State Machine

```
                      +-------------------+
                      |      pending      |<----------------------+
                      +---------+---------+                       |
                                |                                 |
                                | claimNextTask()                 |
                                v                                 |
                      +-------------------+                       |
                      |    processing     |                       |
                      +----+---------+----+                       |
                           |         |                            |
          Provider Success |         | Provider Transient Failure |
                           v         v (attempts < maxAttempts)   |
             +---------------+     +--------------------+         |
             |   completed   |     |  retry_scheduled   |---------+
             +---------------+     +---------+----------+ (nextAttemptAt)
                     |                       |
          24h TTL    |                       | Provider Terminal / Max Attempts
          Purge      v                       v
                  (Purged)         +--------------------+
                                   |  failed_permanent  |
                                   +--------------------+
                                             |
                                   * NEVER Purged by TTL
                                   * Operator Visible Alert
```

### 5.2 Atomic Task Leasing & Worker Lifecycle
- `VoiceEvictionWorker` runs on every API instance, polling every 10 seconds.
- Uses `VoiceEvictionTaskModel.claimNextTask(instanceId, leaseDurationMs = 30000)`:
  - Atomically claims ready `pending` or `retry_scheduled` tasks (`nextAttemptAt <= now`).
  - Automatically reclaims abandoned `processing` tasks whose lease expired (`leaseExpiresAt <= now`).
- Multiple workers never execute the same eviction concurrently.
- Bounded exponential backoff: 2s, 4s, 8s, 16s... capped at 60s.
- **Permanent Failure Retention**:
  - Universal TTL was removed.
  - Partial TTL index applies strictly to `{ status: 'completed' }`.
  - Unresolved tasks (`failed_permanent`) are **never deleted**.
- **Graceful Shutdown**:
  - `server.ts` registers `voiceEvictionWorker.stop()` on `SIGTERM` and `SIGINT`.
  - Halts new task polling and awaits in-flight provider calls with a 5-second timeout.

### 5.3 Operator Recovery Procedure for `failed_permanent` Tasks
When a security task reaches `failed_permanent` (e.g. LiveKit API credentials misconfigured during eviction), structured logs alert operators:
```json
{
  "taskId": "673...",
  "targetType": "user",
  "targetId": "65f...",
  "roomId": "65f...",
  "attempts": 5,
  "status": "failed_permanent",
  "msg": "CRITICAL: Exhausted max retries for voice eviction task. Marked failed_permanent for operator intervention"
}
```
**Operator Steps**:
1. Query failed tasks in MongoDB:
   ```javascript
   db.voiceevictiontasks.find({ status: 'failed_permanent' })
   ```
2. Diagnose LiveKit connectivity or room status.
3. Manually retry the task:
   ```javascript
   db.voiceevictiontasks.updateOne(
     { _id: ObjectId("673...") },
     { $set: { status: 'pending', attemptCount: 0, nextAttemptAt: new Date() } }
   )
   ```
   The background worker will claim and execute it on the next sweep cycle.

---

## 6. Complete Session Revocation Coverage

### 6.1 Centralized Revocation Architecture
All session revocations are centralized in `AuthService`:
- `revokeSessionFamily(familyId, reason)`: Scoped to a specific session family.
- `revokeUserSessions(userId, reason)`: Scoped to all session families of a user.

| Revocation Pathway | Trigger Point | Sessions Affected | Socket.IO Scope | Voice Eviction Scope |
| :--- | :--- | :--- | :--- | :--- |
| **User Logout** | `POST /api/v1/auth/logout` | Single `familyId` | Sockets matching `familyId` | LiveKit participants matching `familyId` |
| **Token Replay** | `POST /api/v1/auth/refresh` | Single `familyId` | Sockets matching `familyId` | LiveKit participants matching `familyId` |
| **Account Suspension** | `userService.update(id, { status: 'suspended' })` | All families for `userId` | All sockets matching `userId` | All rooms where user is active |
| **Account Deactivation** | `userService.update(id, { status: 'deactivated' })` | All families for `userId` | All sockets matching `userId` | All rooms where user is active |
| **Host Kick** | `POST /api/v1/rooms/:id/members/:userId/kick` | Room membership | Room socket channel | Room LiveKit participant |
| **Room Closure** | `POST /api/v1/rooms/:id/close` | Room active state | Entire room socket channel | Entire LiveKit room deleted |

### 6.2 Guaranteed Task Enqueueing
If the synchronous LiveKit API call encounters a network blip during revocation:
1. The database revocation transition commits first.
2. `recordPendingEviction` persists a task to `VoiceEvictionTaskModel`.
3. `voiceEvictionWorker` executes bounded retries until confirmed.

---

## 7. Supported LiveKit Token Refresh Strategy

### 7.1 SDK Assessment (`livekit-client` v2.23.0)
- `livekit-client` v2.23.0 does not offer a public `room.updateToken()` method on the `Room` class.
- Sprint 2.3.1's direct mutation of `room.engine.token` has been removed.

### 7.2 Implemented Client Lifecycle
1. **Proactive Background Authorization**:
   At 80% of TTL (approx. 4 minutes), `useVoiceClient` calls `voiceApi.getVoiceToken(roomId, { tabId })`.
2. **Token Storage**:
   The refreshed token is stored in `latestTokenRef.current`.
3. **Reconnection Verification**:
   When LiveKit emits `RoomEvent.Reconnected`, the client immediately re-validates authorization against `POST /api/v1/rooms/:roomId/voice/token`.
   - If authorization succeeded: updates `latestTokenRef.current` and schedules the next renewal timer.
   - If authorization failed (e.g. kicked or session revoked while offline): transitions state to `unauthorized` and invokes `leaveVoice()`.
4. **Explicit Leave Protection**:
   `isExplicitLeaveRef.current` tracks intentional leaves. Once a user clicks "Leave Voice", all timers are cleared and no background reconnection can occur.

---

## 8. Single-Instance and Multi-Instance Guarantees

| Concern | Single-Instance Behavior | Multi-Instance Behavior (Shared MongoDB) |
| :--- | :--- | :--- |
| **Webhook Deduplication** | Guaranteed via MongoDB unique index on `eventId` | Guaranteed via MongoDB unique index on `eventId` |
| **Webhook Ordering** | Guaranteed via `VoiceParticipantSequenceModel` | Guaranteed across all instances via monotonic atomic updates |
| **Eviction Task Claiming**| Claimed sequentially | Atomically claimed via `findOneAndUpdate` lease; no duplicate runs |
| **Eviction Worker Failover**| Worker restarts on process restart | Healthy instances reclaim tasks if an instance dies during processing |
| **Session Registry** | In-memory lookup + LiveKit metadata fallback | LiveKit participant query provides ground truth across instances |

---

## 9. Verification Summary Checklist

- [x] Webhook processing persisted and deduplicated across restarts via MongoDB.
- [x] Monotonic event ordering enforced across horizontal API instances.
- [x] Eviction tasks use 5-state machine (`pending`, `processing`, `retry_scheduled`, `completed`, `failed_permanent`).
- [x] Atomic task claiming with 30s lease expiration and abandoned task recovery.
- [x] Partial TTL index applied strictly to completed eviction tasks; failed tasks preserved.
- [x] Background worker starts at API boot and shuts down gracefully on SIGTERM/SIGINT.
- [x] Public metadata separated from private session family and tab identifiers.
- [x] Backend derives opaque participant session IDs (`${userId}_vps_${id}`).
- [x] Direct assignment to `room.engine.token` removed in favor of supported token state management.
- [x] All session revocation pathways centralized and wired to socket and voice eviction.
- [x] Static typecheck and linting pass with 0 errors across monorepo.
