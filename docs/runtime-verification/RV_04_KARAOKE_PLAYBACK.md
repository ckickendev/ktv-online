# Workstream RV-04 — Karaoke Playback & Queue Synchronization Verification

## 1. Scope & Objective

Workstream **RV-04** verifies the core karaoke entertainment engine of KTVOnline:
- Queue operations: Adding songs, user queue limits, fractional index positioning, host reordering (`karaokeService.reorderQueue`), and position rebalancing (`rebalanceQueuePositions`).
- Concurrency invariants: Race conditions during simultaneous queue modifications, skips, and reorders under multi-document transactions and CAS fencing.
- Playback controls: Host execution of `play`, `pause`, `seek`, `skip`, and `stop` commands with version fencing (`expectedPlaybackVersion`).
- Server-authoritative playback engine: Natural track completion orchestrated by `KaraokePlaybackWorker` with distributed worker leases and precision in-memory timers.
- Client clock synchronization: RTT and server offset estimation via `ClockSyncService` (HTTP `/api/v1/karaoke/clock/sync` and Socket.IO `karaoke:clock:sync`).
- Three-tier client-side drift compensation (`PLAYBACK_SYNC_CONFIG`):
  - **Tier 1 (Drift $< 250\text{ ms}$)**: Deadband. Playback rate locked to $1.0\times$.
  - **Tier 2 ($250\text{ ms} \le \text{Drift} \le 1500\text{ ms}$)**: Micro-tempo adjustment ($1.04\times$ if audio lags, $0.96\times$ if audio leads).
  - **Tier 3 (Drift $> 1500\text{ ms}$)**: Hard seek to server anchor position (`audio.currentTime = targetMs / 1000`).
- Background reconciliation recovery: State cleanup on server startup and network interruptions (`KaraokeReconciliationService`).

---

## 2. Test Scenarios

### Scenario RV04-TC01: Queue Addition, Limit Enforcement & Fractional Indexing
- **Scenario ID**: `RV04-TC01`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Headless API)`
- **Preconditions**: Open room with Host and Member.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: Host + Member `rv_queue_user_01`.
- **Exact Execution Steps**:
  1. Member adds fixture song `fix_synth_groove` to queue via `POST /api/v1/rooms/:roomId/karaoke/queue`.
  2. Member adds a second song `fix_ballad_acoustic`.
  3. Query `GET /api/v1/rooms/:roomId/karaoke/queue`.
  4. Inspect queue ordering and position numbers:
     - Item 1 has position `1000`.
     - Item 2 has position `2000`.
  5. Attempt to exceed per-user concurrent queue limit (e.g. adding 10 songs in rapid succession).
- **Expected Result**:
  - Songs queued successfully with incremental sort keys.
  - Adding songs past the allowed limit returns HTTP 400 Bad Request (`QUEUE_USER_LIMIT_EXCEEDED`).
  - Queue snapshot accurately reflects items, singer attribution, and estimated duration.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Songs queued with correct positions; limits enforced; queue snapshot consistent.
  - **Fail**: Position keys collide or per-user limit bypassed.
  - **Blocked**: Song catalog empty or inaccessible.
- **Required Logs & Evidence**: JSON responses from queue additions; MongoDB `RoomQueueItemModel` documents.
- **Cleanup Procedure**: Clear queue; close room.
- **Related Scenarios**: `RV04-TC02`, `RV04-TC03`.

---

### Scenario RV04-TC02: Concurrent Queue Reordering & Transactional Consistency
- **Scenario ID**: `RV04-TC02`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Concurrency Harness)`
- **Preconditions**: Room queue populated with 4 songs (Items A, B, C, D).
- **Environment Requirements**: Replica Set MongoDB (mandatory for multi-document transaction).
- **Test Accounts**: Host + Co-Host.
- **Exact Execution Steps**:
  1. Host sends `PUT /api/v1/rooms/:roomId/karaoke/queue/reorder` moving Item D between Item A and Item B (`targetPosition: 1500`).
  2. Concurrently, Co-Host sends a conflicting reorder moving Item C before Item A (`targetPosition: 500`).
  3. Inspect HTTP responses and resulting queue state via `GET /api/v1/rooms/:roomId/karaoke/queue`.
  4. Verify that:
     - No two items share identical position indices.
     - Fractional position compaction (`rebalanceQueuePositions`) is triggered if position gap falls below threshold ($< 0.001$).
     - Outbox event `karaoke:queue:updated` is broadcast via Socket.IO with monotonic version.
- **Expected Result**:
  - One reorder commits cleanly; second reorder either succeeds with updated CAS position or retries gracefully without corrupting list order.
  - Queue remains deterministically ordered from position 1 to $N$.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Zero duplicate position indices; all 4 items remain present in deterministic order.
  - **Fail**: Items lost, duplicate positions created, or unhandled transaction rollback.
  - **Blocked**: MongoDB running in standalone mode (unsupported topology).
