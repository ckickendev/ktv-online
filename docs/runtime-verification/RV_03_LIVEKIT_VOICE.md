# Workstream RV-03 — LiveKit Voice Lounge & Signaling Verification

## 1. Scope & Objective

Workstream **RV-03** verifies the low-latency WebRTC voice communication infrastructure powered by LiveKit:
- Token authorization gates: User active status, session family validity, room open status, membership, and kick status (`VoiceService.generateVoiceToken`).
- Opaque participant session identities (`${userId}_vps_${participantSessionId}`) and server-side private registry tracking (`voiceSessionRegistry`).
- WebRTC track publishing, dynamic mute toggle, and audio constraints (`echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`).
- Audio peripheral device switching (`switchActiveDevice` for input, `setSinkId` for output sink routing).
- Remote audio lifecycle: Track subscription, audio element binding, and cleanup on remote participant departure.
- Automated token renewal prior to expiration and graceful session reconnection.
- Security evictions: Instant participant disconnection upon room closure, member kick, or user session family revocation (`evictLiveKitParticipant`, `evictLiveKitSessionFamily`).
- Durable webhook processing: HMAC signature verification, atomic deduplication claim (`VoiceWebhookEventModel.claimEvent`), and monotonic ordering assertions (`assertMonotonicEventOrder`).
- Asynchronous recovery: The background voice eviction worker (`VoiceEvictionWorker`) retrying failed provider evictions.

> [!IMPORTANT]
> **Separation of Concerns (L1/L2 vs L3)**:
> Automated tests verify token claims, WebRTC signaling state transitions, and server-side participant eviction. Physical acoustic assessment (perceived echo bleed, audio clipping, and voice intelligibility) must be verified via **Level 3 Manual-Assisted Hardware** testing.

---

## 2. Test Scenarios

### Scenario RV03-TC01: Voice Token Authorization Gates & Security Validation
- **Scenario ID**: `RV03-TC01`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Headless API)`
- **Preconditions**: Backend running with LiveKit configuration.
- **Environment Requirements**: Valid `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- **Test Accounts**: Active Host, Suspended User, Kicked User, Non-Member User.
- **Exact Execution Steps**:
  1. Active Host sends `POST /api/v1/rooms/:roomId/voice/token` with `{ tabId: "tab-alpha" }`.
  2. Non-member sends `POST /api/v1/rooms/:roomId/voice/token`.
  3. Kicked user sends `POST /api/v1/rooms/:roomId/voice/token`.
  4. Suspended user sends `POST /api/v1/rooms/:roomId/voice/token`.
  5. Inspect token response for Step 1:
     - Decode JWT claims. Verify `roomJoin: true`, `room: "ktv_room_<roomId>"`.
     - Verify participant identity format matches `^[a-f0-9]{24}_vps_[a-f0-9]{12}$`.
     - Inspect metadata: Verify `userId`, `username`, `displayName`, and `avatarUrl` are present; verify sensitive fields (`familyId`, `tabHint`) are omitted.
- **Expected Result**:
  - Step 1 returns HTTP 200 with `serverUrl`, `token`, `roomName`, `participantIdentity`, and `expiresAt`.
  - Step 2 returns HTTP 403 Forbidden (`FORBIDDEN_NOT_MEMBER`).
  - Step 3 returns HTTP 403 Forbidden (`FORBIDDEN_KICKED`).
  - Step 4 returns HTTP 403 Forbidden (`FORBIDDEN_USER_INACTIVE`).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Token issued only to authorized active member; all security gates reject unauthorized users.
  - **Fail**: Token issued to non-member, kicked user, or suspended user.
  - **Blocked**: LiveKit credentials invalid.
- **Required Logs & Evidence**: Decoded JWT claims, HTTP error responses for unauthorized calls.
- **Cleanup Procedure**: Close room.
- **Related Scenarios**: `RV03-TC04`, `RV06-TC04`.

---

