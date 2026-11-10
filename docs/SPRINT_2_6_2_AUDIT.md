# Sprint 2.6.2 — Audio Lifecycle & Streaming Reliability Audit

## 1. Audit Context & Scope

This audit reviews the complete audio delivery and media execution lifecycle for KTVOnline, from song selection and source resolution to progressive streaming, buffering, network recovery, and resource teardown.

**Inspected Backend Components:**
- `IKaraokeAudioSourceProvider` (`apps/api/src/modules/karaoke/audio-source.types.ts`)
- `AudioSourceService` (`apps/api/src/modules/karaoke/audio-source.service.ts`)
- `FixtureAudioSourceProvider` (`apps/api/src/modules/karaoke/fixture-audio.provider.ts`)
- `FixtureAudioGenerator` (`apps/api/src/modules/karaoke/fixture-audio.generator.ts`)
- `KaraokeController` (`apps/api/src/modules/karaoke/karaoke.controller.ts`)
- `karaoke.routes.ts` (`apps/api/src/modules/karaoke/karaoke.routes.ts`)
- Contracts (`packages/contracts/src/karaoke.ts`)

**Inspected Frontend Components:**
- `useKaraokeAudio` (`apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts`)
- `useKaraoke` (`apps/web/src/features/karaoke/hooks/use-karaoke.ts`)
- `karaokeApi` (`apps/web/src/features/karaoke/api/karaoke-api.ts`)
- `KaraokePlayer` (`apps/web/src/features/karaoke/components/KaraokePlayer.tsx`)

---

## 2. Answers to Audit Questions

### 1. How is an audio source resolved?
The browser requests `POST /api/v1/songs/:songId/audio/resolve`. `AudioSourceService.resolveAudioSource` verifies that `song.audioAvailability === 'audio_available'`, delegates to the registered `IKaraokeAudioSourceProvider`, and returns a `ResolvedAudioSourceDto` containing the stream URL (`/api/v1/songs/:songId/audio/stream`), MIME type, licensing classification, and optional expiration metadata.

### 2. Does the API return a permanent URL or temporary URL?
The fixture provider returns a persistent URL pointing to the streaming endpoint. The contract includes `expiresAt?: string`, which supports future commercial providers returning time-limited signed tokens.

### 3. What happens when the source URL expires during playback?
Currently, there is no expiration check or refresh mechanism on the client. If a signed URL expires mid-playback, subsequent range requests fail with HTTP 401/403, and the browser media engine halts with `MEDIA_ERR_NETWORK`.

### 4. Does the streaming endpoint support HTTP Range correctly?
Partially. `AudioSourceService.streamAudio` parses standard `bytes=start-end` ranges. However:
- Suffix ranges (e.g. `bytes=-500` for the last 500 bytes) are misparsed.
- Malformed range headers (e.g. `bytes=abc-xyz`) produce `NaN` byte boundaries.
- `HEAD` requests (`req.method === 'HEAD'`) are not explicitly handled.
- Inverted ranges (`start > end`) are not rejected with HTTP 416.
- Client disconnects mid-stream are not hooked to cancel upstream processing.

### 5. Does the endpoint return correct Content-Length and Content-Range?
Yes for standard partial ranges (`bytes start-end/totalSize` with partial length), but error responses for 416 do not always set `Content-Range: bytes */totalSize` with empty bodies.

### 6. How are invalid ranges handled?
If `start >= totalSize || end >= totalSize`, it returns HTTP 416. However, if `start > end`, `start < 0`, or parsing fails, it fails to emit a clean 416 Range Not Satisfiable.

### 7. Can a client request arbitrary files through the streaming endpoint?
No. `songId` is strictly validated as a MongoDB `ObjectId` and queried against the `SongModel`. No user-provided path is passed to the filesystem.

### 8. Is source authorization enforced?
Resolution (`/songs/:songId/audio/resolve`) uses `optionalAuth`. It should require authenticated membership when resolving room-scoped or protected tracks.

