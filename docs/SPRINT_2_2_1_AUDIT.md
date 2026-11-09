# KTV Online — Sprint 2.2.1 Audit: Realtime Consistency & Recovery Hardening

**Document:** Sprint 2.2.1 Pre-Implementation Architecture Audit  
**Sprint:** Sprint 2.2.1 — Realtime Consistency & Recovery Hardening (Code-Only)  
**Status:** AUDIT COMPLETE  
**Audience:** Backend Engineers, Frontend Engineers, System Architects

---

## 1. Executive Summary

Sprint 2.2 established server-authoritative room state snapshots and monotonic versioning (`stateVersion`). However, an audit of the runtime flow reveals several subtle failure modes in high-concurrency, packet-loss, process-crash, and multi-tab operational conditions. 

Sprint 2.2.1 hardens the synchronization architecture against:
1. **Cross-collection consistency failure windows** between `Room` and `RoomMembership`.
2. **Database-to-Socket.IO publication loss** (the process-crash window).
3. **The "Lost Final Event" problem** where clients never receive subsequent events to trigger gap recovery.
4. **Snapshot generation races** where `room` and `members` queries read different logical versions.
5. **Client-side ordering inversions** where late snapshots overwrite newer state or events arriving during initial sync are dropped.
6. **Session revocation leakage** where revoked tokens/sessions retain active socket access.
7. **Kick moderation bypass** where kicked users can immediately invoke `joinRoom` to clear kick metadata.

---

## 2. A1: State Mutation Inventory

| Service & Method | Collections Modified | Mutation Trigger | Current Atomicity & Guarantees | Advances `stateVersion`? | Event Published? | Failure & Process Crash Windows |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `RoomService.create` | `Room`, `RoomMembership` | `POST /api/v1/rooms` | Non-transactional: `room.save()` followed by `RoomMembershipModel.create()`. | Yes (initialized to 1) | No (client navigates to room) | Crash after `room.save()` leaves room without an active host membership. |
| `RoomService.update` | `Room` | `PATCH /api/v1/rooms/:id` | Single-document atomic `findOneAndUpdate` with capacity guard. | Yes (`$inc: { stateVersion: 1 }`) | Yes (`room.settings.updated`) | Crash between DB write and `publishRoomStateEvent` leaves DB at $V+1$ with zero event broadcast. |
| `RoomService.closeRoom` | `Room`, `RoomMembership` | `DELETE /api/v1/rooms/:id` | Non-transactional multi-step: `findByIdAndUpdate` on `Room`, then two `updateMany` sweeps on `RoomMembership`. | Yes (`$inc: { stateVersion: 1 }`) | Yes (`room.closed`) | Crash between Room close and Membership update leaves active memberships associated with a closed room. |
| `RoomService.joinRoom` | `Room`, `RoomMembership` | `POST /api/v1/rooms/:id/join` | Non-transactional: Atomic capacity reservation on `Room` (`$inc: { currentParticipantsCount: 1, stateVersion: 1 }`), followed by membership create/reactivate. On failure, rollback decrements count. | Yes (`$inc: { stateVersion: 1 }`) | Yes (`member.joined`) | **CRITICAL DEFECT:** If membership fails or is rolled back, `currentParticipantsCount` is decremented by -1, but `stateVersion` is **NOT** rolled back! Failed join attempts permanently increment `stateVersion`. Crash after reservation permanently leaks occupancy. |
| `RoomService.leaveRoom` | `RoomMembership`, `Room` | `POST /api/v1/rooms/:id/leave` | Non-transactional: `findOneAndUpdate` on `RoomMembership` (`status: 'left'`), followed by `findOneAndUpdate` on `Room` (`$inc: { currentParticipantsCount: -1, stateVersion: 1 }`). | Yes (`$inc: { stateVersion: 1 }`) | Yes (`member.left`) | Crash between membership update and room update leaves participant count not decremented and `stateVersion` not advanced. |
| `RoomService.kickMember` | `RoomMembership`, `Room`, `RoomActivity` | `POST /api/v1/rooms/:id/members/:userId/kick` | Non-transactional: `findOneAndUpdate` on `RoomMembership` (`status: 'left'`, `kickedAt`), then `findOneAndUpdate` on `Room` (`$inc: { currentParticipantsCount: -1, stateVersion: 1 }`), then `chatService.recordActivity`. | Yes (`$inc: { stateVersion: 1 }`) | Yes (`member.kicked`) | Crash between membership kick and room update leaves count un-decremented and `stateVersion` un-advanced. |
| `RoomReconciliationService.reconcileRoom` | `Room`, `RoomMembership` | Admin REST or background sweep | Atomic CAS update on `Room` (`currentParticipantsCount = activeCount`). | **NO** (Does not touch `stateVersion`) | **NO** (No event published) | If reconciliation repairs drifted occupancy, clients are never notified and remain on drifted count until next unrelated mutation. |

---

## 3. A2: Event Publication Inspection

1. **Fire-and-Forget Architecture:**
   - `publishRoomStateEvent` in `room-state.publisher.ts` emits directly via Socket.IO: `io.to(channel).emit(ROOM_STATE_EVENT, event)`.
   - Socket.IO broadcast does not track delivery receipts or subscriber acknowledgements.
   - If the Express process crashes between MongoDB write and `publishRoomStateEvent`, the event is permanently lost.
2. **Missing Outbox / Recovery Queue:**
   - No durable record of published events exists in MongoDB.
   - If an event is dropped in transit, the server has no record of past events beyond the single integer `stateVersion` on the room document.
3. **Implication:**
   - The system cannot rely exclusively on event delivery. It must rely on deterministic version-gap detection and snapshot reconciliation, supplemented by a durable outbox record or periodic version verification.

---

