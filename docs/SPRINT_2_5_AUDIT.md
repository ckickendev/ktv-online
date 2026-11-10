# Sprint 2.5 — Existing Infrastructure & Karaoke Playback Experience Audit

## 1. Executive Summary & Audit Mission

Sprint 2.5 initiates the product experience and playback integration phase of KTVOnline. The primary objective is to transform the server-authoritative room queue and state coordination engine into a functional, end-to-end karaoke playback experience.

This audit inspects the current repository across the backend (`apps/api`), web frontend (`apps/web`), and shared contracts (`packages/contracts`) to determine what exists, what is missing, what can be reused, and what architectural boundaries must be respected.

---

## 2. Answers to Audit Questions

### 1. Does the current backend expose enough information to resolve actual backing-track audio?
**Finding: No.**
- [SongDto](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/karaoke.ts) only contains metadata: `id`, `provider`, `providerSongId`, `title`, `artist`, `thumbnailUrl`, `durationMs`, `language`, `genre`, and `mediaAvailability`.
- No endpoint exists to resolve a playable audio URL, stream URI, or MIME type for a song.
- [song-catalog.provider.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/song-catalog.provider.ts) defines `ISongCatalogProvider` with `searchSongs`, `getSongById`, and `getPlaybackAvailability`, but has no method for resolving backing-track audio streams.

### 2. Does the current Song model distinguish audio availability from metadata availability?
**Finding: Partially, but insufficiently.**
- The [SongModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/song.model.ts) and [SongMediaAvailabilitySchema](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/karaoke.ts) define an enum: `['available', 'restricted', 'unavailable', 'fixture_mock']`.
- However, all 12 seeded fixture songs are tagged `mediaAvailability: 'fixture_mock'`, yet none of them contain actual audio URLs. The system does not distinguish between a song whose metadata is discoverable in catalog search versus a song that has verified playable backing audio.
- An explicit availability classification (`metadata_only`, `audio_available`, `audio_unavailable`, `restricted`) and audio resolution response are required.

### 3. Is there an existing lyrics provider or timed lyrics representation?
**Finding: No.**
- There are no models, schemas, DTOs, or endpoints for lyrics anywhere in the repository.
- Neither synchronized (timed) lyrics nor plain lyrics exist in [packages/contracts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/karaoke.ts) or [apps/api](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke).
- A structured timed lyrics contract (`TimedLyricLine`, `SongLyricsDto`) and a lyrics provider abstraction must be introduced.

### 4. Does the frontend currently play actual audio or only render a playback visualizer?
**Finding: Only renders a playback visualizer.**
- Inspection of [KaraokePlayer.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/KaraokePlayer.tsx) reveals that it renders CSS animated soundwave bars and a seekable progress bar.
- There is **no `<audio>` tag**, no `HTMLAudioElement`, no Web Audio API node, and no media streaming integration.
- Playback progress is simulated visually by calculating elapsed time from the server time anchor without producing any sound.

### 5. Does playback progress derive from the authoritative server anchor?
**Finding: Yes.**
- In [use-karaoke.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke.ts) (lines 120–156), `currentPositionMs` is derived smoothly at 10Hz:
  $$ \text{elapsed} = \max(0, \text{Date.now()} - \text{anchorStartedAt}) $$
  $$ \text{derivedPositionMs} = \min(\text{durationMs}, \text{positionMs} + \text{elapsed}) $$
- This client calculation accurately mirrors the backend's server anchor calculation in [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) and provides the single source of truth for synchronization.

### 6. Can clients distinguish a song that is queued from one that is actually playable?
**Finding: No.**
- All items in the queue and search results appear identical in terms of capability.
- Users can enqueue any catalog item, and if the room is idle, [karaoke.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts) immediately promotes it to `status: 'playing'`, even when no playable audio stream exists.
- The UI requires explicit badges and indicators distinguishing playable tracks from metadata-only catalog entries.

### 7. Does playback completion remain server-authoritative?
**Finding: Yes.**
- The backend owns track lifecycle through [KaraokePlaybackScheduler](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts) and [KaraokePlaybackWorker](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke-playback.worker.ts).
- Natural track completion advances the queue via [advanceToNextTrack](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts) with version fencing and distributed lease verification.
- The browser must NOT trigger authoritative track completion when its local audio element reaches the end.

### 8. Can playback recover after Socket.IO reconnect?
**Finding: Yes.**
- In [use-karaoke.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke.ts), on the `connect` event, the client emits `KARAOKE_STATE_REQUEST` with the current `roomId`.
- The server responds with `KARAOKE_SNAPSHOT`, updating TanStack query cache and version refs if the snapshot has higher or equal version counters.
- The audio player hook must re-sync local playback position to the new snapshot upon recovery.

### 9. Are LiveKit remote audio and karaoke backing audio managed independently?
**Finding: Not currently integrated.**
- LiveKit voice is managed by [use-voice-client.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts), which attaches remote audio tracks (`Track.Source.Microphone`) to distinct `HTMLAudioElement` instances.
- Karaoke audio currently does not exist.
- When karaoke audio is added, it must use its own independent audio output element and volume controls, completely separated from LiveKit's microphone input track to prevent audio echo and loopback into voice chat.

### 10. Are there existing limitations in browser autoplay and audio output handling?
**Finding: Yes.**
- All modern browsers (Chrome, Safari, Firefox, Edge) enforce autoplay policies: calling `HTMLMediaElement.play()` without prior user interaction in the current document context rejects with a `NotAllowedError`.
- If a host starts a song, other room members who have not yet interacted with the page will have their audio playback blocked by the browser.
- The frontend must catch autoplay rejection and display an interactive banner allowing the user to click to enable audio.

