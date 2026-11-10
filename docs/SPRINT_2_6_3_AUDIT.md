# Sprint 2.6.3 — LiveKit Voice Quality & Audio Device Management Audit

## 1. Audit Overview & SDK Inventory

| Component | Package | Installed Version | Location |
| :--- | :--- | :--- | :--- |
| **Frontend LiveKit Client SDK** | `livekit-client` | `2.23.0` | `apps/web/package.json` |
| **Frontend React Components** | `@livekit/components-react` | `2.9.25` | `apps/web/package.json` |
| **Backend LiveKit Server SDK** | `livekit-server-sdk` | `2.19.2` | `apps/api/package.json` |

---

## 2. Answers to Audit Questions

### 1. Which LiveKit client SDK version is installed?
`livekit-client@2.23.0` (in `apps/web/package.json`).

### 2. Which LiveKit server SDK version is installed?
`livekit-server-sdk@2.19.2` (in `apps/api/package.json`).

### 3. What microphone capture options are currently configured?
In `apps/web/src/features/voice/hooks/use-voice-client.ts`, `new Room` was instantiated with:
```typescript
audioCaptureDefaults: {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
}
```
However, these capture options were static, not user-configurable, not persisted in preferences, and not dynamic across microphone switches.

### 4. Are echo cancellation, noise suppression, and AGC enabled?
Yes, default `true` in `RoomOptions.audioCaptureDefaults`. However, there was no user control to adjust them for specialized hardware (e.g. external USB cardioid microphones or external audio interfaces).

### 5. Are these settings controlled by the browser or by application code?
Browser WebRTC media track engine handles echo cancellation, noise suppression, and automatic gain control directly in hardware and browser DSP. The application sets standard W3C `MediaTrackConstraints` through LiveKit's `AudioCaptureOptions`.

### 6. Can the user change microphone devices without leaving the room?
Partially. `switchDevice(deviceId)` was present in `useVoiceClient` using `room.switchActiveDevice('audioinput', deviceId)`. However:
- Device discovery was only triggered once upon `RoomEvent.Connected`.
- Browser `devicechange` events (`navigator.mediaDevices.addEventListener('devicechange', ...)`) were not observed in application state.
- When plugging in a new USB headset, the device list did not refresh dynamically.
- Audio output devices (`audiooutput`) were not discovered or exposed.

### 7. How are permission-denied errors handled?
Caught in `joinVoice` as `NotAllowedError` / `Permission denied`, setting `errorMessage: 'Microphone access was denied. Please allow microphone permissions in your browser and try again.'` and state to `failed`. There was no proactive permission query via `navigator.permissions.query({ name: 'microphone' })`.

### 8. What happens when the selected microphone is unplugged?
LiveKit has an internal `devicechange` listener that attempts to switch to the default device, but the application UI state did not update its active device label, and no notification was surfaced to the user.

### 9. How are remote audio tracks attached and detached?
In `RoomEvent.TrackSubscribed`, an `<audio>` element is dynamically created and attached via `track.attach(audioEl)`. On `TrackUnsubscribed` or `ParticipantDisconnected`, the audio element is paused, removed from DOM, and evicted from `audioElementsRef`.

### 10. How is the voice output device selected?
Not implemented. Voice audio elements used the browser default output sink.

### 11. How is the backing-track output device selected?
Not implemented. `useKaraokeAudio`'s `HTMLAudioElement` routed to the default system output without exposing output sink selection.

### 12. Can remote voice and backing audio accidentally create duplicate audio elements?
No. Remote voice is isolated in `audioElementsRef` Map keyed by `participant.identity`. Backing track audio is isolated in `audioRef.current` in `useKaraokeAudio`. They never share audio elements.

### 13. Are output-device APIs supported across target browsers?
`HTMLMediaElement.prototype.setSinkId` is supported in Chromium browsers (Chrome, Edge, Brave, Opera) and Safari 17+ (macOS/iOS). It is not enabled by default in Mozilla Firefox. Therefore, feature detection (`'setSinkId' in HTMLMediaElement.prototype`) and graceful degradation are required.

### 14. Can device changes race with token renewal or reconnection?
Yes. Rapid device switching while reconnecting or re-authenticating could lead to stale selections overwriting newer selections without generation fencing.

### 15. Does changing a microphone device accidentally publish duplicate microphone tracks?
No. `room.switchActiveDevice('audioinput', deviceId)` replaces the existing track publication in-place inside `LocalParticipant`.

---

## 3. Identified Gaps & Target Implementation Plan

1. **Microphone Device Management**:
   - Dynamic device discovery with `navigator.mediaDevices.addEventListener('devicechange', ...)`.
   - Track permission state (`prompt`, `granted`, `denied`).
   - Graceful fallback when an active device is unplugged.
2. **Audio Capture Quality Settings**:
   - Configurable capture options: `echoCancellation`, `noiseSuppression`, `autoGainControl`.
   - Safe defaults: all enabled.
   - Local persistence in browser `localStorage` (`ktv_audio_capture_options`).
3. **Voice Output Device Selection**:
   - Detect `setSinkId` capability.
   - Enumerate `audiooutput` devices via `Room.getLocalDevices('audiooutput')`.
   - Route remote voice audio elements via `room.switchActiveDevice('audiooutput', deviceId)` and `audioEl.setSinkId(deviceId)`.
4. **Backing-Track Audio Output Device Selection**:
   - Expose `setOutputDevice(deviceId)` in `useKaraokeAudio`.
   - Apply `setSinkId(deviceId)` to the backing `HTMLAudioElement`.
5. **Unified Audio Device Settings Modal / Panel**:
   - Dedicated audio settings modal with clear separation between Microphone Input, Voice Output, and Karaoke Backing Output.
   - Device status, permission guidance, and browser limitation alerts.
6. **Race Safety**:
   - Fenced device operations with cancellation checks.
