# Workstream RV-07 — Endurance, Soak & Long-Running Session Verification

## 1. Scope & Objective

Workstream **RV-07** verifies the stability, resource consumption, and synchronization integrity of KTVOnline during sustained, multi-user karaoke sessions:
- Long-duration real-time sessions (30-minute dual-participant and 60-minute multi-participant sessions).
- High-churn stress conditions: Rapid repeated join/leave cycles, continuous track skipping, and frequent audio peripheral switching.
- Browser lifecycle events: Tab backgrounding and foregrounding (visibility state changes and clock re-synchronization).
- Quantitative telemetry and resource leak detection across Node.js backend processes, MongoDB collections, and browser runtime engines.

---

## 2. Telemetry & Metrics Collection Plan

The future Verification Runner and telemetry scrapers must sample and record the following metrics at 30-second intervals throughout endurance sessions:

| Metric Category | Target Dimension | Metric Identifier | Measurement Method |
| :--- | :--- | :--- | :--- |
| **Backend Resources** | Process Memory | `backend_memory_rss_mb` | Node.js `process.memoryUsage().rss` |
| | Heap Allocation | `backend_heap_used_mb` | Node.js `process.memoryUsage().heapUsed` |
| | Event Loop Lag | `backend_event_loop_lag_ms` | `perf_hooks.monitorEventLoopDelay()` |
| **Database Hygiene** | Unresolved Tasks | `mongo_pending_eviction_tasks` | `VoiceEvictionTaskModel.countDocuments({ status: 'pending' })` |
| | Orphan Webhooks | `mongo_stale_webhook_claims` | `VoiceWebhookEventModel.countDocuments({ status: 'in_progress', createdAt: { $lt: now - 60s } })` |
| | Inconsistent Rooms | `mongo_inconsistent_playback_rooms` | `karaokeReconciliationService.reconcileAllActiveRooms(dryRun: true)` |
| **Browser Runtime** | JS Heap Size | `browser_heap_used_mb` | `performance.memory.usedJSHeapSize` (Chromium) |
| | AudioContext Leaks | `browser_active_audio_contexts` | Scanned count of non-closed `AudioContext` instances |
| | MediaStream Tracks | `browser_active_media_tracks` | Count of un-ended `MediaStreamTrack` instances in DOM |
| | Socket Health | `browser_socket_reconnect_count` | Total reconnect events recorded by client |
| **Synchronization** | Playback Drift | `browser_playback_drift_ms` | `audioMs - serverTargetMs` sampled at 1 Hz |
| | Drift Tier Histogram | `browser_drift_tier_distribution` | % of samples in Tier 1 (<250ms), Tier 2 (250-1500ms), Tier 3 (>1500ms) |

### Recommended Initial Thresholds (PROPOSED ONLY)

> [!WARNING]
> **Proposed Operational Thresholds**:
> In accordance with runbook guidelines, the thresholds below are **preliminary recommendations** based on architectural sizing. They are **NOT** verified production gates and must be empirically calibrated after baseline endurance runs are executed.

- **Proposed Backend Heap Growth Ceiling**: $< 50\text{ MB}$ net increase per hour under steady 5-user load.
- **Proposed Browser Memory Growth Ceiling**: $< 100\text{ MB}$ net increase per hour.
- **Proposed Active AudioContext Ceiling**: Exactly $\le 1$ active `AudioContext` per browser tab at all times (Zero leaked contexts across track transitions).
- **Proposed Playback Drift Stability**: $\ge 95\%$ of all playback samples within Tier 1 Deadband ($< 250\text{ ms}$); $0\%$ unbounded runaway drift.
- **Proposed Unresolved Background Tasks**: $0$ stuck tasks in `VoiceEvictionTaskModel` after worker quiescence.

---

## 3. Test Scenarios

