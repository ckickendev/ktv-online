# Karaoke Browser Player & Audio Synchronization Architecture

## 1. System Mission & Core Authority Boundary

The KTVOnline karaoke player provides synchronized backing-track audio playback across distributed browser clients.

### Separation of Concerns: Server vs. Client

| Domain Responsibility | Server Authority | Client Browser Authority |
| :--- | :--- | :--- |
| **Track Selection** | Owns active queue item ID and track progression. | Renders current song metadata. |
| **Playback Status** | Owns authoritative state (`playing`, `paused`, `idle`). | Mirror status in local audio element. |
| **Playback Clock** | Owns time anchor (`positionMs`, `anchorStartedAt`). | Computes continuous elapsed time. |
| **Track Completion** | `KaraokePlaybackScheduler` advances queue. | Reaching `ended` resets local audio; **cannot** advance queue. |
| **Audio Rendering** | None (headless). | Native `HTMLAudioElement` streams and decodes audio. |
| **Audio Volume** | None. | Persisted in local browser `localStorage`. |
| **Microphone Chat** | LiveKit SFU server routes voice tracks. | WebRTC captures microphone stream. |

---

## 2. Server-Authoritative Playback Clock

The backend calculates playback position without continuously writing to the database by using a time-anchor model:

$$\text{currentPositionMs} = \text{positionMs} + (\text{now} - \text{anchorStartedAt})$$

When paused, $\text{positionMs}$ is frozen and $\text{anchorStartedAt}$ is set to `null`.
When stopped or idle, $\text{positionMs} = 0$.

Clients derive their continuous display and synchronization clock at 10 Hz from this authoritative anchor.

---

## 3. Synchronization & Drift Correction Algorithm

Network jitter, tab throttling, and hardware audio buffering inevitably cause client audio elements to drift from the server anchor.

`useKaraokeAudio` executes a controlled, three-tier drift correction strategy:

```typescript
const driftMs = localTimeMs - authoritativePositionMs;
const absDrift = Math.abs(driftMs);

if (absDrift < 300) {
  // Tier 1: Small drift (< 300ms)
  // Imperceptible to human ear — leave playback untouched
  audio.playbackRate = 1.0;
} else if (absDrift <= 1500) {
  // Tier 2: Moderate drift (300ms - 1500ms)
  // Smooth tempo nudge to eliminate drift without audible glitching
  if (driftMs > 0) {
    audio.playbackRate = 0.95; // Local is ahead -> slow down
  } else {
    audio.playbackRate = 1.05; // Local is behind -> speed up
  }
} else {
  // Tier 3: Large drift (> 1500ms)
  // Hard seek to authoritative anchor
  audio.currentTime = authoritativePositionMs / 1000;
  audio.playbackRate = 1.0;
}
```

### Protection Against Seek Loops
- Seeking is throttled to at most once every 1,500 ms.
- Drift correction is bypassed during audio buffering or track initial loading.

---

## 4. Autoplay Policy Handling

Modern web browsers (Chrome, Safari, Firefox, Edge) restrict media playback with audio unless the user has actively interacted with the document.

### Rejection Detection & Non-Intrusive Recovery
When the host executes `play`:
1. Non-host listeners may receive the Socket.IO `karaoke:playback_updated` event while their tab has no user interaction token.
2. `HTMLMediaElement.play()` rejects with `NotAllowedError: play() failed because the user didn't interact with the document first`.
3. The player catches this error explicitly:
   - Sets `isAutoplayBlocked = true`.
   - Displays an accessible banner: *"Audio autoplay blocked by browser. Click to unmute backing track."*
   - Renders an interactive button calling `unlockAutoplay()`.
4. When clicked, `unlockAutoplay()` immediately triggers `audio.play()`, unmuting playback and dismissing the banner.
5. The backend playback state remains completely untouched—a participant's local browser restriction never alters the shared room state.

---

## 5. LiveKit Voice & Backing Audio Separation

A critical failure mode in social karaoke applications is audio feedback loops, where backing audio played through the browser is re-captured by the microphone and broadcast to the room.

### Architectural Audio Partitioning

```
+------------------------------------------------------------------------+
| Client Browser Window                                                  |
|                                                                        |
|  [Karaoke Audio Engine]                    [LiveKit WebRTC Engine]     |
|          |                                            |                |
|  HTMLAudioElement                             getUserMedia             |
|  (Streams Backing WAV/MP3)                    (Microphone Input Only)  |
|          |                                            |                |
|          v                                            v                |
|  System Audio Output                     LiveKit Voice Publisher Track |
|  (User Headphones / Speakers)                         |                |
|                                                       v                |
|                                             LiveKit SFU Server         |
|                                                       |                |
|                                                       v                |
|                                            Remote Voice Subscribers    |
+------------------------------------------------------------------------+
```

1. **No Mixed Audio Publishing**: The browser never routes `HTMLAudioElement` into `navigator.mediaDevices.getUserMedia` or LiveKit audio tracks.
2. **Independent Volume Controls**:
   - Karaoke backing audio slider operates strictly on `HTMLAudioElement.volume`.
   - Microphone mute toggles `LiveKitRoom.localParticipant.setMicrophoneEnabled(false)`.
   - Changing backing track volume has zero impact on microphone capture levels.
3. **Lifecycle Teardown**:
   - Exiting the room immediately pauses and empties `audioRef.current.src = ''`.
   - Destroys event listeners, preventing ghost audio or duplicate audio instances after reconnect.
