# KTVOnline — Sprint 4.0: Comprehensive Integration & Architecture Audit

**Audit Date:** November 2026  
**Baseline Commit:** `7cdb1195669b7f58993c3b0eb6886e00cfbe3170`  
**Scope:** Cross-subsystem integration, state consistency, failure recovery, resource lifecycles, and deployment scalability.

---

## 1. End-to-End Flow Tracing

```mermaid
sequenceDiagram
  autonumber
  actor User as Participant / Host
  participant Web as Next.js Web App
  participant API as Express API / Services
  participant DB as MongoDB (test)
  participant Socket as Socket.IO Cluster
  participant LK as LiveKit Media Server

  Note over User,LK: Flow 1: Create, Discover & Join Lounge
  User->>Web: Create Lounge (name, type, capacity)
  Web->>API: POST /api/v1/rooms
  API->>DB: Create RoomModel + Host RoomMembershipModel
  API-->>Web: RoomCreatedDto
  Web->>Socket: emit('room:join', { roomId })
  Socket->>API: presenceManager.addSocket()
  Socket-->>Web: emit('room:presence:snapshot')
  
  Note over User,LK: Flow 2: Voice Connection & State Sync
  Web->>API: POST /api/v1/rooms/:id/voice/token
  API->>DB: Verify active membership & isMuted
  API->>API: Mint JWT with canPublish: !isMuted
  API-->>Web: VoiceTokenResult
  Web->>LK: Connect WebRTC room
  LK-->>Web: Subscribed to voice tracks
```

### Flow 1: Create and Join Room
1. **User Action:** Host initiates lounge creation via form.
2. **Frontend State:** TanStack Query `useCreateRoom()` mutates `/api/v1/rooms` and navigates to `/rooms/[roomId]`.
3. **Backend Service:** [`room.service.ts:create()`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts) creates `RoomModel` (`currentParticipantsCount: 1, stateVersion: 1`) and `RoomMembershipModel` (`role: 'host', status: 'active'`).
4. **Client Join:** Visitor clicks "Join Lounge".
   - `POST /api/v1/rooms/:id/join` executes atomic CAS capacity reservation on `RoomModel`.
   - Creates or reactivates `RoomMembershipModel` (`status: 'active'`).
   - Increments `stateVersion` (+1) and publishes versioned `member.joined` via `publishRoomStateEvent()`.
   - Records `member_joined` activity in chat timeline.
5. **Realtime Handshake:** Client connects Socket.IO, emits `room:join`, registers in `presenceManager`, and receives initial `presence:snapshot`.
6. **Voice Entry:** Client requests voice token (`POST /api/v1/rooms/:id/voice/token`), verifies active membership, and connects to LiveKit room.
- **Identified Failure Point:** If socket reconnects before membership is committed, socket join is accepted as viewer rather than member until snapshot refresh.
- **Recovery:** `useRoomState` detects version mismatch and refreshes authoritative snapshot.

### Flow 2: Leave and Rejoin Room
1. **Normal Departure:** Member confirms leave in dialog.
   - Client calls `voice.leaveVoice()` (disconnects LiveKit).
   - Calls `POST /api/v1/rooms/:id/leave`.
   - Backend atomically transitions `RoomMembershipModel` status to `'left'`, decrements `currentParticipantsCount`, advances `stateVersion`, and publishes `member.left`.
   - Backend non-blockingly triggers `voiceService.evictLiveKitParticipant()` and advances stage playback if leaving user was singer.
2. **Unexpected Disconnection:**
   - Network drop disconnects Socket.IO: `presenceManager.removeSocket()` decrements online count and emits `room:member:left` (ephemeral presence notification). Membership remains active in database.
   - When socket reconnects: `useRoomState` handles `connect` event, re-joins room channel, and calls `getRoomStateSnapshot()`.
- **Identified Integration Defect (INT-01):** In `apps/web/src/hooks/use-room-state.ts`, the `useEffect` cleanup function removes event listeners but **does NOT emit `SOCKET_EVENTS.CLIENT.ROOM_LEAVE`** to the server. When a user navigates away from a room, their socket remains in the server room channel until the tab is closed, keeping backend presence counts artificially inflated.

### Flow 3: Queue and Singer Handoff
1. **Track Addition:** User selects song from catalog dialog.
   - `POST /api/v1/rooms/:id/queue` validates active membership.
   - If room playback is idle and audio is available: activates immediately to stage, creates `RoomQueueItemModel` with `status: 'playing'`, sets `RoomPlaybackStateModel` to `status: 'playing'`, schedules precision timer, and updates `room.currentSingerName`.
   - Otherwise: appends to queue (`status: 'queued'`).
   - Broadcasts `karaoke:queue:updated`.
2. **Track Completion & Handoff:**
   - When duration expires, `karaokePlaybackWorker` precision timer triggers `advanceToNextTrack()`.
   - Atomically transitions current item to `status: 'completed'`.
   - Finds candidate item with lowest position.
   - **Active Membership Verification:** Verifies candidate singer or requester is still an active member. If departed/kicked, marks candidate `removed` and moves to next song.
   - Atomically claims candidate to `status: 'playing'`, updates playback anchor, and broadcasts `karaoke:playback:updated`.

