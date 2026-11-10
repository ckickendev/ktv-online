# Sprint 2.4.1 — Architecture & Reliability Audit: Karaoke Playback Consistency & Lifecycle Hardening

## 1. Executive Summary & Objective

This audit evaluates the reliability, concurrency safety, and cross-collection consistency of the Sprint 2.4 Karaoke Playback Foundation in **KTVOnline**.

The goal of Sprint 2.4.1 is to eliminate race conditions, guarantee atomic queue transitions, enforce cross-collection invariants between `RoomQueueItemModel` and `RoomPlaybackStateModel`, implement reliable server-authoritative natural playback completion, and harden lifecycle cleanups across server restarts and concurrent mutations.

---

## 2. Source Code Inspection & Defect Analysis

### 2.1 Queue Mutation Pathways

| Pathway | Location | Operation | Findings & Risks | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Add Song (Idle Stage)** | `KaraokeService.addToQueue` | Reads `hasActivePlaying` & `playbackState.status === 'idle'`, then creates `playing` item and updates `playbackState` | **Race Condition**: Two concurrent additions when stage is idle will both detect `!hasActivePlaying` and both attempt to create `playing` items. One hits MongoDB `E11000` duplicate key error on partial unique index and crashes with 500 error instead of cleanly queueing behind track 1. | **HIGH** |
| **Add Song (Active Stage)** | `KaraokeService.addToQueue` | Reads max position from DB, then inserts next queued item | **Race Condition**: Concurrent additions can compute the same `nextPosition`, creating duplicate queue positions. `activeQueueCount >= 50` is a read-then-write check that can be exceeded under concurrent load. | **MEDIUM** |
| **Remove Song** | `KaraokeService.removeFromQueue` | Finds item, sets `status: 'removed'`, advances next track or calls `rebalanceQueuePositions` | **Partial Failure Risk**: If removing an active playing track, the queue item is updated first, then `advanceToNextTrack` is called. If the process crashes in between, the queue item is `removed` but `playbackState` still points to it. | **HIGH** |
| **Reorder Queue** | `KaraokeService.reorderQueue` | Iterative loop: for each item ID, executes `updateOne` with sequential position | **Critical Race Condition**: Multiple sequential `updateOne` calls are executed non-atomically. If two hosts reorder simultaneously, or an addition/removal occurs concurrently, queue positions will be corrupted. Reorder does not check if the room is closed. | **CRITICAL** |
| **Position Rebalance** | `KaraokeService.rebalanceQueuePositions` | Fetches all queued items, loops through them, and executes `updateOne` for each item | Non-atomic across items. Concurrent mutations can produce inconsistent ordering. | **MEDIUM** |

---

### 2.2 Playback Mutation Pathways

| Pathway | Location | Operation | Findings & Risks | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Natural Playback Completion** | `KaraokeService.getPlaybackSnapshot` | Inactive query-driven check: `if (derivedPositionMs >= songDurationMs) await advanceToNextTrack()` | **CRITICAL ARCHITECTURAL DEFECT**: Natural completion is entirely passive and query-driven! If no client requests a playback snapshot, a completed track stays in `playing` status indefinitely in the database. When the server restarts, completed tracks never advance. | **CRITICAL** |
| **Advance Next Track** | `KaraokeService.advanceToNextTrack` | 1. Updates current item to `completed`<br>2. Finds next queued item<br>3. Saves next item as `playing`<br>4. Updates `playbackState`<br>5. Calls `rebalanceQueuePositions` | **Cross-Collection Race**: Multi-step non-transactional sequence. If host clicks `skip` at the exact instant natural completion evaluates, two songs can be advanced or `E11000` duplicate key error is thrown without handling. Next item requester is not checked for active room membership. | **HIGH** |
| **Playback Commands (Play/Pause/Seek/Skip/Stop)** | `KaraokeService.executePlaybackCommand` | Verifies version, checks host/singer role, applies state mutation, calls `advanceToNextTrack` on skip/stop | Version fencing exists via `expectedPlaybackVersion`, but singer role check does not re-verify whether the singer is still an active room member at command time. | **MEDIUM** |

---

### 2.3 Member and Room Lifecycle Cleanup

| Pathway | Location | Operation | Findings & Risks | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Member Departure** | `RoomService.leaveRoom` & `KaraokeService.handleMemberDeparted` | Updates user's queued items to `removed`, rebalances queue, advances track if user was singer | `handleMemberDeparted` is non-blocking in `leaveRoom`. If `advanceToNextTrack` fails, the error is swallowed and playback remains in an invalid state. | **MEDIUM** |
| **Member Eviction (Kick)** | `RoomService.kickMember` & `socket.server.ts:evictKickedMember` | Socket server cleans up karaoke state upon eviction | If socket server is unreachable or client is disconnected, cleanup may be skipped or delayed. Should be called directly in `roomService.kickMember`. | **MEDIUM** |
| **Room Closure** | `RoomService.closeRoom` & `KaraokeService.handleRoomClosed` | Sets playback to `idle`, marks all active queue items `removed` | If an in-flight command commits at the same tick room closes, a new song could be queued or played in a closed room. | **HIGH** |