### Scenario RV07-TC01: Standard Dual-Participant 30-Minute Endurance Session
- **Scenario ID**: `RV07-TC01`
- **Priority**: `P1`
- **Verification Level**: `L2 (Browser Automated) & L1 (Telemetry)`
- **Preconditions**: Staging environment running with replica set MongoDB and LiveKit Cloud.
- **Environment Requirements**: Two headless or headed browser instances (User A: Singer, User B: Listener).
- **Test Accounts**: `rv_endurance_user_01`, `rv_endurance_user_02`.
- **Exact Execution Steps**:
  1. User A creates room `rv_endurance_30m` and invites User B.
  2. Both users connect to LiveKit voice lounge. User A un-mutes microphone; User B remains muted.
  3. User A queues a playlist of 6 songs (total duration $\sim 30\text{ minutes}$).
  4. Initiate playback (`command: "play"`).
  5. Allow the session to run autonomously for 30 consecutive minutes:
     - Songs play to natural completion and automatically advance via `karaokePlaybackWorker`.
     - Lyric sweeps update continuously at 10 Hz.
     - Sample client and server telemetry every 30 seconds.
  6. At minute 30, query reconciliation status and memory footprints.
- **Expected Result**:
  - All 6 songs complete naturally and queue transitions cleanly without manual intervention.
  - Zero unhandled disconnects or crashes on either client.
  - Browser memory consumption stabilizes without linear accumulation (leak-free).
  - Exactly 1 `AudioContext` maintained; zero leaked contexts on track changes.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Session completes 30 minutes; all tracks play; telemetry remains within proposed boundaries.
  - **Fail**: Process crash, player freezes, voice disconnects permanently, or drift exceeds 3000ms.
  - **Blocked**: Insufficient audio test fixtures to sustain 30 minutes.
- **Required Logs & Evidence**: 30-minute time-series CSV of memory, AudioContext count, and playback drift.
- **Cleanup Procedure**: Close room; delete accounts.
- **Related Scenarios**: `RV04-TC04`, `RV05-TC06`.

---

### Scenario RV07-TC02: Multi-Participant 60-Minute Stress & Soak Session
- **Scenario ID**: `RV07-TC02`
- **Priority**: `P1`
- **Verification Level**: `L2 (Multi-Browser Automated) & L1 (Telemetry)`
- **Preconditions**: High-capacity staging environment.
- **Environment Requirements**: 5 concurrent browser clients (1 Host, 4 Members).
- **Test Accounts**: `rv_soak_host`, `rv_soak_mbr_01` through `rv_soak_mbr_04`.
- **Exact Execution Steps**:
  1. Host creates room `rv_soak_60m` with `capacity: 10`.
  2. 4 Members join room, connect Socket.IO, and enter LiveKit voice lounge.
  3. Queue a 60-minute playlist of diverse tracks.
  4. Initiate playback.
  5. Introduce scheduled operational events during the 60-minute window:
     - **At Minute 15**: Member 1 toggles microphone mute 10 times in rapid succession.
     - **At Minute 25**: Member 2 adds 3 new songs and reorders the queue.
     - **At Minute 35**: Host skips current track midway.
     - **At Minute 45**: Member 3 closes tab, waits 30 seconds, and reconnects.
     - **At Minute 55**: Member 4 switches audio EQ presets across all 4 modes.
  6. Sample server and browser metrics continuously.
- **Expected Result**:
  - System remains fully responsive throughout the 60 minutes.
  - Operational disruptions (mute toggles, skips, reconnects, EQ changes) resolve cleanly without corrupting playback state or room presence.
  - Server event loop lag remains $< 50\text{ ms}$.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: 60-minute session completes; all events recovered; final state consistent.
  - **Fail**: Server OOM crash, unhandled rejection, or desynchronized queue state.
  - **Blocked**: LiveKit cloud participant concurrency limits reached.
- **Required Logs & Evidence**: Complete 60-minute metrics dataset, Pino server error logs.
- **Cleanup Procedure**: Terminate all 5 browser instances; close room.
- **Related Scenarios**: `RV02-TC04`, `RV04-TC02`, `RV06-TC03`.

---