### Flow 4: Playback Synchronization
1. **Server Anchor Authority:**
   - Server stores `anchorStartedAt` (Date) and `positionMs` on `RoomPlaybackStateModel`.
2. **Client Clock Alignment:**
   - Client calculates expected position: `currentPositionMs = (Date.now() + clockSync.offsetMs) - anchorStartedAt`.
   - `clock-sync.service.ts` continuously samples round-trip times and maintains median offset against server time.
   - If audio element drift exceeds 250ms, client performs corrective seek.
3. **Late Joiner Recovery:**
   - Client fetches `GET /api/v1/rooms/:id/playback`, initializes audio source at calculated offset, and highlights active lyric line.

### Flow 5: Room Moderation (Role Update, Mute, Kick)
1. **Role Update:** Host promotes member to moderator (`PATCH /api/v1/rooms/:id/members/:userId/role`). `stateVersion` advances, `room.member.role.updated` broadcast, activity logged.
2. **Mute Enforcement:** Moderator mutes participant (`POST /api/v1/rooms/:id/members/:userId/mute`).
   - `RoomMembershipModel.isMuted` set to `true`.
   - `voiceService.muteLiveKitParticipant()` calls LiveKit SDK: sets `canPublish: false` and calls `mutePublishedTrack()`.
   - Client `VoiceControls` receives `isServerMuted: true` and disables microphone toggle.
   - If muted participant attempts to refresh or request new token, backend embeds `canPublish: false` in the signed JWT.
3. **Kick Enforcement:** Moderator removes member (`POST /api/v1/rooms/:id/members/:userId/kick`).
   - Membership set to `status: 'left', kickedAt: Date.now()`.
   - LiveKit participant evicted immediately.
   - Queued tracks removed; if active singer, stage advances to next song.
   - Subsequent socket or API join requests rejected with `FORBIDDEN_KICKED`.

### Flow 6: Host Transfer
1. **Ownership Handover:** Current host selects active member (`POST /api/v1/rooms/:id/transfer-host`).
2. **Atomic Transition:**
   - `RoomModel.ownerId` reassigned to target user.
   - Old host membership updated to `role: 'moderator'`.
   - New host membership updated to `role: 'host'`.
   - `stateVersion` incremented (+1) and `room.host.transferred` published.
3. **Client Refresh:** Frontend updates host badge, transfers room control actions, and refreshes permission checks.

### Flow 7: Realtime Audience Interaction
1. **Stage Cheer Reactions:** Ephemeral, sliding-window rate-limited (max 5 per 2s). Validates active room membership. Broadcast to all clients; zero database writes.
2. **Virtual Appreciation Gifts:** Ephemeral animation, sliding-window rate-limited (max 3 per 5s). Validates recipient is current performer or room host. Recorded in chat timeline. Zero monetization.

---

## 2. Source-of-Truth & Consistency Matrix

| State Entity | Authoritative Owner | Replicas / Consumers | Synchronization Mechanism | Known Risk & Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **Room Ownership** | `RoomModel.ownerId` | `RoomMembershipModel.role`, `useRoomState.host` | Versioned `room.host.transferred` event | Cache desync on transfer -> Handled via `stateVersion` invalidation. |
| **Room Membership** | `RoomMembershipModel` (`status: 'active'`) | `useRoomState.members` | Versioned `member.joined` / `member.left` / `member.kicked` | Stale membership -> Handled via version-fenced read loop. |
| **Participant Count** | `RoomModel.currentParticipantsCount` | Discovery cards, Header badge | Atomically updated on join/leave/kick | **Counter drift** -> Repaired via CAS reconciliation in `getRoomStateSnapshot`. |
| **Online Presence** | `RoomPresenceManager` (Memory) | Socket.IO rooms, `useRoomState.onlineUserIds` | `room:presence:snapshot`, `room:member:joined/left` | **Leaked presence** -> Clients navigating away without emitting `room:leave` linger in memory. |
| **Voice Connection** | LiveKit Media Server | `useVoiceClient.connectionState` | LiveKit WebRTC signaling events | WebRTC disconnect while Socket.IO remains online -> Decoupled cleanly. |
| **Server Mute State** | `RoomMembershipModel.isMuted` | LiveKit JWT (`canPublish`), `VoiceControls` | `room.member.muted/unmuted`, LiveKit track muting | Reconnect bypass -> Backend embeds `canPublish: !isMuted` in all minted tokens. |
| **Queue Ordering** | `RoomQueueItemModel` (`position, status`) | `useKaraoke.queueQuery` | `karaoke:queue:updated` with monotonic `queueVersion` | Concurrent reordering -> Fenced by atomic `queueVersion` increment. |
| **Current Singer** | `RoomQueueItemModel` (`status: 'playing'`) | `RoomModel.currentSingerName`, `SingerTurnIndicator` | `karaoke:playback:updated`, `karaoke:queue:updated` | Singer departure -> `handleMemberDeparted` automatically advances stage. |
| **Playback Status** | `RoomPlaybackStateModel.status` | `useKaraoke.playbackQuery`, `KaraokePlayer` | Authoritative background worker leases & Socket events | Idle/ended desync -> Authoritative worker forces transition upon duration expiry. |
| **Playback Position** | `RoomPlaybackStateModel.anchorStartedAt` | HTML5 `<audio>`, Lyrics timer | NTP-style `clock-sync.service.ts` offset calculation | Clock skew -> Median offset compensation with drift correction threshold. |
| **Lyrics Position** | Client derived from `currentPositionMs` | `LyricsStage.tsx` | Line index derived from track timestamp array | Tab background throttling -> Re-syncs immediately on `visibilitychange`. |
| **Room Atmosphere** | `RoomModel.atmospherePreset` | `useRoomAtmosphere`, Stage CSS styling | Versioned `room.settings.updated` event | Stale theme -> Hydrated from authoritative room snapshot. |
| **Reactions** | Ephemeral memory broadcast | `FloatingReactionsOverlay` | `reaction:received` Socket.IO event | Screen clutter -> Capped at 30 concurrent DOM nodes. |
| **Virtual Gifts** | Ephemeral memory broadcast | `GiftAnimationOverlay`, Chat activity feed | `gift:received` Socket.IO event, `chatService.recordActivity` | Spam flooding -> Enforced by sliding-window rate limiter (3 / 5s). |

