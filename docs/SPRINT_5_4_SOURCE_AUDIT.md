# Sprint 5.4: Singer Studio & Live Vocal Experience — Source Audit

**Milestone:** Sprint 5.4 Phase 0 Baseline Audit  
**Date:** 2026-11-14  
**Expected Baseline Commit:** `a4e23f4`  
**Actual HEAD Commit:** `a4e23f4f0afdf6394926b2e35c1501203cacf5ac`  
**Working Tree Status:** Clean  
**MongoDB Database Name:** `test` (preserved per platform constraints)  

---

## 1. Baseline & Repository Verification

- Current Git HEAD matches expected baseline `a4e23f4` (`feat(memories): implement Sprint 5.3 session memories, karaoke history, recap experience, and privacy controls`).
- Working tree is clean on branch `main`.
- Monorepo package manager: `pnpm 10.x` workspace.
- Backend database configuration: `test` MongoDB database preserved in `apps/api/src/config/env.ts` and `apps/api/src/database/connection.ts`.

---

## 2. Audio & Voice Architecture Inspection

### 2.1 Installed SDK Versions
- **Frontend (`apps/web/package.json`)**:
  - `livekit-client`: `^2.23.0`
  - `@livekit/components-react`: `^2.9.25`
  - `react`: `^19.0.0`
  - `next`: `^15.2.0`
- **Backend (`apps/api/package.json`)**:
  - `livekit-server-sdk`: `^2.19.2`
  - `express`: `^4.21.2`
  - `mongoose`: `^8.10.1`
  - `socket.io`: `^4.8.4`

### 2.2 Frontend Voice Lifecycle (`apps/web/src/features/voice/`)
1. **`useVoiceClient` (`hooks/use-voice-client.ts`)**:
   - Manages connection to LiveKit rooms using `livekit-client`.
   - Acquires short-lived JWT token via `voiceApi.getVoiceToken(roomId, { tabId })`.
   - Schedules proactive token renewal at 80% TTL.
   - Enforces participant session generation fencing (`sessionGenRef`) to eliminate race conditions from concurrent disconnect/reconnect cycles.
   - Handles device enumeration for audio input and audio output devices via `navigator.mediaDevices.enumerateDevices()`.
   - Stores preferred microphone ID (`ktv_preferred_mic_id`) and output ID (`ktv_preferred_voice_output_id`) in `localStorage`.
   - Tracks audio capture preferences (`echoCancellation`, `noiseSuppression`, `autoGainControl`) in `localStorage` (`ktv_audio_capture_prefs`).
   - Handles remote audio tracks by creating `<audio>` elements attached to the DOM and setting `sinkId` where supported.
2. **`VoiceControls` (`components/voice-controls.tsx`)**:
   - Renders in two variants: `bar` (compact top toolbar in room header) and `card` (full panel).
   - Provides join/leave voice buttons, mute/unmute toggle, quick input device selector, and trigger for device settings.
   - Evaluates `isServerMuted` and prevents local unmuting when room moderation has muted the participant.
3. **`AudioDeviceSettingsModal` (`components/audio-device-settings-modal.tsx`)**:
   - Allows selecting microphone input, toggling AEC/NS/AGC, and selecting voice output sink.
   - **Current limitations**:
     - No live microphone volume meter.
     - No interactive microphone test flow (users cannot verify audio capture before speaking to the room).
     - No visual feedback distinguishing silence, normal singing levels, or audio clipping.
     - Cannot be accessed outside of an active room (e.g. from the Profile page or before entering a room).
4. **Mobile Voice Dock (`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`)**:
   - Fixed bottom navigation bar with a dedicated quick voice toggle button.
   - Satisfies 44px touch targets and safe area insets.
   - Reflects basic connecting, muted, speaking, and mod-muted states.

