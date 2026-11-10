# Workstream RV-06 — Fault Recovery & Security Invariants Verification

## 1. Scope & Objective

Workstream **RV-06** verifies system resilience under severe infrastructure faults and enforces distributed security boundaries:
- Sudden backend process restart and automated recovery of state machines and background workers (`server.ts`, `karaokeReconciliationService`).
- Transient MongoDB network partition and seamless reconnection (`connectDatabase`, `serverSelectionTimeoutMS`).
- Socket.IO disconnect storms and automated state snapshot recovery (`room:state:request`, `stateVersion`).
- LiveKit WebRTC signaling outages and client fallback behavior.
- Resilient webhook delivery: Defense against webhook replay attacks, duplicate deliveries, and stale out-of-order events (`assertMonotonicEventOrder`).
- Authentication security: Refresh token rotation with automated replay attack detection, instant token family revocation, and active socket severance (`disconnectSessionSockets`).
- Administrative security: Immediate eviction of suspended or deactivated users across active rooms, Socket.IO channels, and LiveKit voice lounges (`evictUserFromAllRooms`).
- Kicked participant exclusion: Enforcement of the `kickedAt` moderation gate against repeated reconnection attempts.
- Distributed background worker lease expiration and orphan task recovery (`VoiceEvictionWorker`, `KaraokePlaybackWorker`).

---

## 2. Test Scenarios

### Scenario RV06-TC01: Abrupt Backend Restart & Automatic State Reconciliation
- **Scenario ID**: `RV06-TC01`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Fault Injection Harness)`
- **Preconditions**: Room active with song playing; Host and members connected.
- **Environment Requirements**: Process manager (e.g. Docker, systemd, or local process controller).
- **Test Accounts**: Host + Member.
- **Exact Execution Steps**:
  1. Room is playing a track; `RoomPlaybackStateModel.status === 'playing'`, `anchorStartedAt` recorded.
  2. Send `SIGKILL` to the backend process (`kill -9 <pid>`), bypassing graceful shutdown handlers.
  3. Wait 2 seconds. Relaunch backend process (`node dist/server.js` or container restart).
  4. Inspect startup logs for:
     - `karaokeReconciliationService.reconcileAllActiveRooms()`.
     - Worker restarts: `voiceEvictionWorker`, `karaokePlaybackWorker`.
  5. Query `GET /api/v1/rooms/:roomId/karaoke/playback`.
  6. Connected client reconnects Socket.IO and requests state snapshot.
- **Expected Result**:
  - Backend starts cleanly without deadlock.
  - Initial reconciliation sweep inspects active rooms:
    - If song was midway through, playback continues from calculated elapsed anchor without resetting to 0.
    - If song expired during downtime, reconciliation advances to next queued track or sets status to `idle`.
  - Reconnected clients receive accurate authoritative playback snapshot.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Process restarts; DB reconciliation runs; playback state resumes or advances legally.
  - **Fail**: Playback hangs indefinitely or startup throws unhandled DB error.
  - **Blocked**: Test environment lacks permission to kill and restart process.
- **Required Logs & Evidence**: Server startup logs showing reconciliation sweep; DB document before and after restart.
- **Cleanup Procedure**: Close room.
- **Related Scenarios**: `RV01-TC06`, `RV04-TC07`.

---

### Scenario RV06-TC02: Transient MongoDB Network Partition & Reconnect
- **Scenario ID**: `RV06-TC02`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Fault Injection Harness)`
- **Preconditions**: Backend running on `PORT=5001`.
- **Environment Requirements**: Docker container `ktv-mongodb` or network firewall rule emulator.
- **Test Accounts**: None.
- **Exact Execution Steps**:
  1. Verify backend readiness: `GET /api/v1/health/ready` returns HTTP 200 (`ready`).
  2. Pause MongoDB container: `docker pause ktv-mongodb`.
  3. Query `GET /api/v1/health/ready` via HTTP client.
  4. Send a write request: `POST /api/v1/rooms`.
  5. Unpause MongoDB container after 4 seconds: `docker unpause ktv-mongodb`.
  6. Wait 2 seconds for Mongoose reconnection.
  7. Query `GET /api/v1/health/ready`.
  8. Retry room creation: `POST /api/v1/rooms`.
