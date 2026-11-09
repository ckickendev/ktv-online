# Sprint 2.3.2 — Voice Reliability & Distributed Lifecycle Hardening Audit

## 1. Executive Summary

This audit assesses the LiveKit voice infrastructure implemented across Sprint 2.3 and Sprint 2.3.1 for **KTVOnline**.
The objective of Sprint 2.3.2 is targeted reliability and distributed security hardening:
1. Making LiveKit webhook processing safe across process restarts and multiple horizontal API instances.
2. Ensuring unresolved security-critical voice eviction tasks are never silently dropped or purged by TTL expiration.
3. Removing internal session-family identifiers and tab identifiers from client-visible LiveKit participant metadata.
4. Replacing undocumented LiveKit SDK internals with a supported token-refresh and reconnect strategy.
5. Auditing and centralizing every session-revocation pathway across the backend.
6. Enforcing backend-controlled participant session identity generation and multi-tab isolation.

In accordance with the mandatory code-only policy, this audit reviews the actual codebase, installed package versions, database models, and service lifecycles without running tests or production builds.

---

## 2. Architecture & Infrastructure Assessment

### 2.1 Monorepo Architecture
- **API Server** (`apps/api`): Node.js 22, Express 4.21, TypeScript 5.8, Mongoose 8.10.
- **Frontend** (`apps/web`): Next.js 15.2, React 19, TypeScript 5.8, `livekit-client` 2.23.0, `@livekit/components-react` 2.9.25.
- **Shared Contracts** (`packages/contracts`): Zod schemas and TypeScript DTOs.
- **Realtime**: Socket.IO 4.8 for chat, room state, and application events; LiveKit for WebRTC audio transport.
- **Persistence**: MongoDB. **Redis is NOT present in the monorepo**. All durable state must reside in MongoDB.

### 2.2 Invariants to Preserve
1. `Room.currentParticipantsCount === count(active RoomMembership records)`.
2. LiveKit voice presence never changes persistent room occupancy.
3. Leaving voice does not revoke room membership.
4. Revoking membership immediately blocks voice authorization.
5. Session revocation invalidates corresponding established voice sessions.
6. Kick and room closure permanently prevent voice access.
7. LiveKit provider failures never roll back persistent database transitions.
8. Socket.IO remains independent of LiveKit.
9. Backend authorization remains authoritative.
10. Never expose LiveKit secrets or raw credentials to unauthorized clients.

---

## 3. LiveKit SDK Version & Capability Verification

### 3.1 Backend: `livekit-server-sdk` (v2.19.2)
- **`AccessToken.addGrant()`**: Supports `canPublishSources: [TrackSource.MICROPHONE]`. Enforces audio-only publication at the SFU level.
- **`RoomServiceClient`**:
  - `removeParticipant(roomName, identity)`: Evicts specific participant identity.
  - `deleteRoom(roomName)`: Closes room and severs all peer connections.
  - `listParticipants(roomName)`: Lists active participants and metadata.
- **`WebhookReceiver`**: `receive(rawBody: string, authHeader: string)` provides official HMAC SHA-256 signature verification.

### 3.2 Frontend: `livekit-client` (v2.23.0)
- **`Room.connect(url, token, options)`**: Standard connection establishment.
- **`Room.disconnect()`**: Clean teardown of WebRTC peer connections.
- **`Room.prepareConnection(url, token)`**: Pre-warms DNS and connection caches.
- **Token Refresh Assessment**:
  - `livekit-client` v2.23.0 **does NOT expose a public `room.updateToken()` or `room.setToken()` method** on the `Room` class.
  - In Sprint 2.3.1, `room.engine.token = freshTokenData.token` was utilized. `engine` is a private property on `Room` (`private engine?: RTCEngine`).
  - Relying on private property mutation is unsafe against future SDK updates.
  - Active LiveKit WebRTC peer connections do not terminate merely because JWT `exp` elapses; JWT `exp` is validated only during initial connection and reconnection.
  - **Supported Strategy**: Retain proactive background token refresh by querying `POST /api/v1/rooms/:roomId/voice/token` at 80% of TTL, store the latest valid token in client memory, and if a network disconnect occurs requiring reconnect, reconnect using the verified latest token.

---

## 4. Workstream Audits & Failure Mode Inventory

