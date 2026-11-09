# Real-time Voice Architecture Specification (LiveKit Integration)

## 1. Overview & Architectural Goals

The voice communication architecture for KTVOnline establishes high-fidelity, low-latency WebRTC voice communication among authenticated room participants using **LiveKit**.

This system works alongside the existing **Socket.IO** realtime foundation and **MongoDB** persistent state without coupling ephemeral voice presence to persistent room occupancy or membership counts.

```
       +--------------------------------------------------------------+
       |                         KTVOnline                            |
       |                                                              |
       |   +-------------------+              +-------------------+   |
       |   |     Socket.IO     |              |      LiveKit      |   |
       |   |  Realtime Events  |              | WebRTC Voice/Audio|   |
       |   +---------+---------+              +---------+---------+   |
       |             |                                  |             |
       |     Chat, Reactions,                   Microphone Streaming, |
       |     Presence, Roster,                  Audio Subscription,   |
       |     State Versioning                   Speaking Indicators   |
       +-------------+----------------------------------+-------------+
                     |                                  |
            [Express API Server]              [LiveKit Cloud / Server]
                     |                                  |
                     | Token Generation & Auth Check    |
                     +--------------------------------->|
```

---

## 2. Core Responsibilities & Boundary Separation

| Responsibility | Socket.IO Engine | LiveKit WebRTC Engine | MongoDB Persistence |
| :--- | :--- | :--- | :--- |
| **Room Membership** | Authoritative room roster broadcast | Independent (ephemeral) | Authoritative source of truth (`RoomMembership`) |
| **Room Occupancy** | Broadcasts `currentParticipantsCount` | Never mutates occupancy | Strictly counts active memberships |
| **Chat & Reactions** | Room chat messages & emojis | Out of scope | Persistent chat history |
| **Room State Sync** | Monotonic `stateVersion` events | Unaware of room state | State snapshot & outbox storage |
| **Audio Transport** | Out of scope | WebRTC RTP streams (Opus 48kHz) | Out of scope |
| **Speaking Detection**| Out of scope | Active speaker VAD (Voice Activity Detection) | Out of scope |

---

## 3. Room Identity & Participant Identity Strategy

### 3.1 Room Identity Mapping
- KTVOnline room identifiers are 24-character hexadecimal MongoDB `ObjectId` strings (e.g. `65f01...`).
- The LiveKit room name is derived deterministically by the server as:
  $$\text{LiveKitRoomName} = \text{"ktv\_room\_"} + \text{roomId}$$
- **Security Boundary**: The client is never permitted to specify or override the LiveKit room name. The server derives it exclusively from the validated `:roomId` parameter.

### 3.2 Participant Identity & Multi-Tab Isolation
If a user joins the same KTVOnline room in two separate browser tabs, standard user ID assignment would cause a participant identity collision in LiveKit.
- **Identity Scheme**:
  $$\text{participantIdentity} = \text{userId} + \text{"\_vps\_"} + \text{participantSessionId}$$
  Where `participantSessionId` is an opaque 12-character hex string generated on the backend. Client-supplied tab IDs serve strictly as diagnostic hints and do not dictate the authoritative identity.
- **Public Participant Metadata**: To prevent internal credential leaks, LiveKit participant metadata is strictly restricted to UI-necessary attributes:
  ```json
  {
    "userId": "65f...",
    "username": "MiaSingz",
    "displayName": "Mia Singer",
    "avatarUrl": "https://..."
  }
  ```
  Internal authentication credentials (such as `familyId` and `tabId`) remain strictly in backend server memory and database mappings.
- **UI Aggregation**: The frontend groups voice participants by `userId` to compute composite mute and speaking states while annotating multi-tab presences with a subtle badge.

---

## 4. Voice Authorization & Token Issuance Flow

