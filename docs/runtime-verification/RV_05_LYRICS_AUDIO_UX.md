# Workstream RV-05 — Lyrics Engine & Advanced Audio UX Verification

## 1. Scope & Objective

Workstream **RV-05** verifies the frontend presentation and client-side audio rendering delivered in **Sprint 2.6.4**:
- High-resolution lyric synchronization: Sub-line word tokens (`TimedLyricWord`) with smooth highlight sweeps, alongside seamless fallback to line-level timing (`TimedLyricLine`).
- Rendering performance: Memoized `LyricLineRow` components ensuring $O(1)$ component evaluations per 10 Hz position tick instead of $O(N)$ re-renders.
- UX scroll behavior: Automatic lyric auto-scrolling with a 4,000 ms cooldown pause upon manual user scroll interactions.
- Accessibility compliance: Support for `prefers-reduced-motion` media queries (disabling smooth sweeps and large font-scale jumps).
- Local 3-band backing track equalizer (`KaraokeEqualizerService`):
  - Filter topology: `lowshelf` ($150\text{ Hz}$), `peaking` ($1.5\text{ kHz}, Q=1.0$), `highshelf` ($8\text{ kHz}$).
  - Presets: `flat` ($0\text{ dB}$ bypass), `bass_boost` ($+5\text{ dB}$ low, $-1\text{ dB}$ high), `vocal_clarity` ($-2\text{ dB}$ low, $+4\text{ dB}$ mid, $+2\text{ dB}$ high), `treble_boost` ($-1\text{ dB}$ low, $+1\text{ dB}$ mid, $+5\text{ dB}$ high).
  - Pop prevention: 20 ms exponential parameter ramping (`setTargetAtTime`).
- Strict isolation guarantees: Backing track EQ processing is isolated strictly to the local `HTMLAudioElement`; LiveKit voice capture and remote voice streams **never** route through Web Audio nodes.
- AudioContext lifecycle: Lazy creation on non-flat presets, clean disposal on track change, and CORS error fallback without muting audio.

---

## 2. Test Scenarios

### Scenario RV05-TC01: Word-Level vs Line-Level Lyric Synchronization
- **Scenario ID**: `RV05-TC01`
- **Priority**: `P0`
- **Verification Level**: `L2 (Browser Automated - Playwright)`
- **Preconditions**: Room stage open with player ready.
- **Environment Requirements**: Playwright browser with DOM inspection.
- **Test Accounts**: Viewer.
- **Exact Execution Steps**:
  1. Load track with word-level timing: `fix_synth_groove`.
  2. Start playback and advance clock to active singing section.
  3. Inspect DOM elements within `LyricsStage`:
     - Verify active line contains multiple `<span>` tokens corresponding to `words` array.
     - As clock advances across word timestamps (`startMs` to `endMs`), verify individual word tokens receive the active highlight class (`text-amber-400` / filled gradient).
  4. Load track with line-level timing only: `fix_ballad_acoustic`.
  5. Start playback and advance clock.
  6. Inspect DOM elements within `LyricsStage`:
     - Verify entire line highlights as an atomic unit when `currentPositionMs` enters the line time window without throwing contract validation errors.
- **Expected Result**:
  - Word-level track highlights syllable by syllable.
  - Line-level track highlights whole lines cleanly without layout shift or crash.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Word-level sweeps animate accurately; line-level fallback operates seamlessly.
  - **Fail**: Active word highlights fail to activate, or missing words array causes crash.
  - **Blocked**: Fixture lyric provider returns 404.
- **Required Logs & Evidence**: DOM snapshots and class assertions at specified millisecond timestamps.
- **Cleanup Procedure**: Stop playback.
- **Related Scenarios**: `RV05-TC02`, `RV04-TC05`.

---

### Scenario RV05-TC02: Lyrics Render Performance & Memoization ($O(1)$ Invariant)
- **Scenario ID**: `RV05-TC02`
- **Priority**: `P1`
- **Verification Level**: `L2 (Browser Automated - React Profiler / Playwright)`
- **Preconditions**: Track loaded with 50+ lyric lines (`fix_synth_groove`).
- **Environment Requirements**: Browser runtime with React DevTools profiling or custom render counting.
- **Test Accounts**: Viewer.
- **Exact Execution Steps**:
  1. Attach a render-count spy to `LyricLineRow` component.
  2. Start playback for 3 seconds (equivalent to 30 clock updates at 10 Hz).
  3. Verify that the song remains on Line 3 during this 3-second window.
  4. Count the number of re-renders across all inactive lines (Lines 1, 2, 4 through 50).
- **Expected Result**:
  - Inactive lines re-render **zero** times during the 30 clock ticks due to `React.memo` comparator.
  - Only the single active line (Line 3) re-renders to update word highlight styles.
  - Total component renders per tick is $O(1)$, not $O(N)$.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Inactive line render count is zero across clock ticks.
  - **Fail**: Inactive lines re-render on every 10 Hz position tick.
  - **Blocked**: React production build strips component profiling hooks.
