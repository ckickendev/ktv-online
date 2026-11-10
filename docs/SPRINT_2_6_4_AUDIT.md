# Sprint 2.6.4 — Lyrics Architecture & Advanced Audio UX Audit

## 1. Audit Overview

This audit evaluates the current implementation of synchronized lyrics rendering, authoritative playback time consumption, audio pipeline capabilities, and equalizer feasibility for KTVOnline.

---

## 2. Lyrics Architecture & Contracts Audit

### 2.1 Lyric Data Model (`packages/contracts/src/karaoke.ts`)
The current contracts define:
```typescript
export const TimedLyricLineSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative().optional(),
  text: z.string(),
  translation: z.string().optional(),
});
export type TimedLyricLine = z.infer<typeof TimedLyricLineSchema>;

export const SongLyricsDtoSchema = z.object({
  songId: z.string(),
  provider: z.string(),
  lines: z.array(TimedLyricLineSchema),
  language: z.string().default('en'),
  hasTimedLyrics: z.boolean(),
  attribution: z.string().optional(),
});
```

#### Observations & Gaps:
1. **Line-Level Only**: Timings exist exclusively at the line level (`startMs`, optional `endMs`). There is no sub-line, word, or syllable timing data model.
2. **Extensibility**: The schema can be extended cleanly with an optional `words` array (`TimedLyricWord[]`), ensuring 100% backward compatibility with all existing lyrics fixtures and client consumers.
3. **Missing Word Structure**:
   - `TimedLyricWord`: `startMs`, `endMs`, `text`, optional `id`.
   - Lines without word timestamps can fall back seamlessly to continuous line-level percentage sweep.

### 2.2 Provider Boundaries (`apps/api/src/modules/karaoke/`)
- `ILyricsProvider`: Interface with `getLyrics(song: ISongDocument): Promise<SongLyricsDto | null>`.
- `LyricsService`: Provider registry and caching service.
- `FixtureLyricsProvider`: Authoritative fixture database providing synchronized lyrics for 4 songs (`fix_auld_lang_syne`, `fix_amazing_grace`, `fix_scarborough_fair`, `fix_synth_groove`).
- **Provider Integrity**: Lyrics timestamps are strictly provided by the provider; the backend does not run synthetic alignment or speech-to-text inference at runtime.

### 2.3 Authoritative Playback Position & Update Cadence
In `apps/web/src/features/karaoke/hooks/use-karaoke.ts`:
- Server time anchor model: `currentPositionMs = positionMs + (serverNow - anchorStartedAt)`.
- Re-calculated at a 10 Hz cadence (~100ms `setInterval`) when `playback.status === 'playing'`.
- Lyrics highlighting receives `currentPositionMs` directly from this hook.
- **Invariant Preserved**: Lyrics highlighting never invents a local playback clock; it strictly tracks the server-authoritative playback position.

---

## 3. Lyrics Rendering Performance Audit (`LyricsStage.tsx`)

### 3.1 Unnecessary Rerenders
- In `LyricsStage.tsx`, `currentPositionMs` is a top-level prop.
- When `currentPositionMs` updates every 100ms, the entire `LyricsStage` component re-renders.
- In `lines.map((line, index) => ...)`, every single lyric line in the entire song is re-evaluated, re-computing inline styles, classes, and JSX trees, even if the line is inactive.
- For a standard 50-line karaoke song, this causes 500 line evaluations per second.

### 3.2 Active Line Calculation
- `activeIndex` is computed via a linear loop (`for (let i = 0; i < lines.length; i++)`). While $O(N)$ for $N \le 100$ is negligible in raw CPU cycles, re-running this loop at 10Hz can be optimized by caching or binary searching, and isolating active line progress.

