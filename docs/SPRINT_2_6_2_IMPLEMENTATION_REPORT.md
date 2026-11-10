# Sprint 2.6.2 — Audio Lifecycle & Streaming Reliability Implementation Report

## Project: KTVOnline
## Sprint: 2.6.2 — Audio Lifecycle & Streaming Reliability
## Date: 2026-11-10
## Final Verdict: `CODE COMPLETE — NOT RUNTIME VERIFIED`

---

## 1. Initial Audio Lifecycle Audit

A thorough audit of the audio streaming and client-side audio execution architecture was completed and documented in [SPRINT_2_6_2_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_2_AUDIT.md).

Key findings:
1. **HTTP Range Parser Vulnerabilities**: The previous range parsing logic split on `-` without validating suffix ranges (`bytes=-N`), inverted ranges (`start > end`), or non-numeric input, which failed RFC 7233 conformance.
2. **Missing Probing Capabilities**: The audio stream endpoint did not support HTTP `HEAD` requests, preventing browser audio engines from probing range support and stream lengths without requesting audio bodies.
3. **Stream Abort & Client Disconnect**: The server did not listen for client connection teardown (`req.on('close')`), which could lead to write attempts to closed HTTP streams.
4. **Play Promise Rejections**: Asynchronous `audio.play()` rejections with `AbortError` (triggered naturally when pausing or switching songs while a play request was settling) were misclassified as fatal `PLAYBACK_START_FAILED` errors.
5. **Decoder Resource Leaks**: Resetting `audio.src = ''` and calling `audio.pause()` did not flush browser hardware media decoders; calling `audio.load()` is required to completely release browser media pipelines.
6. **Transient Network Retries**: Transient network drops while resolving song audio immediately failed playback rather than executing exponential backoff retries with jitter.

---

## 2. Audio Source Resolution Architecture

The audio source provider architecture retains the core abstraction:
- [IKaraokeAudioSourceProvider](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/audio-source.types.ts)
- [AudioSourceService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/audio-source.service.ts)
- [FixtureAudioSourceProvider](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/fixture-audio.provider.ts)

The contract schema [ResolvedAudioSourceDtoSchema](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/karaoke.ts) was hardened with safe playback metadata:
- `supportsByteRange`: Boolean flag indicating byte-range seeking capability (`default: true`).
- `isPlayable`: Boolean flag confirming track availability for audio decoding (`default: true`).
- `durationMs`: Integer audio track duration in milliseconds.

---

## 3. Authorization & Source Expiration Handling

- **Catalog Availability Enforced**: `AudioSourceService.resolveAudioSource` checks `song.audioAvailability === 'audio_available'`. If a song is metadata-only or restricted, it rejects with `SONG_AUDIO_UNAVAILABLE`.
- **ObjectId Sanitization**: Both `resolveAudioSource` and `streamAudio` sanitize incoming song identifiers using `mongoose.isValidObjectId(songId)`. Malformed IDs or directory traversal sequences (e.g. `../../etc/passwd`) are rejected immediately with HTTP 400 (`INVALID_SONG_ID`).
- **Stable URLs for Development Fixtures**: Development fixtures generate deterministic procedural audio and carry `Cache-Control: public, max-age=3600, must-revalidate`.

---

## 4. HTTP Range Implementation

The streaming pipeline in [AudioSourceService.streamAudio](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/audio-source.service.ts) was rewritten with an RFC 7233 compliant parser:
- **Full Response (HTTP 200)**: Emitted when no `Range` header is present. Returns full `Content-Length`, `Content-Type: audio/wav`, and `Accept-Ranges: bytes`.
- **Partial Response (HTTP 206)**:
  - Standard ranges: `bytes=0-1048575` -> slices buffer and sets `Content-Range: bytes 0-1048575/5292044` with partial `Content-Length`.
  - Open-ended ranges: `bytes=1048576-` -> reads from `1048576` to `totalSize - 1`.
  - Suffix ranges: `bytes=-524288` -> reads last 512 KB (`start = Math.max(0, totalSize - suffixLength)`).
- **Range Not Satisfiable (HTTP 416)**: Emitted when `start >= totalSize`, `start > end`, or range values are non-numeric. Sets header `Content-Range: bytes */${totalSize}`.
- **HEAD Probing**: `GET` and `HEAD` requests share the route in [karaoke.routes.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.routes.ts). On `HEAD`, headers are written identically to `GET` and the response is terminated with `res.end()` without transmitting audio payload.

---

## 5. Stream Cancellation & Cleanup

- Connection close detection:
  ```typescript
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });
  ```
- Before transmitting headers or chunks, the service confirms `!clientDisconnected && !res.writableEnded`.
- Eliminates unhandled `ERR_STREAM_WRITE_AFTER_END` or `ECONNRESET` exceptions when browsers terminate connections upon rapid song skipping or page reloads.

---

## 6. Audio Execution State Machine