- **Required Logs & Evidence**: Component render count ledger across the 30-tick test window.
- **Cleanup Procedure**: Detach render spy.
- **Related Scenarios**: `RV05-TC01`, `RV07-TC01`.

---

### Scenario RV05-TC03: Non-Intrusive Auto-Scroll & Reduced Motion Compliance
- **Scenario ID**: `RV05-TC03`
- **Priority**: `P1`
- **Verification Level**: `L2 (Browser Automated - Playwright)`
- **Preconditions**: Active playback in `LyricsStage`.
- **Environment Requirements**: Headless Chromium with viewport emulation.
- **Test Accounts**: Viewer.
- **Exact Execution Steps**:
  1. Let song play naturally. Verify `LyricsStage` auto-scrolls the active line to center viewport (`scrollIntoView` triggered).
  2. Simulate user manual mouse-wheel / touch scroll upwards by 200px.
  3. Advance playback by 2 seconds so that a new line becomes active.
  4. Inspect viewport scroll position immediately upon line advance. Verify viewport has NOT snapped back to active line (auto-scroll paused).
  5. Wait 4,200 ms (past the 4,000 ms cooldown).
  6. Advance to the next line. Verify auto-scroll resumes and centers the active line.
  7. Emulate `prefers-reduced-motion: reduce`.
  8. Advance line. Verify scroll behavior uses `behavior: "auto"` rather than `"smooth"`.
- **Expected Result**:
  - Manual scroll suppresses auto-scrolling for exactly 4,000 ms.
  - Auto-scroll resumes seamlessly once interaction ceases.
  - `prefers-reduced-motion` eliminates smooth animation jumps.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: 4s cooldown observed; auto-scroll resumes; reduced motion honored.
  - **Fail**: Viewport snaps back immediately while user is actively scrolling.
  - **Blocked**: Scroll event simulation unsupported by browser driver.
- **Required Logs & Evidence**: Timestamped scroll position ledger and scroll-cooldown state transitions.
- **Cleanup Procedure**: Reset browser media emulation.
- **Related Scenarios**: `RV05-TC01`.

---

### Scenario RV05-TC04: Backing Track Equalizer Presets & Biquad Filter Graph
- **Scenario ID**: `RV05-TC04`
- **Priority**: `P0`
- **Verification Level**: `L2 (Browser Automated / L3 Manual)`
- **Preconditions**: Playback active in room; `AudioDeviceSettingsModal` open.
- **Environment Requirements**: Browser supporting Web Audio API (`AudioContext`, `BiquadFilterNode`).
- **Test Accounts**: Viewer.
- **Exact Execution Steps**:
  1. Verify initial preset is `flat`. Inspect `KaraokeEqualizerService`: Verify `audioCtx === null` (lazy instantiation bypass).
  2. Select preset `bass_boost` from dropdown.
  3. Inspect Web Audio node graph:
     - Verify `audioCtx` is instantiated and running.
     - Verify `lowFilter.gain.value` ramps to $+5\text{ dB}$ (frequency: $150\text{ Hz}$, type: `lowshelf`).
     - Verify `midFilter.gain.value` is $0\text{ dB}$ (frequency: $1500\text{ Hz}$, type: `peaking`, $Q=1.0$).
     - Verify `highFilter.gain.value` is $-1\text{ dB}$ (frequency: $8000\text{ Hz}$, type: `highshelf`).
  4. Select preset `vocal_clarity`. Verify gains ramp to: Low $-2\text{ dB}$, Mid $+4\text{ dB}$, High $+2\text{ dB}$.
  5. Select preset `treble_boost`. Verify gains ramp to: Low $-1\text{ dB}$, Mid $+1\text{ dB}$, High $+5\text{ dB}$.
  6. Click "Reset to Flat (Bypass)" button. Verify gains ramp back to $0\text{ dB}$ and UI indicates "Bypassed".
- **Expected Result**:
  - Filter graph created with correct frequencies and Q values.
  - Presets apply exact expected gain offsets with 20ms click-free ramping.
  - Reset cleanly restores unity gain ($0\text{ dB}$).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: All filter nodes configured according to spec; preset transitions ramp without pop.
  - **Fail**: Filter nodes omitted, wrong gains applied, or audio muted.
  - **Blocked**: Web Audio API disabled.
- **Required Logs & Evidence**: Web Audio inspector node parameters dump for each preset.
- **Cleanup Procedure**: Reset preset to `flat`.
- **Related Scenarios**: `RV05-TC05`, `RV05-TC07`.

---

