# Karaoke Playback Synchronization Specification

## 1. System Mission & Authority Invariants

In KTVOnline, distributed participants in a room must hear the same musical backing track in near-perfect synchrony, despite divergent client hardware, network latency, packet jitter, and browser background tab throttling.

### Absolute Authority Invariants
1. **Server Clock Authority**: The Node.js server system clock is the sole source of time truth.
2. **Time-Anchor Model**: Persistent playback state is captured as an anchor tuple:
   $$(\text{positionMs}, \text{anchorStartedAt}, \text{playbackVersion}, \text{status})$$
3. **Client Clock Offset ($\theta$)**: Clients never assume their local clock equals the server clock. Instead, clients estimate the clock offset $\theta = \text{serverTime} - \text{clientTime}$ using an NTP-style filter.
4. **Local Audio Subservience**: The client `HTMLAudioElement` only mirrors the authoritative state. Reaching the end of the audio track locally **never** advances the persistent queue. Natural completion is strictly driven by the server-side `KaraokePlaybackScheduler` and `KaraokePlaybackWorker`.

---

## 2. Server Clock Offset Estimation Algorithm

To eliminate device clock inaccuracies (which frequently vary by $\pm 2$ to $5$ seconds across phones, tablets, and laptops), the frontend operates a `ClockSyncService`.

### 2.1 NTP-Style Measurement Exchange

The client samples server time via WebSocket (`karaoke:clock:sync`) or REST (`GET /api/v1/time`):

```
Client                              Server
  |                                   |
  |--- t0 (client send timestamp) --->|
  |                                   | (server records t1 = Date.now())
  |<-- t1 (server timestamp) ---------|
  |    t0 (echoed)                    |
  |                                   |
(client receives at t2)
```

1. **Round-Trip Time**:
   $$\text{RTT} = t_2 - t_0$$
2. **Validity Filter**: Reject any sample where $\text{RTT} < 0$ or $\text{RTT} > 3000\text{ ms}$.
3. **Offset Sample Calculation**:
   Assuming symmetric network latency, the midpoint of the transaction corresponds to the server timestamp $t_1$:
   $$\theta_{\text{sample}} = t_1 - \frac{t_0 + t_2}{2}$$

### 2.2 Lowest-RTT Jitter Filtering & Median Aggregation

Network queuing delay skews latency measurements. To isolate the true clock offset from network jitter:
1. Samples are stored in a bounded circular buffer (maximum 8 samples).
2. The buffer is sorted by ascending RTT. The samples with the lowest RTT experience minimal network buffering and therefore exhibit the highest precision.
3. The top 50% lowest-RTT samples are selected.
4. The median offset of these best samples is selected as the active clock offset $\theta$.

### 2.3 Authoritative Server Time Estimation

At any point in time, the client computes authoritative server time as:
$$\text{serverNow} = \text{Date.now}() + \theta$$

---

## 3. Authoritative Playback Position Derivation

For any playback state snapshot:

$$\text{currentPositionMs} = \begin{cases}
0 & \text{if status} \in \{\text{'idle'}, \text{'ended'}\} \\
\text{playback.positionMs} & \text{if status} = \text{'paused'} \\
\min(\text{durationMs}, \text{playback.positionMs} + \max(0, \text{serverNow} - \text{anchorTime})) & \text{if status} = \text{'playing'}
\end{cases}$$

Where $\text{anchorTime} = \text{new Date}(\text{playback.anchorStartedAt}).\text{getTime}()$.

---

## 4. Playback Drift Correction Policy

The client browser continuously monitors local audio position against `currentPositionMs`:

$$\text{audioMs} = \text{audio.currentTime} \times 1000$$
$$\Delta = \text{audioMs} - \text{currentPositionMs}$$
$$|\Delta| = |\text{audioMs} - \text{currentPositionMs}|$$

### 4.1 Configurable Thresholds (`PLAYBACK_SYNC_CONFIG`)