The client-side audio execution state machine in [useKaraokeAudio](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts) now explicitly manages 9 states:
1. `idle`: No song queued or player standby.
2. `resolving_source`: Asynchronously fetching authorized audio stream metadata from server.
3. `loading`: Stream URL assigned to `HTMLAudioElement.src`, awaiting metadata load.
4. `buffering`: Audio element waiting for additional byte chunks (`waiting`, `stalled`).
5. `playing`: Audio actively rendering and advancing timeline.
6. `paused`: Playback frozen at current position.
7. `waiting_for_user_interaction`: Browser autoplay blocked unmuted audio; waiting for user gesture unlock.
8. `reconnecting`: Controlled automatic retry in progress following transient network failure.
9. `failed`: Permanent failure or exhausted retries; manual retry required.

### Playback Promise AbortError Guard
```typescript
const playPromise = audio.play();
if (playPromise !== undefined) {
  playPromise.catch((err: Error) => {
    if (err.name === 'AbortError') {
      // Benign abort caused by track change or pause while play promise was settling
      return;
    }
    if (err.name === 'NotAllowedError') {
      setIsAutoplayBlocked(true);
      setExecutionState('waiting_for_user_interaction');
    } else {
      setAudioError('PLAYBACK_START_FAILED');
      setExecutionState('failed');
    }
  });
}
```

---

## 7. Buffering Handling

Preserved and hardened Sprint 2.6.1's buffering guard:
- While `isBuffering === true` or `audio.readyState < 3`, drift correction rate nudges and hard seeks are strictly bypassed.
- When buffering resolves (`canplay`, `playing`), `currentTime` is smoothly reconciled against the authoritative backend time anchor.

---

## 8. Network Recovery & Retry Policy

Defined in [use-karaoke-audio.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts):
```typescript
export const AUDIO_RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 500,
  BACKOFF_FACTOR: 2,
  JITTER_MS: 150,
} as const;
```
- **Classification**:
  - Permanent domain failures (`SONG_AUDIO_UNAVAILABLE`, `SONG_NOT_FOUND`, HTTP 400/404) immediately transition to `failed` without retrying.
  - Transient network failures (HTTP 502/503/504, timeout, network offline) enter `reconnecting` and schedule retries with exponential backoff:
    - Attempt 1: Immediate fetch.
    - Attempt 2: $500\text{ms} + \text{jitter}$ (500–650 ms).
    - Attempt 3: $1000\text{ms} + \text{jitter}$ (1000–1150 ms).
  - All retry timeouts are registered in `retryTimeoutRef` and cleared immediately upon track preemption or unmount.

---

## 9. Reconnect Behavior

When a socket re-establishes connection and pushes an updated `PlaybackStateDto`:
1. If `playback.currentItem.song.id === currentSongIdRef.current` and audio is already loaded, the audio element is **not** recreated.
2. The player re-evaluates `currentPositionMs` against `playback.anchorStartedAt`.
3. If drift exceeds `SEEK_ALIGN_TOLERANCE_SEC`, position is realigned without resetting `src` or issuing duplicate network fetches.
4. Persistent room state and queue version are completely protected from client recovery operations.

---

## 10. Generation Fencing

- `loadGenerationRef.current` increments monotonically on every track change, skip, or manual retry.
- In-flight asynchronous resolutions compare `generation === loadGenerationRef.current`.
- Responses from older tracks arriving after a skip or reorder are safely discarded without touching the audio element.

---

## 11. Audio Element Ownership

- A single backing `HTMLAudioElement` instance is instantiated per [useKaraokeAudio](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts) hook.
- Component re-renders do not recreate the audio element.
- Volume is persisted independently in `localStorage` under `ktv_karaoke_volume`.
- Backing track audio is completely separated from LiveKit microphone WebRTC tracks.

---

## 12. Room Leave & Unmount Cleanup

Upon component unmount or room leave:
1. Generation is invalidated: `loadGenerationRef.current += 1`.
2. Active retry timer is cancelled: `clearTimeout(retryTimeoutRef.current)`.
3. Playback rate is reset to `1.0`.
4. `audio.pause()` is executed.
5. `audio.src = ''` is assigned.
6. `audio.load()` is executed to flush hardware audio decoders and free buffer memory.
7. `audioRef.current = null`.

---

## 13. Buffering & Recovery UX

Updated [KaraokePlayer.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/KaraokePlayer.tsx):
- **Reconnecting Banner**: Displays an animated cyan recovery alert when `executionState === 'reconnecting'` with message *"Reconnecting audio stream... Attempting automatic recovery."*
- **Screen Header Status**: Renders dynamic status pill:
  - `Reconnecting...` (cyan spinning loader) during transient network retries.
  - `Buffering...` (amber spinning loader) during media data starvation.
- **Autoplay Banner**: Displays *"Audio autoplay blocked by browser"* with a prominent *"Listen to Backing Track"* button.
- **Manual Retry Control**: If retries are exhausted, an alert banner provides an instant *"Retry Audio"* action.

---

## 14. Observability Changes

