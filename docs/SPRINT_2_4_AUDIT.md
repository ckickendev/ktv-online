# Sprint 2.4 — Architecture & Security Audit: Karaoke Playback Foundation

## 1. Executive Summary & Prerequisite Gate Verification

Sprint 2.4 establishes the foundational karaoke playback domain for **KTVOnline**, transforming social voice rooms into synchronized karaoke lounges.

### Prerequisite Gate Result: **PASS — READY FOR IMPLEMENTATION**

Prior to code implementation, a thorough audit was performed covering:
- Sprint 2.3.2 and 2.3.2.1 implementation reports ([SPRINT_2_3_2_1_IMPLEMENTATION_REPORT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_3_2_1_IMPLEMENTATION_REPORT.md)).
- Voice security and lifecycle specifications ([VOICE_SECURITY_AND_LIFECYCLE.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/VOICE_SECURITY_AND_LIFECYCLE.md)).
- Voice architecture design ([VOICE_ARCHITECTURE.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/VOICE_ARCHITECTURE.md)).
- Existing room membership and authorization services ([room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts), [membership.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/membership.model.ts)).
- Existing Socket.IO infrastructure and presence handling ([socket.server.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/socket.server.ts), [room.events.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room.events.ts)).
- Version-fenced room snapshot recovery ([room-state.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/room-state.ts), [use-room-state.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/use-room-state.ts)).
- Shared contracts package ([packages/contracts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/index.ts)).
- Frontend room and voice architecture ([RoomDetailPage](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/[roomId]/page.tsx), [use-voice-client.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts)).

**Findings**:
1. Voice authorization, participant identity generation, session-family isolation, and webhook idempotency are verified and hardened.
2. Room membership consistency invariant (`Room.currentParticipantsCount === count(active RoomMembership records)`) is strictly preserved across room lifecycles.
3. Socket.IO connection and room-join handlers dynamically verify room status and kick moderation state.
4. No blocking defects were found in the prerequisite foundation.

---

## 2. Invariants & Domain Boundaries

The karaoke domain introduces song catalogs, room song queues, and server-authoritative playback while adhering to the core architectural invariants:

1. **Persistent Room Occupancy Invariant**:
   `Room.currentParticipantsCount === count(active RoomMembership records)`.
   Neither song queue mutations nor playback state transitions ever alter room occupancy or participant counts.
2. **Independent Stage vs. Membership**:
   Adding a song to the queue or singing does not alter membership status. Conversely, leaving or being kicked from the room automatically cleans up the user's queued songs and evicts any active playback initiated by that user.
3. **At Most One Playing Song per Room**:
   A room can have at most one queue item in `playing` status at any given time.
4. **Server-Authoritative Playback**:
   Clients submit commands (e.g., `play`, `pause`, `seek`, `skip`); the backend validates authorization, updates persisted state, increments `playbackVersion`, and broadcasts authoritative snapshots. Clients never dictate wall-clock playback time.
5. **Deterministic Queue Ordering**:
   Queue positions are assigned and maintained exclusively by the backend using integer positions ($1, 2, 3, \dots$). Client-supplied position numbers are rejected.
6. **Closed Room Immutability**:
   Once a room is closed (`status === 'closed'`), all queue additions and playback mutations are strictly forbidden.
7. **Zero Secret Exposure & Media Separation**:
   Song catalog metadata is separated from playable media URLs. Commercial stream extraction, scraping, and pirated media embeds are strictly prohibited. Fixture catalog entries clearly denote mock/development availability.

---

## 3. Workstream Analysis & Architecture Plan

### 3.1 Workstream A: Song Catalog Abstraction
- **Model**: `Song` (`songs` collection in MongoDB).
- **Attributes**:
  - `id`: Unique MongoDB ObjectId string.
  - `provider`: Provider identifier (e.g. `'fixture'`, `'licensed_partner'`).
  - `providerSongId`: External provider reference.
  - `title`, `artist`: Core search and display metadata.
  - `thumbnailUrl`: Optional album / track artwork.
  - `durationMs`: Total duration in milliseconds (integer $> 0$).
  - `language`, `genre`: Filtering and classification attributes.
  - `mediaAvailability`: `'available' | 'restricted' | 'unavailable' | 'fixture_mock'`.
  - `isAvailable`: Boolean flag.
