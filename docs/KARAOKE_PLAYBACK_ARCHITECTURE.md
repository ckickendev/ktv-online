# Karaoke Playback Architecture Specification

## 1. Overview & System Mission

The Karaoke Playback domain upgrades KTVOnline's social voice lounges into full-fledged karaoke rooms. It introduces:
1. **Song Catalog Abstraction**: Separation of track metadata from media transport; modular catalog provider interface.
2. **Persistent Room Song Queue**: Server-ordered, persistent FIFO queue tracking requester, status, and deterministic queue positions.
3. **Server-Authoritative Playback State**: A stable time-anchor engine that calculates continuous playback positions without write-heavy polling.
4. **Realtime Synchronization**: Monotonic versioning (`queueVersion`, `playbackVersion`) broadcast over Socket.IO with recovery.
5. **Interactive Frontend Player**: Rich UI with responsive stage surface, visualizer, queue management, and catalog search.

---

## 2. Core Domain Models & Schemas

### 2.1 Song Catalog (`SongModel`)

Collection: `songs`

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique song identifier |
| `provider` | `String` | Catalog provider identifier (e.g., `'fixture'`, `'licensed_partner'`) |
| `providerSongId` | `String` | Provider-specific track reference ID |
| `title` | `String` | Song title (text indexed) |
| `artist` | `String` | Performing artist (text indexed) |
| `thumbnailUrl` | `String` (optional) | Album artwork / cover image URL |
| `durationMs` | `Number` | Track duration in milliseconds ($> 0$) |
| `language` | `String` | Language code (e.g. `'en'`, `'vi'`, `'ja'`, `'ko'`) |
| `genre` | `String` | Genre classification (e.g. `'pop'`, `'rock'`, `'ballad'`) |
| `mediaAvailability`| `String` | `'available'`, `'unavailable'`, `'fixture_mock'`, `'licensed_stream'` |
| `metadata` | `Mixed` (optional) | Extensible metadata (key, BPM, licensing tags) |
| `createdAt` / `updatedAt` | `Date` | Mongoose auto-timestamps |

**Indexes**:
- Unique compound: `{ provider: 1, providerSongId: 1 }`
- Text compound: `{ title: 'text', artist: 'text' }`
- Secondary indexes: `{ genre: 1 }`, `{ language: 1 }`

---

### 2.2 Room Song Queue Item (`RoomQueueItemModel`)

Collection: `roomqueueitems`

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Queue item ID |
| `roomId` | `ObjectId` | Foreign key referencing `Room` |
| `songId` | `ObjectId` | Foreign key referencing `Song` |
| `requestedBy` | `ObjectId` | Foreign key referencing `User` (the requester/singer) |
| `position` | `Number` | 1-based ordering index for `queued` items; 0 for `playing`/terminal |
| `status` | `String` | `'queued'`, `'playing'`, `'completed'`, `'skipped'`, `'removed'`, `'failed'` |
| `addedAt` | `Date` | Timestamp when item was enqueued |
| `startedAt` | `Date` (optional) | Timestamp when item entered `'playing'` status |
| `completedAt` | `Date` (optional) | Timestamp when item reached terminal state |
| `removedAt` | `Date` (optional) | Timestamp when item was deleted |

**Indexes**:
- Compound queue index: `{ roomId: 1, status: 1, position: 1 }`
- Partial Unique Index enforcing the single-playing invariant at database level:
  `{ roomId: 1, status: 1 }` with `{ partialFilterExpression: { status: 'playing' }, unique: true }`
- Cleanup index: `{ roomId: 1, requestedBy: 1, status: 1 }`

---

### 2.3 Room Playback State (`RoomPlaybackStateModel`)

Collection: `roomplaybackstates`

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary key |
| `roomId` | `ObjectId` (unique) | Target room |
| `currentQueueItemId` | `ObjectId` (nullable) | Currently playing queue item |
| `status` | `String` | `'idle'`, `'loading'`, `'playing'`, `'paused'`, `'ended'`, `'error'` |
| `positionMs` | `Number` | Base position in ms at time anchor |
| `anchorStartedAt` | `Date` (nullable) | Server timestamp when playback started/resumed |
| `pausedAt` | `Date` (nullable) | Server timestamp when playback was paused |
| `playbackVersion` | `Number` | Monotonically incrementing version integer |
| `queueVersion` | `Number` | Monotonically incrementing queue version integer |
| `playbackExpiresAt` | `Date` (nullable) | Server-computed natural completion timestamp |
| `lastTransitionId` | `String` (nullable) | UUID tracking last logical transition |
| `claimedBy` | `String` (nullable) | Worker instance holding current lease |
| `claimedAt` | `Date` (nullable) | Timestamp lease was acquired |
| `leaseExpiresAt` | `Date` (nullable) | Timestamp lease expires |
| `leaseToken` | `String` (nullable) | Unique token for lease verification |
| `leaseVersion` | `Number` | Monotonic lease version counter |