### Issue 1: In-Memory Webhook Deduplication and Ordering (Workstream A)
- **Existing Implementation**:
  [`apps/api/src/modules/voice/voice-webhook.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts) tracks `processedEventIds` (Map) and `participantLastEventTimes` (Map) strictly in process memory.
- **Affected File**: [`apps/api/src/modules/voice/voice-webhook.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts)
- **Failure Scenario**:
  1. Multiple API instances receive concurrent webhook deliveries from LiveKit. Instance A has not seen the event ID, and Instance B has not seen it either; both process the webhook concurrently.
  2. If the API process restarts, all in-memory history is wiped. A delayed `participant_joined` event delivered after restart could process after a previous `participant_left` event.
- **Security & Consistency Impact**: Ephemeral voice presence state or eviction checks can be triggered multiple times or out of order.
- **Proposed Remediation**:
  1. Create a durable MongoDB model `VoiceWebhookEventModel` tracking `eventId`, `eventType`, `roomName`, `participantIdentity`, `status` (`processing`, `completed`, `failed`), `claimedBy`, `claimedAt`, and `processedAt`.
  2. Use atomic conditional upsert (`findOneAndUpdate` with lease expiration) to claim events across multiple API instances.
  3. Create `VoiceParticipantSequenceModel` tracking the monotonic `lastEventTimestamp` per participant in room to atomically reject stale out-of-order events across all instances.
  4. Design deterministic fallback event ID (`sha256(event + createdAt + roomName + participantIdentity)`) when provider `event.id` is missing.
- **Enforcement Level**: **Application-level durable MongoDB locking**.

---

### Issue 2: Eviction Task Reliability & Lifecycle Flaws (Workstream B)
- **Existing Implementation**:
  [`apps/api/src/modules/voice/voice-eviction-task.model.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-eviction-task.model.ts) has statuses `['pending', 'completed', 'exhausted']`.
  It defines a TTL index on `createdAt: 1` with `expireAfterSeconds: 24 * 60 * 60` without filtering by status.
  In [`voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts), `retryPendingEvictions()` is defined but **never scheduled or called on API startup**.
- **Affected Files**:
  - [`apps/api/src/modules/voice/voice-eviction-task.model.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-eviction-task.model.ts)
  - [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts)
  - [`apps/api/src/server.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/server.ts)
- **Failure Scenario**:
  1. A host kicks a user. LiveKit Cloud returns 503. A task is recorded.
  2. The task is never retried because no background worker runs `retryPendingEvictions()`.
  3. After 24 hours, MongoDB TTL purges the task document completely.
  4. The security eviction is permanently lost without operator notice.
- **Security & Consistency Impact**: Security-critical evictions are dropped silently.
- **Proposed Remediation**:
  1. Refactor lifecycle states to: `pending`, `processing`, `retry_scheduled`, `completed`, `failed_permanent`.
  2. Add atomic claiming with lease expiration (`claimedAt`, `claimedBy`) to prevent concurrent worker execution across instances.
  3. Remove universal TTL index on `createdAt`. Add partial TTL index strictly for `status: 'completed'`. **Never delete `failed_permanent` tasks**.
  4. Launch a managed background worker in `server.ts` with bounded intervals (e.g. every 10 seconds) and graceful shutdown hooks (`stopEvictionWorker()`).
  5. Distinguish transient errors (network timeout, 502/503) from terminal provider errors (e.g. room not found).
- **Enforcement Level**: **Application-level durable queue & scheduler**.

---

### Issue 3: Exposure of `familyId` in Participant Metadata (Workstream C)
- **Existing Implementation**:
  [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts) bundles `familyId`, `tabId`, and `issuedAt` into `VoiceParticipantMetadata` which is passed to `token.metadata = JSON.stringify(metadata)`.
- **Affected Files**:
  - [`apps/api/src/modules/voice/voice.types.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.types.ts)
  - [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts)
  - [`apps/web/src/features/voice/types/voice.types.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/types/voice.types.ts)
