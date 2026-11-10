# Sprint 2.6.3 — LiveKit Voice Quality & Audio Device Management Implementation Report

## Final Verdict
**`CODE COMPLETE — NOT RUNTIME VERIFIED`**

---

## 1. Initial Voice Architecture Audit

Before making any changes, an audit of the voice and playback architecture was conducted:
- **Backend**: `voice-token.service.ts` mints short-lived JWT tokens for authorized room members. Grant privileges correctly restrict audio publishing (`canPublish: true`, `canSubscribe: true`, `canPublishData: false`). Identity and metadata (`familyId`) enforce session family revocation. Webhooks and eviction workers asynchronously track participant disconnects.
- **Frontend Voice**: `use-voice-client.ts` initializes the LiveKit `Room` instance (`livekit-client@2.23.0`). Remote audio elements are dynamically mounted on `TrackSubscribed` and torn down on `TrackUnsubscribed` or `ParticipantDisconnected`.
- **Karaoke Audio**: `useKaraokeAudio` owns a single native `HTMLAudioElement` that streams the server-authoritative backing track.
- **Identified Gaps**:
  1. Capture options (`echoCancellation`, `noiseSuppression`, `autoGainControl`) were hardcoded to `true` and not configurable by users.
  2. Microphone device enumeration happened only once on connect; dynamic plugging/unplugging was not observed via `devicechange`.
  3. Audio output device selection (`setSinkId`) was missing for both LiveKit remote voice and karaoke backing audio.
  4. Disconnection of the active microphone did not have automatic fallback or user alerting.
  5. Audio device settings lacked a dedicated, clean UI modal.

---

## 2. Installed SDK Versions

| Component | Package | Installed Version | Location |
| :--- | :--- | :--- | :--- |
| **Frontend LiveKit Client SDK** | `livekit-client` | `2.23.0` | `apps/web/package.json` |
| **Frontend React Components** | `@livekit/components-react` | `2.9.25` | `apps/web/package.json` |
| **Backend LiveKit Server SDK** | `livekit-server-sdk` | `2.19.2` | `apps/api/package.json` |

---

## 3. Microphone Capture Configuration

- **Configuration Layer**: Integrated directly into `RoomOptions.audioCaptureDefaults` and dynamic track re-publication via `room.localParticipant.setMicrophoneEnabled(true, captureOptions)`.
- **Exposed Preferences**:
  - `echoCancellation: boolean` (default: `true`)
  - `noiseSuppression: boolean` (default: `true`)
  - `autoGainControl: boolean` (default: `true`)
- **Status**: **Implemented**.

---

## 4. Echo Cancellation Implementation

- **Acoustic Echo Cancellation (AEC)** is handled natively by browser WebRTC media engines and hardware DSP.
- Backing track audio is completely decoupled from the microphone capture stream; backing audio is never injected into `getUserMedia`.
- No custom DSP or AudioWorklets were introduced.
- **Physical Limitation**: Software AEC cannot guarantee zero acoustic leakage in every speaker and room setup. Users singing with high speaker volume are advised to use headphones.
- **Status**: **Implemented**.

---

## 5. Noise Suppression Implementation

- Noise suppression is requested via W3C `MediaTrackConstraints` (`noiseSuppression: true`).
- Filters continuous background noise (fans, typing, ambient hum) without third-party noise cancellation services.
- Advanced singers can disable noise suppression in the settings modal to preserve full vocal harmonics.
- **Status**: **Implemented**.

---

## 6. Automatic Gain Control (AGC) Implementation

- AGC automatically normalizes vocal dynamic range across quiet speakers and loud singing.
- Degrades gracefully on browsers or operating systems where AGC is not supported or ignored by audio drivers.
- Can be disabled by users with dedicated hardware preamps to prevent pumping artifacts.
- **Status**: **Implemented**.

---

## 7. Microphone Device Management

- **Device Discovery**: Uses `Room.getLocalDevices('audioinput')` to list microphones.
- **Label Handling**: Masks empty labels prior to user permission and falls back to readable identifiers.
- **Device Switching**:
  - Validates requested device against current enumerated devices.
  - Calls `room.switchActiveDevice('audioinput', deviceId)`.
  - Replaces the published track in-place without publishing duplicate tracks or reconnecting.
  - Preserves mute state and capture options.
  - Restores the previous working device on failure.