- **Required Logs & Evidence**: Transaction logs from backend; array of items with position floats.
- **Cleanup Procedure**: Clear queue.
- **Related Scenarios**: `RV01-TC02`, `RV06-TC02`.

---

### Scenario RV04-TC03: Authoritative Playback State Machine & Version Fencing
- **Scenario ID**: `RV04-TC03`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated API + Socket.IO)`
- **Preconditions**: Room has a queued song ready to play.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: Host.
- **Exact Execution Steps**:
  1. Host queries playback state: `status === "idle"`, `playbackVersion: 1`.
  2. Host executes `POST /api/v1/rooms/:roomId/karaoke/playback/command` with `{ command: "play", expectedPlaybackVersion: 1 }`.
  3. Verify status transitions to `playing`, `playbackVersion` increments to 2, and `anchorStartedAt` is set to ISO timestamp.
  4. Host attempts duplicate `play` command with stale `expectedPlaybackVersion: 1`.
  5. Host sends `pause` command with `expectedPlaybackVersion: 2`.
  6. Host sends `seek` command with `{ command: "seek", positionMs: 45000, expectedPlaybackVersion: 3 }`.
  7. Host sends `skip` command to skip to next track.
- **Expected Result**:
  - Step 2: `status` transitions to `playing`, `anchorStartedAt` populated, `playbackVersion: 2`.
  - Step 4: Stale command rejected with HTTP 409 Conflict (`VERSION_MISMATCH`).
  - Step 5: `status` transitions to `paused`, `positionMs` captures pause timestamp.
  - Step 6: `positionMs` updates to 45,000 ms; `anchorStartedAt` recalculated.
  - Step 7: Current track marked `finished`; next track starts or state returns to `idle`.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: All state transitions valid; version fencing blocks stale commands; anchors accurate.
  - **Fail**: Stale version accepted or playback position incorrect.
  - **Blocked**: Backend command endpoint unresponsive.
- **Required Logs & Evidence**: Sequence of playback snapshot payloads and version numbers.
- **Cleanup Procedure**: Reset playback state.
- **Related Scenarios**: `RV04-TC04`.

---

### Scenario RV04-TC04: Natural Track Completion & Worker Lease Handover
- **Scenario ID**: `RV04-TC04`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Worker Inspector)`
- **Preconditions**: Track queued with a short synthetic duration (e.g. 10 seconds).
- **Environment Requirements**: Backend running with `karaokePlaybackWorker` active.
- **Test Accounts**: Host.
- **Exact Execution Steps**:
  1. Queue 10-second song `rv_short_track` followed by a second song `rv_track_two`.
  2. Start playback (`command: "play"`).
  3. Do NOT send any manual skip commands. Wait 12 seconds for the track to naturally conclude.
  4. Inspect `karaokePlaybackWorker` logs during the transition.
  5. Query `GET /api/v1/rooms/:roomId/karaoke/playback`.
- **Expected Result**:
  - At $\sim 10\text{ seconds}$, in-memory precision timer (or worker polling sweep) triggers completion.
  - Worker acquires atomic lease on `RoomPlaybackStateModel` (`leaseWorkerInstanceId`, `leaseExpiresAt`).
  - First song marked `status: 'finished'`; second song automatically promoted to `playing`.
  - Socket event `karaoke:playback:updated` broadcast to room channel with new song metadata.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Track completes naturally without client intervention; next track auto-starts.
  - **Fail**: Playback hangs indefinitely at end of song without advancing.
  - **Blocked**: Background worker inactive.
- **Required Logs & Evidence**: Server worker lease logs; timestamped playback event sequence.
- **Cleanup Procedure**: Clear queue; reset room.
- **Related Scenarios**: `RV04-TC05`, `RV06-TC01`.

---