## 4. A3: Snapshot Construction Analysis

Inspect `getRoomStateSnapshot` in `room.service.ts`:
1. **Unfenced Concurrent Reads:**
   - Step 1: `RoomModel.findById` reads room document (Version $V_1$, Count $C_1$).
   - Step 2: Kicked record query.
   - Step 3: Private room authorization query.
   - Step 4: Viewer membership query.
   - Step 5: `RoomMembershipModel.find({ status: 'active' })` reads active member roster.
   - Step 6: `presenceManager.getRoomPresence` reads ephemeral sockets.
   - Step 7: Returns snapshot with `version: room.stateVersion`.
2. **The Inconsistent Snapshot Race:**
   - If `joinRoom`, `leaveRoom`, or `kickMember` commits between Step 1 and Step 5:
     - `room.currentParticipantsCount` reflects $C_1$ at version $V_1$.
     - `members` reflects $C_2$ at version $V_2$.
     - The snapshot is delivered to the client claiming version $V_1$ while containing $V_2$ membership data, or with `room.currentParticipantsCount !== members.length`!
3. **Resolution Strategy:**
   - Implement **Version-Fenced Read**:
     1. Read `stateVersion` ($V_1$).
     2. Query `Room` and active `RoomMembership[]`.
     3. Re-read `stateVersion` ($V_2$).
     4. If $V_1 \neq V_2$, retry bounded times (e.g., 3).
     5. Enforce snapshot invariant `room.currentParticipantsCount === members.length`. If drifted, trigger reconciliation.

---

## 5. A4: Frontend Reconciliation & Race Conditions

Inspect `useRoomState` in `apps/web/src/hooks/use-room-state.ts`:
1. **Initial Mount Race:**
   - Page mount starts REST `fetchSnapshot()` and establishes socket connection with `room:join`.
   - If `room:join` completes first, Socket.IO sends `room:state:snapshot` AND can begin delivering `room:state:event`.
   - If a `room:state:event` (e.g., version 11) arrives while REST snapshot (version 10) is still in transit, `versionRef.current` is 0. The client sees a gap, marks `desynchronized`, and triggers another snapshot!
   - When the REST snapshot (version 10) finally returns, it calls `applySnapshot` and overwrites version 11, rolling local state backwards!
2. **Missing Event Buffering During Synchronization:**
   - When `syncStatus` is `'initializing'`, `'reconnecting'`, or `'desynchronized'`, events arriving over WebSocket must be buffered.
   - Once snapshot version $V_s$ is installed, buffered events with version $\le V_s$ are discarded, and events with version $> V_s$ are applied in strict sequential order.
3. **The "Lost Final Event" Problem:**
   - Version gap detection triggers ONLY when a *subsequent* event ($V + 2$) is received.
   - If a room has version 10, a mutation commits version 11, and the broadcast for event 11 is dropped (or process crashed), and *no further mutations occur*, the client never receives version 12!
   - The client remains stuck at version 10 indefinitely without detecting the discrepancy.
   - **Resolution Strategy:**
     - Implement lightweight periodic version polling (e.g., every 20s while viewing active room).
     - Trigger reconciliation on window focus / `document.visibilityState === 'visible'`.
     - Trigger reconciliation on socket reconnect.
4. **Recovery Request Storms:**
   - If multiple rapid gaps or reconnect triggers occur, multiple `refreshState` calls run concurrently.
   - Need in-flight deduplication / coalescing so only one snapshot recovery request runs at a time.

---

## 6. A5: Session Revocation & Kick Moderation Lifecycle

1. **Session Revocation Disconnect Gap:**
   - `authService.logout` and token family replay detection revoke MongoDB `SessionModel`.
   - Socket connections authenticate only during handshake (`socketAuthMiddleware`).
   - Sockets never check session revocation during active operation and are never forcibly disconnected upon logout.
   - A logged-out user or compromised session can remain connected to Socket.IO indefinitely.
   - **Remediation:**
     - Store `familyId` in `AuthenticatedSocketData`.
     - When `authService.logout` or replay detection revokes a session, call `disconnectSessionSockets(familyId)` or `disconnectUserSockets(userId)` to immediately evict the sockets.
2. **Kick Lifecycle & Moderation Bypass:**
   - When a member is kicked, `RoomMembership` is marked `status: 'left'`, `kickedAt = new Date()`, `kickedBy = hostId`.
   - `socket.room:join` and `getRoomStateSnapshot` reject kicked users with `FORBIDDEN_KICKED`.
   - **Vulnerability in `joinRoom`:** `RoomService.joinRoom` lines 394–430 checks `status: { $ne: 'active' }` and immediately reactivates the membership, clearing `kickedAt` and `kickedBy` without verifying whether the user was kicked!
   - A kicked user simply clicks "Join Lounge" on the frontend REST API and bypasses the host kick entirely!
   - **Remediation:**
     - In `RoomService.joinRoom`: check if the user has an active kick (`status === 'left' && kickedAt != null`). If kicked, reject with `403 Forbidden` (`FORBIDDEN_KICKED`).
     - Introduce explicit host-controlled reinstatement (`reinstateMember` / `unbanMember`) so only the host can authorize a kicked user to rejoin.
     - When an authorized member joins, stale kick metadata is cleared.

---

## 7. Deployment Assumptions

- **Topology:** Single-instance Node.js / Express backend with MongoDB and Socket.IO.
- **Transactions:** MongoDB standalone in development (no replica set); production may or may not use replica sets. The architecture must provide guaranteed consistency on standalone MongoDB via atomic CAS and version-fenced reads, while using multi-document transactions when available.
- **No Redis / No Kafka:** Out-of-scope. Consistency and recovery must be achieved through MongoDB durable outbox records, version-fenced reads, and client self-healing reconciliation.