---

## 3. Failure Mode & Boundary Analysis

```mermaid
flowchart TD
  subgraph Failure Scenarios & Mitigations
    F1[Host Leaves Room] -->|Mitigation| M1[Blocked by backend: Host must close room or transfer ownership first]
    F2[Active Singer Disconnects] -->|Mitigation| M2[handleMemberDeparted detects departure, cleans queue, advances track]
    F3[Socket Reconnect after Network Blip] -->|Mitigation| M3[useRoomState triggers snapshot refresh and drains buffered events]
    F4[LiveKit Media Server Downtime] -->|Mitigation| M4[Graceful fallback: Stage playback and text chat continue uninterrupted]
    F5[Server Process Crash during Playback] -->|Mitigation| M5[Startup reconciliation resets orphaned playbacks and releases expired leases]
  end
```

### Detailed Failure Mode Classifications

1. **Concurrent Joins at Capacity:**
   - *Status:* **Correctly Handled.**
   - *Mechanism:* `RoomModel.findOneAndUpdate({ currentParticipantsCount: { $lt: capacity } }, { $inc: { currentParticipantsCount: 1 } })` ensures strict reservation before membership persistence. Excess requests receive `ROOM_FULL`.
2. **Duplicate Join Requests:**
   - *Status:* **Correctly Handled.**
   - *Mechanism:* Unique compound partial index on `{ roomId: 1, userId: 1, status: 'active' }` rejects duplicates with idempotency return.
3. **Host Departure Policy:**
   - *Status:* **Correctly Handled.**
   - *Mechanism:* `room.service.ts:leaveRoom()` explicitly throws `HOST_CANNOT_LEAVE` unless room is closed or ownership transferred.
4. **Current Singer Leaves Lounge:**
   - *Status:* **Correctly Handled.**
   - *Mechanism:* `karaokeService.handleMemberDeparted()` detects active singer departure, marks current song `removed`, cancels precision timer, and advances to next queued track.
5. **Client Navigation Away Without Socket Leave (INT-01):**
   - *Status:* **Partially Handled (Integration Defect).**
   - *Mechanism:* Listener cleanup removes DOM events, but socket remains subscribed to room channel on server until socket disconnects.
6. **LiveKit Reconnection Mute Enforcement:**
   - *Status:* **Correctly Handled.**
   - *Mechanism:* Token generation always reads database `isMuted` and issues tokens with `canPublish: false`. LiveKit SDK track mute is also authoritatively invoked via server SDK.
7. **Playback State Recovery on Refresh:**
   - *Status:* **Correctly Handled.**
   - *Mechanism:* Client calculates current audio position using `(serverNow - anchorStartedAt)` and seeks audio element to exact elapsed millisecond.

---

## 4. Database & Resource Lifecycle Audit

### 4.1 MongoDB Collections & Retention Analysis

| Collection | Model Name | Primary Indexes | Retention / Cleanup Status | Assessment |
| :--- | :--- | :--- | :--- | :--- |
| `rooms` | `RoomModel` | `ownerId`, `name`, `status`, `roomType` | Retained indefinitely (permanent record) | Healthy. |
| `roommemberships` | `RoomMembershipModel` | `{ roomId, userId }` (unique partial), `{ userId, status }` | Soft delete (`status: 'left'`) | Healthy. Required for audit history. |
| `roomplaybackstates` | `RoomPlaybackStateModel`| `roomId` (unique), `playbackExpiresAt` | 1 document per room (reused) | Zero bloat. |
| `roomqueueitems` | `RoomQueueItemModel` | `{ roomId, status, position }` | Status transitions (`queued -> playing -> completed/removed`) | Accumulates over time; completed items should be archived in Sprint 4.0. |
| `messages` | `RoomMessageModel` | `roomId, createdAt` | No retention policy / no TTL | **Architectural Risk:** Unbounded growth over long-term operations. |
| `roomactivities` | `RoomActivityModel` | `roomId, createdAt` | No retention policy / no TTL | **Architectural Risk:** Unbounded growth over long-term operations. |
| `roomstateoutboxes` | `RoomStateOutboxModel` | `{ roomId, version }` (unique), `publishedAt` | No TTL index | **Architectural Risk:** Outbox records accumulate indefinitely. |
| `voiceevictiontasks`| `VoiceEvictionTaskModel`| `status, nextAttemptAt` | Processed by eviction worker | Self-cleaning upon resolution. |

