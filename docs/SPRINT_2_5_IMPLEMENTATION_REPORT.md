# Sprint 2.5 — Karaoke Playback Experience Foundation Implementation Report

## Final Verdict
**`CODE COMPLETE — NOT RUNTIME VERIFIED`**

---

## 1. Sprint Scope & Summary

Sprint 2.5 transforms KTVOnline's server-authoritative room queue and playback state infrastructure into an end-to-end karaoke playback experience.

The implementation establishes:
1. **Audio Source Provider Abstraction**: Decoupling song catalog metadata from playable media streams with explicit availability semantics.
2. **Copyright & Legal Compliance Boundary**: Rejection of audio ripping, scraping, or unlicensed redistribution; explicit provenance and licensing classifications.
3. **Procedural Development Audio Generator**: Pure PCM stereo WAV 44.1kHz 16-bit generator with HTTP 206 Partial Content range requests for 4 authorized public domain / royalty-free fixture tracks.
4. **Browser Audio Playback Engine**: Native `HTMLAudioElement` integration with generation-fenced asynchronous resolution, three-tier drift correction, autoplay block detection, and independent volume controls.
5. **Timed Lyrics Architecture**: REST-based lyrics fetching (`ILyricsProvider`), deterministic synchronization projected from `currentPositionMs`, auto-scrolling with progressive gradient sweep, and empty/instrumental handling.
6. **LiveKit Voice Decoupling**: Complete segregation between browser backing-track audio playback and WebRTC microphone capture, preventing acoustic feedback loops.
7. **Room Player UI**: Integrated `KaraokePlayer` featuring dynamic stage view switching (Lyrics vs Visualizer), `CurrentSongPanel` with availability badges, `RoomSongQueue` status indicators, and `SongSearchDialog` with Playable Audio filtering.

---

## 2. Initial Architecture Audit

Conducted and recorded in [SPRINT_2_5_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_5_AUDIT.md).

Key findings:
- Previous models lacked separation between song catalog metadata and playable backing-track media.
- Seeded commercial songs had no attached media files or licensing agreements.
- The web frontend visualizer animated purely on local CSS keyframes without decoding or streaming actual audio.
- Timed lyrics contracts did not exist.
- Playback synchronization relied on server time anchors (`positionMs`, `anchorStartedAt`), but lacked client-side drift compensation.

---

## 3. Actual Audio Source Availability

A song appearing in the KTVOnline catalog does not imply audio or lyrics are available.

### Catalog Status Post-Sprint 2.5:
1. **Commercial Sample Songs**: Marked `audioAvailability: 'audio_unavailable'` / `'metadata_only'`, `lyricsAvailability: 'unavailable'`, `licenseClassification: 'licensed_commercial'`. Attempting to start/play these tracks throws structured error `SONG_AUDIO_UNAVAILABLE`.
2. **Authorized Development Fixtures (4 Tracks)**:
   - `fix_auld_lang_syne` ("Auld Lang Syne") — Public Domain. Full playable backing audio and timed lyrics.
   - `fix_amazing_grace` ("Amazing Grace") — Public Domain. Full playable backing audio and timed lyrics.
   - `fix_scarborough_fair` ("Scarborough Fair") — Public Domain. Full playable backing audio and timed lyrics.
   - `fix_synth_groove` ("Neon City Synthwave") — Royalty-Free. Full playable backing audio and timed lyrics.

---

## 4. Audio Provider Abstraction

Implemented `IKaraokeAudioSourceProvider` in [audio-source.types.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/audio-source.types.ts):

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

Managed centrally by [AudioSourceService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/audio-source.service.ts) and implemented by [FixtureAudioSourceProvider](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/fixture-audio.provider.ts).

---

## 5. Song Availability & Resolution Lifecycle

1. **Availability States**:
   - `metadata_only`: Browsable only.
   - `audio_available`: Resolvable stream URL available.
   - `audio_unavailable`: Temporarily or permanently disabled.
   - `restricted`: Access restricted by room or licensing policy.
2. **Server-Enforced Guard**: In [karaoke.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts), `play` and `advanceToNextTrack` reject tracks without `audio_available` with `SONG_AUDIO_UNAVAILABLE`.
3. **HTTP Range Streaming**: In [karaoke.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.controller.ts), `GET /songs/:songId/audio/stream` handles `Range: bytes=start-end`, streaming 206 Partial Content slices.

---

## 6. Actual Browser Audio Playback Implementation

Implemented in [use-karaoke-audio.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts):
- Native `HTMLAudioElement` encapsulated inside a custom React hook.
- Persistent volume and mute state stored in browser `localStorage` (`ktv_karaoke_volume`, `ktv_karaoke_muted`).
- Generation fencing prevents stale asynchronous audio resolutions from replacing newer tracks.
- Autoplay block detection: catches `NotAllowedError` on `play()`, sets `isAutoplayBlocked = true`, and exposes `unlockAutoplay()`.
- Dedicated error banner on audio stream failure with a "Retry Audio" action.

---