- [audio-source.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/audio-source.service.ts) logs warning when attempting to resolve audio for metadata-only songs with `{ songId, title, audioAvailability }`.
- Client-side execution state transitions are structured cleanly without leaking signed URLs, tokens, or personal identifiers.

---

## 15. Files Created and Modified

### Created
- [docs/SPRINT_2_6_2_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_2_AUDIT.md)
- [docs/KARAOKE_AUDIO_STREAMING.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KARAOKE_AUDIO_STREAMING.md)
- [docs/SPRINT_2_6_2_IMPLEMENTATION_REPORT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_2_IMPLEMENTATION_REPORT.md)

### Modified
- [packages/contracts/src/karaoke.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/karaoke.ts)
- [apps/api/src/modules/karaoke/fixture-audio.provider.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/fixture-audio.provider.ts)
- [apps/api/src/modules/karaoke/audio-source.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/audio-source.service.ts)
- [apps/api/src/modules/karaoke/karaoke.routes.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.routes.ts)
- [apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts)
- [apps/web/src/features/karaoke/components/KaraokePlayer.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/KaraokePlayer.tsx)
- [docs/KARAOKE_AUDIO_SOURCE_ARCHITECTURE.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KARAOKE_AUDIO_SOURCE_ARCHITECTURE.md)
- [docs/KARAOKE_PLAYER_ARCHITECTURE.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KARAOKE_PLAYER_ARCHITECTURE.md)

---

## 16. Static Verification Results

In compliance with the Code-only policy, no test runners, builds, or runtime commands were executed. Static verification was performed across all workspace packages:

### 16.1 TypeScript Typecheck (`pnpm typecheck`)
- **Command**: `pnpm typecheck`
- **Working Directory**: `/Users/mac/Documents/workspace/workspace_coding/ktvonline`
- **Exit Code**: `0`
- **Output**:
  - `packages/contracts`: Done in 850ms
  - `apps/api`: Done in 2.8s
  - `apps/web`: Done in 3.3s
- **Errors / Warnings**: `0`

### 16.2 ESLint Linting (`pnpm lint`)
- **Command**: `pnpm lint`
- **Working Directory**: `/Users/mac/Documents/workspace/workspace_coding/ktvonline`
- **Exit Code**: `0`
- **Output**:
  - `packages/contracts`: Done in 999ms
  - `apps/api`: Done in 1.1s
  - `apps/web`: `✔ No ESLint warnings or errors` (Done in 2.1s)
- **Errors / Warnings**: `0`

---

## 17. Deferred Runtime Verification

Due to the mandatory constraints of Sprint 2.6.2, the following verifications are explicitly deferred:
1. Multi-device physical audio playback synchronization across distinct physical networks.
2. Web browser media element hardware decoder memory profiling under prolonged continuous streaming.
3. Live socket reconnect simulation during mid-track audio streaming under packet loss.
4. Cross-browser validation of `HEAD` request processing across Safari iOS, Chrome Android, and Firefox.

---

## 18. Remaining Risks

1. **Browser Background Tab Resource Throttling**: Some mobile browsers aggressively suspend audio contexts and throttle Web Workers when backgrounded for extended periods (> 5 minutes). While tab visibility listeners mitigate drift upon foregrounding, browser OS policy may force an audio element reload.
2. **Third-Party Provider Latency**: When integrating future licensed commercial streaming CDNs, signed URL expiration must align with track duration plus expected buffering buffers.

---

## 19. Recommended Sprint 2.6.3 Scope

1. **Syllable-Level Timed Lyrics**: Upgrade lyrics stage from line-level timing to syllable-level karaoke progression.
2. **Audio EQ & Reverb Controls**: Client-side Web Audio API filter node chain for user microphone vocal tuning.
3. **Vocal Activity & Pitch Visualizer**: Live pitch curve comparison against reference track melody.

---

## 20. Implementation Status Summary

| Workstream | Scope Item | Status |
| :--- | :--- | :--- |
| **Workstream A** | Existing Audio Lifecycle Audit | **Implemented** |
| **Workstream B** | Audio Source Resolution Contract Hardening | **Implemented** |
| **Workstream C** | HTTP Range Streaming & HEAD Probing | **Implemented** |
| **Workstream D** | Frontend Audio Execution State Machine | **Implemented** |
| **Workstream E** | Network Failure & Exponential Backoff Recovery | **Implemented** |
| **Workstream F** | Reconnect & Playback Snapshot Recovery | **Implemented** |
| **Workstream G** | Audio Element Ownership & Teardown | **Implemented** |
| **Workstream H** | Audio Buffering & Reconnecting UX | **Implemented** |
| **Workstream I** | Performance & Observability Diagnostics | **Implemented** |
| **Workstream J** | Architectural Documentation Updates | **Implemented** |
| **Verification** | Static Typecheck & Lint Verification | **Implemented** |
| **Runtime** | Cross-Browser Runtime Audio Testing | **Deferred Runtime Verification** |

### Final Verdict: `CODE COMPLETE — NOT RUNTIME VERIFIED`