- **Expected Result**:
  - During pause: `/health/ready` returns HTTP 503 (`database is disconnected`); write request fails fast without crashing backend process.
  - After unpause: Mongoose reconnects (`📦 MongoDB connected successfully`); `/health/ready` recovers to HTTP 200; subsequent writes succeed cleanly.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Backend survives DB partition; health probe reflects outage; recovers automatically upon unpause.
  - **Fail**: Backend process crashes, or Mongoose never reconnects after unpause.
  - **Blocked**: Docker access unavailable.
- **Required Logs & Evidence**: Mongoose connection event logs; HTTP 503 and 200 status responses.
- **Cleanup Procedure**: Ensure MongoDB container is unpaused.
- **Related Scenarios**: `RV01-TC01`, `RV01-TC02`.

---

### Scenario RV06-TC03: Socket.IO Server Disruption & Client Reconnect Storm
- **Scenario ID**: `RV06-TC03`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated Multi-Socket Client)`
- **Preconditions**: 15 concurrent Socket.IO clients connected to a room channel.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: 15 simulated test users.
- **Exact Execution Steps**:
  1. Connect 15 Socket.IO clients to room channel `room:<roomId>`.
  2. Sever all socket connections simultaneously from server-side or kill network connection.
  3. Verify all 15 clients detect disconnect (`disconnect` event fired with reason `transport close`).
  4. Restore network. Clients trigger automated Socket.IO reconnection with exponential backoff and jitter.
  5. As each client reconnects, it emits `room:join` and `room:state:request`.
  6. Inspect server-side CPU and memory during reconnect storm.
  7. Verify all 15 clients successfully re-subscribe to channel and receive authoritative `room:state:snapshot`.
- **Expected Result**:
  - All 15 clients reconnect within 5 seconds without server errors or unbounded resource spikes.
  - Room presence reconciles to exact count (`totalOnline === 15`).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: 100% of clients reconnect and restore state; presence count accurate.
  - **Fail**: Clients permanently disconnected or presence count corrupted.
  - **Blocked**: Insufficient system file descriptors for socket pool.
- **Required Logs & Evidence**: Reconnect timestamp ledger; final room presence snapshot.
- **Cleanup Procedure**: Disconnect all 15 clients; close room.
- **Related Scenarios**: `RV02-TC06`, `RV07-TC02`.

---

### Scenario RV06-TC04: Refresh Token Replay Attack & Instant Family Revocation
- **Scenario ID**: `RV06-TC04`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Security API Harness)`
- **Preconditions**: User registered and logged in with active session family.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: Victim User `rv_victim_user@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Victim logs in via `POST /api/v1/auth/login`. Captures `refreshToken_1` and connects a Socket.IO client.
  2. Victim executes legitimate token refresh via `POST /api/v1/auth/refresh` using `refreshToken_1`.
     - Server issues `refreshToken_2` and invalidates `refreshToken_1` (`replacedByTokenHash` set).
  3. **Attacker Simulation**: Malicious actor (or intercepted token) attempts to refresh using the compromised `refreshToken_1`.
  4. Inspect server response to the attacker's request.
  5. Inspect `SessionModel` in MongoDB for this session family (`familyId`).
  6. Inspect victim's connected Socket.IO client.
  7. Victim attempts to use `refreshToken_2` or make authenticated API calls.
- **Expected Result**:
  - Attacker's refresh request rejected with HTTP 401 Unauthorized (`REFRESH_TOKEN_REUSED`).
  - Server immediately revokes the **entire session family** in MongoDB (`isRevoked: true`).
  - Server calls `disconnectSessionSockets(familyId)`, terminating victim's socket with `SESSION_REVOKED`.
  - Subsequent requests with `refreshToken_2` are rejected. Both attacker and victim must re-authenticate.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Token reuse triggers immediate family revocation; socket severed; all family tokens blocked.
  - **Fail**: Stale refresh token accepted, or family remains active after reuse detection.
  - **Blocked**: Auth endpoints unresponsive.
- **Required Logs & Evidence**: Server security warning logs with `familyId`; MongoDB session document; Socket disconnect event.
- **Cleanup Procedure**: Delete victim user.
- **Related Scenarios**: `RV01-TC04`, `RV03-TC04`.

---

### Scenario RV06-TC05: LiveKit Webhook Replay & Out-of-Order Delivery Defense
- **Scenario ID**: `RV06-TC05`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Webhook API)`
- **Preconditions**: Backend running with `LIVEKIT_WEBHOOK_SECRET`.
- **Environment Requirements**: Valid webhook signature generator.
- **Test Accounts**: None.
- **Exact Execution Steps**:
  1. Generate valid signed `participant_joined` webhook for participant `user_test_seq` with `createdAt: 1000`.
  2. Send to `POST /api/v1/voice/webhook`. (First delivery: Accepted).
  3. Send identical request again with identical signature and payload. (Replay attack).
  4. Generate and send signed `participant_left` webhook for same participant with older timestamp `createdAt: 900`. (Out-of-order delivery).
  5. Generate and send signed `participant_left` webhook with valid newer timestamp `createdAt: 1100`. (Valid state transition).
