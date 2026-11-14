# Sprint 5.4: Singer Studio & Live Vocal Experience — Audio Lifecycle & Resource Safety

**Document:** `SPRINT_5_4_AUDIO_LIFECYCLE_REVIEW.md`  
**Focus:** Web Audio API & LiveKit Media Resource Management  
**Status:** Complete  

---

## 1. Lifecycle Invariants & Resource Guarantees

In modern web applications, audio hardware and Web Audio resources are stateful OS-level primitives. Failing to manage their lifecycle causes browser tabs to leak memory, leaves hardware microphone indicators (e.g. macOS orange dot) running indefinitely, and leads to audio clipping or hardware starvation.

### Mandatory Rules:
1. **Private Test Streams Must Be Explicitly Stopped**: Any `MediaStream` acquired via `getUserMedia()` for local testing must have `track.stop()` called on all tracks when testing stops or the dialog closes.
2. **AudioContext Teardown**: Every instantiated `AudioContext` must have its source and analyser nodes disconnected, and `audioContext.close()` must be executed upon dialog unmount.
3. **No Interruption of Live Room Audio**: When testing inside an active LiveKit call, the studio must never call `track.stop()` on LiveKit's published `LocalAudioTrack`.
4. **Server Mute Preservation**: Device switches and microphone tests must never trigger LiveKit publishing (`setMicrophoneEnabled(true)`) if `isServerMuted` or `canPublish === false`.
5. **No Duplicate Event Listeners**: `devicechange` listeners must be registered once per hook lifecycle and removed cleanly on unmount.

---

## 2. Resource Transition Matrix

| State / Trigger | Test Stream Action | AudioContext Action | LiveKit Track Action | UI Meter State |
| :--- | :--- | :--- | :--- | :--- |
| **Open Dialog (Test Active)** | Call `getUserMedia()` with selected `deviceId` & capture prefs | Create `AudioContext` & `AnalyserNode`, start RAF loop | Untouched (remains as-is) | Active & reactive |
| **Switch Device in Dialog** | Stop old test tracks, acquire new track for new `deviceId` | Reconnect `MediaStreamAudioSourceNode` | If LiveKit active, call `switchActiveDevice('audioinput', newId)` | Reset & resume |
| **Stop Test Button Clicked** | Stop all test tracks (`track.stop()`) | Suspend or close `AudioContext`, cancel RAF | Untouched | Inactive (0% level) |
| **Close Dialog** | Stop all test tracks immediately | Close `AudioContext`, cancel RAF | Untouched | Dormant |
| **Unplug Active Microphone** | Browser fires `devicechange`; fall back to default mic | Re-acquire stream on fallback device | Fallback to next available mic via `switchActiveDevice` | Error / fallback notice |
| **Host Mutes User in Room** | Test stream continues locally (private only) | Untouched | Server revokes `canPublish`, mutes track | Displays "Server Muted" badge |
| **Leave Room While Studio Open**| Test stream continues locally if desired | Untouched | Room disconnects, room tracks stopped | Switched to Standalone mode |

---

## 3. Server-Mute Moderation Safeguard

A critical security invariant in KTVOnline is that room hosts and moderators have authoritative control over voice publishing permissions:
- When a user is server-muted (`viewer.isMuted === true` or LiveKit `permissions.canPublish === false`), the backend token and server-side LiveKit client revoke the microphone source.
- In `apps/web`:
  - `VoiceControls` disables the mute toggle and displays a prominent moderation badge.
  - In `switchAudioInputDevice()` and `useVoiceClient()`:
    ```typescript
    // Ensure device switching does NOT automatically unmute a moderated or locally muted user
    if (roomRef.current?.localParticipant) {
      await roomRef.current.switchActiveDevice('audioinput', deviceId);
      if (isMuted || isServerMuted || !canPublish) {
        // Enforce muted publication state
        const micPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track && !micPub.isMuted) {
          await micPub.track.mute();
        }
      }
    }
    ```
- Reconnection routines (`attemptReconnect`) re-validate permissions with the backend API (`voiceApi.getVoiceToken`) before attempting to publish any track.

---

## 4. Teardown & Leak Prevention Audit

1. **`requestAnimationFrame` Cancellation**:
   The animation frame ID is stored in a `useRef<number | null>(null)`. In the cleanup function of the meter hook, `cancelAnimationFrame(frameId)` is invoked unconditionally.
2. **AudioContext State Check**:
   Before calling `audioContext.close()`, verify `audioContext.state !== 'closed'`.
3. **Cross-Tab Concurrency**:
   Local capture preferences and device selections stored in `localStorage` use storage event synchronization so multiple tabs do not enter contradictory device states.