- **Device Removal**:
  - Listens to `devicechange` on `navigator.mediaDevices`.
  - When the active device is unplugged, automatically falls back to the first available microphone and notifies the user.
- **Status**: **Implemented**.

---

## 8. Voice Output Device Management

- **Output Selection**: Queries `Room.getLocalDevices('audiooutput')` to enumerate available speakers and headsets.
- **Sink Routing**:
  - Calls `room.switchActiveDevice('audiooutput', deviceId)`.
  - Invokes `HTMLMediaElement.prototype.setSinkId` on all active remote participant audio elements.
  - Newly subscribed remote tracks immediately inherit the selected sink.
- **Graceful Fallback**: If `setSinkId` is unsupported by the browser, displays an informative badge that system default output is used.
- **Status**: **Implemented**.

---

## 9. Backing-Track Output Device Management

- **Karaoke Audio Sink**: `useKaraokeAudio` exposes `outputDeviceId`, `isOutputSelectionSupported`, and `setOutputDevice(deviceId)`.
- **Cross-Component Sync**: When changed in the settings modal, saves to `localStorage` under `ktv_karaoke_audio_sink_id` and dispatches `ktv_karaoke_sink_changed` to update the backing `HTMLAudioElement` immediately.
- **Dual-Pipeline Routing**: Backing track and remote voice can route to separate physical hardware (e.g. room soundbar vs. monitoring headset).
- **Status**: **Implemented**.

---

## 10. Browser Compatibility & Limitations

| Feature | Chrome / Edge / Brave | Safari 17+ | Firefox | Mobile Browsers |
| :--- | :---: | :---: | :---: | :---: |
| **Microphone Capture (AEC/NS/AGC)** | Full | Full | Full | Full |
| **Microphone Enumeration & Switch** | Full | Full | Full | Full |
| **Dynamic `devicechange`** | Full | Full | Full | Browser-dependent |
| **Voice Output `setSinkId`** | Full | Full (HTTPS) | Unsupported (Default sink) | Partial (OS routed) |
| **Backing Audio `setSinkId`** | Full | Full (HTTPS) | Unsupported (Default sink) | Partial (OS routed) |

- **Status**: **Documented & Handled Gracefully**.

---

## 11. Permission & Device Error Handling

- Proactively queries `navigator.permissions.query({ name: 'microphone' })` where supported.
- Maps browser DOMExceptions into friendly UI text:
  - `NotAllowedError` $\rightarrow$ *"Microphone permission was denied. Please allow microphone access in your browser settings and try again."*
  - `NotFoundError` $\rightarrow$ *"No microphone found. Please connect an audio input device."*
  - `NotReadableError` $\rightarrow$ *"Microphone is in use by another application or unavailable."*
  - `OverconstrainedError` $\rightarrow$ *"Microphone does not satisfy requested audio constraints."*
  - `AbortError` $\rightarrow$ *"Microphone operation was interrupted. Please retry."*
  - `SecurityError` $\rightarrow$ *"Audio devices require a secure HTTPS origin."*
  - Switch failure $\rightarrow$ *"Could not switch microphone. Your previous microphone is still active."*
- Permanent permission denials are not retried indefinitely.
- **Status**: **Implemented**.

---

## 12. Remote Voice Audio Lifecycle

- Tracks are mounted on `RoomEvent.TrackSubscribed` via `track.attach(audioEl)`.
- Audio elements are tracked in `audioElementsRef` Map keyed by `participant.identity`.
- Detached on `TrackUnsubscribed`, `ParticipantDisconnected`, and room disconnect.
- Output sink (`setSinkId`) is automatically re-applied to any newly attached remote audio element.
- Single audio element per participant ensures zero audio duplication or memory leakage.
- **Status**: **Implemented**.

---

## 13. Race-Safety & Generation Fencing

- Device switching uses generation counter `deviceOpGenerationRef` to discard stale async operations.
- Explicit `leaveVoice()` halts pending switch operations and detaches listeners.
- Device switching never bypasses token authorization or room membership checks.
- Session revocation remains authoritative; device operations do not alter `playbackVersion`, `queueVersion`, or `RoomMembership`.
- **Status**: **Implemented**.

---

## 14. Local Preference Persistence

- Preferences stored strictly in browser `localStorage`:
  - `ktv_audio_capture_options`: `{ echoCancellation, noiseSuppression, autoGainControl }`
  - `ktv_audio_input_device_id`: Preferred microphone device ID.
  - `ktv_voice_audio_output_device_id`: Preferred voice output sink ID.
  - `ktv_karaoke_audio_sink_id`: Preferred backing-track sink ID.