### 4.1 Sequence Diagram
```
Client (Web)                     Express API                     LiveKit Server
     |                                |                                |
     |  1. POST /rooms/:id/voice/token|                                |
     |     (Bearer JWT)               |                                |
     |------------------------------->|                                |
     |                                | 2. Verify JWT & Account        |
     |                                | 3. Check Room status !== closed|
     |                                | 4. Check active RoomMembership |
     |                                | 5. Check kickedAt == null      |
     |                                | 6. Generate LiveKit Token      |
     |                                |    (TTL: 5m, grants: join/pub) |
     |  7. HTTP 200 (TokenResponse)   |                                |
     |<-------------------------------|                                |
     |                                                                 |
     |  8. WebRTC Connect (Token)                                      |
     |---------------------------------------------------------------->|
     |                                                                 |
     |  9. Publish Mic Audio (setMicrophoneEnabled(true))              |
     |---------------------------------------------------------------->|
     |                                                                 |
     |  10. Subscribe Remote Audio Tracks                              |
     |<----------------------------------------------------------------|
```

### 4.2 Minimum Required Grants (Audio-Only Hardening)
Tokens issued by `VoiceTokenService` contain only the least privileges required:
- `roomJoin: true`
- `room: ktv_room_${roomId}`
- `canPublish: true`
- `canPublishSources: [TrackSource.MICROPHONE]` (Restricts publishing strictly to microphone audio; video camera and screen sharing are denied at the protocol level)
- `canSubscribe: true` (remote participant audio)
- `canPublishData: false` (data messaging routed exclusively via Socket.IO)
- `roomAdmin: false`, `roomRecord: false`

### 4.3 Token Renewal Strategy
- **TTL**: 300 seconds (5 minutes).
- **Proactive Renewal**: The frontend schedules a refresh timer at 80% of TTL (approximately 4 minutes).
- **Request Coalescing**: Multiple renewal triggers are locked behind `isRenewingRef` to prevent concurrent duplicate token requests.
- **Engine Token Synchronization**: Renewed tokens update `room.engine.token = freshToken.token` on the LiveKit client engine, ensuring background ICE restarts and signal reconnections succeed after the initial token's TTL.
- **Security Check on Renewal**: Renewal calls `POST /api/v1/rooms/:roomId/voice/token`, repeating all database authorization checks (membership, room open status, and unrevoked session family status).
- If the user was kicked, deactivated, or if the session family was revoked, renewal fails with HTTP 403, and the client automatically severs voice communication.

---

## 5. Frontend Voice State Machine

The client voice client (`useVoiceClient`) transitions through well-defined lifecycle states:

```
                  +-----------------------------------+
                  |               idle                |
                  +-----------------+-----------------+
                                    | joinVoice()
                                    v
                  +-----------------------------------+
                  |       requesting_permission       |
                  +-----------------+-----------------+
                                    | token & mic granted
                                    v
                  +-----------------------------------+
                  |            connecting             |
                  +-----------------+-----------------+
                                    | RoomEvent.Connected
                                    v
                  +-----------------------------------+
+---------------->|             connected             |<---------------+
|                 +--------+-----------------+--------+                |
|                          |                 |                         |
|    RoomEvent.Reconnected |                 | RoomEvent.Reconnecting  |
|                          v                 v                         |
|                 +-----------------+  +-----------------+             |
|                 |   leaveVoice()  |  |  reconnecting   |-------------+
|                 +--------+--------+  +-----------------+
|                          |
|                          v
|                 +-----------------+
|                 |  disconnected   |
|                 +--------+--------+
|                          |
|                          v
|                 +-----------------+
+-----------------|     failed      |  (e.g. Permission denied, network fail)
                  +-----------------+
                           |
                           v
                  +-----------------+
                  |  unauthorized   |  (e.g. Kicked by host, room closed)
                  +-----------------+
```

---

## 6. Room Lifecycle & Voice Invalidation

### 6.1 Room Closure
When a host closes a room (`POST /api/v1/rooms/:id/close`):
1. `RoomModel` status is set to `'closed'`.
2. Socket.IO broadcasts `room:closed` and clears presence.
3. `voiceService.closeLiveKitRoom(roomId)` calls LiveKit `RoomServiceClient.deleteRoom("ktv_room_" + roomId)`.
4. All active WebRTC peer connections in that LiveKit room are terminated immediately.

