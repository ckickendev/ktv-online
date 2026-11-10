# Workstream RV-02 — Room State & Realtime Protocol Verification

## 1. Scope & Objective

Workstream **RV-02** verifies the distributed state synchronization and real-time protocol governing KTVOnline virtual rooms:
- Room creation, capacity boundaries, and access control policies (host, member, viewer).
- Public room discovery, search filters, and private room passcode isolation (`apps/api/src/modules/rooms/`).
- Membership invariants and atomic occupancy tracking (`RoomModel.currentParticipantsCount` vs `RoomMembershipModel`).
- Concurrency control: Race conditions during simultaneous joins and join vs close conflicts.
- Multi-tab presence tracking: Deduplication of online status across multiple browser tabs (`tabId`).
- Moderation operations: Host kick (`evictKickedMember`), voluntary leave, and room closure broadcasts (`broadcastRoomClosed`).
- Resilient state recovery: Snapshot reconciliation via `room:state:request` and monotonic event versioning (`stateVersion`).

---

## 2. Test Scenarios

### Scenario RV02-TC01: Room Creation, Visibility & Public Discovery
- **Scenario ID**: `RV02-TC01`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Headless API)`
- **Preconditions**: Authenticated user account exists.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: `rv_user_host_01@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Authenticate `rv_user_host_01` and receive JWT access token.
  2. Send `POST /api/v1/rooms` to create a public room:
     `{ name: "rv_test_public_01", capacity: 10, visibility: "public", category: "pop" }`.
  3. Send `POST /api/v1/rooms` to create a private room:
     `{ name: "rv_test_private_01", capacity: 5, visibility: "private", passcode: "secret123" }`.
  4. Send unauthenticated `GET /api/v1/rooms?search=rv_test_` to list public rooms.
  5. Verify that `rv_test_public_01` appears in the list and `rv_test_private_01` is omitted.
  6. Send `GET /api/v1/rooms/:privateRoomId` without passcode. Verify access is denied.
- **Expected Result**:
  - Both rooms created successfully with status `open` and initial `currentParticipantsCount: 1`.
  - Public room listed in discovery results; private room excluded from unauthenticated search.
  - Accessing private room without passcode returns HTTP 403 / 401.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Public room discoverable; private room isolated and passcode-gated.
  - **Fail**: Private room leaks in public search, or capacity bounds violated.
  - **Blocked**: Room creation endpoint returns 500.
- **Required Logs & Evidence**: JSON responses from room creation and discovery queries.
- **Cleanup Procedure**: Delete test rooms via `DELETE /api/v1/rooms/:roomId`.
- **Related Scenarios**: `RV02-TC02`, `RV02-TC03`.

---

### Scenario RV02-TC02: Concurrent Join Invariants & Capacity Ceiling
- **Scenario ID**: `RV02-TC02`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Concurrency Harness)`
- **Preconditions**: A public room created with strict `capacity: 3` (Host + 2 seats).
- **Environment Requirements**: Replica Set or CAS-enabled MongoDB.
- **Test Accounts**: Host + 5 candidate participants (`rv_cand_01` through `rv_cand_05`).
- **Exact Execution Steps**:
  1. Host creates room `rv_capacity_room` with `capacity: 3`.
  2. Concurrently dispatch 5 simultaneous `POST /api/v1/rooms/:roomId/join` requests from `rv_cand_01` through `rv_cand_05` using `Promise.all()`.
  3. Inspect HTTP status codes and payloads for all 5 requests.
  4. Inspect database: Count active documents in `RoomMembershipModel` where `status: 'active'`.
  5. Check `RoomModel.findById(roomId).currentParticipantsCount`.
- **Expected Result**:
  - Exactly 2 of the 5 requests succeed with HTTP 200 (filling seats 2 and 3).
  - Exactly 3 requests are rejected with HTTP 409 Conflict or 400 Bad Request (`ROOM_CAPACITY_EXCEEDED`).
  - Database assertions:
    - `RoomMembershipModel.countDocuments({ roomId, status: 'active' }) === 3`.
    - `RoomModel.currentParticipantsCount === 3`.
    - No over-allocation or phantom seats exist.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Exactly 3 total members admitted; exactly 3 rejected; DB counts consistent.
  - **Fail**: More than 3 members admitted (`currentParticipantsCount > 3`) or DB counter mismatch.
  - **Blocked**: Race condition causes unhandled deadlock or crash.
- **Required Logs & Evidence**: All 5 concurrent response codes, direct MongoDB document dumps.
- **Cleanup Procedure**: Close room; remove test memberships.
- **Related Scenarios**: `RV02-TC03`.

---

### Scenario RV02-TC03: Join vs Close Race Condition
- **Scenario ID**: `RV02-TC03`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated Concurrency Harness)`
- **Preconditions**: Active open room with Host.
- **Environment Requirements**: Replica Set MongoDB with transaction support.
- **Test Accounts**: Host + Candidate `rv_late_joiner`.
- **Exact Execution Steps**:
  1. Concurrently execute:
     - Thread A: Host sends `POST /api/v1/rooms/:roomId/close`.
     - Thread B: Candidate sends `POST /api/v1/rooms/:roomId/join`.
  2. Await both promises.
  3. Query `RoomModel` and `RoomMembershipModel`.