### 9. Does the browser retry after a network failure?
No. Any failure in `karaokeApi.resolveAudioSource` immediately sets `executionState = 'failed'` and halts without automated retries.

### 10. Can multiple source resolutions run concurrently for the same track?
Yes, rapid re-renders can initiate redundant resolution fetches. While generation fencing prevents stale commits, coalescing in-flight resolution promises is needed.

### 11. Can an old source resolution replace a newer track?
No. `loadGenerationRef` increments monotonically on song transition and discards stale resolutions. However, pending network requests are not actively aborted.

### 12. Can an audio element survive room unmount accidentally?
In `useKaraokeAudio`, the cleanup pauses audio and clears `src = ''`. However, explicitly calling `audio.load()` is required by browser engines to immediately abort background media decoding threads.

### 13. Can two audio elements play the same backing track?
A single `useKaraokeAudio` hook manages one `HTMLAudioElement` stored in `audioRef`. However, during component remounts or hot reloads, overlapping instances must synchronously pause and reset.

### 14. Does reconnect recreate audio unnecessarily?
No, the audio element is preserved across socket reconnects. However, snapshot recovery must verify whether the current track is still valid before triggering a reload.

### 15. Does buffering incorrectly trigger playback synchronization correction?
Resolved in Sprint 2.6.1: drift correction is strictly bypassed when `isBuffering === true` or `audio.readyState < 3`.

---

## 3. Identified Gaps & Deficiencies

1. **Incomplete HTTP Range Parser**: Lacks support for suffix ranges (`bytes=-N`), `HEAD` requests, malformed header protection, and client abort listeners.
2. **Missing Network Retry with Backoff**: Frontend lacks automated retries with exponential backoff and jitter for transient network failures during audio resolution.
3. **Missing `AbortError` Filtering on `play()`**: Changing tracks or pausing while an `audio.play()` promise is pending throws `AbortError`, which was previously caught and erroneously flagged as `PLAYBACK_START_FAILED`.
4. **Missing In-Flight Resolution Coalescing**: Rapid re-renders can trigger duplicate HTTP requests for the same song ID.
5. **Missing Media Pipeline Reset on Unmount**: Needs explicit `audio.load()` call on unmount to completely release browser audio decode threads.
6. **No Proactive Token Refresh on Expiration**: If `expiresAt` is present, the player should verify freshness before playing.

---

## 4. Implementation Plan for Sprint 2.6.2

1. **HTTP Range Parser Hardening (`AudioSourceService`)**:
   - Support `bytes=start-end`, `bytes=start-`, and `bytes=-suffix`.
   - Support `HEAD` requests setting correct `Content-Length`, `Content-Type`, and `Accept-Ranges: bytes` without a body.
   - Return clean HTTP 416 `Content-Range: bytes */${totalSize}` for invalid/inverted/NaN ranges.
   - Client disconnect listener (`req.on('close')`) to cancel streaming operations.
2. **Audio Source Resolution Contract Updates**:
   - Update `ResolvedAudioSourceDto` with `supportsByteRange: boolean`, `isPlayable: boolean`.
   - Validate song availability and reject unplayable songs.
3. **Frontend Execution State Machine & Retry Engine (`useKaraokeAudio`)**:
   - Support `reconnecting` and retryable failure classification.
   - Bounded retries (up to 3 attempts) with exponential backoff and jitter for transient network failures.
   - Filter `AbortError` on `play()` promises as expected lifecycle transitions.
   - Proactive token expiration checking before playback.
4. **Audio Element Ownership & Teardown**:
   - Add explicit `audio.load()` on room unmount/leave to flush browser media buffers.
   - Invalidate in-flight promises with generation fencing and cancel pending retry timeouts.
5. **Observability & Diagnostics**:
   - Structured diagnostics for streaming ranges, retry attempts, recovery reasons, and aborts.