### Scenario RV07-TC03: High-Frequency Churn (Rapid Join/Leave & Track Skip Stress)
- **Scenario ID**: `RV07-TC03`
- **Priority**: `P2`
- **Verification Level**: `L1 (Automated Multi-Client Harness)`
- **Preconditions**: Staging environment with active room.
- **Environment Requirements**: Headless test client orchestrator.
- **Test Accounts**: 1 Host + 10 rotating ephemeral test accounts.
- **Exact Execution Steps**:
  1. Host starts room playback.
  2. Over a 10-minute window, execute 100 rapid join-and-leave cycles (10 users joining, sending 1 chat message, and leaving every 60 seconds).
  3. Concurrently, Host issues 20 track skip commands at 30-second intervals.
  4. At conclusion, stop all churn traffic and wait 30 seconds for worker quiescence.
  5. Inspect database state:
     - `RoomMembershipModel.countDocuments({ roomId, status: 'active' })`.
     - `RoomModel.currentParticipantsCount`.
     - `RoomPlaybackStateModel.status`.
     - `VoiceEvictionTaskModel.countDocuments({ status: 'pending' })`.
- **Expected Result**:
  - All 100 join/leave cycles process cleanly without orphaned active memberships.
  - `RoomModel.currentParticipantsCount` accurately equals 1 (Host only).
  - Zero leaked voice eviction tasks or unhandled promise rejections.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Membership and occupancy counters match exactly; zero orphan records.
  - **Fail**: Occupancy counter desynchronized (`currentParticipantsCount !== 1`) or worker deadlock.
  - **Blocked**: Rate limiter blocks test accounts prematurely (must configure test rate limit bypass).
- **Required Logs & Evidence**: Churn transaction audit log and final DB invariant dump.
- **Cleanup Procedure**: Purge ephemeral test accounts; close room.
- **Related Scenarios**: `RV02-TC02`, `RV06-TC01`.

---

### Scenario RV07-TC04: Browser Tab Background/Foreground Transitions & Drift Re-Alignment
- **Scenario ID**: `RV07-TC04`
- **Priority**: `P2`
- **Verification Level**: `L2 (Browser Automated - Playwright)`
- **Preconditions**: Track actively playing in browser; lyrics scrolling.
- **Environment Requirements**: Playwright browser with page visibility controls.
- **Test Accounts**: Viewer.
- **Exact Execution Steps**:
  1. Start playback. Verify audio is playing smoothly with drift $< 100\text{ ms}$.
  2. Simulate tab backgrounding: Trigger `visibilitychange` with `document.visibilityState = "hidden"`.
  3. Let the tab remain hidden for 60 seconds while track continues to play.
  4. Note: Modern browsers throttle `setInterval` and Web Audio timers down to 1 Hz or suspend animation frames in backgrounded tabs.
  5. Simulate tab foregrounding: Trigger `visibilitychange` with `document.visibilityState = "visible"`.
  6. Inspect `useKaraokeAudio` and `ClockSyncService` logs immediately upon tab return:
     - Verify `clockSyncService.sampleSocket()` or `sampleHttp()` executes immediately.
     - Verify audio drift calculation evaluates `drift > PLAYBACK_SYNC_CONFIG.DRIFT_HARD_SEEK_MS`.
     - If drift exceeds 1500ms, verify hard seek realigns `audio.currentTime` to server anchor.
- **Expected Result**:
  - Tab foregrounding triggers instant clock resync.
  - Audio and lyric viewport smoothly realign to the authoritative server position within 500ms of returning to the tab.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Audio and lyrics resynchronize cleanly within 500ms of foregrounding.
  - **Fail**: Audio remains desynchronized or player freezes permanently.
  - **Blocked**: Playwright unable to simulate visibility change events.
- **Required Logs & Evidence**: High-resolution timestamps of visibility state change, clock sync trigger, and seek realignment.
- **Cleanup Procedure**: Stop playback.
- **Related Scenarios**: `RV04-TC05`, `RV05-TC01`.

