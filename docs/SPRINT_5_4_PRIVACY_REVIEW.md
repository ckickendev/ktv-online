# Sprint 5.4: Singer Studio & Live Vocal Experience — Privacy & Security Review

**Document:** `SPRINT_5_4_PRIVACY_REVIEW.md`  
**Focus:** Microphone Data Handling, User Consent & Security Boundaries  
**Status:** Complete & Approved  

---

## 1. Microphone Privacy Threat Model & Principles

Microphone hardware access is among the most sensitive user permissions on personal computers and mobile devices. In karaoke and social hangout applications, users must have absolute confidence that:
1. Their microphone is not listening when they believe it is off.
2. Local microphone tests do not secretly transmit audio to the server or other room members.
3. No audio is recorded or stored without explicit consent and architectural support.
4. Room moderation controls (server mute) cannot be bypassed by client-side tampering.

---

## 2. Privacy & Data Handling Analysis

### 2.1 Local Audio Analysis Isolation
- **Web Audio Routing**:
  The microphone input meter connects the local `MediaStreamAudioSourceNode` solely to an `AnalyserNode`.
  - It is **never** piped to `audioContext.destination` (speakers).
  - It is **never** piped to a `MediaRecorder` or WebRTC peer connection.
  - No raw PCM audio chunks, audio buffers, or frequency vectors are ever transmitted via HTTP, WebSocket, or LiveKit data channels.
- **In-Memory Volatility**:
  The byte frequency arrays computed during meter animation are transient typed arrays held in function scope for the duration of a single animation frame (16ms) and garbage collected immediately.

### 2.2 Device Identification Sanitization
- `navigator.mediaDevices.enumerateDevices()` returns `deviceId` and `label`.
- Hardware `deviceId` strings are treated as ephemeral client-side tokens.
  - They are stored only in `localStorage` under `ktv_preferred_mic_id` to remember the user's preferred physical microphone across sessions.
  - They are **never** transmitted to backend databases or included in user profiles.
  - In UI presentation, only human-readable labels (e.g. *"MacBook Pro Microphone"*, *"Yeti Nano USB Mic"*) are shown. If device labels are empty (when permission has not yet been granted), user-friendly generic labels (e.g. *"Microphone 1"*) are displayed.

### 2.3 Explicit User Consent & State Transparency
- Microphone capture for testing is **never initiated automatically** without explicit user context (such as opening the Microphone Studio dialog or clicking "Start Test").
- When microphone capture is active:
  - Browser tab recording indicators (e.g. macOS orange dot, Chrome tab red dot) illuminate as required by OS security policies.
  - The in-app UI displays an active visual status: "Microphone Active" or "Microphone Test Running".
- When the studio dialog is closed:
  - All local media stream tracks are immediately stopped via `track.stop()`.
  - Browser hardware indicators instantly extinguish.

---

## 3. Server-Side Moderation Security Invariants

| Action Attempted by Client | Server Defense Mechanism | Result |
| :--- | :--- | :--- |
| Moderated user changes microphone device | LiveKit server tracks permissions authoritatively; `canPublish: false` maintained | Client device changes, but publishing remains blocked |
| Moderated user manually invokes `setMicrophoneEnabled(true)` | LiveKit server drops published tracks not permitted by JWT / RoomServiceClient | Publication rejected with authorization error |
| Moderated user reconnects or refreshes page | Backend `voiceApi.getVoiceToken()` validates `membership.isMuted`; issues token with `canPublish: false` | User connects in listen-only mode |
| User attempts to access voice without active room membership | Backend verifies `RoomMembershipModel.findOne({ status: 'active' })`; rejects with `FORBIDDEN_NOT_MEMBER` | LiveKit token denied |
| Kicked user attempts to rejoin voice | Backend verifies `membership.kickedAt == null`; rejects with `FORBIDDEN_KICKED` | LiveKit token denied |

---

## 4. Browser Limitations & Graceful Degradation

1. **Permission Query Support**:
   - `navigator.permissions.query({ name: 'microphone' })` is supported in Chromium and Firefox, but historically restricted in Safari desktop/iOS.
   - The studio gracefully degrades: if `permissions.query` throws or is unsupported, permission state is tracked via direct `getUserMedia()` promise resolution/rejection (`NotAllowedError`).
2. **Audio Output Routing (`setSinkId`)**:
   - Supported in Chrome/Edge, but unsupported in Safari and some mobile browsers.
   - When unsupported, the UI clearly displays: *"Your browser uses your system default audio output device"* rather than throwing an error or showing broken selectors.