### 4.2 Non-Database Resource Lifecycle

- **Socket.IO Subscriptions:** Leaked when clients navigate away from room without calling `room:leave` (INT-01).
- **LiveKit Tracks & Audio Elements:** Cleaned up properly in `useVoiceClient.ts` via `audioElementsRef` and `room.disconnect()`.
- **Playback Timers:** In-memory timers stored in `Map<roomId, NodeJS.Timeout>` and cleared whenever a track finishes, skips, or when the worker stops.
- **Clock Sync Interval:** Cleared on tab close / window teardown.

---

## 5. Deployment & Scalability Assessment

### Single-Instance vs. Multi-Instance Evaluation

```mermaid
flowchart TD
  subgraph Current Deployment: Single Node
    API1[API Instance 1]
    Mem1[In-Memory Socket.IO Adapter]
    Pres1[In-Memory Presence Manager]
    Worker1[Authoritative Playback Worker]
    API1 --- Mem1
    API1 --- Pres1
    API1 --- Worker1
  end

  subgraph Clustered Deployment: Multi-Node (Future)
    APIA[API Replica A]
    APIB[API Replica B]
    RedisPub[(Redis Pub/Sub Adapter)]
    APIA <-->|Realtime State Events| RedisPub
    APIB <-->|Realtime State Events| RedisPub
  end
```

1. **Current Reality:**
   - The application runs on a single Node.js 22 container or process in development and staging.
   - Redis is **NOT deployed, assumed, or required** in the current environment.
   - The in-memory Socket.IO adapter and in-memory `RoomPresenceManager` are lightweight, have zero operational dependencies, and operate reliably for single-instance workloads.
2. **Multi-Instance Bottlenecks (If scaled without Redis):**
   - Socket broadcasts in `room-state.publisher.ts` would only reach clients connected to the same container replica.
   - `RoomPresenceManager` would only report local socket connections.
   - **Crucial Positive Finding:** `RoomPlaybackStateModel`'s distributed lease mechanism (`claimDuePlayback`) is ALREADY multi-instance safe! It uses atomic MongoDB document locks with `leaseToken` and `leaseExpiresAt`.
3. **Recommendation:**
   - **Do NOT introduce Redis in Sprint 4.0.** Preserve the zero-infrastructure-dependency simplicity.
   - Document Redis adapter configuration for horizontal cloud scaling in Milestone 5.0.

---

## 6. Comprehensive Findings & Classification

| Finding ID | Subsystem | Severity | Risk | Classification | Description & Recommended Resolution |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **INT-01** | Frontend / Realtime | **P1** | **Low** | **Confirmed Defect** | **`useRoomState` Missing Socket Room Leave:** The cleanup hook removes event listeners but fails to emit `SOCKET_EVENTS.CLIENT.ROOM_LEAVE`. Emitting `room:leave` on unmount prevents presence ghosting and memory leaks. |
| **INT-02** | Database / Lifecycle | **P2** | **Medium** | **Architectural Risk** | **Unbounded Growth in Outbox & Chat Tables:** `RoomStateOutboxModel`, `RoomMessageModel`, and `RoomActivityModel` lack automated TTL indexing or scheduled archiving. Implement 30-day TTL index. |
| **INT-03** | Frontend / Ergonomics | **P2** | **Low** | **UX Inconsistency** | **Queue Completion Notice Delay:** When a song reaches the end of its duration, the client display remains on `00:00` for 1-2 seconds while waiting for authoritative server advance. Add immediate client transition state. |
| **INT-04** | Voice / LiveKit | **P2** | **Medium** | **Runtime Requirement** | **WebRTC Media Reconnection Token Invalidation:** Requires live multi-client verification under network packet drop to confirm participant media state re-syncs cleanly. |
| **INT-05** | Infrastructure | **P3** | **High** | **Architectural Risk** | **Socket.IO Cross-Instance Scaling:** In-memory adapter prevents multi-container horizontal scale-out. Documented for Milestone 5.0. |

---

## INT-01 — Realtime Subscription Lifecycle Remediation

### 1. Issue Summary
In `apps/web/src/hooks/use-room-state.ts`, the Socket.IO event synchronization effect registered listeners and emitted `SOCKET_EVENTS.CLIENT.ROOM_JOIN` upon mount and reconnect. However, the cleanup function only detached local event listeners (`socket.off`) without notifying the server that the socket was leaving the channel (`SOCKET_EVENTS.CLIENT.ROOM_LEAVE`).