### 2.3 Backend Voice Lifecycle & Moderation (`apps/api/src/modules/voice/`)
1. **`VoiceService` (`voice.service.ts`)**:
   - Issues short-lived access tokens via `voiceTokenService.generateToken()`.
   - Authoritative membership and moderation validation:
     - Rejects inactive or suspended users (`FORBIDDEN_USER_INACTIVE`).
     - Rejects revoked session families (`FORBIDDEN_SESSION_REVOKED`).
     - Rejects closed rooms (`FORBIDDEN_ROOM_CLOSED`).
     - Rejects non-members (`FORBIDDEN_NOT_MEMBER`).
     - Rejects kicked members (`FORBIDDEN_KICKED`).
     - Sets `canPublish: !membership.isMuted` in LiveKit token grants.
   - Provides `muteLiveKitParticipant(roomId, userId, isMuted)` which authoritatively calls LiveKit's `RoomServiceClient.updateParticipant` to revoke or grant publishing permissions (`canPublish: false`, `canPublishSources: []`) and mutes published tracks on the server.
   - Provides `evictLiveKitParticipant` and `evictLiveKitSessionFamily` with fallback background retry via `VoiceEvictionTaskModel`.

---

## 3. Confirmed Implementation Gaps & Deficiencies

| ID | Component / Area | Description of Gap | Severity |
| :--- | :--- | :--- | :--- |
| **GAP-01** | Microphone Input Level Meter | No real-time Web Audio API audio level visualizer. Users cannot see if their microphone is picking up sound or if the volume is too low or clipping. | **High** |
| **GAP-02** | Dedicated Microphone Studio Experience | No comprehensive `MicrophoneStudioDialog` component. Current settings dialog lacks testing capabilities, level diagnostics, and pre-room availability. | **High** |
| **GAP-03** | Standalone Pre-Room Testing | Microphone configuration and testing is only accessible when already inside an active room. Users cannot test their microphone from the Profile page or before joining a stage. | **Medium** |
| **GAP-04** | Fine-Grained Voice Connection States | Voice connection states are partially collapsed in UI controls. Needs distinct representation for: `idle`, `connecting`, `requesting_permission`, `connected`, `reconnecting`, `server_muted`, `listen_only`, `device_unavailable`, `permission_denied`. | **Medium** |
| **GAP-05** | Resource Lifecycle Safety on Test Audio | Local microphone testing requires acquiring a `MediaStream` and `AudioContext`. If not safely torn down upon dialog close, route change, or unmount, microphone hardware indicators stay on and memory leaks occur. | **High** |
| **GAP-06** | Device Switching While Moderated | While `canPublish` is enforced on the server, switching devices client-side must guarantee that the participant does not accidentally attempt to republish an active track if server-muted. | **Medium** |

---

## 4. LiveKit SDK 2.23.0 Capability Assessment

Inspecting `livekit-client` v2.23.0:
- **`Room.switchActiveDevice(kind, deviceId, exact)`**: Supported for `'audioinput'` and `'audiooutput'`. Returns `Promise<boolean>`.
- **`Room.getActiveDevice(kind)`**: Supported.
- **`Room.localParticipant.setMicrophoneEnabled(enabled, audioCaptureDefaults)`**: Supported.
- **`LocalAudioTrack.mediaStreamTrack`**: Standard browser `MediaStreamTrack` instance accessible via `pub.track?.mediaStreamTrack`. Can be inspected or cloned for Web Audio analysers when microphone is actively published.
- **`navigator.mediaDevices.getUserMedia`**: Standard browser API available for standalone pre-room testing without requiring a LiveKit connection.
- **Web Audio API (`AudioContext`, `AnalyserNode`)**: Universally supported in modern browsers for real-time RMS and frequency analysis.

---

## 5. Architectural Strategy & Safety Constraints

1. **Dual-Mode Audio Testing**:
   - **Mode A (Connected & Unmuted in Room)**: Leverage the active LiveKit `LocalAudioTrack`'s underlying `MediaStreamTrack` for the analyser. Closing the studio dialog disconnects the analyser nodes but leaves the LiveKit track streaming to the room uninterrupted.
   - **Mode B (Standalone / Pre-Room / Room Muted)**: Acquire a private local `MediaStream` via `navigator.mediaDevices.getUserMedia`. The audio is strictly routed to a local `AnalyserNode` and never published to LiveKit or sent over any network. Closing the studio dialog or stopping the test immediately calls `track.stop()` on all private tracks and closes the `AudioContext`.
2. **Server-Mute Security Invariant**:
   - Client-side device switching and testing must never invoke `setMicrophoneEnabled(true)` if `viewer.isMuted` or `canPublish === false`.
3. **No Heavy Custom DSP / Auto-tune / Recording**:
   - Strictly defer professional mixing consoles, pitch correction, auto-tune, voice morphing, and server-side audio recording per Section 11 of the sprint requirements.