- **Provider Interface**:
  - `ISongCatalogProvider`:
    - `searchSongs(query, options)`: Returns matching songs with pagination.
    - `getSongById(songId)`: Resolves a song by ID.
    - `getPlaybackAvailability(songId)`: Determines if playback is allowed.
  - `FixtureCatalogProvider`: Built-in seed provider with safe royalty-free / demo song entries for development without external scraping.

### 3.2 Workstream B: Persistent Room Queue
- **Model**: `RoomQueueItem` (`roomqueueitems` collection in MongoDB).
- **Attributes**:
  - `roomId`: Reference to `Room`.
  - `songId`: Reference to `Song`.
  - `requestedBy`: Reference to `User` (requester/singer).
  - `position`: 1-based integer position in the active queue.
  - `status`: `'queued' | 'playing' | 'completed' | 'skipped' | 'removed' | 'failed'`.
  - `queueVersion`: Room-scoped monotonic integer incremented on every queue mutation.
  - `addedAt`, `startedAt`, `completedAt`, `removedAt`: State transition timestamps.
- **State Machine**:
  - `queued` $\rightarrow$ `playing` (when playback starts).
  - `queued` $\rightarrow$ `removed` (when requester or host deletes item from queue).
  - `playing` $\rightarrow$ `completed` (when track plays to end).
  - `playing` $\rightarrow$ `skipped` (when host or singer skips).
  - `playing` $\rightarrow$ `removed` (when removed while playing).
  - `playing` $\rightarrow$ `failed` (if media error occurs).
  - Terminal statuses (`completed`, `skipped`, `removed`, `failed`) can never transition back to `queued` or `playing`.
- **Authorization**:
  - Only active room members (`RoomMembership.status === 'active'`) may add songs (`queue:add`).
  - Requesters can remove their own items (`queue:remove`).
  - Room hosts or moderators can remove any member's item or reorder the queue.
  - Max queue size: 50 items per room.

### 3.3 Workstream C: Server-Authoritative Playback State
- **Model**: `RoomPlaybackState` (`roomplaybackstates` collection in MongoDB).
- **Attributes**:
  - `roomId`: Unique reference to `Room` (1-to-1).
  - `currentQueueItemId`: Reference to `RoomQueueItem` or `null`.
  - `status`: `'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'`.
  - `positionMs`: Playback position in milliseconds at the time of the anchor.
  - `anchorStartedAt`: Server wall-clock timestamp when current playback resumed.
  - `pausedAt`: Timestamp when playback was paused.
  - `playbackVersion`: Monotonic integer incremented on every valid transition.
- **Time Anchor Model**:
  $$\text{EffectivePosition}(t) = \begin{cases} \text{positionMs} + (t - \text{anchorStartedAt}), & \text{if status} = \text{'playing'} \\ \text{positionMs}, & \text{if status} = \text{'paused'} \text{ or } \text{'idle'} \end{cases}$$
  - No periodic 1-second writes to MongoDB.
  - Pausing captures the derived position and clears `anchorStartedAt`.
  - Seeking updates `positionMs` and resets `anchorStartedAt = Date.now()`.
- **Commands & Permissions**:
  - Host-only commands: `play`, `pause`, `seek`, `skip`.
  - Singer permissions: The user who requested the currently playing song may also pause/play or skip their own turn.
  - Optimistic concurrency: Every command sends expected `playbackVersion`; stale commands are rejected.

