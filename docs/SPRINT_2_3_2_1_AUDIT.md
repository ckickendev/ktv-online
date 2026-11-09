# Sprint 2.3.2.1 — Source-Code Audit: Voice Concurrency & Lifecycle Verification

## 1. Audit Scope & Executive Summary

This targeted source-code audit evaluated the distributed concurrency, lease fencing, token lifecycle, and session revocation coverage implemented in Sprint 2.3.2 for the **KTVOnline** platform.

The audit focused strictly on four areas without rewriting working infrastructure:
1. **Area A: Durable Webhook Ordering & Idempotency**
2. **Area B: Eviction Worker Lease Fencing**
3. **Area C: LiveKit Token Renewal & Reconnect Lifecycle**
4. **Area D: Complete Session Revocation Coverage**

### Source Files Inspected

- [voice-participant-sequence.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-participant-sequence.model.ts)
- [voice-webhook-event.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook-event.model.ts)
- [voice-webhook.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts)
- [voice-eviction-task.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-eviction-task.model.ts)
- [voice-eviction.worker.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-eviction.worker.ts)
- [voice.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts)
- [auth.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts)
- [user.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/users/user.service.ts)
- [room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts)
- [socket.server.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/socket.server.ts)
- [use-voice-client.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts)
- [apps/web/package.json](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/package.json)
- [apps/api/package.json](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/package.json)

---

## 2. Audit Findings by Severity

### 2.1 High Severity Findings

