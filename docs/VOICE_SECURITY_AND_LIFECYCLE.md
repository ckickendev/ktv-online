# Voice Security & Lifecycle Hardening Specification

## 1. Executive Overview

This document specifies the voice security, lifecycle hardening, and provider failure handling architecture implemented in **Sprint 2.3.1** for **KTVOnline**.

While Sprint 2.3 introduced the initial LiveKit WebRTC voice capability, Sprint 2.3.1 hardens the integration against session revocation leakage, audio-only publishing bypasses, webhook delivery duplication/out-of-order execution, provider API eviction failures, token renewal race conditions, multi-tab identity collisions, and frontend resource leaks.

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
   The backend derives room names, participant identities, and source-publishing grants. Clients can neither supply arbitrary identities nor claim permissions beyond audio publication.
5. **Durable Provider Failure Recovery**:
   Persistent room membership and session revocation decisions commit first. LiveKit API failures never rollback database transactions. Unsuccessful evictions are recorded in a durable task queue (`VoiceEvictionTaskModel`) and recovered with exponential backoff.
6. **Zero Secret Exposure**:
   LiveKit API keys, secrets, and raw tokens are never logged or leaked to unauthorized clients.

---

## 3. Session-Family to Voice Participant Mapping

### 3.1 Mapping Architecture

```
+---------------------------------------------------------------------------------------+
| Express Backend / In-Memory Registry (VoiceSessionRegistry)                           |
|                                                                                       |
|   participantIdentity = `${userId}_${tabId}`                                          |
|                                                                                       |
|   ActiveVoiceSession {                                                                |
|     identity: string;       // Primary Key                                            |
|     userId: string;         // Indexed for user-level eviction (kick, account suspend)|
|     roomId: string;         // Indexed for room-level scope                           |
|     familyId: string;       // Indexed for session revocation (logout, token replay)  |
|     issuedAt: Date;                                                                   |
|   }                                                                                   |
+---------------------------------------------------------------------------------------+
        |                                                        |
        v                                                        v
+-------------------------------+               +-------------------------------+
| LiveKit Room JWT Claims       |               | Signed LiveKit Metadata       |
|                               |               |                               |
| {                             |               | {                             |
|   "sub": "userId_tabId",      |               |   "userId": "...",            |
|   "video": {                  |               |   "familyId": "...",          |
|     "room": "ktv_room_...",   |               |   "issuedAt": "...",          |
|     "canPublishSources":      |               |   "tabId": "...",             |
|       ["microphone"]          |               |   "displayName": "..."        |
|   }                           |               | }                             |
| }                             |               +-------------------------------+
+-------------------------------+
```

### 3.2 Authorization at Issuance and Renewal
Every token generation request (`POST /api/v1/rooms/:roomId/voice/token`) verifies:
1. **Authenticated Context**: Token bearer must be authenticated; `user.id` and `user.familyId` are derived from the verified JWT.
2. **Account Status**: `UserModel.status !== 'suspended' && UserModel.status !== 'deactivated'`.
3. **Session Revocation**: `SessionModel.findOne({ familyId: user.familyId, isRevoked: false })` must exist and be active. If revoked, token generation fails immediately with HTTP 403 `FORBIDDEN_SESSION_REVOKED`.
4. **Room Status**: `RoomModel.status !== 'closed'`.
5. **Membership Status**: `RoomMembershipModel.findOne({ roomId, userId: user.id, status: 'active', kickedAt: null })`.

Upon passing authorization:
- `VoiceTokenService` signs a token with 300s TTL.
- The session is registered in `voiceSessionRegistry`.

### 3.3 Revocation Integration Paths
- **Explicit User Logout** (`POST /api/v1/auth/logout`):
  Invokes `voiceService.evictLiveKitSessionFamily(session.familyId)` immediately.
- **Refresh Token Reuse Detection** (`auth.service.ts`):
  When a previously revoked refresh token is replayed, the entire session family is compromised and revoked. The system revokes the session family, disconnects its Socket.IO connections, and calls `voiceService.evictLiveKitSessionFamily(compromisedSession.familyId)`.
- **Account Suspension / Deactivation**:
  Invokes `voiceService.evictLiveKitParticipant(roomId, userId)` across all active rooms.

---

## 4. Audio-Only Publication Restrictions