### 3.4 Workstream D: Shared Contracts
- New module `packages/contracts/src/karaoke.ts`:
  - Schemas: `SongDtoSchema`, `SongSearchQuerySchema`, `SongSearchResponseSchema`.
  - Queue schemas: `RoomQueueItemDtoSchema`, `RoomQueueSnapshotDtoSchema`, `AddQueueItemDtoSchema`, `RemoveQueueItemDtoSchema`, `ReorderQueueDtoSchema`.
  - Playback schemas: `PlaybackStateDtoSchema`, `PlaybackCommandDtoSchema`, `PlaybackSnapshotDtoSchema`.
  - Socket event names in `SOCKET_EVENTS`:
    - `CLIENT.KARAOKE_QUEUE_ADD`: `'karaoke:queue:add'`
    - `CLIENT.KARAOKE_QUEUE_REMOVE`: `'karaoke:queue:remove'`
    - `CLIENT.KARAOKE_QUEUE_REORDER`: `'karaoke:queue:reorder'`
    - `CLIENT.KARAOKE_PLAYBACK_COMMAND`: `'karaoke:playback:command'`
    - `CLIENT.KARAOKE_STATE_REQUEST`: `'karaoke:state:request'`
    - `SERVER.KARAOKE_QUEUE_UPDATED`: `'karaoke:queue:updated'`
    - `SERVER.KARAOKE_PLAYBACK_UPDATED`: `'karaoke:playback:updated'`
    - `SERVER.KARAOKE_SNAPSHOT`: `'karaoke:snapshot'`

### 3.5 Workstream E: REST Endpoints
- `GET /api/v1/rooms/:roomId/queue` — Returns active room queue snapshot.
- `POST /api/v1/rooms/:roomId/queue` — Adds a song to room queue.
- `DELETE /api/v1/rooms/:roomId/queue/:itemId` — Removes item from queue.
- `POST /api/v1/rooms/:roomId/queue/reorder` — Reorders queue items (host only).
- `GET /api/v1/rooms/:roomId/playback` — Returns authoritative playback state snapshot.
- `POST /api/v1/rooms/:roomId/playback/command` — Submits playback command (play, pause, seek, skip).
- `GET /api/v1/songs/search` — Searches song catalog with query, genre, language filters.

### 3.6 Workstream F: Realtime Synchronization
- Attached to existing Socket.IO server.
- Verifies room channel membership and authenticates active user credentials per event.
- Publishes versioned queue and playback delta events to `room:${roomId}` channel.
- Supports full snapshot recovery on reconnect (`karaoke:state:request`).

### 3.7 Workstream G: Frontend Karaoke Experience
- In `apps/web/src/features/karaoke/`:
  - `KaraokePlayer`: Primary virtual screen, lyrics canvas placeholder, audio playback bar, sync timekeeper hook.
  - `CurrentSongPanel`: Title, artist, singer badge, progress, lyrics simulation.
  - `PlaybackControls`: Host/singer play, pause, seek, skip controls with role-based disabling.
  - `RoomSongQueue`: Active queue list with requester avatar, turn numbers, drag/reorder or delete buttons.
  - `SongSearchDialog`: Modal to search catalog, filter genres, preview duration, and add to queue.
  - `SingerTurnIndicator`: Prominent banner indicating whose turn it is to sing.
- Integrated into `RoomDetailPage` replacing simulated stage mocks.

---

## 4. Concurrency & Optimistic Locking Strategy

1. **Queue Position Rebalancing**:
   When an item is deleted or skipped, remaining active queued items have their positions rebalanced ($1 \dots N$) atomically within the room queue transaction or atomic batch, bumping `queueVersion`.
2. **Optimistic Version Fencing**:
   `RoomPlaybackState` carries `playbackVersion: number`. Command execution validates `expectedVersion === current.playbackVersion`. If a conflict occurs, command is rejected with `STALE_PLAYBACK_VERSION`.
3. **Single Playing Item Mutual Exclusion**:
   Starting a new track checks `{ roomId, status: 'playing' }` and transitions existing active tracks to `completed` or `skipped` atomically before marking the next item `playing`.

---

## 5. Audit Conclusion

The architecture satisfies all requirements of Sprint 2.4 without compromising existing room membership, socket presence, or LiveKit voice infrastructure. Implementation may proceed.