#### Finding A-1: Non-Atomic Monotonic Sequence Update Race Window
- **Location**: [voice-participant-sequence.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-participant-sequence.model.ts#L54-L68)
- **Impact**: High (Stale events could overwrite newer state).
- **Description**: `assertMonotonicEventOrder` previously executed a `findOne` followed by an unconditional `findOneAndUpdate`. If two webhook deliveries for the same participant were handled concurrently by two API instances (e.g. Worker 1 with timestamp $T_1 = 100$ and Worker 2 with timestamp $T_2 = 200$), both workers could execute `findOne` before either updated the database. Worker 2 would write $T_2$, and immediately afterwards Worker 1 would overwrite the document with $T_1$. This inverted monotonic ordering, allowing older participant events to overwrite newer participant state.
- **Remediation**: Replaced read-then-write logic with a single atomic conditional `findOneAndUpdate` filter:
  `{ participantKey, $or: [ { lastEventTimestampMs: { $lt: eventTimestampMs } }, { lastEventTimestampMs: eventTimestampMs, lastEventPrecedence: { $lt: incomingPrecedence } } ] }`.
  Initial document creation is handled via `create` catching MongoDB duplicate key error code `11000` to retry the conditional update atomically.

#### Finding B-1: Missing Lease Fencing Token in Background Eviction Worker
- **Location**: [voice-eviction-task.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-eviction-task.model.ts), [voice-eviction.worker.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-eviction.worker.ts#L99-L191)
- **Impact**: High (Stale worker could overwrite newer worker's state).
- **Description**: While `claimNextTask` applied a 30-second lease, it did not issue a unique cryptographic lease token or monotonic lease version. When `executeTask` finished in `voice-eviction.worker.ts`, it called `await task.save()` unconditionally. If Worker A experienced a network pause or long GC pause (>30s) such that its lease expired and Worker B reclaimed and advanced the task, Worker A would awaken and call `task.save()`, overwriting Worker B's state without validating that it still held an active lease.
- **Remediation**:
  1. Added `leaseToken: string | null` and `leaseVersion: number` to `IVoiceEvictionTask` and `VoiceEvictionTaskSchema`.
  2. In `claimNextTask`, generated a unique UUID `leaseToken` and incremented `leaseVersion`.
  3. Added `VoiceEvictionTaskModel.updateTaskOutcome(taskId, leaseToken, outcome)` using an atomic conditional update matching `{ _id: taskId, leaseToken, status: 'processing' }`.
  4. If the update matches 0 documents (lease expired/preempted), the worker discards the stale update and logs a warning.

#### Finding A-2: Non-Atomic Reclaiming of Expired/Failed Webhook Events
- **Location**: [voice-webhook-event.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook-event.model.ts#L118-L124)
- **Impact**: High (Concurrent API instances could double-claim the same expired webhook lease).
- **Description**: When reclaiming an expired lease or previously failed event, `claimEvent` loaded `existing` and called `await existing.save()`. Two concurrent API instances receiving a retried webhook delivery could both observe `existing.leaseExpiresAt <= now` and both execute `.save()`, causing both instances to process the event concurrently.
- **Remediation**: Implemented atomic conditional update `findOneAndUpdate({ eventId, $or: [{ status: 'failed' }, { status: 'processing', leaseExpiresAt: { $lte: now } }] }, { $set: { status: 'processing', claimedBy, claimedAt, leaseExpiresAt } }, { new: true })`.

---

### 2.2 Medium Severity Findings

#### Finding A-3: Lack of Deterministic Tie-Breaking for Equal Event Timestamps
- **Location**: [voice-participant-sequence.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-participant-sequence.model.ts)
- **Impact**: Medium (Departure and arrival within the same second had non-deterministic resolution).
- **Description**: LiveKit webhook timestamps are delivered with second precision (Unix seconds). When a user disconnected and rapidly reconnected within the same second, both `participant_left` and `participant_joined` possessed identical `createdAt` values. Without deterministic tie-breaking, whichever event arrived second in MongoDB would overwrite the first.
- **Remediation**: Introduced deterministic event type precedence ranking:
  - `participant_left`: Precedence 2 (terminal lifecycle event takes precedence over join).
  - `participant_joined`: Precedence 1 (initial arrival takes precedence over unspecified events).
  - default/other: Precedence 0.
  When timestamps are identical, the event with higher precedence wins; lower or equal precedence events are rejected as stale.

#### Finding C-1: Unbounded Reconnection and Incomplete Disconnect Lifecycle
- **Location**: [use-voice-client.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts)
- **Impact**: Medium (Transport disconnect left client in disconnected state without recovery; or unbounded reconnect loop if network failed).
- **Description**: On `RoomEvent.Disconnected`, if the disconnect was unexpected (network dropped or LiveKit media server rebooted), the client was set to `disconnected` and participants cleared without an automated, bounded recovery attempt. Furthermore, if a reconnect mechanism were added without exponential backoff or authorization checks, it could spin in an unbounded retry loop.
- **Remediation**:
  1. Implemented bounded reconnect (`MAX_RECONNECT_ATTEMPTS = 3`) with exponential backoff ($2\text{s}, 4\text{s}, 8\text{s}$, capped at $10\text{s}$).
  2. Reconnect requires mandatory backend re-authorization (`voiceApi.getVoiceToken`) before instantiating a new `Room`. If authorization fails (e.g. kicked or session revoked while disconnected), it immediately halts and sets state to `unauthorized`.
  3. Bounded attempts exhaust after 3 failures, transitioning state to `failed` with clear user messaging.
  4. Explicit leave (`isExplicitLeaveRef.current`) halts and cancels all background reconnect timers.

#### Finding A-4: Potential Timestamp Unit Magnitude Mismatch
- **Location**: [voice-webhook.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts#L98)
- **Impact**: Medium (Timestamp multiplied by 1000 could produce invalid dates if provider delivered milliseconds).
- **Description**: `Number(event.createdAt) * 1000` assumed LiveKit always delivered seconds. If a provider webhook payload delivered millisecond timestamps (> 1e11), multiplying by 1000 would cause astronomical year 53000 timestamps.
- **Remediation**: Added timestamp magnitude normalization: if `rawCreatedAt > 1e11`, it is preserved as milliseconds; if `rawCreatedAt > 0`, it is multiplied by 1000; otherwise falls back to `Date.now()`.

---

### 2.3 Low Severity & Informational Findings

#### Finding A-5: Fallback Event ID Collision Resistance
- **Location**: [voice-webhook.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts#L34-L52)
- **Impact**: Low (Collision edge-case if LiveKit omitted official `id` on simultaneous track events).
- **Description**: The deterministic hash fallback concatenated `[event, createdAt, room, participant]`. For track events where multiple tracks are published in the same second, this could yield identical fallback hashes.
- **Remediation**: Included `event.track?.sid || event.egressInfo?.egressId || ''` in the hash payload and increased hex digest slice to 32 characters.

#### Finding D-1: Complete Session Revocation Verification
- **Location**: [auth.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts), [user.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/users/user.service.ts), [room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts)
- **Impact**: Informational (Confirmed 100% centralized coverage).
- **Verification**: Audited all session and user modification points across the codebase. Verified that:
  - Explicit logout calls `authService.logout(token)` -> `authService.revokeSessionFamily`.
  - Refresh token reuse detection calls `authService.revokeSessionFamily(revokedSession.familyId, 'REFRESH_TOKEN_REPLAY')`.
  - User suspension and deactivation in `userService.update` call `authService.revokeUserSessions`.
  - Room member kicks in `roomService.kickMember` evict room sockets and call `voiceService.evictLiveKitParticipant`.
  - Room closures in `roomService.closeRoom` call `voiceService.closeLiveKitRoom`.
  - Session-family isolation is preserved: `revokeSessionFamily` only targets sessions matching the specific `familyId`. Other active sessions for the same user remain unaffected.
  - All eviction failures reliably persist a task in `VoiceEvictionTaskModel` for background worker recovery.

---

## 3. Detailed Area-by-Area Verification Checklist

### Area A: Durable Webhook Ordering & Idempotency
- [x] **Deterministic Event ID Generation**: Uses official `event.id` if present; fallback hashes event type, timestamp, room, participant, and track/egress IDs into a 32-character SHA-256 hex digest.
- [x] **Timestamp Source & Precision Documented**: Documented Unix timestamp normalization handling both second and millisecond representations into integer milliseconds.
- [x] **Deterministic Equal Timestamp Handling**: Resolved via `getEventTypePrecedence` (`participant_left: 2`, `participant_joined: 1`, `default: 0`).
- [x] **Atomic Sequence Updates**: Single atomic `findOneAndUpdate` with monotonic filter; no read-then-write race window.
- [x] **No Overwriting of Newer Participant State**: Conditional filter rejects any incoming event with an older timestamp or equal timestamp with lower precedence.
- [x] **Reconnection & Identity Reuse**: Reconnected participants reuse existing opaque session ID if active within the room; new connections generate isolated opaque IDs.
- [x] **Duplicate Delivery Protection**: Deduplicated via `VoiceWebhookEventModel.claimEvent` with MongoDB unique index on `eventId`.
- [x] **Multi-Instance Event Claiming Fenced**: Expired and failed lease re-claims use atomic conditional `findOneAndUpdate` preventing concurrent worker bypass.

### Area B: Eviction Worker Lease Fencing
- [x] **Unique Lease Token / Monotonic Version**: Every claim generates a cryptographically random UUID `leaseToken` and increments `leaseVersion`.
- [x] **Task Updates Validate Current Lease Owner**: All status transitions (`completed`, `retry_scheduled`, `failed_permanent`) execute via `VoiceEvictionTaskModel.updateTaskOutcome` requiring matching `_id` and `leaseToken`.
- [x] **Expired Workers Cannot Overwrite Newer Results**: If a worker takes longer than 30s and another worker claims the task, `updateTaskOutcome` matches 0 documents; stale updates are discarded.
- [x] **Abandoned Tasks Reclaimable**: `claimNextTask` queries `{ status: 'processing', leaseExpiresAt: { $lte: now } }` to reclaim abandoned tasks.
- [x] **Concurrent Workers Cannot Claim Same Active Lease**: Atomic `findOneAndUpdate` ensures exactly one worker claims an eligible task.
- [x] **Shutdown Behavior Preserves Task Integrity**: Worker stop waits up to 5 seconds for in-flight tasks; unfinished tasks remain in `processing` until their lease expires and is reclaimed on reboot.
- [x] **Retry Exhaustion Preserves Tasks**: Tasks reaching `maxAttempts` (5) transition to `failed_permanent`. Partial TTL index excludes `failed_permanent`, ensuring they are never deleted by MongoDB.
- [x] **Failed Tasks Observable & Recoverable**: Structured critical logging alerts operators; tasks are manually recoverable by resetting `status: 'pending'`.

### Area C: LiveKit Token Renewal & Reconnect Lifecycle
- [x] **Supported Public SDK APIs Only**: Uses official `livekit-client` v2.23.0 APIs (`new Room(...)`, `room.connect()`, `room.disconnect()`, `RoomEvent.*`). Zero private properties or undocumented internals accessed.
- [x] **New Tokens via Backend Authorization**: Every reconnect and proactive renewal requests a fresh token through `voiceApi.getVoiceToken`.
- [x] **Explicit Leave Prevents Background Reconnect**: `isExplicitLeaveRef.current` and generation counter `sessionGenRef.current` abort all background timers immediately.
- [x] **Session Revocation Prevents Reconnect**: Backend token route verifies active session family and room membership; returns 401/403/revoked/kicked which immediately aborts reconnection and sets `unauthorized`.
- [x] **Generation Fencing Blocks Stale Operations**: Increments `sessionGenRef.current` on leave or reconnect; callbacks verify generation before applying state.
- [x] **Multiple Renewal Requests Coalesced**: `isRenewingRef.current` flag prevents concurrent overlapping refresh requests.
- [x] **Bounded Reconnect Without Unbounded Loops**: Reconnect is strictly capped at `MAX_RECONNECT_ATTEMPTS = 3` with exponential backoff ($2\text{s}, 4\text{s}, 8\text{s}$); transitions to `failed` upon exhaustion.
- [x] **Hardware & Audio Cleanup**: Stops all local audio tracks (`pub.track.stop()`) to release microphone hardware; removes remote `<audio>` elements from DOM.

### Area D: Complete Session Revocation Coverage
- [x] **Centralized Revocation in AuthService**: `revokeSessionFamily` and `revokeUserSessions` serve as single authoritative entry points.
- [x] **Synchronous Socket Invalidation**: Disconnects matched socket sessions with `SESSION_REVOKED` error code.
- [x] **LiveKit Voice Eviction**: Synchronously calls `voiceService.evictLiveKitSessionFamily` or `evictUserFromAllRooms`.
- [x] **Durable Eviction Task Creation on Provider Failure**: Catches LiveKit failures and calls `recordPendingEviction` to persist a task in `VoiceEvictionTaskModel`.
- [x] **Prevention of New Voice Token Issuance**: `voiceService.generateVoiceToken` validates active unrevoked session family, active room membership, active user status, and non-kicked status before issuing JWT.
- [x] **Session-Family Isolation Preserved**: Revoking a single session family (`familyId`) leaves other active sessions belonging to the same user intact.