### 3.3 Scroll Behavior & Fighting Manual Scrolling
- Auto-scroll uses `activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- If a user manually scrolls to preview upcoming lyrics or review previous verses, the next line transition abruptly jerks the view back to the active line.
- There is no user scroll detection or temporary auto-scroll pause.
- `prefers-reduced-motion` is not currently respected.

---

## 4. Equalizer Feasibility & Web Audio Audit

### 4.1 Audio Source & CORS Configuration
- Backing track audio is streamed from `GET /api/v1/songs/:songId/audio/stream` via `AudioSourceService.streamAudio`.
- The Express server configures CORS in `apps/api/src/app.ts` with credentials and allowed origins (`FRONTEND_URL`, `localhost:3000`, etc.).
- When `HTMLAudioElement` has `crossOrigin = "anonymous"`, connecting it to `AudioContext.createMediaElementSource(audio)` is safe and will not mute the media element.
- If an unauthenticated third-party URL lacks CORS headers, `createMediaElementSource` would silence audio. Therefore:
  1. A try-catch guard around Web Audio initialization is mandatory.
  2. If Web Audio connection fails or throws, the player must gracefully fall back to native unprocessed audio output.

### 4.2 Web Audio Graph Isolation
- The Web Audio graph must be attached **strictly** to the backing track `HTMLAudioElement`.
- LiveKit WebRTC audio tracks (local microphone capture and remote participant subscriptions) bypass this graph completely.
- LiveKit audio is managed by the LiveKit WebRTC engine and independent `<audio>` elements.

### 4.3 Equalizer Presets & Node Architecture
A clean, lightweight 3-band parametric/shelving filter chain:
- **Low Shelf** (`lowshelf`, $f = 150\text{ Hz}$): Controls bass and sub-frequencies.
- **Mid Peaking** (`peaking`, $f = 1500\text{ Hz}$, $Q = 1.0$): Shapes vocal presence and body.
- **High Shelf** (`highshelf`, $f = 8000\text{ Hz}$): Shapes treble air and sparkle.

Presets:
1. `flat`: 0 dB across all bands (unity gain / transparent).
2. `bass_boost`: Low +5 dB, Mid 0 dB, High -1 dB.
3. `vocal_clarity`: Low -2 dB, Mid +4 dB, High +2 dB.
4. `treble_boost`: Low -1 dB, Mid +1 dB, High +5 dB.

Conservative gain limits ($\le +5\text{ dB}$) prevent digital clipping.

---

## 5. Identified Gaps & Target Implementation Plan

1. **Contracts (`packages/contracts/src/karaoke.ts`)**:
   - Add `TimedLyricWordSchema` and `TimedLyricWord` type.
   - Extend `TimedLyricLineSchema` with optional `words: z.array(TimedLyricWordSchema).optional()`.
2. **Fixture Provider (`apps/api/src/modules/karaoke/fixture-lyrics.provider.ts`)**:
   - Add word-level timestamps to `fix_synth_groove` to demonstrate word/syllable timing while leaving others as line-level to demonstrate backward compatibility.
3. **Lyrics Rendering (`LyricsStage.tsx`)**:
   - Memoize inactive lines (`LyricLineRow` component) using `React.memo`.
   - Isolate active-line sweep and word highlighting so only the active line updates at 10Hz.
   - Detect user manual scrolling: pause auto-scroll for 4 seconds after user scroll interaction.
   - Respect `prefers-reduced-motion` media query.
4. **Equalizer Hook & Service (`apps/web/src/features/karaoke/`)**:
   - Implement `useKaraokeEqualizer` or integrate cleanly into `useKaraokeAudio`.
   - Manage single persistent `AudioContext` and 3-band filter graph.
   - Support `flat`, `bass_boost`, `vocal_clarity`, `treble_boost`.
   - Persist preference in `localStorage` under `ktv_karaoke_eq_preset`.
   - Graceful fallback if Web Audio is unsupported or restricted.
5. **UI Integration (`AudioDeviceSettingsModal.tsx`)**:
   - Add Equalizer Preset selector under Karaoke Audio section.
   - Provide "Reset to Flat" button.
6. **Documentation**:
   - Deliver `SPRINT_2_6_4_AUDIT.md`, `SPRINT_2_6_4_IMPLEMENTATION_REPORT.md`, `KARAOKE_LYRICS_ARCHITECTURE.md`, `KARAOKE_AUDIO_PREFERENCES.md`, and update `KARAOKE_PLAYER_ARCHITECTURE.md`.