- **Expected Result**:
  - If Thread A commits first: Thread B fails with HTTP 403/400 (`ROOM_CLOSED`).
  - If Thread B commits first: Room closes immediately after, and candidate's membership status is updated to `departed` or `closed` during room closure teardown.
  - In no condition does an `active` membership remain attached to a `closed` room.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Zero active memberships exist for closed room in MongoDB.
  - **Fail**: Candidate successfully joins and remains marked active in a closed room.
  - **Blocked**: Transaction serialization error uncaught by backend.
- **Required Logs & Evidence**: Timestamps of both requests, room document after race resolution.
- **Cleanup Procedure**: Delete closed room.
- **Related Scenarios**: `RV02-TC02`, `RV06-TC01`.

---

### Scenario RV02-TC04: Multi-Tab Presence Deduplication & Disconnect Lifecycle
- **Scenario ID**: `RV02-TC04`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated Multi-Socket Client)`
- **Preconditions**: Test room exists with Host.
- **Environment Requirements**: Realtime Socket.IO server running.
- **Test Accounts**: Participant `rv_user_multitab@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Participant opens Tab 1: Connects Socket A with `tabId: "tab-1"` and emits `room:join`.
  2. Server broadcasts `room:member:joined` and updates presence (`totalOnline: 2`).
  3. Participant opens Tab 2: Connects Socket B with same user credentials and `tabId: "tab-2"`, emits `room:join`.
  4. Server acknowledges presence; inspect `presenceManager.getRoomOnlineCount(roomId)`.
  5. Participant closes Tab 1: Socket A disconnects.
  6. Inspect presence state.
  7. Participant closes Tab 2: Socket B disconnects.
  8. Inspect presence state.
- **Expected Result**:
  - Step 3/4: User is counted once in room occupancy (`totalOnline` remains 2, not 3).
  - Step 5/6: User remains online because Tab 2 is active. No `room:member:left` event broadcast.
  - Step 7/8: Upon final socket disconnect, server broadcasts `room:member:left` and decrements `totalOnline` to 1 (Host only).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Multiple tabs for one user do not inflate member count; leaving one tab preserves presence; closing all tabs clears presence.
  - **Fail**: Member count inflated or `room:member:left` prematurely fired on closing one of two tabs.
  - **Blocked**: Socket server fails to emit presence ack.
- **Required Logs & Evidence**: Socket event sequence transcripts from both sockets.
- **Cleanup Procedure**: Disconnect any residual sockets; close room.
- **Related Scenarios**: `RV03-TC03`.

---

### Scenario RV02-TC05: Host Kick Moderation & Eviction Broadcast
- **Scenario ID**: `RV02-TC05`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated API + Socket.IO)`
- **Preconditions**: Room with Host and Member `rv_troublemaker` connected via Socket.IO.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: Host + `rv_troublemaker`.
- **Exact Execution Steps**:
  1. Member connects Socket client and joins room channel `room:<roomId>`.
  2. Host sends `POST /api/v1/rooms/:roomId/members/:troublemakerId/kick` with `{ reason: "Disruptive behavior" }`.
  3. Member socket listens for `room:member:kicked`.
  4. Verify member socket is forced to leave Socket.IO channel.
  5. Member attempts to send `chat:message:send` or `karaoke:queue:add`.
  6. Member attempts to re-join room via `POST /api/v1/rooms/:roomId/join`.
- **Expected Result**:
  - Member receives `room:member:kicked` with matching reason.
  - Server removes member from room channel.
  - Member's queued songs are automatically removed, and presence is cleared.
  - Subsequent socket operations rejected with `NOT_IN_ROOM` or `KICKED`.
  - HTTP re-join rejected with HTTP 403 Forbidden (`FORBIDDEN_KICKED`).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Kicked user immediately evicted from channel; queue cleaned; re-entry blocked.
  - **Fail**: Kicked user receives chat messages or re-joins room.
  - **Blocked**: Kick endpoint returns 500.
- **Required Logs & Evidence**: Socket events captured on both host and member clients; HTTP 403 payload.
- **Cleanup Procedure**: Close room.
- **Related Scenarios**: `RV03-TC04`, `RV06-TC06`.

---

### Scenario RV02-TC06: Socket Disconnect, Reconnect & State Version Catch-Up
- **Scenario ID**: `RV02-TC06`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated Socket.IO)`
- **Preconditions**: Room active with Host and Participant.
- **Environment Requirements**: Backend running on `PORT=5001`.
- **Test Accounts**: Host + Participant.
- **Exact Execution Steps**:
  1. Participant joins room; initial `stateVersion === 1`.
  2. Disconnect Participant's socket client abruptly without sending `room:leave`.
  3. Host performs state mutations while Participant is disconnected:
     - Updates room topic (`room.updated` $\rightarrow$ `version: 2`).
     - Admits another member (`member.joined` $\rightarrow$ `version: 3`).
  4. Participant reconnects socket client with valid auth token.
  5. Participant emits `room:state:request` with `{ roomId }`.
  6. Participant inspects `room:state:snapshot` response payload.
- **Expected Result**:
  - Snapshot returns `version: 3` with updated room metadata and updated member list.
  - Participant local state reconciles to authoritative state without missing mutations.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Participant recovers latest snapshot (`version: 3`) with consistent data.
  - **Fail**: Reconnect fails or snapshot returns stale `version: 1`.
  - **Blocked**: Socket reconnect timeout.
- **Required Logs & Evidence**: Full packet capture during disconnect and `room:state:request` cycle.
- **Cleanup Procedure**: Close room.
- **Related Scenarios**: `RV04-TC04`, `RV06-TC03`.

