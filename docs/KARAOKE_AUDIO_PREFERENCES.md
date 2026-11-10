# KTVOnline Karaoke Audio Preferences & Equalizer Specification

## 1. Overview & Storage Boundaries

KTVOnline maintains user audio preferences locally in the browser. Audio hardware configurations, volumes, and equalizer presets reflect client-side listening environments and must never mutate server-authoritative room state or compromise user privacy.

### Local Storage Inventory

| Key | Type | Default | Description | Domain Boundary |
| :--- | :--- | :--- | :--- | :--- |
| `ktv_karaoke_volume` | `number` | `0.8` | Backing track local playback volume ($0.0 - 1.0$). | Karaoke Backing Track |
| `ktv_karaoke_muted` | `boolean` | `false` | Backing track local mute state. | Karaoke Backing Track |
| `ktv_karaoke_output_device` | `string` | `""` (Default) | Selected audio sink ID for backing track playback. | Karaoke Backing Track |
| `ktv_karaoke_eq_preset` | `string` | `'flat'` | Equalizer preset (`flat`, `bass_boost`, `vocal_clarity`, `treble_boost`). | Karaoke Backing Track |
| `ktv_audio_input_device_id` | `string` | `""` (Default) | Selected microphone input device ID. | LiveKit Voice Track |
| `ktv_voice_audio_output_device_id` | `string` | `""` (Default) | Selected audio sink ID for remote participant voices. | LiveKit Voice Track |
| `ktv_audio_capture_options` | `JSON` | `{"echoCancellation":true,"noiseSuppression":true,"autoGainControl":true}` | WebRTC capture constraint preferences. | LiveKit Voice Track |

### Architectural Privacy Invariant:
> [!IMPORTANT]
> Audio device IDs and equalizer settings are **strictly local** to the client browser. They are never sent to the backend API, never broadcast over Socket.IO, and never persisted to the PostgreSQL database.

---

## 2. Backing Track Equalizer Architecture (Sprint 2.6.4)

### 2.1 Signal Path & Pipeline Isolation
The equalizer operates exclusively on the local karaoke backing track:

```
+-------------------------------------------------------------------------------------------------+
| Browser Audio Processing Pipelines                                                              |
|                                                                                                 |
| [Karaoke Backing Audio]                                                                         |
| HTMLAudioElement ──> MediaElementSourceNode ──> LowShelf ──> Peaking ──> HighShelf ──> Speakers|
| (crossOrigin=anonymous)                          (150Hz)     (1500Hz)    (8000Hz)               |
|                                                                                                 |
| [Microphone Input]                                                                              |
| getUserMedia(AEC, NS, AGC) ───────────────────────────────────────────> LiveKit SFU Server      |
|                                                                                                 |
| [Remote Voice Streams]                                                                          |
| LiveKit WebRTC Subscription ──────────────────────────────────────────> Remote <audio> Elements |
+-------------------------------------------------------------------------------------------------+
```

### Critical Isolation Guarantees:
1. **Zero Voice Leakage**: LiveKit microphone capture and remote voice streams **never** enter the Web Audio equalizer graph.
2. **Zero Server State Mutation**: Toggling or switching EQ presets does not emit Socket.IO events, does not change `playbackVersion`, and does not alter server clock offset calculations.
3. **No Timeline Impact**: The equalizer does not introduce audio buffer offsets or pitch changes that would corrupt lyrics alignment.

---

## 3. Equalizer Filter Graph & Presets

The equalizer is implemented via `KaraokeEqualizerService` using standard browser `BiquadFilterNode` instances.

### Filter Topology
- **Band 1 (Bass)**: `lowshelf` filter at $150\text{ Hz}$.
- **Band 2 (Mid / Vocals)**: `peaking` filter at $1,500\text{ Hz}$ with $Q = 1.0$.
- **Band 3 (Treble)**: `highshelf` filter at $8,000\text{ Hz}$.

### Presets Specification

| Preset ID | Name | Low ($150\text{ Hz}$) | Mid ($1.5\text{ kHz}$) | High ($8\text{ kHz}$) | Sound Profile & Purpose |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `flat` | **Flat / Bypass** | $0\text{ dB}$ | $0\text{ dB}$ | $0\text{ dB}$ | Natural original master track; unity gain across all frequencies. |
| `bass_boost` | **Bass Boost** | $+5\text{ dB}$ | $0\text{ dB}$ | $-1\text{ dB}$ | Enriched sub-bass and kick punch for dance and rhythm tracks. |
| `vocal_clarity` | **Vocal Clarity** | $-2\text{ dB}$ | $+4\text{ dB}$ | $+2\text{ dB}$ | Carves out low-end mud and boosts vocal presence so singers cut through the mix. |
| `treble_boost` | **Treble Boost** | $-1\text{ dB}$ | $+1\text{ dB}$ | $+5\text{ dB}$ | Air, brightness, and sparkle for acoustic, classical, or ballad performances. |

### Anti-Clipping & Anti-Zipper Engineering:
1. **Conservative Gain**: Boosts are strictly limited to $\le +5\text{ dB}$ to minimize digital inter-sample clipping on pre-mastered backing tracks.
2. **Smooth Parameter Ramping**: Gain transitions use `setTargetAtTime(targetGain, currentTime, 0.02)`, applying an exponential 20ms ramp that completely eliminates audible pops, clicks, and zipper noise during preset changes.
3. **Lazy Graph Instantiation**: When `eqPreset === 'flat'` (default), no `AudioContext` is created; audio plays 100% natively through `HTMLAudioElement`. The Web Audio graph is attached only when a non-flat preset is engaged.

---

## 4. CORS & Resilience Handling

### CORS Requirements for Web Audio
Connecting an `HTMLAudioElement` to `createMediaElementSource` requires cross-origin permission.
1. The `HTMLAudioElement` is instantiated with `audio.crossOrigin = 'anonymous'`.
2. The KTVOnline backend API explicitly permits CORS from registered frontend origins.
3. **Graceful Fallback**: If `createMediaElementSource` throws (e.g. security error or unsupported platform), the service catches the exception, logs a warning, sets `isSupported = false`, and falls back seamlessly to direct HTML media playback without muting the user.

### Autoplay & AudioContext Suspension
1. Modern browsers suspend `AudioContext` until a user gesture occurs.
2. `useKaraokeAudio` invokes `karaokeEqualizer.resumeIfSuspended()` inside the `play` event handler and within `unlockAutoplay()`.
3. If an output device change occurs (`setSinkId`), `karaokeEqualizer.setSinkId(deviceId)` routes the Web Audio destination concurrently with the media element.

---

## 5. UI Integration & Accessibility

The equalizer controls are housed in the unified **Audio & Device Settings Modal** (`AudioDeviceSettingsModal.tsx`):
- Accessible button grid with distinct active states (`bg-pink-500/10 border-pink-500/40 text-pink-300`).
- Status badge indicating whether the EQ is `Active` or `Bypassed (Flat)`.
- One-click **"Reset to Flat"** button for immediate return to default.
- Informational footnote clarifying that the equalizer affects only the backing music, not the singer's microphone.
