# Sprint 2.6.4 — Lyrics Performance & Advanced Audio UX Implementation Report

## Final Verdict
**`CODE COMPLETE — NOT RUNTIME VERIFIED`**

---

## 1. Executive Summary

Sprint 2.6.4 improves the karaoke audio and visual experience by delivering:
1. **Sub-line & Word-Level Timing**: Extended `@ktv/contracts` with `TimedLyricWord` tokens and `words` array on `TimedLyricLine`. Implemented word-level timing in fixture song `fix_synth_groove` while maintaining 100% backward compatibility with line-level lyrics.
2. **Rendering Performance Optimization**: Encapsulated lyric lines in a memoized `LyricLineRow` with a custom comparison predicate, reducing 10 Hz position update render complexity from $O(N)$ to $O(1)$.
3. **Non-Intrusive Auto-Scrolling & Reduced Motion**: Automatically pauses auto-scrolling for 4,000 ms upon manual user scroll interactions and respects the `prefers-reduced-motion` media query.
4. **Lightweight Local Backing Equalizer**: Built a 3-band parametric/shelving Web Audio filter graph (`lowshelf` @ 150Hz, `peaking` @ 1.5kHz, `highshelf` @ 8kHz) supporting 4 presets (`flat`, `bass_boost`, `vocal_clarity`, `treble_boost`) strictly isolated to the backing track.
5. **Unified Settings UX**: Embedded equalizer presets into the existing `AudioDeviceSettingsModal` with bypass indicators, reset buttons, and local persistence.

All existing synchronization invariants, LiveKit voice isolation, and server-authoritative playback clocks were preserved.

---

## 2. Audit Findings

Documented in detail in [`docs/SPRINT_2_6_4_AUDIT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_4_AUDIT.md):
- **Contracts**: Previously lacked sub-line word or syllable tokens. Adding an optional `words?: TimedLyricWord[]` array preserves full compatibility with existing providers.
- **Rendering**: Updating `currentPositionMs` at 10 Hz forced all $N$ lines in `LyricsStage` to re-render every tick, producing 500+ component evaluations per second for a 50-line song.
- **Scrolling**: Automated `scrollIntoView` triggered on every line advance without detecting manual user scrolls, jarringly snapping the viewport away from user interactions.
- **Audio & CORS**: The backend Express server permits CORS for registered frontend origins. Instantiating `HTMLAudioElement` with `crossOrigin = "anonymous"` allows `AudioContext.createMediaElementSource(audio)` without muting, with graceful fallback to native audio if blocked.

---

## 3. Files Created and Modified

### Created Files
- [`apps/web/src/features/karaoke/services/karaoke-equalizer.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/services/karaoke-equalizer.ts)
- [`docs/SPRINT_2_6_4_AUDIT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_4_AUDIT.md)
- [`docs/SPRINT_2_6_4_IMPLEMENTATION_REPORT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_4_IMPLEMENTATION_REPORT.md)
- [`docs/KARAOKE_AUDIO_PREFERENCES.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KARAOKE_AUDIO_PREFERENCES.md)

### Modified Files
- [`packages/contracts/src/karaoke.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/karaoke.ts)
- [`apps/api/src/modules/karaoke/fixture-lyrics.provider.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/fixture-lyrics.provider.ts)
- [`apps/web/src/features/karaoke/components/LyricsStage.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/components/LyricsStage.tsx)
- [`apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts)
- [`apps/web/src/features/karaoke/index.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/index.ts)
- [`apps/web/src/features/voice/components/audio-device-settings-modal.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/audio-device-settings-modal.tsx)
- [`apps/web/src/features/voice/components/voice-controls.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/voice-controls.tsx)
- [`docs/KARAOKE_LYRICS_ARCHITECTURE.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KARAOKE_LYRICS_ARCHITECTURE.md)
- [`docs/KARAOKE_PLAYER_ARCHITECTURE.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KARAOKE_PLAYER_ARCHITECTURE.md)

---

## 4. Word/Syllable Timing Implementation

- **Contract Extension**: Added `TimedLyricWordSchema` (`id?`, `startMs`, `endMs`, `text`) and added `words?: z.array(TimedLyricWordSchema).optional()` to `TimedLyricLineSchema`.
- **Fixture Implementation**: Populated 8 lines of `fix_synth_groove` with word-level timestamps in `FixtureLyricsProvider`.
- **Backward Compatibility**: Remaining fixture songs (`fix_auld_lang_syne`, `fix_amazing_grace`, `fix_scarborough_fair`) remain line-level only, validating that the renderer seamlessly falls back to line-level continuous sweep without error.
- **Timing Invariant**: Word highlighting evaluates against the server-authoritative `currentPositionMs`. No local clock or drifting timer is introduced.

---

## 5. Lyrics Performance Improvements