### 4.1 Server-Side Enforcement via `canPublishSources`
Sprint 2.3 granted `canPublish: true`, which permitted clients to publish video cameras or screen shares if a modified client bypassed frontend controls.

Sprint 2.3.1 enforces strict source-level restrictions using `livekit-server-sdk` v2.19.2:

```typescript
import { AccessToken, TrackSource } from 'livekit-server-sdk';

token.addGrant({
  roomJoin: true,
  room: options.roomName,
  canPublish: true,
  canPublishSources: [TrackSource.MICROPHONE], // Enforces microphone audio ONLY
  canSubscribe: true,
  canPublishData: false, // Disallows WebRTC data packets; Socket.IO is authoritative
  roomAdmin: false,
  roomRecord: false,
});
```

### 4.2 Security Boundary
- LiveKit SFU natively validates tracks published against `canPublishSources`. Any attempt to publish a video track (`TrackSource.CAMERA`) or screen track (`TrackSource.SCREEN_SHARE`) is rejected at the protocol level with a permission error.
- Even if a compromised client attempts to send video RTP packets, the LiveKit SFU drops the stream.

---

## 5. Webhook Idempotency & Monotonic Ordering

### 5.1 Official Signature Verification
LiveKit webhooks delivered to `POST /api/v1/webhooks/livekit` are verified using `WebhookReceiver.receive(rawBody, authHeader)` from `livekit-server-sdk`.
- `req.rawBody` contains the untouched HTTP request buffer.
- Requests with invalid signatures or missing authorization headers are rejected with HTTP 401.

### 5.2 Deduplication Cache
Network retries by LiveKit could deliver duplicate webhook payloads.
- An in-memory LRU cache tracks `event.id` (or deterministic SHA-256 fallback of `event + roomName + identity + createdAt`) with a 10-minute TTL and 5,000 entry cap.
- Duplicate event deliveries are detected immediately and logged safely:
  ```json
  { "eventId": "EV_abc123", "event": "participant_joined", "msg": "Duplicate LiveKit webhook ignored" }
  ```
  The server responds with HTTP 200 to acknowledge receipt without executing duplicate side-effects.

### 5.3 Monotonic Sequence Ordering
Because network transit delays can cause a `participant_joined` event to arrive after a `participant_left` event:
- The controller maintains a per-participant sequence map:
  $$\text{key} = \text{roomName} + \text{":"} + \text{identity}$$
  $$\text{value} = \text{lastProcessedTimestampMs}$$
- If a webhook has `createdAt < lastProcessedTimestampMs`, it is dropped as a stale out-of-order event.

### 5.4 Closed Room Defense
If a delayed `participant_joined` webhook arrives for a KTVOnline room that has already been closed:
- The webhook handler queries `RoomModel.findById(roomId).select('status')`.
- If `status === 'closed'`, it automatically disconnects the participant via `evictLiveKitParticipant` to guarantee no zombie participants linger in closed rooms.
- Webhooks **never** recreate rooms or mutate membership records.

---

## 6. Provider Failure & Eviction Recovery

### 6.1 Persistent Decision Priority
Persistent membership transitions (kick, leave, close) and authentication revocations must remain authoritative. A LiveKit network failure must **never** rollback a database transaction.

### 6.2 Durable Eviction Task Queue (`VoiceEvictionTaskModel`)
When an immediate eviction call to LiveKit fails (e.g. timeout, 502 Bad Gateway):
1. A pending eviction task is committed to MongoDB:
   ```typescript
   {
     targetType: 'user' | 'session_family' | 'room',
     targetId: string,
     roomId?: string,
     familyId?: string,
     attempts: 1,
     maxAttempts: 5,
     status: 'pending',
     nextRetryAt: new Date(Date.now() + 5000), // Exponential backoff: 5s, 10s, 20s, 40s
     lastError: 'LiveKit API connection timeout'
   }
   ```
2. The model includes a 24-hour TTL index on completed/failed records for automated storage cleanup:
   ```typescript
   VoiceEvictionTaskSchema.index(
     { updatedAt: 1 },
     { expireAfterSeconds: 86400, partialFilterExpression: { status: { $in: ['completed', 'failed'] } } }
   );
   ```
3. A background sweep worker (`voiceService.retryPendingEvictions()`) retries pending tasks with exponential backoff up to 5 attempts. Once retries are exhausted, the task is marked as `failed` with structured error logging for operational alerting.

---

## 7. Token Renewal Lifecycle