---

### 2.4 Realtime Synchronization and Event Consistency

| Pathway | Location | Operation | Findings & Risks | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **Event Broadcasting** | `KaraokeController` vs `KaraokeService` | Controller emits socket events after service returns | If `advanceToNextTrack` is triggered internally (e.g. by natural completion or member departure), socket events are omitted unless callers manually invoke broadcaster. | **HIGH** |
| **Socket Error Responses** | `karaoke.events.ts` | Socket event handlers emit error events | Error structures must use standard error codes matching contracts (`STALE_PLAYBACK_VERSION`, `FORBIDDEN_NOT_MEMBER`, `ROOM_CLOSED`). | **LOW** |

---

## 3. Classification of Findings

| Severity | Count | Summary of Key Defects |
| :--- | :---: | :--- |
| **CRITICAL** | 2 | 1. Natural playback completion is passive and query-driven with no server-side scheduling or restart recovery.<br>2. Queue reordering uses un-fenced multi-step sequential updates vulnerable to corruption under concurrent commands. |
| **HIGH** | 4 | 1. Concurrent additions when stage is idle trigger unhandled MongoDB `E11000` duplicate key errors.<br>2. Non-atomic cross-collection transitions between `RoomQueueItem` and `RoomPlaybackState` during `advanceToNextTrack`.<br>3. Room closure can race with concurrent queue additions.<br>4. Internal track advancements do not uniformly broadcast realtime socket events. |
| **MEDIUM** | 4 | 1. Concurrent additions can produce duplicate queue positions.<br>2. Singer playback authorization does not re-verify active room membership at command time.<br>3. Next track selection does not verify requester eligibility (departed members).<br>4. Member kick relies on socket handler rather than direct service invocation. |
| **LOW** | 1 | 1. Socket error payload consistency across minor event channels. |

---

## 4. Remediation Plan

1. **Workstream B (Atomic Queue Transitions)**:
   - Establish room-level atomic queue sequencing with optimistic version fencing (`queueVersion`).
   - Catch and handle MongoDB `E11000` duplicate key errors in `addToQueue`: if a concurrent race occurs on idle stage activation, automatically fall back to enqueueing the song as `queued` at the end of the queue.
   - Enforce capacity ceiling atomically.
   - Guard `reorderQueue` with `expectedQueueVersion` CAS check and execute batch position assignment under optimistic lock.

2. **Workstream C (Queue & Playback Cross-Collection Invariants & Reconciliation)**:
   - Implement `KaraokeReconciliationService` to detect and repair cross-collection inconsistencies:
     - Playback points to nonexistent or non-playing item $\rightarrow$ self-heal to `idle`.
     - Queue contains playing item while playback is idle $\rightarrow$ reconcile playing item.
     - Multiple playing items detected $\rightarrow$ keep canonical item, complete/skip duplicates.
     - Closed room has active queue/playback $\rightarrow$ conclude all items and idle playback.
   - Define a recoverable transition protocol using atomic CAS operations with version fencing.

3. **Workstream D (Server-Authoritative Playback Completion)**:
   - Implement `KaraokePlaybackWorker`:
     - Tracks authoritative expiration timestamp `playbackExpiresAt` on `RoomPlaybackStateModel`.
     - Regularly scans for overdue playing tracks using atomic claims (`playbackVersion` and `currentQueueItemId` fencing).
     - Survives process restarts and guarantees overdue tracks are naturally completed and advanced.
     - Integrates an in-memory precision timer on active nodes with the background worker as the durable recovery backstop.

4. **Workstream E (Automatic Next-Track Transition)**:
   - When advancing tracks, filter next queued items by validating that the requester is still an active member. If the requester has left, mark item `removed` and select the next eligible item.
   - Atomically transition the chosen item to `playing` and update playback state with monotonic version increment.

5. **Workstream F (Explicit Authorization Policy)**:
   - Document explicit authorization matrix in `docs/KARAOKE_PLAYBACK_AUTHORIZATION.md`.
   - In `executePlaybackCommand`, re-verify that the active singer has an active membership record in `RoomMembershipModel`.

6. **Workstream G (Lifecycle Integration)**:
   - Ensure `roomService.kickMember` directly invokes karaoke departure cleanup.
   - Ensure `roomService.closeRoom` prevents any concurrent in-flight queue additions.

7. **Workstream H & I (Recovery & Realtime Consistency)**:
   - Run reconciliation on API bootstrap.
   - Unify event broadcasting inside domain service transitions or ensure all advance pathways emit authoritative updates.

8. **Workstream J (Frontend Compatibility)**:
   - Ensure frontend `use-karaoke.ts` gracefully handles 409 stale version conflicts and reconnects with snapshot reconciliation.