- **Failure Scenario**: LiveKit client SDK broadcasts `RemoteParticipant.metadata` to all participants in the WebRTC room. Any user can inspect network traffic or SDK participant objects and read other participants' internal authentication `familyId`.
- **Security Impact**: Leaks internal session architecture and authentication identifiers to untrusted clients.
- **Proposed Remediation**:
  1. Separate into `VoiceParticipantPublicMetadata` containing strictly: `userId`, `username`, `displayName`, `avatarUrl`.
  2. Strip `familyId`, `tabId`, and `issuedAt` from public metadata.
  3. Store `familyId`, participant session ID, user ID, room ID, and connection state strictly in server-side registry.
- **Enforcement Level**: **Server-side token generation grant boundary**.

---

### Issue 4: Undocumented LiveKit Token Refresh Property Assignment (Workstream D)
- **Existing Implementation**:
  [`apps/web/src/features/voice/hooks/use-voice-client.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts) updates:
  ```typescript
  (room as any).engine.token = freshTokenData.token;
  ```
- **Affected File**: [`apps/web/src/features/voice/hooks/use-voice-client.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts)
- **Failure Scenario**: Future `livekit-client` patch releases may rename `engine` or refactor token storage, causing silent failures or runtime exceptions.
- **Proposed Remediation**:
  1. Remove `(room as any).engine.token` assignment.
  2. Maintain token refresh lifecycle: store `latestTokenRef.current = freshTokenData.token`.
  3. On unexpected disconnect or reconnect events, verify authorization against backend and reconnect using public `room.connect(serverUrl, latestTokenRef.current)` if needed.
  4. Preserve all renewal guards: coalesced requests, generation fencing, leave voice abort.
- **Enforcement Level**: **Client SDK public API boundary**.

---

### Issue 5: Incomplete Session Revocation Coverage (Workstream E)
- **Existing Implementation**:
  [`apps/api/src/modules/auth/auth.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts) triggers voice eviction on `logout` and `refreshToken` (replay detected).
  However, there is no centralized session revocation handler, and user suspension/deactivation paths do not trigger session-family voice eviction.
- **Affected Files**:
  - [`apps/api/src/modules/auth/auth.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts)
  - [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts)
  - [`apps/api/src/modules/users/user.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/users/user.service.ts)
- **Failure Scenario**: An admin suspends a user or revokes an account. The user's refresh tokens are invalidated, but active LiveKit sessions are not evicted if only user status is modified without calling voice eviction.
- **Proposed Remediation**:
  1. Centralize session family revocation and user revocation in `auth.service.ts`.
  2. Implement `revokeSessionFamily(familyId, reason)`: marks `SessionModel.isRevoked = true`, severs Socket.IO sockets via `disconnectSessionSockets(familyId)`, and evicts LiveKit voice via `voiceService.evictLiveKitSessionFamily(familyId)`.
  3. Implement `revokeUserSessions(userId, reason)`: revokes all session families for that user, disconnects all user sockets, and evicts the user from all active LiveKit rooms.
  4. Ensure durable eviction tasks are scheduled on any provider failure.
- **Enforcement Level**: **Application service lifecycle**.

---

### Issue 6: Client-Controlled Tab ID in Participant Identity (Workstream F)
- **Existing Implementation**:
  [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts) derives participant identity:
  ```typescript
  const participantIdentity = `${user.id}_${cleanTabId}`;
  ```
  where `cleanTabId` is supplied by the client.
- **Affected Files**:
  - [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts)
  - [`apps/web/src/features/voice/hooks/use-voice-client.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts)
  - [`apps/web/src/features/voice/components/voice-participants.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/voice-participants.tsx)
- **Failure Scenario**:
  If two clients or tabs supply the identical `tabId`, their participant identities collide in LiveKit, causing unexpected disconnections or eviction of the wrong tab.
- **Proposed Remediation**:
  1. Backend generates an opaque participant session ID:
     `participantIdentity = `${user.id}_vps_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}``
  2. Bind participant identity to `(userId, roomId, familyId, tabHint)`.
  3. Ensure token renewal for the same active session reuses the assigned participant identity without creating zombie identities.
  4. Kicked or revoked identities can never be reused.
  5. Frontend continues grouping by `p.userId` for clean UI aggregation.
- **Enforcement Level**: **Server-side cryptographic identity generation**.

---

## 5. Audit Conclusion

All 6 identified issues are addressable using existing technologies (MongoDB and official Node.js / LiveKit server SDKs). No Redis or third-party queue service is needed. Implementation will proceed according to the six workstreams.
