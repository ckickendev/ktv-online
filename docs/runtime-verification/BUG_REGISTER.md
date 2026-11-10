# KTVOnline — Runtime Verification Bug Register

## 1. Defect Classification & Severity Standards

The Bug Register tracks all defects, inconsistencies, race conditions, and performance bottlenecks identified during runtime verification passes. Every defect is categorized by severity:

| Severity Level | Definition | SLA / Release Gate Impact |
| :--- | :--- | :--- |
| **S1 — Blocker** | System crash, data loss, security vulnerability, broken authentication, or complete loss of voice/audio. | **Release Blocker**: Zero S1 defects permitted for production release. |
| **S2 — Critical** | Major feature broken (e.g. queue reordering fails, playback drift $>3\text{s}$, webhook failure), no workaround. | **Release Blocker**: Must be resolved before staging sign-off. |
| **S3 — Major** | Degraded performance, intermittent drift, layout glitches, or non-fatal audio pop artifacts with a workaround. | Remediation scheduled for subsequent stabilization sprint. |
| **S4 — Minor** | Minor cosmetic styling issues, typo in error message, non-critical telemetry delay. | Backlog / polish item. |

---

## 2. Active Defect Ledger

The entries below document initial baseline risks and edge cases identified during the repository audit and architecture design after Sprint 2.6.4:

### Defect BUG-RV-001: Third-Party Music CDN CORS Absence Disables Web Audio EQ
- **Bug ID**: `BUG-RV-001`
- **Workstream**: `RV-05 (Lyrics & Audio UX)`
- **Severity**: `S3 (Major - Known Limitation / Fallback Handled)`
- **Discovered In Scenario**: `RV05-TC04`
- **Status**: `OPEN (Design Caveat Documented)`
- **Description**: If a third-party audio source provider or external CDN is used in production that does not supply `Access-Control-Allow-Origin: *` or explicit origin matching, invoking `AudioContext.createMediaElementSource(audio)` causes the browser to mute audio playback entirely to prevent cross-origin media data exfiltration.
- **Reproduction Steps**:
  1. Queue an external track hosted on a CDN that omits CORS headers.
  2. Select any equalizer preset other than `flat` (e.g. `bass_boost`).
  3. Observe browser audio output.
- **Expected vs Observed**:
  - *Expected*: Equalizer processes audio cleanly.
  - *Observed / Current Behavior*: Handled gracefully via `try-catch` fallback in `KaraokeEqualizerService.attachElement()`, which disables Web Audio EQ and falls back to native un-equalized playback without muting audio. However, equalizer functionality remains inactive for that specific stream.
- **Root Cause Hypothesis**: Browser Web Audio security sandbox requirements on cross-origin media streams.
- **Assigned Sprint / Remediation**: Sprint 2.7 (Audio Proxy Architecture or Cloud CDN Header Configuration).

---

### Defect BUG-RV-002: Potential Digital Clipping Under 100% Backing Track Volume with Bass Boost
- **Bug ID**: `BUG-RV-002`
- **Workstream**: `RV-05 (Lyrics & Audio UX)`
- **Severity**: `S4 (Minor - Acoustic Edge Case)`
- **Discovered In Scenario**: `RV05-TC07`
- **Status**: `OPEN (Pending L3 Acoustic Verification)`
- **Description**: Backing track audio files that have been mastered close to $0\text{ dBFS}$ (normalized to maximum peak) may experience slight digital clipping or inter-sample peaks when the `bass_boost` preset applies $+5\text{ dB}$ low-shelf gain if the user keeps master player volume at 100%.
- **Reproduction Steps**:
  1. Play a heavily compressed/limited rock/EDM track (`fix_rock_anthem`) at 100% volume.
  2. Engage `bass_boost` preset.
  3. Listen via high-fidelity headphones for subtle peak distortion during kick-drum hits.
- **Expected vs Observed**:
  - *Expected*: Rich bass punch without digital clipping.
  - *Observed*: Potential harmonic saturation on high-energy low frequencies.
- **Root Cause Hypothesis**: Absence of a gentle compressor or pre-gain attenuator (e.g. $-2\text{ dB}$ headroom reduction) prior to the boosting filter node.
- **Assigned Sprint / Remediation**: Sprint 2.7 (Introduce DynamicsCompressorNode or automatic $-3\text{ dB}$ makeup attenuation when boost presets are engaged).

---

### Defect BUG-RV-003: Mobile Safari Strict Background Tab Web Audio Throttling
- **Bug ID**: `BUG-RV-003`
- **Workstream**: `RV-07 (Endurance)`
- **Severity**: `S3 (Major - Platform Constraint)`
- **Discovered In Scenario**: `RV07-TC04`
- **Status**: `OPEN (Design Caveat Documented)`
- **Description**: On iOS Mobile Safari, switching away from the browser tab or locking the mobile screen severely throttles JavaScript timer intervals down to once per second and suspends `requestAnimationFrame`. If the backing track continues playing via native audio, client-side drift estimation stops updating until the tab is foregrounded.
- **Reproduction Steps**:
  1. Open KTVOnline room on iOS 17 Mobile Safari.
  2. Start playback.
  3. Switch to another app for 45 seconds, then return to Mobile Safari.
- **Expected vs Observed**:
  - *Expected*: Playback and lyrics remain in sync upon tab return.
  - *Observed / Current Behavior*: Handled by `handleVisibilityChange` in `ClockSyncService`, which triggers an immediate resync and realignment seek upon returning to foreground. However, during the background interval, lyric progress does not advance smoothly.
- **Root Cause Hypothesis**: Mobile OS power-saving and background execution throttling.
- **Assigned Sprint / Remediation**: Sprint 2.7 (Evaluate Web Worker / AudioWorklet clock estimation for mobile browsers).

---

## 3. Defect Ledger Schema for Verification Execution

Future defects detected by automated runners or human evaluators must be appended below following this exact schema:

```markdown
### Defect BUG-RV-XXX: [Concise Defect Title]
- **Bug ID**: `BUG-RV-XXX`
- **Workstream**: `[RV-01 to RV-07]`
- **Severity**: `[S1 / S2 / S3 / S4]`
- **Discovered In Scenario**: `[Scenario ID, e.g. RV02-TC02]`
- **Status**: `[OPEN / INVESTIGATING / FIXED / VERIFIED_CLOSED]`
- **Description**: [Detailed description of the observed defect]
- **Reproduction Steps**:
  1. [Step 1]
  2. [Step 2]
- **Expected vs Observed**:
  - *Expected*: [Expected behavior]
  - *Observed*: [Observed failure]
- **Root Cause Hypothesis**: [Technical analysis of cause]
- **Assigned Sprint / Remediation**: [Target sprint or PR reference]
```