### 2. Root Cause Confirmed from Source
1. **Unilateral Listener Detachment:** The client disconnected local callbacks but left the underlying Socket.IO socket joined to `room:${roomId}` on the server.
2. **Presence Ghosting:** Because `presenceManager.removeSocket(socket.id)` was only triggered on `socket.on('disconnect')` or explicit `ROOM_LEAVE`, navigation away from a room (e.g. to `/rooms` or `/profile`) left the user recorded as an active online participant in memory.
3. **Cross-Room Channel Leakage:** Sockets switching from Room A to Room B remained subscribed to Room A's channel on the server, receiving unnecessary broadcasts.
4. **Unstable Dependency Re-triggering:** `fetchSnapshot` had `room` in its dependency array, which caused `refreshState` to re-instantiate on every room state change, resetting the socket effect needlessly.

### 3. Actual Lifecycle Ownership Model
- **Socket Connection:** Owned globally by `socketManager` singleton (`apps/web/src/lib/socket/socket-client.ts`).
- **Room Subscription:** Owned at the route level by `useRoomState(roomId)` in `/rooms/[roomId]/page.tsx`. Sibling/child feature hooks (`useRoomChat`, `useKaraoke`, `useStageReactions`, `useVirtualGifts`) only attach domain event handlers on the active socket.
- **Room Presence:** Owned on the backend by in-memory `RoomPresenceManager` with per-user socket sets (`roomUsers = Map<roomId, Map<userId, Set<socketId>>>`).
- **Persistent Membership:** Owned authoritatively in MongoDB by `RoomMembershipModel`. Persistent membership is completely decoupled from Socket.IO presence and is never affected by socket join/leave events.

### 4. Chosen Solution
1. **Emit `ROOM_LEAVE` on Unmount & Room Change:**
   In `use-room-state.ts`, updated the effect cleanup to emit `SOCKET_EVENTS.CLIENT.ROOM_LEAVE` with `targetRoomId` whenever the hook unmounts or `roomId` changes:
   ```typescript
   return () => {
     if (socket.connected) {
       socket.emit(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, { roomId: targetRoomId });
     }
     socket.off('connect', onConnectOrReconnect);
     // ... deregister domain handlers
     bufferedEventsRef.current = [];
   };
   ```
2. **Stabilize Hook Callbacks with `roomRef`:**
   Stored `room` in `roomRef` to remove `room` from `fetchSnapshot`'s dependency array. This guarantees `fetchSnapshot`, `refreshState`, and the socket synchronization effect remain completely stable across room state mutations.

### 5. Preserved Architectural Invariants
- **Invariant A (Membership vs. Presence):** `ROOM_LEAVE` on the socket only affects channel broadcasting and ephemeral in-memory presence. Persistent MongoDB membership remains active.
- **Invariant B (Multi-Device Safety):** `RoomPresenceManager.removeSocket()` deletes only the leaving `socketId`. If the user has another active tab or device in the room, `userSockets.size > 0`, `isLastDisconnection === false`, and the user remains online.
- **Invariant C (Idempotent Cleanup):** Repeated cleanup calls on the server are safe no-ops (`this.socketMeta.get(socketId)` returns `undefined`).
- **Invariant D (Route-Level Ownership):** `useRoomState` is only instantiated at the route level in `page.tsx`. Child components never trigger accidental unsubscriptions.
- **Invariant E (Safe Room Switching):** When moving from Room A to Room B, the cleanup emits `ROOM_LEAVE` for Room A before the new effect emits `ROOM_JOIN` for Room B.
- **Invariant F (Safe Reconnection):** Socket reconnect re-emits `ROOM_JOIN` only for the currently active `targetRoomId`.

### 6. Remaining Runtime Verification Scenarios
- Multi-tab presence isolation when closing one tab.
- Rapid room switching between Room A and Room B.
- Network blip socket reconnection handling.

---

## INT-03 — Playback Transition & Singer Handoff Remediation

### 1. Issue Summary & Latency Analysis
In Phase 0, INT-03 identified that when a song reaches the end of its duration, the client timeline displays `00:00` remaining (or 100% progress) while the frontend remains in an apparent "frozen" or "stuck" state for approximately 1–2 seconds before the stage advances to the next track or returns to standby.

Detailed latency breakdown:
1. **Precision Timer vs. Distributed Poller:** The backend combines in-memory node-local `setTimeout` precision timers (`KaraokePlaybackWorker.schedulePrecisionTimer`) with periodic distributed lease scanning (`processDuePlaybacks` polling every 2,000ms via `claimDuePlayback`).
2. **Audio Track Duration Discrepancy:** Native browser `<audio>` playback duration can differ by a few hundred milliseconds from the static `song.durationMs` stored in MongoDB due to audio container metadata or encoding headers.
3. **Timer Event Loop Jitter & Network Transmission:** Even when the precision timer fires promptly, database transaction execution (`advanceToNextTrack`), queue rebalancing, and WebSocket broadcast transmission consume ~100–350ms.
4. **Fallback Poller Window:** If the API process restarted during playback or an in-memory precision timer was cancelled/missed, playback relies on the 2,000ms poller. This produces an average 1,000ms (and up to 2,000ms) delay before lease acquisition.
5. **UI State Ambiguity:** During this ~1-2s gap, `KaraokePlayer.tsx` maintained `isPlaying = true`, displaying `ON AIR` or `ENDING SOON`, while the lyrics engine stayed parked on the final lyric line. Users perceived the application as stalled or unresponsive.