- No device IDs are sent to the backend or synced to user profiles.
- If a saved device ID is disconnected on subsequent visits, the client falls back safely to default.
- **Status**: **Implemented**.

---

## 15. Observability & Performance

- Clean structured diagnostics with `[VoiceClient]` and `[AudioDeviceSettings]` prefixes.
- Zero raw access tokens, provider secrets, or microphone payload data are logged.
- Debounced device enumeration prevents event thrashing on rapid USB connection/disconnection.
- All event listeners are properly unregistered on component unmount.
- **Status**: **Implemented**.

---

## 16. Files Created and Modified

### Created Files
- [`docs/SPRINT_2_6_3_AUDIT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_3_AUDIT.md)
- [`docs/KTV_VOICE_QUALITY.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KTV_VOICE_QUALITY.md)
- [`docs/KTV_AUDIO_DEVICE_MANAGEMENT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KTV_AUDIO_DEVICE_MANAGEMENT.md)
- [`docs/SPRINT_2_6_3_IMPLEMENTATION_REPORT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_6_3_IMPLEMENTATION_REPORT.md)
- [`apps/web/src/features/voice/components/audio-device-settings-modal.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/audio-device-settings-modal.tsx)

### Modified Files
- [`apps/web/src/features/voice/types/voice.types.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/types/voice.types.ts)
- [`apps/web/src/features/voice/hooks/use-voice-client.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts)
- [`apps/web/src/features/voice/components/voice-controls.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/voice-controls.tsx)
- [`apps/web/src/features/voice/index.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/index.ts)
- [`apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/karaoke/hooks/use-karaoke-audio.ts)
- [`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/[roomId]/page.tsx)
- [`docs/KARAOKE_PLAYER_ARCHITECTURE.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/KARAOKE_PLAYER_ARCHITECTURE.md)

---

## 17. Static Verification Results

### `pnpm typecheck`
- **Command**: `pnpm typecheck`
- **Working Directory**: `/Users/mac/Documents/workspace/workspace_coding/ktvonline`
- **Exit Code**: `0`
- **Workspace Coverage**:
  - `packages/contracts`: passed (`tsc --noEmit`)
  - `apps/api`: passed (`tsc --noEmit`)
  - `apps/web`: passed (`tsc --noEmit`)
- **Output**: Clean compilation with 0 type errors.

### `pnpm lint`
- **Command**: `pnpm lint`
- **Working Directory**: `/Users/mac/Documents/workspace/workspace_coding/ktvonline`
- **Exit Code**: `0`
- **Workspace Coverage**:
  - `packages/contracts`: passed (`eslint src/`)
  - `apps/api`: passed (`eslint src/`)
  - `apps/web`: passed (`next lint`)
- **Output**: `✔ No ESLint warnings or errors`.

---

## 18. Deferred Runtime Verification

In accordance with the code-only constraint, the following runtime tests remain deferred for automated or manual browser testing environments:
1. Physical microphone hot-plug and unplug verification with USB/Bluetooth audio interfaces.
2. Verification of `setSinkId` audio routing on actual multi-output physical setups (headphones vs. external speakers).
3. Verification of browser permission prompt flows on first-time browser profiles across Safari, Chrome, and Firefox.
4. Physical acoustic leakage measurements under high speaker volume in various room environments.

---

## 19. Remaining Risks

1. **Firefox Output Device Selection**: Firefox continues to gate `setSinkId` behind `media.setsinkid.enabled` in `about:config`. Firefox users will remain on system default output routing until Mozilla enables the standard API by default.
2. **Audio Driver Lockup**: On Windows, certain proprietary ASIO or gaming audio drivers may throw `NotReadableError` if an exclusive-mode DAW is active. The application catches this cleanly and displays an actionable error message.

---

## 20. Recommended Sprint 2.6.4 Scope

1. **Speaking Volume & Participant Audio Activity**:
   - Surface LiveKit participant speaking indicators and volume metering in `VoiceParticipants` to help singers know when they are actively transmitting.
2. **Participant Volume Sliders**:
   - Allow individual participants to adjust the volume of specific remote singers in their local client mix.
3. **Bandwidth & Network Quality Indicators**:
   - Display LiveKit connection quality scores (`excellent`, `good`, `poor`) beside participant avatars.
