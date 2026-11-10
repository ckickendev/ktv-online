# Sprint 2.4 — Implementation Report: Karaoke Playback Foundation

## 1. Prerequisite Gate Result

- **Gate Status**: **PASSED**
- **Date**: 2026-11-10
- **Pre-Implementation Deliverable**: [SPRINT_2_4_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_4_AUDIT.md)
- **Summary**:
  Sprint 2.3.2 and 2.3.2.1 voice infrastructure, webhook durable ordering, participant session-family isolation, and room membership invariants were audited. No blocking defects were found. Room membership count invariant (`Room.currentParticipantsCount === count(active RoomMembership records)`) is fully respected and isolated from karaoke queue and playback state.

---

## 2. Audit Findings

1. **Voice Infrastructure Stability**: Existing LiveKit voice rooms are independent of room queue and playback state. Voice presence does not mutate playback state; playback state does not alter room occupancy.
2. **MongoDB Concurrency Strategy**: To enforce the invariant that at most one song can play in a room simultaneously without holding multi-document distributed locks, a MongoDB partial unique index on `{ roomId: 1, status: 1 }` with `{ partialFilterExpression: { status: 'playing' } }` was established.
3. **Playback Time Anchor Strategy**: Instead of persisting 1-second ticks into MongoDB, a server time anchor model was implemented (`positionMs`, `anchorStartedAt`), allowing continuous sub-second client visual rendering with zero continuous database write load.
4. **Member Eviction & Departure Integration**: Whenever a member leaves or is kicked, their pending queued songs are marked `removed`, positions are rebalanced, and if they were singing, playback advances to the next track.

---

## 3. Files Created and Modified

### Created Files
1. `docs/SPRINT_2_4_AUDIT.md`: Pre-implementation audit and prerequisite gate verification.
2. `docs/KARAOKE_PLAYBACK_ARCHITECTURE.md`: Complete domain, queue, and playback architecture specification.
3. `docs/SPRINT_2_4_IMPLEMENTATION_REPORT.md`: This comprehensive implementation report.
4. `packages/contracts/src/karaoke.ts`: Shared Zod schemas, TypeScript types, and DTOs for songs, queues, playback states, commands, and realtime payloads.
5. `apps/api/src/modules/karaoke/song.types.ts`: TypeScript domain definitions for songs and Mongoose documents.
6. `apps/api/src/modules/karaoke/song.model.ts`: Mongoose schema and model for persistent song catalog with text and provider indexes.
7. `apps/api/src/modules/karaoke/song-catalog.provider.ts`: Catalog provider interface (`ISongCatalogProvider`) and fixture provider (`FixtureCatalogProvider`).
8. `apps/api/src/modules/karaoke/song.service.ts`: Song search, lookup, and database fixture seeding service.
9. `apps/api/src/modules/karaoke/room-queue-item.model.ts`: Mongoose model for persistent room queue with partial unique index enforcing single-playing invariant.
10. `apps/api/src/modules/karaoke/room-playback-state.model.ts`: Mongoose model for server-authoritative room playback state and monotonic versions.
11. `apps/api/src/modules/karaoke/karaoke.service.ts`: Core business logic service for queue management, playback commands, time anchor derivation, rebalancing, and room/member lifecycle hooks.
12. `apps/api/src/modules/karaoke/karaoke.controller.ts`: Thin Express controller handling REST endpoints with parameter and payload validation.
13. `apps/api/src/modules/karaoke/karaoke.routes.ts`: REST routes for song catalog, queue, and playback.
14. `apps/api/src/realtime/karaoke.events.ts`: Socket.IO realtime broadcasters and authenticated event handlers.
15. `apps/web/src/features/karaoke/api/karaoke-api.ts`: Frontend REST API client for karaoke operations.
16. `apps/web/src/features/karaoke/hooks/use-karaoke.ts`: React hook combining TanStack Query, Socket.IO realtime event synchronization, and client-side smooth time-anchor interpolation.
17. `apps/web/src/features/karaoke/components/CurrentSongPanel.tsx`: Current song details, album cover, and requester metadata component.
18. `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx`: Turn notification component indicating active singer, next up singer, or open stage.
19. `apps/web/src/features/karaoke/components/PlaybackControls.tsx`: Authoritative controls for play, pause, seek, rewind, forward, stop, and skip.
20. `apps/web/src/features/karaoke/components/QueueItem.tsx`: Individual queue item component with position, requester, remove button, and host reordering arrows.
21. `apps/web/src/features/karaoke/components/RoomSongQueue.tsx`: Room queue list component with capacity tracking, empty state, and "Add Song" CTA.
22. `apps/web/src/features/karaoke/components/SongSearchDialog.tsx`: Modal dialog for searching royalty-free catalog sample tracks with debounce and genre filter pills.
23. `apps/web/src/features/karaoke/components/KaraokePlayer.tsx`: Main virtual stage player surface with animated equalizer visualizer, seekable progress bar, and integrated controls.
24. `apps/web/src/features/karaoke/components/index.ts`: Export barrel for karaoke UI components.
25. `apps/web/src/features/karaoke/index.ts`: Public feature barrel for `@/features/karaoke`.