### 2. Root Cause Confirmed from Source
- **Client Render Lag:** `currentPositionMs` was clamped to `durationMs` (`Math.min(durationMs, baseMs + elapsed)` in `use-karaoke.ts`), locking the timer display to `00:00`.
- **Missing Intermediate Visual Phase:** The UI recognized only `loading`, `playing`, `paused`, and `ended`/`idle`. There was no distinct client-side `transitioning` state for the brief interval between track conclusion and receipt of authoritative server state advancement.
- **Audience & Performer Desynchronization:** `SingerTurnIndicator.tsx` continued alerting the active singer that they were live (`ON AIR` / `Singing Live`) and warned the next singer (`Get Ready`) without indicating that the performance had completed and handoff was actively taking place.

### 3. Authoritative Ownership Matrix

| Responsibility | Authoritative Owner | Mechanism | Role of Frontend Replica |
| :--- | :--- | :--- | :--- |
| **Track Completion** | Backend (`KaraokePlaybackWorker` / `karaokeService`) | Atomic CAS transaction with monotonic `playbackVersion` + `queueVersion` | Pure consumer; never self-completes tracks |
| **Queue Advancement** | Backend (`karaokeService.advanceToNextTrack`) | Atomic MongoDB CAS item update (`status: 'playing'`) | Pure consumer; updates TanStack query cache upon socket event |
| **Singer Handoff** | Backend (`RoomModel.currentSingerName`, `RoomQueueItemModel`) | Validates active room membership; rebalances queue positions | Renders current and next singer badges from server payload |
| **Playback Status** | Backend (`RoomPlaybackStateModel.status`) | Distributed lease token locking (`claimDuePlayback`) | Renders `TRANSITIONING` UI state locally when `position >= duration` |
| **Clock Synchronization** | Backend Anchor (`anchorStartedAt`) | NTP-style offset estimation (`clock-sync.service.ts`) | Calculates smooth 10Hz interpolated position |

### 4. Concurrency & Race Condition Safeguards
The backend architecture contains strict concurrency guards to handle overlapping triggers:
1. **Natural Completion vs. Host/Singer Skip:**
   - If a host or singer triggers `skip` while natural completion is underway, both invoke `advanceToNextTrack()`.
   - `advanceToNextTrack()` evaluates `options.expectedPlaybackVersion`. The first operation increments `playbackVersion` (`v -> v+1`).
   - The second operation detects the version mismatch (`current !== expected`) and aborts cleanly without double-advancing the queue.
2. **Duplicate Worker Lease Contention:**
   - In multi-instance deployments, workers race to claim overdue tracks via `claimDuePlayback(instanceId, leaseDurationMs)`.
   - MongoDB CAS guarantees only one worker acquires the unique `leaseToken`.
   - When completing the transition, `commitConditionalPlaybackTransition()` validates the `leaseToken`. Expired or stolen leases are rejected and rolled back.
3. **Departed or Kicked Candidate Singers:**
   - When advancing to the next queued item, `advanceToNextTrack()` performs active membership validation (`RoomMembershipModel.findOne({ status: 'active', kickedAt: null })`).
   - If the candidate performer left or was kicked while in queue, their item is automatically marked `status: 'removed'`, and the engine advances to the next eligible track.
4. **Audio Unavailability Defense:**
   - If a candidate song is missing an audio source (`audioAvailability !== 'audio_available'`), it is marked `status: 'failed'` and skipped safely to prevent stage stalling.

### 5. Implemented Solution
1. **Frontend `isTransitioning` Derived State (`KaraokePlayer.tsx`):**
   - Derived cleanly without mutating server state:
     ```typescript
     const isTransitioning = Boolean(
       currentItem &&
         ((isPlaying && durationMs > 1 && currentPositionMs >= durationMs) ||
           (isEnded && Boolean(nextUpItem)))
     );
     ```
   - When `isTransitioning` is active:
     - Top status badge displays an animated cyan `TRANSITIONING` badge (`stage-status-transitioning`) with a spinner.
     - Top status label displays `"Handoff in progress..."` or `"Wrapping up performance..."`.
     - An authoritative transition overlay banner appears over the stage: `"Song Concluded • Stage Transition"` displaying `"Next Up: [Song Title] • [Next Singer]"`.
     - The interactive progress bar displays an active pulsing cyan gradient at 100%, indicating stage handoff rather than a frozen bar.
     - The `ENDING SOON` badge is safely suppressed during transition.
2. **Performer & Audience Cues (`SingerTurnIndicator.tsx`):**
   - **Current Singer View:** Switches to `"Performance Complete"` with a supportive message: `"Great performance! Wrapping up stage for [Next Song Title]."`
   - **Next Singer View:** Switches to `"Step Up to the Stage!"` with badge `"Stage Handoff"` and prompt: `"Get ready! [Song Title] is taking the spotlight right now!"`
   - **Audience View:** Displays `"Stage Handoff"` badge and notes the upcoming performance handoff.