### Scenario RV05-TC05: Voice Isolation & Web Audio Graph Separation Invariants
- **Scenario ID**: `RV05-TC05`
- **Priority**: `P0`
- **Verification Level**: `L2 (Browser Automated / Architecture Inspection)`
- **Preconditions**: User connected to both Karaoke playback and LiveKit voice lounge.
- **Environment Requirements**: Chrome browser with both audio streams active.
- **Test Accounts**: Singer.
- **Exact Execution Steps**:
  1. Connect user to LiveKit voice lounge (Microphone published).
  2. Start karaoke backing track with `bass_boost` active.
  3. Trace the Web Audio `MediaElementAudioSourceNode` connection path in `karaoke-equalizer.ts`:
     `sourceNode` $\rightarrow$ `lowFilter` $\rightarrow$ `midFilter` $\rightarrow$ `highFilter` $\rightarrow$ `audioCtx.destination`.
  4. Inspect the LiveKit `Room` audio graph:
     - Verify LiveKit microphone capture uses standard WebRTC `MediaStreamTrack`.
     - Verify remote participant voice elements are attached directly via `<audio>` elements without routing through `KaraokeEqualizerService`.
  5. Apply extreme gain modifications to EQ filters.
- **Expected Result**:
  - Backing music changes frequency curve according to preset.
  - LiveKit microphone signal and remote voice streams remain completely untouched (Zero EQ coloring or Web Audio distortion applied to voice).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Voice streams are 100% physically isolated from the Web Audio equalizer graph.
  - **Fail**: Voice audio routes through music equalizer nodes.
  - **Blocked**: Unable to connect both voice and playback concurrently.
- **Required Logs & Evidence**: Audio graph routing dump; Playwright evaluation of DOM audio elements.
- **Cleanup Procedure**: Leave voice; stop playback.
- **Related Scenarios**: `RV03-TC02`, `RV05-TC04`.

---

### Scenario RV05-TC06: Audio Graph Disposal & Output Sink (`setSinkId`) Independence
- **Scenario ID**: `RV05-TC06`
- **Priority**: `P1`
- **Verification Level**: `L2 (Browser Automated)`
- **Preconditions**: Track playing with equalizer active; multiple audio outputs available.
- **Environment Requirements**: Chrome browser supporting `AudioContext.setSinkId` and `HTMLMediaElement.setSinkId`.
- **Test Accounts**: Viewer.
- **Exact Execution Steps**:
  1. With `vocal_clarity` active, switch tracks by skipping to next song.
  2. Verify `karaokeEqualizer.dispose()` executes:
     - Filters disconnected.
     - `sourceNode` disconnected.
     - `audioCtx` closed or reset.
     - AudioContext count does NOT leak.
  3. New track loads: Verify equalizer reattaches cleanly to new `HTMLAudioElement`.
  4. In `AudioDeviceSettingsModal`, change the backing track output device to `speaker-sink-2`.
  5. Verify `audio.setSinkId('speaker-sink-2')` and `audioCtx.setSinkId('speaker-sink-2')` resolve successfully.
- **Expected Result**:
  - Clean resource disposal on track transition; no dangling audio nodes or memory leaks.
  - Backing audio routes to selected output sink independently of voice lounge output.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Equalizer reattaches cleanly; sinks route correctly; no node leakage.
  - **Fail**: Track change causes audio silence or unhandled exception.
  - **Blocked**: Browser does not support `setSinkId`.
- **Required Logs & Evidence**: AudioContext lifecycle traces; output device sink assignments.
- **Cleanup Procedure**: Reset sink to default.
- **Related Scenarios**: `RV03-TC03`, `RV07-TC01`.

---

### Scenario RV05-TC07: Subjective EQ Fidelity & Clipping Verification (L3 Manual)
- **Scenario ID**: `RV05-TC07`
- **Priority**: `P2`
- **Verification Level**: `L3 (Manual-Assisted Hardware & Audio)`
- **Preconditions**: Hardware Configuration `HW-CONF-03` (Studio Monitor Headphones / USB Interface).
- **Environment Requirements**: Quiet listening environment ($<40\text{ dBA}$).
- **Test Accounts**: Human Audio Evaluator.
- **Exact Execution Steps**:
  1. Play dynamic backing track `fix_rock_anthem` at 100% player volume with preset `flat`.
  2. Switch preset to `bass_boost` ($+5\text{ dB}$ low shelf). Listen for digital clipping, harsh distortion, or rumble.
  3. Switch preset to `vocal_clarity` ($+4\text{ dB}$ mid peaking). Listen for vocal band presence and harsh sibilance.
  4. Switch preset to `treble_boost` ($+5\text{ dB}$ high shelf). Listen for high-frequency hiss, ringing, or aliasing.
  5. Toggle "Reset to Flat" repeatedly. Evaluate whether transitions produce audible clicks, thumps, or pops.
- **Expected Result**:
  - Each preset provides distinct, musically pleasing acoustic shaping.
  - 20ms exponential parameter ramping prevents clicks during switching.
  - Zero digital saturation or audible clipping under nominal listening volumes.
- **Actual Result**: `[Pending Execution - Manual Evaluation Not Yet Performed]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Warm bass, clear mids, crisp highs; click-free transitions; no clipping distortion.
  - **Fail**: Audible clicks on preset change or harsh digital distortion when bass is boosted.
  - **Blocked**: Test headphones unavailable.
- **Required Logs & Evidence**: Subjective listening evaluation scoring card (timbre, clarity, pop artifacts).
- **Cleanup Procedure**: Reset preset to `flat`.
- **Related Scenarios**: `RV05-TC04`.