### Modified Files
1. `packages/contracts/src/realtime.ts`: Added karaoke event constants to `SOCKET_EVENTS.CLIENT` and `SOCKET_EVENTS.SERVER`.
2. `packages/contracts/src/index.ts`: Exported `./karaoke.js`.
3. `apps/api/src/routes/index.ts`: Mounted `karaokeRoutes` onto `/api/v1`.
4. `apps/api/src/server.ts`: Initialized song catalog fixtures on server bootstrap.
5. `apps/api/src/realtime/index.ts`: Exported `karaoke.events.js`.
6. `apps/api/src/realtime/socket.server.ts`: Registered karaoke socket event handlers and hooked member eviction/room closure cleanup.
7. `apps/api/src/modules/rooms/room.service.ts`: Integrated karaoke cleanup on `closeRoom` and `leaveRoom`.
8. `apps/web/src/hooks/queries/query-keys.ts`: Added `karaoke` query keys (`queue`, `playback`, `songs`).
9. `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`: Replaced simulated stage and mock queue with `KaraokePlayer`, `RoomSongQueue`, and `SongSearchDialog`.

---

## 4. Domain Implementation

### 4.1 Workstream A — Song Catalog Abstraction
- Designed `ISongCatalogProvider` interface with `searchSongs`, `getSongById`, and `getPlaybackAvailability`.
- Implemented `FixtureCatalogProvider` with 12 royalty-free mock sample tracks clearly tagged with `mediaAvailability: 'fixture_mock'`.
- Song catalog is fully decoupled from media delivery URLs, preventing client-supplied unverified media URLs.

### 4.2 Workstream B — Persistent Room Queue
- Implemented `RoomQueueItemModel` with states: `queued`, `playing`, `completed`, `skipped`, `removed`, `failed`.
- Enforced maximum queue capacity ($50$ songs per room).
- Deterministic 1-based positions assigned by the server; clients cannot supply position.
- Rebalancing logic ensures gapless ordering when songs are skipped or deleted.
- Partial unique index on `{ roomId: 1, status: 'playing' }` guarantees at most one track is playing at any time.

### 4.3 Workstream C — Server-Authoritative Playback State
- Implemented `RoomPlaybackStateModel` storing `positionMs` and `anchorStartedAt`.
- Dynamic derived position calculation avoids write-heavy 1-second server ticks.
- Monotonic `playbackVersion` increments on every transition to reject stale out-of-order commands.
- Auto-advancement: when derived position reaches track duration, the track is completed and the next queued song is loaded automatically.

### 4.4 Workstream D — Shared Contracts
- Complete Zod schemas and TypeScript interfaces in `@ktv/contracts/karaoke`:
  - `SongDto`, `SongSearchQuery`, `SongSearchResponse`
  - `RoomQueueItemDto`, `RoomQueueSnapshotDto`, `AddQueueItemDto`, `RemoveQueueItemDto`, `ReorderQueueDto`
  - `PlaybackStateDto`, `PlaybackCommandDto`, `KaraokeSnapshotDto`
  - Realtime socket payloads (`KaraokeQueueUpdatedPayload`, `KaraokePlaybackUpdatedPayload`, `KaraokeStateRequestPayload`)

### 4.5 Workstream E — REST APIs
- `GET /api/v1/songs/search`: Catalog query with text search, genre, and language filters.
- `GET /api/v1/rooms/:roomId/queue`: Room queue snapshot.
- `POST /api/v1/rooms/:roomId/queue`: Enqueue track (requires active room membership).
- `DELETE /api/v1/rooms/:roomId/queue/:itemId`: Remove queued song (requester or host).
- `POST /api/v1/rooms/:roomId/queue/reorder`: Reorder queue (host only).
- `GET /api/v1/rooms/:roomId/playback`: Authoritative playback state snapshot.
- `POST /api/v1/rooms/:roomId/playback/command`: Submit authoritative playback command (host or active singer).