### Scenario RV03-TC02: Microphone Publish, Mute Toggle & Audio Constraints
- **Scenario ID**: `RV03-TC02`
- **Priority**: `P0`
- **Verification Level**: `L2 (Browser Automated - Playwright)`
- **Preconditions**: Browser launched with `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`.
- **Environment Requirements**: Chrome/Chromium with WebRTC fake media driver.
- **Test Accounts**: `rv_user_singer_01@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. User navigates to room page `/rooms/:roomId` and clicks "Join Voice".
  2. Playwright checks `useVoiceClient` connection state transitions:
     `requesting_permission` $\rightarrow$ `connecting` $\rightarrow$ `connected`.
  3. Inspect published audio track settings: Verify `echoCancellation === true`, `noiseSuppression === true`, and `autoGainControl === true`.
  4. Click "Mute Microphone" button.
  5. Verify `room.localParticipant.isMicrophoneEnabled === false` and UI badge updates to "Muted".
  6. Click "Unmute Microphone" button.
  7. Verify microphone track re-enables without re-creating the entire Room instance.
- **Expected Result**:
  - Voice connects smoothly; microphone track published with default capture preferences.
  - Mute toggles track state locally and publishes mute event to LiveKit signaling channel.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Voice connects; track published with expected constraints; mute/unmute functions cleanly.
  - **Fail**: Permission error thrown or mute fails to stop audio track publication.
  - **Blocked**: Fake media device not recognized by headless browser.
- **Required Logs & Evidence**: Browser console logs, LiveKit room event traces.
- **Cleanup Procedure**: Disconnect voice; exit room.
- **Related Scenarios**: `RV03-TC03`, `RV03-TC07`.

---

### Scenario RV03-TC03: Dynamic Microphone & Output Device Switching
- **Scenario ID**: `RV03-TC03`
- **Priority**: `P1`
- **Verification Level**: `L2 (Browser Automated / L3 Manual)`
- **Preconditions**: Active voice session; multiple simulated audio input/output devices available.
- **Environment Requirements**: Chrome browser supporting `HTMLMediaElement.setSinkId`.
- **Test Accounts**: `rv_user_device_tester@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Open `AudioDeviceSettingsModal` in voice lounge.
  2. Select alternate microphone from the Input Device dropdown.
  3. Verify `room.switchActiveDevice('audioinput', newDeviceId)` is called.
  4. Verify `localStorage.getItem('ktv_preferred_mic_id')` persists the selection.
  5. Select alternate speaker from the Output Device dropdown.
  6. Verify `room.switchActiveDevice('audiooutput', newSinkId)` is called and all attached remote `<audio>` elements have `setSinkId(newSinkId)` applied.
  7. Verify `localStorage.getItem('ktv_preferred_voice_output_id')` persists the sink selection.
- **Expected Result**:
  - Device switches without disconnecting the user from the voice room.
  - Preferences persist across page reloads.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Input and output devices switched cleanly; preferences saved.
  - **Fail**: Voice lounge disconnects on device switch or unhandled error thrown.
  - **Blocked**: Browser does not support device enumeration or `setSinkId`.
- **Required Logs & Evidence**: Browser device change event logs and local storage inspection.
- **Cleanup Procedure**: Reset audio preferences in local storage.
- **Related Scenarios**: `RV05-TC06`.

---

### Scenario RV03-TC04: Host Kick Eviction & LiveKit Disconnection
- **Scenario ID**: `RV03-TC04`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated API & LiveKit Inspector)`
- **Preconditions**: LiveKit room `ktv_room_<roomId>` has Host and Participant actively connected.
- **Environment Requirements**: Backend API + LiveKit Cloud/Server.
- **Test Accounts**: Host + Participant `rv_kicked_voice_user`.
- **Exact Execution Steps**:
  1. Host and Participant join room and connect to LiveKit voice.
  2. Verify Participant identity appears in `voiceService.getClient().listParticipants(roomName)`.
  3. Host sends `POST /api/v1/rooms/:roomId/members/:userId/kick`.
  4. Server invokes `voiceService.evictLiveKitParticipant(roomId, userId)` and Socket eviction.
  5. Inspect LiveKit participant list 1 second after kick.
  6. Participant client attempts to publish audio.
- **Expected Result**:
  - Participant is immediately removed from LiveKit room by server-side `removeParticipant()`.
  - Participant is removed from `voiceSessionRegistry`.
  - Participant's client receives `room:member:kicked` and disconnects.
  - Participant cannot reconnect to voice (blocked by token gate).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Participant removed from LiveKit within 1,500ms of kick; cannot rejoin.
  - **Fail**: Participant remains connected or can generate new token.
  - **Blocked**: LiveKit management API unreachable.
- **Required Logs & Evidence**: LiveKit participant list dump before and after kick.
- **Cleanup Procedure**: Close room.
- **Related Scenarios**: `RV02-TC05`, `RV06-TC06`.

---

### Scenario RV03-TC05: LiveKit Webhook Signature Verification & Idempotency
- **Scenario ID**: `RV03-TC05`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated API)`
- **Preconditions**: Backend running with `LIVEKIT_WEBHOOK_SECRET` configured.
- **Environment Requirements**: Node.js test harness capable of signing Webhook tokens.
- **Test Accounts**: None.
- **Exact Execution Steps**:
  1. Send `POST /api/v1/voice/webhook` without `Authorization` header.
  2. Send `POST /api/v1/voice/webhook` with an invalid/forged authorization signature.
  3. Construct a valid `participant_joined` webhook event payload with `eventId: "wh_test_uniq_01"`.
  4. Sign payload using `WebhookReceiver` token generator and send to `/api/v1/voice/webhook`.
  5. Send identical payload and signature a second time (Simulated replay / network retry).
  6. Send a third event with identical participant identity but an older timestamp (Out-of-order delivery).