| Parameter | Value | Semantic |
| :--- | :--- | :--- |
| `DRIFT_TOLERANCE_MS` | $250\text{ ms}$ | Deadband: drift is imperceptible to human ears; leave playback untouched at $1.0\times$. |
| `DRIFT_NUDGE_MAX_MS` | $1500\text{ ms}$ | Moderate drift: gradual tempo adjustment ($1.04\times$ or $0.96\times$) to gracefully eliminate drift without audible clicks. |
| `DRIFT_HARD_SEEK_MS` | $1500\text{ ms}$ | Large drift: direct seek to authoritative position. |
| `MIN_SEEK_COOLDOWN_MS` | $2000\text{ ms}$ | Minimum elapsed time between programmatic hard seeks to eliminate oscillation and thrashing. |
| `SEEK_ALIGN_TOLERANCE_SEC` | $0.4\text{ s}$ | Alignment deadband for state synchronization. |
| `DRIFT_CHECK_INTERVAL_MS` | $400\text{ ms}$ | Active drift checking cadence during playback. |

### 4.2 Three-Tier Policy Table

```
            |Δ| < 250ms        ==> playbackRate = 1.0 (Normal)
   250ms <= |Δ| <= 1500ms      ==> If Δ < 0 (behind): playbackRate = 1.04 (Faster)
                                   If Δ > 0 (ahead):  playbackRate = 0.96 (Slower)
            |Δ| > 1500ms       ==> If (now - lastHardSeek) >= 2000ms:
                                       audio.currentTime = currentPositionMs / 1000
                                       playbackRate = 1.0
```

---

## 5. Buffering, Stalling & Rate Reset Invariants

### 5.1 Buffering Shield Invariant
- When `audio.addEventListener('waiting')` fires, `isBuffering` is set to `true`.
- **Zero Drift Correction**: While `isBuffering === true` or `audio.readyState < 3` (`HAVE_FUTURE_DATA`), drift correction **aborts immediately**.
- Stalled audio is **never** misdiagnosed as clock drift. This eliminates pathological seek-buffering thrashing loops where seeking repeatedly flushes the network buffer.

### 5.2 Guaranteed Playback Rate Reset Invariant
The local `HTMLAudioElement.playbackRate` must strictly return to `1.0` under any of the following conditions:
1. Drift falls back within the normal tolerance ($< 250\text{ ms}$).
2. The server transitions to `paused`.
3. The server transitions to `idle` or `ended`.
4. The user or host issues a seek command.
5. Audio buffering begins.
6. The active song changes.
7. The browser tab is hidden.
8. The component unmounts or the user departs the room.

---

## 6. Browser Visibility & Background Tab Recovery

Modern browsers heavily throttle background tab timers (clamping `setInterval` to 1 Hz or freezing execution entirely).

### 6.1 When Tab is Hidden (`visibilitychange -> hidden`)
- Suppress programmatic hard seeks.
- Force `audio.playbackRate = 1.0` to prevent pitch distortion in background audio.
- Maintain playback generation state.

### 6.2 When Tab Returns to Foreground (`visibilitychange -> visible`)
1. Re-sample clock sync via `clockSyncService.sampleSocket()`.
2. Request a fresh state snapshot via Socket.IO `KARAOKE_STATE_REQUEST`.
3. Re-evaluate `currentPositionMs` with the updated server time.
4. If the audio is playing, ready (`readyState >= 3`), and drift exceeds $1500\text{ ms}$, execute a single clean realign seek:
   $$\text{audio.currentTime} = \frac{\text{currentPositionMs}}{1000}$$
5. Resume normal $400\text{ ms}$ drift monitoring cadence.

---

## 7. Generation Fencing & Race Safety

1. **Audio URL Resolution**: `loadGenerationRef` increments monotonically on song transition. If a slow HTTP resolution returns after a newer track has been commanded, the response is discarded.
2. **Readiness Re-anchoring**: When `canplay` fires on an audio track that took 1–2 seconds to buffer, `audio.currentTime` is immediately set to the current authoritative anchor position rather than playing from 0:00.
3. **Playback Version Fencing**: Playback commands (`play`, `pause`, `seek`, `skip`, `stop`) include `expectedPlaybackVersion`. Conflicts reject with HTTP 409 `STALE_PLAYBACK_VERSION`.