- **Expected Result**:
  - Step 2: HTTP 200 `{ received: true }`. Event claimed in MongoDB.
  - Step 3: HTTP 200 `{ received: true, duplicate: true }`. Deduplication drops event without mutation.
  - Step 4: HTTP 200 `{ received: true, stale: true }`. Monotonic check drops event; prevents ghost participant disconnect.
  - Step 5: HTTP 200 `{ received: true }`. Participant leave processed cleanly.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Deduplication and monotonic sequencing prevent state corruption.
  - **Fail**: Replay event processed or stale event overwrites newer state.
  - **Blocked**: Webhook signature verification fails.
- **Required Logs & Evidence**: `VoiceWebhookEventModel` and sequence records in MongoDB.
- **Cleanup Procedure**: Delete test event documents.
- **Related Scenarios**: `RV03-TC05`.

---

### Scenario RV06-TC06: Administrative User Suspension & Global Eviction
- **Scenario ID**: `RV06-TC06`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated API + Socket + LiveKit Inspector)`
- **Preconditions**: User actively participating in room, with open Socket.IO connection and LiveKit voice session.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: Admin + Target User `rv_suspended_target`.
- **Exact Execution Steps**:
  1. Target user joins room and connects both Socket.IO and LiveKit voice.
  2. Admin updates user status to `suspended` via `PATCH /api/v1/users/:userId/status` or DB update.
  3. Server invokes `evictUserFromAllRooms(userId)` and `disconnectUserSockets(userId)`.
  4. Inspect target user's Socket.IO client: Verify disconnected.
  5. Inspect LiveKit room participant list: Verify participant removed.
  6. Target user attempts to send HTTP request `GET /api/v1/rooms/:roomId`.
  7. Target user attempts to reconnect Socket.IO.
- **Expected Result**:
  - Target user immediately evicted from LiveKit room and Socket.IO server.
  - Subsequent HTTP requests rejected with HTTP 403 (`USER_SUSPENDED`).
  - Socket reconnect rejected during handshake with `AUTH_USER_SUSPENDED`.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Suspension immediately terminates all active channels and blocks re-entry.
  - **Fail**: Suspended user remains in voice lounge or re-connects socket.
  - **Blocked**: Admin endpoint unavailable.
- **Required Logs & Evidence**: Eviction logs from server; LiveKit participant list assertion; Socket handshake rejection.
- **Cleanup Procedure**: Delete test user; close room.
- **Related Scenarios**: `RV02-TC05`, `RV03-TC04`.

---

### Scenario RV06-TC07: Kicked User Persistent Re-Entry Gate Enforcement
- **Scenario ID**: `RV06-TC07`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated API & Socket)`
- **Preconditions**: User previously kicked from room (`RoomMembershipModel.kickedAt !== null`).
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: Host + Kicked User.
- **Exact Execution Steps**:
  1. Kicked user attempts HTTP room join: `POST /api/v1/rooms/:roomId/join`.
  2. Kicked user attempts direct Socket.IO room join: Emits `room:join` with `{ roomId }`.
  3. Kicked user attempts voice token generation: `POST /api/v1/rooms/:roomId/voice/token`.
  4. Host un-kicks member or member is re-invited (if supported) or room is recreated.
- **Expected Result**:
  - Step 1: HTTP 403 Forbidden (`FORBIDDEN_KICKED`).
  - Step 2: Socket error payload emitted with code `FORBIDDEN_KICKED`.
  - Step 3: HTTP 403 Forbidden (`FORBIDDEN_KICKED`).
  - Zero pathways exist for a kicked member to interact with the room while moderation hold is active.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: All 3 access vectors permanently blocked.
  - **Fail**: Any vector allows kicked user to join or receive room messages.
  - **Blocked**: None.
- **Required Logs & Evidence**: HTTP and Socket error response payloads.
- **Cleanup Procedure**: Close room.
- **Related Scenarios**: `RV02-TC05`, `RV03-TC04`.