3. **Proactive Reconciliation Fallback (`use-karaoke.ts`):**
   - Added a safe fallback timer: if `currentPositionMs >= durationMs` and playback remains `'playing'` for >1,500ms without a server push, the client automatically emits `KARAOKE_STATE_REQUEST` (`socket.emit(SOCKET_EVENTS.CLIENT.KARAOKE_STATE_REQUEST, { roomId })`).
   - Ensures fast recovery even if an in-memory precision timer failed or network packet dropped during transition.

### 6. Remaining Limitations & Runtime Verification
- Requires live multi-client testing with simulated network latency to observe smooth visual handoff between outgoing singer and incoming singer.
- High network jitter (>1,000ms RTT) may prolong the visual `TRANSITIONING` state before the next track begins.

---

## INT-02 — Database Retention & Outbox Lifecycle Audit

### 1. Issue Summary & Source Audit Reconciliation
In Phase 0, finding INT-02 reported:
> *"RoomStateOutboxModel, RoomMessageModel, and RoomActivityModel lack automated TTL indexing or scheduled archiving. Implement 30-day TTL index."*

A rigorous line-by-line inspection of the actual MongoDB models revealed critical discrepancies between the Phase 0 report and reality:

| Collection / Model | Actual Existing Indexes in Source | Factual Status | Assessment |
| :--- | :--- | :--- | :--- |
| **`RoomStateOutboxModel`** | `{ createdAt: 1 }` (`expireAfterSeconds: 604800` / 7 days) | **Existing TTL on `createdAt`** | **CRITICAL DEFECT:** Unconditionally purges pending (`publishedAt: null`) and failed events after 7 days, violating delivery invariants. |
| **`RoomMessageModel`** | `{ createdAt: 1 }` (`expireAfterSeconds: 2592000` / 30 days) | **Existing 30-day TTL** | **POLICY REQUIRED:** Index already exists in code (added in Sprint 2.1.1); lacks explicit product-owner sign-off regarding moderation audit retention. |
| **`RoomActivityModel`** | `{ createdAt: 1 }` (`expireAfterSeconds: 604800` / 7 days) | **Existing 7-day TTL** | **POLICY REQUIRED:** Index already exists in code; permanently deletes kick and moderation audit trails after 7 days. |
| **`RoomQueueItemModel`** | `{ roomId: 1, status: 1, position: 1 }`, etc. | **NO TTL index** | **ARCHITECTURAL RISK:** Completed/skipped items accumulate indefinitely without bounds. |
| **`VoiceEvictionTaskModel`** | `{ updatedAt: 1 }` (`expireAfterSeconds: 86400`, `partialFilter: { status: 'completed' }`) | **Exemplary Safe TTL** | **NO FIX REQUIRED:** Purges only completed tasks after 24 hours. Pending/failed tasks never purged. |
| **`VoiceWebhookEventModel`** | `{ createdAt: 1 }` (`expireAfterSeconds: 86400` / 24 hours) | **Existing 24h TTL** | **NO FIX REQUIRED:** Idempotent webhook deduplication window. |
| **`VoiceParticipantSequenceModel`** | `{ updatedAt: 1 }` (`expireAfterSeconds: 86400` / 24 hours) | **Existing 24h TTL** | **NO FIX REQUIRED:** Monotonic sequence tracker cleans up 24h after participant leaves. |
| **`SessionModel`** | `{ expiresAt: 1 }` (`expireAfterSeconds: 0`) | **Existing Safe TTL** | **NO FIX REQUIRED:** Clean TTL on explicit token expiration timestamp. |
| **`RoomMembershipModel`** | `{ roomId: 1, userId: 1 }` (unique partial for `status: 'active'`) | **NO TTL index** | **NO FIX REQUIRED:** Tracks membership and bans (`kickedAt`). Must NOT be automatically deleted. |
| **`RoomModel`** | `{ status: 1 }`, `{ ownerId: 1 }`, etc. | **NO TTL index** | **NO FIX REQUIRED:** Core room entity. Archival requires separate product milestone. |

---

### 2. Outbox Lifecycle & Safety Remediation (Highest Priority)

#### 2.1 Outbox State Lifecycle
The `RoomStateOutboxModel` tracks authoritative room state transitions (`member.joined`, `member.left`, `room.settings.updated`, `room.host.transferred`, etc.):

```mermaid
stateDiagram-v2
  [*] --> Pending: publishRoomStateEvent() [upsert with publishedAt=null, expiresAt=null]
  Pending --> Published: Socket.IO Broadcast Succeeded
  note right of Published
    publishedAt = now
    expiresAt = now + 7 days
    Eligible for TTL cleanup after 7 days post-publish
  end note
  Pending --> Failed: Socket.IO Broadcast Failed / Server Down
  note left of Failed
    lastError recorded
    attemptCount incremented
    publishedAt = null, expiresAt = null
    NEVER purged by TTL
  end note
  Failed --> Retrying: retryPendingOutboxEvents() [attemptCount < 5]
  Retrying --> Published: Retry Broadcast Succeeded
  Retrying --> DeadLetter: Retry Failed [attemptCount >= 5]
  note left of DeadLetter
    expiresAt remains null
    Preserved permanently for manual replay & audit
  end note
```

