# KTVOnline Voice Quality & Capture Processing Architecture

## 1. Overview & Objectives

In real-time karaoke rooms, voice quality faces unique acoustic challenges:
1. High-volume backing music playing concurrently through room speakers or headphones.
2. Wide dynamic range from singers (whispering to powerful high notes).
3. Diverse client hardware (integrated laptop microphones, mobile phone arrays, USB gaming headsets, and dedicated XLR audio interfaces).

The objective of the KTVOnline voice quality pipeline is to deliver clean, intelligible voice communication and singing audio with minimal latency, maximum stability, and browser-standard processing.

---

## 2. Capture Processing Capabilities

KTVOnline leverages browser-native WebRTC media processing constraints applied directly through the LiveKit client SDK (`livekit-client@2.23.0`).

### Configurable Capture Options

| Constraint | Default | Purpose | Behavior & Processing Layer |
| :--- | :--- | :--- | :--- |
| **Echo Cancellation (`echoCancellation`)** | `true` | Acoustic Echo Cancellation (AEC) | Prevents remote voice streams and backing track playback from leaking into the microphone and creating feedback loops. Processed by browser hardware or WebRTC DSP. |
| **Noise Suppression (`noiseSuppression`)** | `true` | Ambient Noise Filtering | Suppresses continuous background noise (fans, air conditioning, keyboard clicks, computer hum) without muting vocal formants. |
| **Automatic Gain Control (`autoGainControl`)** | `true` | Dynamic Level Normalization | Automatically amplifies quiet speakers and limits sudden peaks to prevent digital clipping when singing loudly. |

---

## 3. Recommended Defaults & Configuration Semantics

### Standard User Profile (Default)
For standard users operating laptop built-in microphones or phone earphones:
- `echoCancellation: true`
- `noiseSuppression: true`
- `autoGainControl: true`

This provides out-of-the-box intelligibility, prevents annoying echo for room participants, and evens out volume discrepancies.

### Professional / High-End Microphone Profile
Users equipped with external USB microphones (e.g. Shure MV7, Blue Yeti) or external audio interfaces (e.g. Focusrite Scarlett, MOTU) often prefer uncolored audio:
- `echoCancellation: true` (or `false` if wearing closed-back headphones)
- `noiseSuppression: false` (to preserve the natural frequency response and dynamic range of vocal performance)
- `autoGainControl: false` (to prevent pumping artifacts and allow manual analog preamp gain staging)

Through the **Audio Device Settings Modal**, users can toggle any combination of these three options in real time without disconnecting from the room.

---

## 4. Acoustic Leakage & Browser Limitations

### Inherent Physical Constraints
> [!WARNING]
> Software Acoustic Echo Cancellation (AEC) cannot guarantee 100% elimination of acoustic leakage under all hardware and room configurations.

1. **Loudspeaker Proximity**: If a participant plays the backing track at high volume through laptop speakers situated inches from the integrated microphone, acoustic bleed and minor phasing are physically inevitable.
2. **Headphone Recommendation**: For optimal karaoke performance, singers are always encouraged to use headphones or earphones to physically decouple the microphone from the playback speaker.
3. **Browser Engine Variance**:
   - **Chromium (Chrome, Edge, Brave)**: Utilizes Google WebRTC AEC3 (Acoustic Echo Canceller 3) with aggressive non-linear suppression and double-talk detection.
   - **WebKit (Safari macOS / iOS)**: Delegates echo cancellation to Apple CoreAudio platform DSP, which is tightly tuned to Apple hardware mic arrays but can vary on third-party USB hardware.
   - **Gecko (Firefox)**: Utilizes Mozilla WebRTC AEC, which may exhibit slightly higher sensitivity to speaker feedback under high gain.

---

## 5. Architectural Pipeline Isolation

A fundamental design constraint of KTVOnline is maintaining absolute isolation between the karaoke instrumental audio pipeline and the WebRTC microphone publication pipeline:

```
+----------------------------------------------------------------------------------+
| Client Audio Pipeline Architecture                                               |
|                                                                                  |
| [Karaoke Backing Audio] ──> HTMLAudioElement ──> Speaker / Headphone Output      |
|                                                                                  |
| [Microphone Input]      ──> getUserMedia(AEC, NS, AGC) ──> LiveKit SFU Server    |
+----------------------------------------------------------------------------------+
```

### Architectural Guarantees:
1. **No Mixed Audio Publishing**: The browser never mixes the backing `HTMLAudioElement` into `navigator.mediaDevices.getUserMedia` or LiveKit audio tracks.
2. **No Unnecessary Web Audio API Graphs**: The application does not route microphone tracks through custom `AudioWorklet` nodes, biquad filters, or custom script processors. Custom DSP introduces latency, increases CPU consumption, and risks audio buffer dropouts during intense browser rendering.
3. **Hardware Volume Decoupling**: Adjusting the karaoke backing track volume slider modulates only the `HTMLAudioElement.volume` property; it does not touch the system or browser microphone capture gain.

---

## 6. Preference Persistence & Reactivity

1. **Storage**: Audio capture preferences are stored in the browser's `localStorage` under the key:
   ```json
   ktv_audio_capture_options: {
     "echoCancellation": true,
     "noiseSuppression": true,
     "autoGainControl": true
   }
   ```
2. **Reactivity**:
   - When the user alters capture options in the settings modal, `useVoiceClient` calls:
     ```typescript
     await room.localParticipant.setMicrophoneEnabled(true, newCaptureOptions);
     ```
   - LiveKit re-acquires the media stream with updated `MediaTrackConstraints` and seamlessly substitutes the published audio track without dropping the WebRTC peer connection or notifying remote participants of a rejoin.
3. **Safe Initialization**:
   - If `localStorage` is empty or corrupted, the system safely falls back to standard defaults (`true, true, true`).