**Indexes**:
- Unique index: `{ roomId: 1 }`
- Distributed lease query index: `{ status: 1, playbackExpiresAt: 1, leaseExpiresAt: 1 }`

---

## 3. State Machines & Transitions

### 3.1 Queue Item State Transitions

```mermaid
stateDiagram-v2
    [*] --> queued: Enqueued by Active Member
    queued --> playing: Auto-advanced or Host Started
    queued --> removed: Requester Removed / Host Removed / Member Left
    playing --> completed: Natural Track Completion (Derived Time >= Duration)
    playing --> skipped: Host or Singer Skipped
    playing --> removed: Room Closed / Singer Left / Host Removed
    playing --> failed: Media Error Encountered
    completed --> [*]
    skipped --> [*]
    removed --> [*]
    failed --> [*]
```

#### Terminal State Safeguards
- Terminal states (`completed`, `skipped`, `removed`, `failed`) can never re-enter `queued` or `playing`.
- Any mutation attempting to transition a terminal item is rejected.

---

### 3.2 Authoritative Playback State Transitions

```mermaid
stateDiagram-v2
    idle --> loading: Song Queued & Playback Triggered
    loading --> playing: Playback Commenced (anchorStartedAt Set)
    playing --> paused: Host / Singer Pause (positionMs Frozen, anchor Cleared)
    paused --> playing: Host / Singer Resume (anchorStartedAt Reset to now)
    playing --> ended: Track Duration Reached
    playing --> idle: Queue Empty or Stopped
    playing --> error: Media Provider / Sync Error
    paused --> idle: Stopped or Queue Cleared
    ended --> loading: Next Song in Queue Ready
    ended --> idle: No Songs Remaining
    error --> idle: Recovered / Skipped
```

---

## 4. Server-Authoritative Playback Time Anchor Model

### Why Not 1-Second DB Ticking?
Periodic database writes every second across active rooms would incur extreme I/O overhead and introduce race conditions across horizontally scaled API replicas.

### The Time Anchor Solution
The authoritative playback clock is determined strictly by two persisted values:
1. `positionMs`: The fixed elapsed playback milliseconds when the anchor was set.
2. `anchorStartedAt`: The server UTC timestamp when playback started or resumed.

#### Derived Position Formula
When querying playback state at server time $T_{\text{now}}$:
$$
\text{elapsedMs} = \max(0, T_{\text{now}} - \text{anchorStartedAt})
$$
$$
\text{derivedMs} = \min(\text{song.durationMs}, \text{positionMs} + \text{elapsedMs})
$$

#### State Modifications:
- **Pause**: $\text{positionMs} \leftarrow \text{derivedMs}$, $\text{anchorStartedAt} \leftarrow \text{null}$, $\text{pausedAt} \leftarrow T_{\text{now}}$.
- **Play / Resume**: $\text{anchorStartedAt} \leftarrow T_{\text{now}}$, $\text{pausedAt} \leftarrow \text{null}$.
- **Seek($P_{\text{target}}$)**:
  - If playing: $\text{positionMs} \leftarrow P_{\text{target}}$, $\text{anchorStartedAt} \leftarrow T_{\text{now}}$.
  - If paused: $\text{positionMs} \leftarrow P_{\text{target}}$.
- **Track Auto-Completion**: If $\text{derivedMs} \ge \text{song.durationMs}$, the track completes and advances the queue to the next item automatically.

---

## 5. API & Socket.IO Contract Architecture