#### 2.2 Critical Vulnerability in Prior Implementation
The previous index:
`RoomStateOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });`
used `createdAt` without a partial filter. If the Socket server was temporarily offline or a delivery failed, unbroadcast events were silently and permanently deleted by MongoDB after 7 days, destroying the recovery guarantee of the Transactional Outbox pattern.

#### 2.3 Remediation Implemented
1. **Dedicated Expiration Field (`expiresAt`):**
   Added `expiresAt: { type: Date, default: null, index: true }` to `IRoomStateOutbox` and `RoomStateOutboxSchema`.
2. **Selective Safe TTL Index:**
   Replaced the dangerous `{ createdAt: 1 }` index with:
   ```typescript
   RoomStateOutboxSchema.index(
     { expiresAt: 1 },
     {
       expireAfterSeconds: 0,
       partialFilterExpression: { expiresAt: { $type: 'date' } },
     }
   );
   ```
3. **Explicit Lifecycle Assignment (`room-state.publisher.ts`):**
   - On initial record creation: `expiresAt: null`.
   - On broadcast failure: `expiresAt: null`.
   - On successful broadcast / retry: `expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)`.
4. **Safety Invariants Satisfied:**
   - Pending events (`publishedAt === null`) have `expiresAt: null` -> **Never purged**.
   - Failed events (`lastError !== null`) have `expiresAt: null` -> **Never purged**.
   - Actively processing / retrying events have `expiresAt: null` -> **Never purged**.
   - Only events conclusively delivered to subscribers expire 7 days after delivery.

---

### 3. Chat & Activity Retention Policy Proposals

#### 3.1 `RoomMessageModel` (Chat Messages)
- **Current State:** 30-day TTL on `{ createdAt: 1 }` exists in source code since Sprint 2.1.1.
- **Product Policy Questions Requiring Sign-Off:**
  1. *Host Lounge Permanence:* Do room owners expect private lounge chat history to be preserved longer than public lounges?
  2. *Abuse Reporting:* If a user reports abusive chat messages 35 days later, is 30-day deletion acceptable to Legal / Trust & Safety?
- **Recommendations for Product Owner:**
  - **Option 1 (Approve Existing):** Confirm the existing 30-day TTL policy for all chat messages.
  - **Option 2 (Tiered Retention):** Retain public room messages for 30 days, private room messages for 90 days.
  - **Option 3 (Soft Archival):** Migrate messages older than 30 days to cold storage collection before deletion.

#### 3.2 `RoomActivityModel` (Room Activity Feed)
- **Current State:** 7-day TTL on `{ createdAt: 1 }` exists in source code since Sprint 2.1.1.
- **Product Policy Questions Requiring Sign-Off:**
  1. *Moderation Audit Trails:* Moderation events (`member_kicked`, `member_muted`, `member_role_updated`) currently share the same 7-day TTL as ephemeral cheers (`reaction_sent`, `gift_sent`). After 7 days, host moderation logs are lost.
- **Recommendations for Product Owner:**
  - **Option 1 (Separation of Concerns):** Keep 7-day TTL on ephemeral audience events (`member_joined`, `reaction_sent`, `gift_sent`), but exclude moderation events using `partialFilterExpression: { type: { $nin: ['member_kicked', 'member_muted', 'member_role_updated'] } }`.
  - **Option 2 (Dedicated Moderation Collection):** Create `RoomModerationAuditModel` with permanent or 1-year retention for compliance.

#### 3.3 `RoomQueueItemModel` (Karaoke Queue History)
- **Current State:** No TTL index exists. Completed, skipped, and removed songs remain indefinitely.
- **Recommendations for Product Owner:**
  - If "User Singing History" or "Lounge Analytics" is planned for Sprint 4.x / 5.0, retain completed items.
  - If karaoke queue is strictly ephemeral, introduce a 14-day TTL on `{ completedAt: 1 }` for non-active items (`partialFilterExpression: { status: { $in: ['completed', 'skipped', 'removed', 'failed'] } }`).

---

### 4. Implementation Decision Gate Summary

| Finding | Description | Classification | Severity | Action | Status |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **INT-02A** | Outbox age-based TTL deletes pending/failed events | **CONFIRMED DEFECT** | **P1** | **FIX NOW** | **RESOLVED:** Implemented safe `expiresAt` with `partialFilterExpression`. |
| **INT-02B** | Chat message 30-day retention unconfirmed by product policy | **PRODUCT POLICY REQUIRED** | **P2** | **FIX AFTER APPROVAL** | **DOCUMENTED:** Retained existing code; awaiting product sign-off. |
| **INT-02C** | Moderation kick/mute audit logs purged after 7 days | **PRODUCT POLICY REQUIRED** | **P2** | **FIX AFTER APPROVAL** | **DOCUMENTED:** Proposal submitted for tiered activity retention. |
| **INT-02D** | Unbounded growth in completed/skipped karaoke queue items | **ARCHITECTURAL RISK** | **P3** | **FIX AFTER APPROVAL** | **DOCUMENTED:** Proposal submitted for queue item archival/TTL. |
| **INT-02E** | Voice eviction, session, webhook, and sequence TTLs | **NO FIX REQUIRED** | **P3** | **NO FIX REQUIRED** | **VERIFIED:** Existing implementations are bounded and safe. |



