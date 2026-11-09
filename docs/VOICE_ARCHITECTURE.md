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
  $$\text{participantIdentity} = \text{userId} + \text{"\_"} + \text{sessionSalt}$$
  Where `sessionSalt` is either the client's unique `tabId` (truncated to 12 chars) or a secure random 8-character hex string.
- **Cryptographic Metadata**: The server embeds trusted metadata in the LiveKit JWT token:
  ```json
  {
    "userId": "65f...",
    "username": "MiaSingz",
    "displayName": "Mia Singer",
    "avatarUrl": "https://...",
    "tabId": "tab-abc-123"
  }
  ```
- **UI Aggregation**: The frontend groups voice participants or annotates local session instances with `(You)` while displaying the authentic display name and avatar.

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

### 4.2 Minimum Required Grants
Tokens issued by `VoiceTokenService` contain only the least privileges required:
- `roomJoin: true`
- `room: ktv_room_${roomId}`
- `canPublish: true` (microphone audio)
- `canSubscribe: true` (remote participant audio)
- `canPublishData: false` (data messaging routed exclusively via Socket.IO)
- `roomAdmin: false`, `roomRecord: false`

### 4.3 Token Renewal Strategy
- **TTL**: 300 seconds (5 minutes).
- **Proactive Renewal**: The frontend schedules a refresh timer at 80% of TTL (approximately 4 minutes).
- **Security Check on Renewal**: Renewal calls `POST /api/v1/rooms/:roomId/voice/token`, repeating all database authorization checks.
- If the user was kicked, deactivated, or if the room was closed in the interim, renewal fails with HTTP 403, and the client automatically severs voice communication.

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

### 6.3 Voluntary Room Leave
When a member leaves the lounge (`POST /api/v1/rooms/:id/leave`):
1. Active membership transitions to `'left'`.
2. `RoomModel.currentParticipantsCount` decrements by 1.
3. The client disconnects LiveKit voice prior to unmounting.
4. Backend `voiceService.evictLiveKitParticipant(roomId, userId)` guarantees cleanup if the client disconnected abruptly.

---

## 7. Webhook Signature & Idempotency

LiveKit delivers lifecycle webhooks to `POST /api/v1/webhooks/livekit`.
1. **Raw Body Validation**: Express captures the raw request Buffer in `req.rawBody` prior to JSON parsing.
2. **Signature Verification**: `WebhookReceiver.receive(rawBodyString, req.headers.authorization)` verifies the JWT signature against `LIVEKIT_API_KEY` and `LIVEKIT_WEBHOOK_SECRET` (or `LIVEKIT_API_SECRET`).
3. **Idempotency & Isolation**:
   - `participant_joined` and `participant_left` are logged with correlation IDs.
   - Webhook processing **NEVER** mutates `Room.currentParticipantsCount` or modifies `RoomMembership` status.
   - Out-of-order or delayed webhooks cannot corrupt persistent room state.

---

## 8. Preserved Invariants Verification

1. **`Room.currentParticipantsCount === count(active RoomMemberships)`**: Fully preserved. Voice join/leave modifies 0 database records.
2. **Opt-in Voice**: Joining a room never prompts for microphone access automatically.
3. **Independent Leave**: Users can leave voice at any time without forfeiting room membership.
4. **No Secrets to Client**: LiveKit API Key and Secret remain strictly on the backend.