---

## 3. Existing Components & Capabilities

### Backend Components
- [SongModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/song.model.ts): MongoDB model for catalog metadata, indexed by title, artist, genre, language.
- [FixtureCatalogProvider](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/song-catalog.provider.ts): In-memory seed catalog with 12 mock songs.
- [RoomQueueItemModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts): Persistent queue items tracking position, requester, status, and queue version.
- [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts): Playback state machine with server time-anchor fields (`positionMs`, `anchorStartedAt`, `playbackVersion`, `leaseToken`).
- [karaoke.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts): Authoritative orchestration of queue mutations, playback commands, transitions, and permission checks.
- [karaoke.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.controller.ts) & [karaoke.routes.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.routes.ts): REST endpoints for search, queue, and playback commands.
- [karaoke.events.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/karaoke.events.ts): Realtime Socket.IO broadcasts and acknowledgements.

### Frontend Components
- [KaraokePlayer.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/KaraokePlayer.tsx): Virtual stage screen, progress bar, current song panel.
- [PlaybackControls.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/PlaybackControls.tsx): Buttons for play, pause, seek, skip, stop with host/singer authorization gating.
- [RoomSongQueue.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/RoomSongQueue.tsx) & [QueueItem.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/QueueItem.tsx): Interactive queue list with remove and reorder.
- [SongSearchDialog.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/SongSearchDialog.tsx): Modal catalog browser with genre and language filtering.
- [use-karaoke.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke.ts): React hook integrating TanStack Query, Socket.IO listeners, smooth progress interpolation, and mutation dispatchers.
- [use-voice-client.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts): LiveKit voice connection and audio track management.

---

## 4. Missing Capabilities & Identified Gaps

1. **Audio Source Resolution**: No backend endpoint (`/api/v1/songs/:songId/audio/resolve`) or provider interface to resolve playable audio streams.
2. **Audio Provider Abstraction**: No modular abstraction separating song metadata from audio storage or streaming providers.
3. **Playable Audio Player**: No client-side audio player executing backing tracks synchronized with server state.
4. **Drift Correction Engine**: No synchronization algorithm aligning local audio playback with the authoritative server time anchor.
5. **Autoplay Handling**: No mechanism to detect or recover from browser `play()` promise rejections.
6. **Timed Lyrics Representation**: No contract or storage for timed lyric lines (`TimedLyricLine`).
7. **Lyrics Resolution API**: No endpoint (`/api/v1/songs/:songId/lyrics`) to fetch lyrics for a song.
8. **Lyrics Display Stage**: No frontend component rendering auto-scrolling, synchronized karaoke lyrics.
9. **Authorized Playable Fixture Tracks**: The existing 12 fixture songs represent commercial copyright works without playable media; authorized public domain / royalty-free playable tracks with timed lyrics are missing.
10. **Independent Audio Controls**: No separate backing audio volume slider or mute toggle in the karaoke UI.

---

## 5. Required Contract Changes

In [packages/contracts/src/karaoke.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/karaoke.ts):
1. **Audio Availability & Source Schemas**:
   - `AudioAvailabilitySchema`: `'metadata_only' | 'audio_available' | 'audio_unavailable' | 'restricted'`.
   - `AudioSourceProvenanceSchema`: Provider, license classification (`royalty_free`, `public_domain`, `licensed_commercial`, `development_fixture`), attribution.
   - `ResolvedAudioSourceDtoSchema`: `url`, `mimeType`, `expiresAt`, `attribution`, `availability`.
2. **Timed Lyrics Schemas**:
   - `TimedLyricLineSchema`: `id`, `startMs`, `endMs`, `text`, `translation`.
   - `SongLyricsDtoSchema`: `songId`, `provider`, `lines`, `language`, `hasTimedLyrics`, `attribution`.
3. **Structured Playback Error Codes**:
   - `SONG_AUDIO_UNAVAILABLE`, `SONG_AUDIO_RESOLUTION_FAILED`, `LYRICS_UNAVAILABLE`, `PLAYBACK_AUTOPLAY_BLOCKED`.

---

## 6. Implementation Plan & Workstreams

| Phase | Workstream | Primary Objectives |
| :--- | :--- | :--- |
| **Phase 1** | Audit & Architecture | Document existing code, gaps, contracts, and licensing constraints. |
| **Phase 2** | Audio Source Foundation | Implement `IKaraokeAudioSourceProvider`, `AudioSourceService`, resolve endpoint, and authorized playable fixtures. |
| **Phase 3** | Browser Audio Player | Implement `useKaraokeAudioPlayer` hook with drift correction, autoplay recovery, and generation fencing. |
| **Phase 4** | Synchronized Lyrics | Implement lyrics contract, `LyricsService`, fixture timed lyrics, and `LyricsStage` component. |
| **Phase 5** | Room UI Integration | Integrate `LyricsStage`, audio volume slider, autoplay banner, and song availability badges into `KaraokePlayer`. |
| **Phase 6** | Voice Chat Integration | Verify strict separation between LiveKit microphone audio and karaoke backing audio. |
| **Phase 7** | Recovery & Observability | Harden reconnect recovery, generation fencing, structured error logging, and static verification. |
| **Phase 8** | Documentation | Create implementation report and dedicated architecture specifications. |