### 4.6 Workstream F — Realtime Synchronization
- Registered handlers for `karaoke:queue:add`, `karaoke:queue:remove`, `karaoke:queue:reorder`, `karaoke:playback:command`, and `karaoke:state:request`.
- Broadcasters emit `karaoke:queue:updated` and `karaoke:playback:updated` to the `room:${roomId}` channel after persistence commits.
- Monotonic version checking in `useKaraoke` ignores stale out-of-order socket events.
- Socket reconnection fetches fresh snapshots via `karaoke:state:request`.

### 4.7 Workstream G — Frontend Karaoke Experience
- Integrated `KaraokePlayer` into `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`.
- Displays real-time singer turn alerts (`SingerTurnIndicator`), current song metadata (`CurrentSongPanel`), and authoritative controls (`PlaybackControls`).
- Interactive queue management (`RoomSongQueue`, `QueueItem`) with host reordering controls.
- Interactive catalog search modal (`SongSearchDialog`) with genre filters and transparent fixture notices.

---

## 5. Queue and Playback State Transitions

```
[REST / Socket Command]
          │
          ▼
   Authorize Role & Membership
          │
          ▼
   Version Check (playbackVersion / queueVersion)
          │
          ▼
   Commit to MongoDB (Song / Queue / Playback Collections)
          │
          ▼
   Broadcast Realtime Event (Room Channel)
          │
          ▼
   Clients Reconcile Cache (TanStack Query / Socket.IO)
```

---

## 6. Authorization & Concurrency Guarantees

1. **Active Membership Constraint**: Non-members cannot enqueue songs or control playback.
2. **Playback Control Authorization**: Only the host or the current active singer can pause, resume, seek, skip, or stop playback.
3. **Queue Removal Policy**: Members can only remove their own queued songs; hosts can remove any song.
4. **Queue Reordering**: Strictly restricted to the room host.
5. **Closed Room Protection**: Queue additions and playback mutations return HTTP 400 when room status is `closed`.
6. **Double-Play Prevention**: MongoDB partial unique index prevents concurrent requests from setting more than one item to `playing` in the same room.

---

## 7. Static Verification Results

All static checks were executed in accordance with engineering constraints:

### 1. Typecheck: `@ktv/contracts`
```bash
$ pnpm --filter @ktv/contracts typecheck
> tsc --noEmit
Exit Code: 0 (Passed cleanly)
```

### 2. Typecheck: `@ktv/api`
```bash
$ pnpm --filter @ktv/api typecheck
> tsc --noEmit
Exit Code: 0 (Passed cleanly)
```

### 3. Typecheck: `@ktv/web`
```bash
$ pnpm --filter @ktv/web typecheck
> tsc --noEmit
Exit Code: 0 (Passed cleanly)
```

### 4. Monorepo Workspace Typecheck
```bash
$ pnpm typecheck
> pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck: Done in 769ms
apps/api typecheck: Done in 1.4s
apps/web typecheck: Done in 2.1s
Exit Code: 0 (Passed cleanly across all packages)
```

### 5. Monorepo Workspace Lint
```bash
$ pnpm lint
> pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint: Done in 727ms
apps/api lint: Done in 996ms
apps/web lint: ✔ No ESLint warnings or errors
Exit Code: 0 (Passed cleanly with 0 errors and 0 warnings)
```

---

## 8. Deferred Runtime Verification

The following operational scenarios are intentionally deferred until runtime verification in a future sprint:
1. End-to-end Socket.IO connection recovery under simulated packet loss.
2. MongoDB replication failover during concurrent queue reorder mutations.
3. Cross-browser client audio synchronization across high-latency WAN connections.
4. Commercial licensed media streaming provider integration and CDN token distribution.
5. Live pitch detection, vocal isolation, and scoring algorithms.

---

## 9. Remaining Risks

1. **Clock Drift Between Client and Server**: The time anchor derives playback progress from server time; significant client clock skew could produce slight visual desynchronization on the frontend progress bar until the next anchor event.
2. **Provider Licensing Gate**: Production deployment requires connecting a commercial licensed catalog provider to replace development fixtures.

---

## 10. Final Verdict

**CODE COMPLETE — NOT RUNTIME VERIFIED**