- **Expected Result**:
  - Step 1: Returns HTTP 401 (`Missing authorization header`).
  - Step 2: Returns HTTP 401 (`Invalid webhook signature`).
  - Step 3: Returns HTTP 200 with `{ received: true }`; MongoDB records event claim as `completed`.
  - Step 4: Returns HTTP 200 with `{ received: true, duplicate: true }`; no duplicate processing occurs.
  - Step 5: Returns HTTP 200 with `{ received: true, stale: true }`; stale event discarded.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Invalid signatures rejected; valid event processed once; replay and stale events safely ignored.
  - **Fail**: Forged webhook accepted, or duplicate webhook processed twice.
  - **Blocked**: Missing webhook secret in configuration.
- **Required Logs & Evidence**: HTTP responses, `VoiceWebhookEventModel` document state in MongoDB.
- **Cleanup Procedure**: Delete test event record from MongoDB.
- **Related Scenarios**: `RV06-TC05`.

---

### Scenario RV03-TC06: Background Voice Eviction Worker Recovery
- **Scenario ID**: `RV03-TC06`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated Fault Injection & Worker Inspector)`
- **Preconditions**: Backend running with `voiceEvictionWorker` active.
- **Environment Requirements**: MongoDB connected.
- **Test Accounts**: None.
- **Exact Execution Steps**:
  1. Directly insert a simulated pending eviction failure into `VoiceEvictionTaskModel`:
     `{ targetType: 'user', targetId: 'usr_orphan_01', roomId: 'rm_orphan_01', attemptCount: 1, maxAttempts: 5, status: 'pending', nextAttemptAt: new Date(Date.now() - 5000) }`.
  2. Wait for `voiceEvictionWorker` polling cycle (up to 10 seconds).
  3. Inspect `VoiceEvictionTaskModel` document.
- **Expected Result**:
  - Worker acquires task lease, increments `attemptCount`, and calls `voiceService.evictLiveKitParticipant()`.
  - If LiveKit room does not exist (expected for orphan), worker classifies error and transitions status to `completed` or marks for subsequent backoff retry.
  - Task does not remain stuck in `processing`.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Worker picks up pending task; processes lease; updates status.
  - **Fail**: Task never processed or worker crashes.
  - **Blocked**: Worker timer inactive.
- **Required Logs & Evidence**: `VoiceEvictionWorker` execution logs; updated MongoDB document.
- **Cleanup Procedure**: Remove test eviction document from MongoDB.
- **Related Scenarios**: `RV06-TC06`.

---

### Scenario RV03-TC07: Physical Acoustic Echo & Bleed Verification (L3 Manual)
- **Scenario ID**: `RV03-TC07`
- **Priority**: `P1`
- **Verification Level**: `L3 (Manual-Assisted Hardware & Audio)`
- **Preconditions**: Two physical machines in separate rooms (Machine A: Singer on Loudspeakers, Machine B: Listener on Headphones).
- **Environment Requirements**: Hardware Configuration `HW-CONF-02` (Laptop array mic + built-in speakers).
- **Test Accounts**: Singer + Listener.
- **Exact Execution Steps**:
  1. Singer joins room on Machine A using built-in laptop speakers at 80% volume.
  2. Singer plays backing track `fix_rock_anthem` loudly through laptop speakers.
  3. Singer un-mutes microphone and sings lyrics.
  4. Listener on Machine B monitors incoming voice stream through closed-back headphones.
  5. Listener evaluates whether the backing track echoes back through Singer's microphone.
- **Expected Result**:
  - WebRTC Acoustic Echo Cancellation (AEC) successfully suppresses loudspeaker music bleed.
  - Listener hears Singer's direct voice clearly without audible music flanging, doubling, or howling feedback.
- **Actual Result**: `[Pending Execution - Manual Evaluation Not Yet Performed]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Backing track music bleed is imperceptible or subdued; no acoustic feedback loop.
  - **Fail**: Loud howling feedback occurs, or backing track echoes clearly to remote listeners.
  - **Blocked**: Hardware microphone unavailable on test machine.
- **Required Logs & Evidence**: Recorded audio clip of remote stream from Machine B for acoustic analysis.
- **Cleanup Procedure**: Leave voice; mute microphone.
- **Related Scenarios**: `RV05-TC04`.