## 7. Playback Synchronization Algorithm

Three-tier drift correction in `use-karaoke-audio.ts`:
1. $|\Delta| < 300$ ms: Imperceptible. Normal playback rate ($1.0\times$).
2. $300\text{ ms} \le |\Delta| \le 1500$ ms: Glitch-free tempo adjustment ($1.05\times$ if behind, $0.95\times$ if ahead).
3. $|\Delta| > 1500$ ms: Hard seek to server anchor (`audio.currentTime = authoritativePositionMs / 1000`).

---

## 8. Lyrics Data & Provider Architecture

- Contract: `TimedLyricLine` and `SongLyricsDto` in `@ktv/contracts`.
- Interface: `ILyricsProvider` in [lyrics.types.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/lyrics.types.ts).
- Provider: `FixtureLyricsProvider` supplying timed lyrics for all 4 authorized fixture tracks.
- Service: `LyricsService` resolving lyrics on demand.
- Endpoint: `GET /api/v1/songs/:songId/lyrics`.

---

## 9. Lyrics Synchronization Implementation

Implemented in [LyricsStage.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/LyricsStage.tsx):
- Active line index is a pure projection of authoritative `currentPositionMs`.
- Smooth auto-scrolling with `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- Active line features progressive gradient sweep reflecting line progress.
- Subdued previous lines and readable upcoming lines.
- Instrumental break indicator for intervals $> 8000$ ms without lyrics.

---

## 10. Room Player UI Implementation

- [KaraokePlayer.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/KaraokePlayer.tsx): Interactive stage toggle between Timed Lyrics (`LyricsStage`) and Soundwave Visualizer, autoplay unlock alert banner, and buffering indicator.
- [CurrentSongPanel.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/CurrentSongPanel.tsx): Badges for Audio Availability (`Backing Audio` vs `Metadata Only`), Lyrics (`Timed Lyrics`), and License Classification (`Dev Fixture`, `Public Domain`).
- [PlaybackControls.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/PlaybackControls.tsx): Independent backing track volume slider and mute toggle.
- [QueueItem.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/QueueItem.tsx): Audio and lyrics indicators in queue list.
- [SongSearchDialog.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/SongSearchDialog.tsx): "Playable Audio Only" filter pill and song availability indicators.

---

## 11. LiveKit Audio Separation

1. Backing audio plays strictly through browser `HTMLAudioElement` and is never routed to WebRTC microphone publishing tracks.
2. Voice chat captures strictly the microphone input via LiveKit SDK.
3. Karaoke backing volume control does not affect microphone input sensitivity.
4. Muting microphone does not mute karaoke backing audio.

---

## 12. Reconnect & Recovery Handling

1. Generation fencing on audio loading discards obsolete resolution promises.
2. Browser `ended` event does not mutate persistent room queue state.
3. Room exit cleans up audio element sources (`audio.src = ''`), preventing duplicate audio on reconnect.
4. Reconnection snapshot hydration updates `playbackVersion` and reconciles local audio element with server anchor.

---

## 13. API & Shared Contract Changes

### In `@ktv/contracts`:
- Added `AudioAvailabilitySchema` (`metadata_only`, `audio_available`, `audio_unavailable`, `restricted`).
- Added `AudioLicenseClassificationSchema` (`licensed_commercial`, `royalty_free`, `public_domain`, `user_supplied_authorized`, `development_fixture`).
- Added `LyricsAvailabilitySchema` (`timed_available`, `text_only`, `unavailable`).
- Added `ResolvedAudioSourceDtoSchema` and type.
- Added `TimedLyricLineSchema` and `SongLyricsDtoSchema` and types.
- Updated `SongDtoSchema` with `audioAvailability`, `lyricsAvailability`, and `licenseClassification`.

### In `apps/api`:
- `GET /api/v1/songs/:songId`: Returns song details with availability.
- `POST /api/v1/songs/:songId/audio/resolve`: Resolves playable audio stream URL.
- `GET /api/v1/songs/:songId/audio/stream`: Streams audio bytes with HTTP 206 Partial Content.
- `GET /api/v1/songs/:songId/lyrics`: Returns timed lyric lines.

---

## 14. Database Schema Changes

All schema changes are additive and backward-compatible with default values:
- `SongModel`: Added `audioAvailability` (default: `'audio_unavailable'`), `lyricsAvailability` (default: `'unavailable'`), and `licenseClassification` (default: `'licensed_commercial'`).
- Preserved existing `provider` and `providerSongId` compound index.
- No destructive migrations executed; seed catalog updated idempotently via `ensureSeedSongs()`.

---

## 15. Files Created & Modified

### Created Files:
1. `apps/api/src/modules/karaoke/fixture-audio.generator.ts`
2. `apps/api/src/modules/karaoke/audio-source.types.ts`
3. `apps/api/src/modules/karaoke/fixture-audio.provider.ts`
4. `apps/api/src/modules/karaoke/audio-source.service.ts`
5. `apps/api/src/modules/karaoke/lyrics.types.ts`
6. `apps/api/src/modules/karaoke/fixture-lyrics.provider.ts`
7. `apps/api/src/modules/karaoke/lyrics.service.ts`
8. `apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts`
9. `apps/web/src/features/karaoke/components/LyricsStage.tsx`
10. `docs/SPRINT_2_5_AUDIT.md`
11. `docs/KARAOKE_AUDIO_SOURCE_ARCHITECTURE.md`
12. `docs/KARAOKE_LYRICS_ARCHITECTURE.md`
13. `docs/KARAOKE_PLAYER_ARCHITECTURE.md`
14. `docs/SPRINT_2_5_IMPLEMENTATION_REPORT.md`

### Modified Files:
1. `packages/contracts/src/karaoke.ts`
2. `apps/api/src/modules/karaoke/song.types.ts`
3. `apps/api/src/modules/karaoke/song.model.ts`
4. `apps/api/src/modules/karaoke/song-catalog.provider.ts`
5. `apps/api/src/modules/karaoke/song.service.ts`
6. `apps/api/src/modules/karaoke/karaoke.service.ts`
7. `apps/api/src/modules/karaoke/karaoke.controller.ts`
8. `apps/api/src/modules/karaoke/karaoke.routes.ts`
9. `apps/api/src/realtime/karaoke.events.ts`
10. `apps/web/src/features/karaoke/api/karaoke-api.ts`
11. `apps/web/src/hooks/queries/query-keys.ts`
12. `apps/web/src/features/karaoke/components/KaraokePlayer.tsx`
13. `apps/web/src/features/karaoke/components/CurrentSongPanel.tsx`
14. `apps/web/src/features/karaoke/components/PlaybackControls.tsx`
15. `apps/web/src/features/karaoke/components/QueueItem.tsx`
16. `apps/web/src/features/karaoke/components/SongSearchDialog.tsx`
17. `apps/web/src/features/karaoke/components/index.ts`
18. `apps/web/src/features/karaoke/index.ts`
19. `docs/KARAOKE_PLAYBACK_ARCHITECTURE.md`
20. `docs/KARAOKE_PLAYBACK_CONSISTENCY.md`
21. `docs/DEVELOPMENT.md`

---

## 16. Static Verification Commands & Results

Allowed static verification commands executed under the Code-Only policy:

### 1. TypeScript Strict Type Check
```bash
pnpm typecheck
```
- **Exit Code**: `0`
- **Output**:
  ```text
  Scope: 3 of 4 workspace projects
  packages/contracts typecheck: tsc --noEmit (Done in 847ms)
  apps/api typecheck: tsc --noEmit (Done in 1.8s)
  apps/web typecheck: tsc --noEmit (Done in 2.5s)
  ```

### 2. ESLint Static Code Analysis
```bash
pnpm lint
```
- **Exit Code**: `0`
- **Output**:
  ```text
  Scope: 3 of 4 workspace projects
  packages/contracts lint: eslint src/ (Done in 989ms)
  apps/api lint: eslint src/ (Done in 1.1s)
  apps/web lint: next lint (Done in 1.9s)
  ✔ No ESLint warnings or errors
  ```

---

## 17. Deferred Runtime Verification

In adherence to the Code-Only policy, the following runtime verifications were strictly deferred:
- Browser manual listening test of generated PCM audio chords.
- Audio drift synchronization across two simulated remote browser clients.
- LiveKit voice chat microphone pass-through with concurrent backing audio.
- Browser tab suspension and tab switching audio drift recovery.
- End-to-end integration test runs (Vitest / Playwright / Jest).

---

## 18. Licensing Dependencies & Owner Actions

1. **Commercial Catalog Provider Integration**: Product owners must evaluate and contract with a licensed karaoke catalog partner (e.g., Sunfly, Stingray Karaoke, or Karafun B2B).
2. **Performance Rights Organization (PRO) Clearances**: Public performance streaming licenses (ASCAP, BMI, SESAC, GEMA, etc.) are required prior to offering commercial music streams.
3. **Authorized Staging Audio Bucket**: If deploying staging environments with real backing tracks, configure an S3/GCS bucket with presigned URL expiration.

---

## 19. Known Limitations

- Procedural development audio uses synthesized musical chords rather than human instrumental recordings.
- Lyrics styling provides line-level gradient sweeps; syllable-level word timestamping is not yet modeled in `@ktv/contracts`.
- Autoplay unlock requires one user tap or click per browser session if browser autoplay policy blocks unmuted audio.

---

## 20. Recommended Next Sprint

**Sprint 2.6: Realtime Performance Quality & Audio Experience Polish**
1. Syllable-level timed lyrics support (`wordTimestamps` array on `TimedLyricLine`).
2. Audio output device selector (enabling headphones vs external speaker selection via `setSinkId`).
3. Backing audio equalizer and vocal reverb presets.
4. Commercial catalog provider pilot integration with signed URL token expiration.

---

### Final Verdict: `CODE COMPLETE — NOT RUNTIME VERIFIED`