### Scenario RV04-TC05: Client Clock Synchronization & Drift Compensation Tiers
- **Scenario ID**: `RV04-TC05`
- **Priority**: `P0`
- **Verification Level**: `L2 (Browser Automated - Playwright)`
- **Preconditions**: Playwright browser loaded in room; playback actively playing.
- **Environment Requirements**: Chrome headless browser with Web Audio enabled.
- **Test Accounts**: Viewer `rv_drift_tester`.
- **Exact Execution Steps**:
  1. Evaluate `ClockSyncService`: Execute `clockSyncService.sampleHttp()` and verify `offsetMs` and `estimatedRttMs` are calculated and bounded ($< 500\text{ ms}$).
  2. **Tier 1 Verification**: Verify drift is $< 250\text{ ms}$. Confirm `audio.playbackRate === 1.0`.
  3. **Tier 2 Verification (Simulated Lag)**:
     - Artificially manipulate `audio.currentTime` backwards by $600\text{ ms}$ (within 250-1500ms window).
     - Wait 400ms for drift check interval (`PLAYBACK_SYNC_CONFIG.DRIFT_CHECK_INTERVAL_MS`).
     - Inspect `audio.playbackRate`. Verify it switches to `1.04` (tempo nudge faster).
     - Wait for audio to catch up to within 250ms deadband; verify playbackRate returns to `1.0`.
  4. **Tier 3 Verification (Hard Seek)**:
     - Artificially manipulate `audio.currentTime` backwards by $3000\text{ ms}$ ($> 1500\text{ ms}$ threshold).
     - Wait 400ms for drift check interval.
     - Verify audio element executes a hard seek (`audio.currentTime` jumped forward to server target) and playbackRate resets to `1.0`.
- **Expected Result**:
  - Clock sync measures RTT reliably.
  - Drift tiers execute precisely: Tier 1 maintains 1.0x, Tier 2 nudges 1.04x/0.96x, Tier 3 hard-seeks.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: All 3 tiers behave exactly according to `PLAYBACK_SYNC_CONFIG` thresholds.
  - **Fail**: Tempo fails to nudge, or hard seek loops repeatedly.
  - **Blocked**: Browser audio element muted or paused by autoplay blocker.
- **Required Logs & Evidence**: High-resolution timestamp logs of `driftDelta`, `playbackRate`, and seek calls.
- **Cleanup Procedure**: Stop playback.
- **Related Scenarios**: `RV05-TC01`.

---

### Scenario RV04-TC06: Playback Audio Buffering, Error Retry & Autoplay Recovery
- **Scenario ID**: `RV04-TC06`
- **Priority**: `P1`
- **Verification Level**: `L2 (Browser Automated)`
- **Preconditions**: Playwright browser in fresh session (without prior user click).
- **Environment Requirements**: Chrome browser with strict autoplay policy enabled.
- **Test Accounts**: Viewer.
- **Exact Execution Steps**:
  1. Room host initiates playback.
  2. Viewer loads room page. The browser autoplay policy blocks `HTMLAudioElement.play()`.
  3. Verify UI displays the non-intrusive "Audio Autoplay Blocked — Click to Listen" banner.
  4. Programmatically simulate user clicking the banner or room stage.
  5. Verify `unlockAutoplay()` executes, `AudioContext.resume()` resolves, and audio begins playing.
  6. Simulate a transient network stall on the audio file request.
  7. Verify player enters `buffering` state, applies exponential backoff retry, and resumes cleanly.
- **Expected Result**:
  - Autoplay block intercepted gracefully without throwing uncaught promise rejections.
  - User gesture immediately unblocks playback.
  - Network stall triggers retry backoff and resumes playback seamlessly.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Autoplay banner shown and resolved; network stall recovered.
  - **Fail**: Player permanently hangs or uncaught promise rejection crashes application.
  - **Blocked**: Autoplay policy disabled in browser test harness.
- **Required Logs & Evidence**: Playwright console error intercepts and UI screenshot of banner.
- **Cleanup Procedure**: Stop playback.
- **Related Scenarios**: `RV05-TC04`.

---

### Scenario RV04-TC07: Startup Playback State Reconciliation & Orphan Cleanup
- **Scenario ID**: `RV04-TC07`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated DB & Startup Inspector)`
- **Preconditions**: Database contains corrupted or interrupted playback documents from simulated crash.
- **Environment Requirements**: MongoDB connected.
- **Test Accounts**: None.
- **Exact Execution Steps**:
  1. Direct DB Injection:
     - Insert a room playback document with `status: 'playing'`, but set `anchorStartedAt` to 2 hours in the past (overdue expired song).
     - Insert a second room playback document with two queue items simultaneously marked `status: 'playing'` (illegal invariant).
  2. Execute `karaokeReconciliationService.reconcileAllActiveRooms()`.
  3. Inspect reconciliation results summary.
  4. Query the two room playback documents.
- **Expected Result**:
  - Overdue track is detected and resolved with action `OVERDUE_PLAYBACK_COMPLETED`.
  - Duplicate playing items are deduplicated with action `MULTIPLE_PLAYING_DEDUPLICATED`.
  - Both rooms restored to valid, legal state machine invariants without manual operator intervention.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: All corrupted states detected and repaired; summary matches.
  - **Fail**: Corrupted documents remain or reconciliation throws unhandled exception.
  - **Blocked**: Database write access restricted.
- **Required Logs & Evidence**: `KaraokeReconcileSummary` JSON payload.
- **Cleanup Procedure**: Purge test documents from MongoDB.
- **Related Scenarios**: `RV06-TC01`.

