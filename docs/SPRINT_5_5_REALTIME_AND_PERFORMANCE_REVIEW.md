# Sprint 5.5: Live Karaoke Performance Experience — Realtime & Performance Review

**Document:** `SPRINT_5_5_REALTIME_AND_PERFORMANCE_REVIEW.md`  
**Focus:** Socket.IO Realtime Contracts, Reconnection Safety, and Performance Optimization  
**Status:** Complete  

---

## 1. Realtime Event Contracts & Handlers

The live performance experience coordinates several realtime event streams over Socket.IO:

| Socket.IO Event | Payload | Purpose | Delivery Guarantee |
| :--- | :--- | :--- | :--- |
| `playback:state` | `PlaybackStateDto` | Authoritative track progress and status | Snapshot-based + Version fenced |
| `stage:reaction` | `StageReactionPayload` | Audience cheering emoji and sender metadata | Ephemeral broadcast to room |
| `gift:new` | `GiftNewPayload` | Virtual gift celebrations on stage | Ephemeral broadcast to room |
| `room:state` | `RoomStateSnapshotDto` | Comprehensive room membership & queue state | Periodic / reconnect snapshot |

---

## 2. Race Condition Prevention & State Version Fencing

During live karaoke sessions, rapid user interactions (such as fast song skips or network disconnects) can lead to out-of-order Socket.IO message delivery:
1. **Playback Version Fencing**:
   Every playback state mutation on the server increments `playbackVersion`. The client maintains `latestVersionRef`. Any incoming event with `playbackVersion <= latestVersionRef.current` is ignored, preventing a delayed "playing" event from overwriting a newer "stopped" or "transitioning" state.
2. **Deduplication of Audience Reactions**:
   When an audience member clicks a cheer emoji:
   - The client optimistically renders a local floating particle tagged with `isSelf: true` and an optimistic ID.
   - When the server broadcasts the reaction event back to the room, the hook matches incoming events by sender ID and timestamp window ($\pm 1000\text{ms}$), suppressing duplicate particle rendering for the sender while rendering for everyone else in the room.
3. **Transition Animation Isolation**:
   The stage transition overlay is strictly presentation-only. It visually bridges the gap while the server worker acquires the lease, finalizes the previous song, and claims the next track in the queue. The frontend never artificially starts playback or mutates queue items.

---

## 3. Resource Cleanup & Memory Safety

1. **Floating Particle Timer Garbage Collection**:
   Every particle spawned has a 2000ms removal timer. On component unmount, all active particle timers are cleared to avoid memory retention.
2. **Scroll Timeout Teardown**:
   The user-scroll detection timeout in `LyricsStage` is cleaned up in the component unmount hook.
3. **Animation Frame Cancellation**:
   All RAF loops across the stage visualizer, meter, and audio clock are tracked in `useRef` and canceled on unmount.