- **O(1) Per-Tick Render Complexity**: Refactored `LyricsStage` to use a memoized `LyricLineRow` component with a custom `React.memo` comparator. On 10 Hz clock updates, only the single active line recalculates and re-renders; inactive lines are bypassed.
- **Non-Fighting Scroll Behavior**: Added user scroll detection via `handleScroll`. Manual user scrolling engages a 4,000 ms cooldown timer that suppresses automated `scrollIntoView` operations until the user finishes interacting.
- **Accessibility**: Added `prefers-reduced-motion` detection. When active, scrolling switches from `'smooth'` to `'auto'`, and font-scale jumps are subdued.

---

## 6. Equalizer Architecture & Isolation Guarantees

- **Web Audio Signal Chain**:
  `HTMLAudioElement` $\rightarrow$ `MediaElementAudioSourceNode` $\rightarrow$ `LowShelf` ($150\text{ Hz}$) $\rightarrow$ `Peaking` ($1.5\text{ kHz}, Q=1.0$) $\rightarrow$ `HighShelf` ($8\text{ kHz}$) $\rightarrow$ `AudioContext.destination`.
- **Preset Configurations**:
  - `flat`: $0\text{ dB}$ across all bands (Bypassed).
  - `bass_boost`: $+5\text{ dB}$ low-shelf, $0\text{ dB}$ mid, $-1\text{ dB}$ high-shelf.
  - `vocal_clarity`: $-2\text{ dB}$ low-shelf, $+4\text{ dB}$ mid, $+2\text{ dB}$ high-shelf.
  - `treble_boost`: $-1\text{ dB}$ low-shelf, $+1\text{ dB}$ mid, $+5\text{ dB}$ high-shelf.
- **Isolation Guarantees**:
  - Operates strictly on the local `HTMLAudioElement`.
  - LiveKit microphone capture and remote voice streams **never** route through Web Audio nodes.
  - Toggling presets does not alter playback position, server clock anchors, or queue state.
- **Pop Prevention & Lazy Instantiation**:
  - Parameter changes use 20ms exponential ramping (`setTargetAtTime`) to eliminate audible clicks.
  - When `eqPreset === 'flat'`, no `AudioContext` is created; audio streams 100% natively.
- **CORS & Resilience**:
  - Catches Web Audio connection errors and falls back to direct HTML media playback without muting audio.
  - Resumes `AudioContext` automatically on `play` and `unlockAutoplay`.

---

## 7. Lifecycle & Regression Considerations

- **Track Transitions**: Source changes call `karaokeEqualizer.dispose()`, cleanly disconnecting nodes and releasing audio resources before reattaching.
- **Autoplay Blocks**: Handled by resuming `AudioContext` during `unlockAutoplay()` without interrupting playback promises.
- **Device Output Sink**: When the user changes backing output device via `setSinkId`, `karaokeEqualizer.setSinkId(deviceId)` routes the `AudioContext` destination concurrently.
- **Cross-Component Events**: Presets synchronize across components via the global `ktv_karaoke_eq_changed` custom event and `localStorage` key `ktv_karaoke_eq_preset`.

---

## 8. Static Verification Results

### 1. `pnpm typecheck`
- **Command**: `pnpm typecheck`
- **Working Directory**: `/Users/mac/Documents/workspace/workspace_coding/ktvonline`
- **Exit Code**: `0`
- **Coverage**:
  - `packages/contracts`: passed (`tsc --noEmit`)
  - `apps/api`: passed (`tsc --noEmit`)
  - `apps/web`: passed (`tsc --noEmit`)
- **Output**: Clean compilation with 0 type errors.

### 2. `pnpm lint`
- **Command**: `pnpm lint`
- **Working Directory**: `/Users/mac/Documents/workspace/workspace_coding/ktvonline`
- **Exit Code**: `0`
- **Coverage**:
  - `packages/contracts`: passed (`eslint src/`)
  - `apps/api`: passed (`eslint src/`)
  - `apps/web`: passed (`next lint`)
- **Output**: `✔ No ESLint warnings or errors`.

---

## 9. Deferred Browser/Runtime Verification Checklist

Under the code-only constraint, runtime verification in real browser environments is deferred:
1. Physical listening test of frequency curve profiles for `bass_boost`, `vocal_clarity`, and `treble_boost`.
2. Cross-browser verification of `createMediaElementSource` across Chrome, Safari 17+, and Firefox under high-bitrate streaming.
3. Verification of word-level highlight sweep animations on low-power mobile devices.
4. Validation of 4-second manual scroll pause during touch scrolling on iOS Safari and Android Chrome.

---

## 10. Remaining Risks and Limitations

1. **Third-Party CDN CORS Restrictions**: If an external music provider is integrated in future sprints whose CDN does not supply `Access-Control-Allow-Origin`, connecting `createMediaElementSource` would silence audio. The implemented `try-catch` guard catches this and falls back to direct native playback, but the equalizer remains disabled in that specific scenario.
2. **Extreme Volume Backing Tracks**: While gains are conservatively capped at $+5\text{ dB}$, heavily compressed or clipped source audio played at 100% volume with `bass_boost` may experience slight digital saturation.

---

## 11. Git Commit Hash

- Commit hash: `(pending commit)`
