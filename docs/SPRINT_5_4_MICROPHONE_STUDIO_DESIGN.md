# Sprint 5.4: Singer Studio & Live Vocal Experience — Microphone Studio Design

**Document:** `SPRINT_5_4_MICROPHONE_STUDIO_DESIGN.md`  
**Status:** Approved for Implementation  
**Target Component:** `apps/web/src/features/voice/components/MicrophoneStudioDialog.tsx`  

---

## 1. Component Overview & User Journey

The **Microphone Studio** is the dedicated audio control center for KTVOnline singers. It provides a polished, low-friction environment to test microphones, inspect audio input levels, configure browser vocal processing, and ensure stage readiness before or during a live karaoke session.

### User Journey
1. **Discovery / Launch**:
   - Inside Room: Triggered from the persistent voice toolbar (desktop) or mobile bottom dock.
   - Outside Room: Triggered from the singer's Profile page (`/profile` -> "Audio Setup & Studio").
2. **Permission Check**:
   - If permission is unknown or prompt, clear guidance invites the user to grant access.
   - If permission is denied, clear browser-specific instructions are displayed.
3. **Device Selection**:
   - User views a list of labeled microphones.
   - Changing the device seamlessly transfers active capture.
4. **Interactive Microphone Test**:
   - User speaks or sings into their mic.
   - A real-time multi-segment LED-style meter pulses according to vocal dynamics.
   - Actionable diagnostics describe input quality (Silent, Too Quiet, Optimal Karaoke Range, Peaking).
5. **Browser Capture Processing**:
   - Users can toggle Acoustic Echo Cancellation (AEC), Noise Suppression, and Automatic Gain Control (AGC).
6. **Safe Exit**:
   - Closing the studio automatically closes local audio contexts and stops all private test tracks.

---

## 2. Real-Time Audio Level Meter Architecture

### 2.1 Web Audio API Pipeline
```
[ Microphone Input ]
        │
        ▼
[ MediaStreamTrack ]
        │
        ▼
[ AudioContext ]
        │
        ▼
[ MediaStreamAudioSourceNode ]
        │
        ▼
[ AnalyserNode ] (fftSize: 256, smoothing: 0.8)
        │
        ├─► getByteTimeDomainData / getByteFrequencyData
        │       │
        │       ▼
        │   Calculate RMS: sqrt(sum(sample^2) / N)
        │       │
        │       ▼
        │   Normalize to 0..100%
        │
     (NOT connected to audioContext.destination — ZERO audio feedback loop)
```

> [!IMPORTANT]
> The `AnalyserNode` is intentionally **never connected** to `audioContext.destination`. This guarantees that the user's voice is analyzed silently without playing back through speakers and causing acoustic feedback.

### 2.2 Level Classification Thresholds
| Range | Category | Color / Status | Guidance Text |
| :--- | :--- | :--- | :--- |
| **0% – 2%** | Silence | Gray / Dim | *"No vocal input detected. Speak or sing into your mic."* |
| **2% – 15%** | Low Signal | Amber / Subtle | *"Input is quiet. Move closer to the mic or boost OS gain."* |
| **15% – 75%** | Optimal Vocal Level | Vibrant Emerald / Violet | *"Perfect singing level! Your vocals are clear and resonant."* |
| **75% – 100%** | Excessive / Clipping | Rose / Pulsing | *"Signal peaking / too loud! Step back slightly to prevent distortion."* |

### 2.3 Frame Loop & Render Throttling
- An internal `requestAnimationFrame` loop calculates RMS levels.
- Level updates are smoothed with exponential decay ($V_{smooth} = \alpha V_{new} + (1-\alpha) V_{prev}$) to avoid jittery animations.
- Rerenders are confined to the meter bar component; parent dialog components remain unaffected.

---

## 3. In-Room vs Pre-Room Contexts

`MicrophoneStudioDialog` operates cleanly in two contexts:
1. **In-Room Mode**:
   - Inherits active `useVoiceClient` hook props (active device ID, device list, LiveKit connection state, `isServerMuted`, device switch handlers).
   - If connected and unmuted in LiveKit, can analyze the active `LocalAudioTrack` stream.
   - If connected but muted, acquires a temporary private test stream so the user can test their microphone locally without unmuting to the lounge.
2. **Standalone / Pre-Room Mode (e.g. Profile Page)**:
   - Uses a dedicated hook `useMicrophoneTester` that manages device enumeration and local testing independently of LiveKit.
   - Allows users to configure and verify their microphone setup before joining any room.

---

## 4. UI Layout & Visual Design

- **Aesthetic**: Dark karaoke studio theme (`#0a0d17` background with subtle violet/cyan atmospheric gradients and glass panels).
- **Desktop**: Centered modal with smooth backdrop blur.
- **Mobile**: Responsive bottom-sheet / modal with full touch accessibility (minimum 44px touch targets).
- **Diagnostic Panel**:
  - Live 24-segment responsive VU meter with peak-hold indicators.
  - Active audio capture enhancement toggles with clear explanations of their benefits for karaoke.
  - Audio output selection (for headphones vs speakers) where browser `setSinkId` is supported.