### 5.1 REST Endpoints

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/songs/search` | Optional | Search song catalog by query, genre, language |
| `GET` | `/api/v1/rooms/:roomId/queue` | Optional | Retrieve current room queue snapshot |
| `POST` | `/api/v1/rooms/:roomId/queue` | Required | Enqueue a song (active members only) |
| `DELETE` | `/api/v1/rooms/:roomId/queue/:itemId` | Required | Remove song from queue (owner or host) |
| `POST` | `/api/v1/rooms/:roomId/queue/reorder` | Required | Reorder queued songs (host only) |
| `GET` | `/api/v1/rooms/:roomId/playback` | Optional | Retrieve authoritative playback state snapshot |
| `POST` | `/api/v1/rooms/:roomId/playback/command` | Required | Execute playback control command (`play`, `pause`, etc.) |

---

### 5.2 Realtime Socket.IO Events

#### Client to Server
- `karaoke:queue:add`: `{ roomId, songId, correlationId? }`
- `karaoke:queue:remove`: `{ roomId, itemId, correlationId? }`
- `karaoke:queue:reorder`: `{ roomId, itemIds, expectedQueueVersion?, correlationId? }`
- `karaoke:playback:command`: `{ roomId, command, positionMs?, expectedPlaybackVersion?, correlationId? }`
- `karaoke:state:request`: `{ roomId, correlationId? }`

#### Server to Client (Channel: `room:${roomId}`)
- `karaoke:queue:updated`: `{ roomId, queue, action, affectedItemId?, occurredAt }`
- `karaoke:playback:updated`: `{ roomId, playback, command?, initiatedByUserId?, occurredAt }`
- `karaoke:snapshot`: `{ roomId, playback, queue, serverTimestamp }`
- `karaoke:error`: `{ code, message, correlationId? }`

---

## 6. Security, Authorization & Concurrency Invariants

### 6.1 Authorization Matrix

| Action | Allowed Roles | Validation Rules |
| :--- | :--- | :--- |
| **Add Song to Queue** | Active Room Members | Room must not be closed; max queue size ($50$) enforced |
| **Remove Own Song** | Requester (Owner) | Active membership or host override |
| **Remove Other's Song** | Room Host | Host role verified in `RoomMembershipModel` / `Room.ownerId` |
| **Reorder Queue** | Room Host | Only items in `queued` status can be reordered |
| **Play / Pause / Seek / Skip** | Host OR Current Active Singer | Other room members cannot manipulate playback |
| **State Inspection** | Room Participants | Private room access restricted to members |

---

### 6.2 Concurrency, Topology & Monotonicity
1. **Single Playing Track**: MongoDB partial unique index guarantees that two concurrent requests cannot insert or update two queue items to `playing` status in the same room.
2. **Production & Staging Topology Enforcement**:
   - Production (`production`) and staging (`staging`) strictly require a MongoDB Replica Set supporting multi-document ACID transactions.
   - [checkTransactionSupport](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) probes database capabilities at startup with a bounded 5000ms timeout. If standalone MongoDB is detected or transactions are unsupported in production or staging, the application fails closed immediately with [UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts).
   - Ingress readiness (`/api/v1/health/ready`) returns HTTP 503 if transactions are unavailable in production or staging.
   - In local development (`NODE_ENV === 'development'`), standalone MongoDB is supported for basic workflows under best-effort recovery protocols with explicit startup warnings that standalone mode is NOT ACID-compatible.
3. **Queue Reorder Protocol (Option A Enforced)**:
   - Queue reorder requires multi-document atomicity across all queued items and `queueVersion`.
   - On standalone MongoDB, multi-document reordering is **explicitly disabled** (Option A). Calling `reorderQueue` throws [UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts), returning HTTP 501 / `UNSUPPORTED_TOPOLOGY_FOR_REORDER`.
   - In replica set transaction mode, all queue item reads, bulk updates, and `queueVersion` advancements share the same transaction session, with full coverage validation and structured `STALE_QUEUE_VERSION` (HTTP 409) conflict handling.
4. **Distributed Lease Fencing & Atomic Release**:
   - Background workers claim overdue playbacks using atomic `findOneAndUpdate` that assigns a cryptographically unique `leaseToken`, `leaseExpiresAt`, and increments `leaseVersion`.
   - Outcome writes commit via [commitConditionalPlaybackTransition](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) verifying `playbackVersion`, `currentQueueItemId`, `leaseToken`, and `leaseExpiresAt > now`.
   - Lease releases ([releasePlaybackLease](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts)) strictly match `{ roomId, leaseToken }` and increment `leaseVersion` monotonically via `$inc: { leaseVersion: 1 }`. If Worker A's lease expired and Worker B acquired generation 2, Worker A's release matches 0 documents and cannot clear Worker B's lease.
   - Lease expiry sweeps ([releaseExpiredLeases](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts)) conditionally filter `{ leaseExpiresAt: { $lte: now }, leaseToken: { $ne: null } }` and increment `leaseVersion`.
   - Lease renewal via [renewPlaybackLease](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) requires matching `leaseToken` and `leaseExpiresAt > now`.
5. **Version Responsibilities & Monotonicity**:
   - `queueVersion`: Co-located on [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) as the authoritative room-scoped queue coordinator. Advanced monotonically on enqueues, removals, reorders, position rebalancing, and track advancements.
   - `playbackVersion`: Authoritative coordinator for playback state transitions (play, pause, seek, stop, skip, natural track completion).
   - `stateVersion`: Authoritative coordinator on [RoomModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts) for room membership, participation, and lifecycle.
6. **Room Closure**: Closing a room immediately stops playback, sets state to `idle`, marks all active queue items `removed`, cancels precision timers, and increments versions within an atomic transaction.
7. **Member Departure**: When a member leaves or is evicted, their queued items are cleanly removed, remaining items are rebalanced, `queueVersion` is incremented, and if their song was playing, playback advances to the next track with current item identity fencing.
8. **Self-Healing Reconciliation & Ambiguity Safety**:
   - Startup and periodic sweeps detect and repair orphaned references, closed room state leaks, stray playing items on idle playback, position gaps, and expired worker leases.
   - **Deterministic Gaps vs Ambiguous Collisions**: Invariant 7 distinguishes clean sequential gaps (compacted deterministically) from duplicate position collisions. When duplicate positions occur, reconciliation logs structured diagnostics, flags `operatorInterventionRequired: true` and `ambiguityDetected: true`, and refuses to invent an ordering or advance `queueVersion`.
   - For `QUEUE_PLAYING_ITEM_WITH_IDLE_PLAYBACK`, reconciliation executes a CAS fence on `RoomPlaybackStateModel` (requiring `status: 'idle'` and matching `playbackVersion`) and targets only the specific orphaned item IDs. If a concurrent play command activated the stage, the CAS fence aborts without modifying items.
   - Realtime publication occurs strictly post-commit.

---

## 7. Catalog Provider Abstraction

```typescript
export interface ISongCatalogProvider {
  readonly providerName: string;
  searchSongs(query: SongSearchQuery): Promise<SongSearchResponse>;
  getSongById(providerSongId: string): Promise<SongDto | null>;
  getPlaybackAvailability(providerSongId: string): Promise<MediaAvailability>;
}
```

The system uses `FixtureCatalogProvider` for development and testing with sample tracks. The domain architecture allows swapping in licensed commercial providers without modifying room queue logic or data models.

---

## 8. Audio Source Abstraction & Streaming Architecture (Sprint 2.5)

### 8.1 Core Provider Interface

Separates track catalog metadata from media stream resolution:

```typescript
export interface IKaraokeAudioSourceProvider {
  readonly providerId: string;
  supports(song: ISongDocument): boolean;
  resolvePlayback(song: ISongDocument): Promise<ResolvedAudioSourceDto>;
  getAudioStream?(song: ISongDocument): Promise<{
    stream: NodeJS.ReadableStream;
    contentLength: number;
    mimeType: string;
    isSeekable: boolean;
  }>;
}
```

### 8.2 Track Availability Semantics

- `audio_available`: Valid, playable backing audio file exists. Eligible for playback.
- `metadata_only`: Track details exist for catalog browsing, but no audio stream is attached. Attempting to start/play this track returns `SONG_AUDIO_UNAVAILABLE`.
- `audio_unavailable`: Temporarily or permanently disabled.
- `restricted`: Blocked due to licensing or room policy.

### 8.3 Development Fixture Audio Streaming

Development environments utilize an in-memory pure PCM stereo WAV 44.1kHz 16-bit procedural generator (`fixture-audio.generator.ts`), providing four authorized, royalty-free and public domain tracks (`fix_auld_lang_syne`, `fix_amazing_grace`, `fix_scarborough_fair`, `fix_synth_groove`) with full HTTP 206 Partial Content range streaming.

---

## 9. Synchronized Lyrics & Player Engine (Sprint 2.5)

1. **Timed Lyrics Abstraction (`ILyricsProvider`)**: On-demand retrieval (`GET /api/v1/songs/:songId/lyrics`) decoupled from realtime WebSocket updates.
2. **Deterministic Synchronization**: Active lyric lines and proportional progress sweeps are derived directly from the server-authoritative playback position (`currentPositionMs`).
3. **Three-Tier Drift Correction**:
   - $< 300$ ms: Ignored.
   - $300 - 1500$ ms: Tempo adjustment (`playbackRate = 1.05 / 0.95`).
   - $> 1500$ ms: Hard seek to server anchor.
4. **Autoplay Handling**: Rejection on non-interacted browser tabs displays an accessible "Listen Now" unlock banner without corrupting server room state.
5. **LiveKit Voice Decoupling**: Backing audio streams strictly through browser `HTMLAudioElement` and is never mixed into LiveKit microphone publishing tracks.