### 7.1 Lifecycle Rules
1. **Renewal Mechanism**:
   Clients request a refreshed token at 80% of TTL (every 4 minutes).
2. **Re-Authorization**:
   The renewal request hits `POST /api/v1/rooms/:roomId/voice/token`, re-verifying active room membership, room open status, and unrevoked session family status.
3. **Request Coalescing**:
   Concurrent renewal attempts in `useVoiceClient` are guarded by an in-flight lock (`isRenewingRef`). Multiple timers or event triggers coalesce into a single HTTP request.
4. **Signaling Token Synchronization**:
   In `livekit-client` v2.23.0, the active connection signaling token is stored at `room.engine.token`. When a renewed token is fetched, `room.engine.token = freshTokenData.token` updates the engine so that background ICE restarts or signal reconnects succeed without credential expiration errors.
5. **Session Fencing**:
   A monotonic `sessionGenRef` ensures that asynchronous renewal callbacks belonging to an unmounted room or abandoned voice session are dropped and do not corrupt a newer active room session.
6. **Explicit Leave Stops Renewal**:
   Calling `leaveVoice()` clears renewal timers and aborts in-flight token requests.
7. **Reconnection Verification**:
   When LiveKit fires `RoomEvent.Reconnected`, the client immediately verifies that the session is still authorized by checking room membership. If the user was kicked while reconnecting, `leaveVoice()` is invoked immediately.

---

## 8. Multi-Tab Identity & Display Grouping

### 8.1 Identity Generation
- Format: `${userId}_${tabId}`.
- `userId` is strictly extracted from verified backend auth context.
- `tabId` is generated client-side via `crypto.randomUUID()` and sanitized by the backend (`/^[a-zA-Z0-9-]{1,16}$/`), falling back to a cryptographically secure random string if invalid.
- Prevents identity collisions when the same user opens multiple tabs in the same room.

### 8.2 Frontend Aggregation
- `VoiceParticipants` aggregates participant instances by `userId`:
  - `sessionCount`: Displayed as a subtle badge (e.g. `2 tabs`) when a user has multiple active tabs.
  - `isSpeaking`: Active if any session of the user is speaking.
  - `isMuted`: Muted only if all sessions of the user are muted.
  - `isLocal`: True if any of the active sessions match the current client.
- Remote audio tracks from duplicate local tabs are muted locally to prevent audio feedback and echo loops.

---

## 9. Observability & Safe Logging Standards

All voice events are logged with structured context while strictly omitting sensitive credentials:

| Event | Log Level | Context Fields |
| :--- | :--- | :--- |
| `Voice token issued` | `info` | `correlationId`, `roomId`, `userId`, `tabId`, `familyId` |
| `Voice token denied` | `warn` | `correlationId`, `roomId`, `userId`, `reason` |
| `Session family revoked` | `info` | `familyId`, `evictedSessionsCount` |
| `Participant eviction requested` | `info` | `roomId`, `userId`, `participantIdentity` |
| `Provider eviction failure recorded` | `warn` | `targetType`, `targetId`, `attempts`, `error` |
| `Webhook duplicate ignored` | `info` | `eventId`, `event`, `roomName` |
| `Webhook stale event dropped` | `warn` | `event`, `identity`, `eventTime`, `lastProcessedTime` |
| `Token renewed` | `info` | `roomId`, `userId`, `expiresAt` |

**Security Blacklist**:
Under no circumstances are the following logged:
- LiveKit access tokens or JWT signatures.
- `LIVEKIT_API_SECRET` or `LIVEKIT_WEBHOOK_SECRET`.
- HTTP Authorization headers.
- Raw PCM/Opus audio buffers.

---

## 10. Summary Verification Checklist

- [x] Session revocation evicts LiveKit voice sessions associated with the revoked family.
- [x] Other concurrent session families of the same user remain connected.
- [x] Audio-only publishing enforced via `canPublishSources: [TrackSource.MICROPHONE]`.
- [x] Webhook signatures verified using raw request body.
- [x] Webhook duplicates deduplicated via bounded LRU cache.
- [x] Stale webhooks discarded via monotonic timestamp tracking.
- [x] Provider eviction failures recovered via `VoiceEvictionTaskModel`.
- [x] Token renewal coalesced and synchronized to `room.engine.token`.
- [x] Multi-tab identities isolated on backend and aggregated on frontend.
- [x] Static typecheck and lint clean across monorepo.