### 6.2 Host Moderation Kick
When a host kicks a member (`POST /api/v1/rooms/:id/members/:userId/kick`):
1. Target membership status transitions to `'left'`, stamped with `kickedAt` and `kickedBy`.
2. `RoomModel.currentParticipantsCount` decrements by 1.
3. `evictKickedMember` emits `member:kicked` via Socket.IO and removes the user from the room channel.
4. `voiceService.evictLiveKitParticipant(roomId, targetUserId)` enumerates participants in `ktv_room_${roomId}` and calls `roomServiceClient.removeParticipant`.
5. The kicked user's WebRTC connection is severed on the spot, and subsequent token requests fail with HTTP 403 `FORBIDDEN_KICKED`.

### 6.4 Session-Family Invalidation & Token Replay
When a session family is revoked (via explicit logout or refresh token replay detection):
1. `auth.service.ts` flags `SessionModel.isRevoked = true` and invalidates the family.
2. `voiceService.evictLiveKitSessionFamily(familyId)` finds all active participants belonging to `familyId` in `voiceSessionRegistry` and disconnects them via `removeParticipant`.
3. Other concurrent session families of the same user remain unaffected.
4. Subsequent token requests or renewals bearing the revoked session token are rejected with HTTP 403 `FORBIDDEN_SESSION_REVOKED`.

### 6.5 Durable Provider Eviction Recovery
1. Persistent database transitions (kick, leave, close, logout) always commit first.
2. If LiveKit's API is temporarily unavailable or returns an error, the operation is **never** rolled back.
3. The failed eviction is persisted to MongoDB via `VoiceEvictionTaskModel` utilizing a 5-state lifecycle: `pending`, `processing`, `retry_scheduled`, `completed`, and `failed_permanent`.
4. An atomic lease mechanism (`claimNextTask`) with a 30-second timeout ensures multiple API instances never process the same eviction concurrently and abandoned tasks are safely recovered.
5. A background recovery worker (`VoiceEvictionWorker`) starts automatically on API boot and shuts down cleanly on `SIGTERM`/`SIGINT`.
6. **Permanent Task Retention**: A partial TTL index purges completed tasks after 24 hours. Unresolved security evictions (`failed_permanent`) are **never deleted by TTL** and remain persisted for operator alerting.

---

## 7. Webhook Signature, Idempotency & Ordering

LiveKit delivers lifecycle webhooks to `POST /api/v1/webhooks/livekit`.
1. **Raw Body Validation**: Express captures the raw request Buffer in `req.rawBody` prior to JSON parsing.
2. **Signature Verification**: `WebhookReceiver.receive(rawBodyString, req.headers.authorization)` verifies the JWT signature against `LIVEKIT_API_KEY` and `LIVEKIT_WEBHOOK_SECRET` (or `LIVEKIT_API_SECRET`).
3. **Durable Deduplication (`VoiceWebhookEventModel`)**:
   - Webhook deliveries are atomically claimed and deduplicated in MongoDB across all API instances.
   - Deterministic event IDs are generated via SHA-256 fallback if LiveKit omits `event.id`.
   - Re-delivered events are acknowledged with HTTP 200 `{ duplicate: true }` without repeating side effects.
4. **Monotonic Sequence Ordering (`VoiceParticipantSequenceModel`)**:
   - Monotonic timestamps are tracked per participant across horizontal instances.
   - Older events arriving after newer events are dropped to prevent delayed `participant_joined` from resurrecting departed participants.
5. **Closed Room Guard**:
   - If a delayed `participant_joined` webhook arrives for a closed room, the participant is immediately evicted.
6. **Strict Invariant Isolation**:
   - Webhook processing **NEVER** mutates `Room.currentParticipantsCount` or modifies `RoomMembership` status.
   - Delayed or replay webhooks cannot corrupt persistent room state or recreate closed rooms.

---

## 8. Preserved Invariants Verification

1. **`Room.currentParticipantsCount === count(active RoomMemberships)`**: Fully preserved. Voice join/leave modifies 0 database records.
2. **Opt-in Voice**: Joining a room never prompts for microphone access automatically.
3. **Independent Leave**: Users can leave voice at any time without forfeiting room membership.
4. **No Secrets to Client**: LiveKit API Key and Secret remain strictly on the backend.
