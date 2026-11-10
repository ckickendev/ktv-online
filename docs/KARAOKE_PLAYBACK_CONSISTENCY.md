# Karaoke Playback Consistency & Concurrency Architecture

## 1. Overview & Consistency Strategy

Sprint 2.4.1.1 hardens the consistency protocols of the karaoke domain to ensure verified, truthful guarantees under concurrent host commands, singer departures, room closures, worker execution delays, and server crashes.

### Dual-Mode Execution Strategy
MongoDB multi-document ACID transactions (`session.withTransaction`) require a replica set or sharded cluster. In standalone MongoDB deployments (often encountered in local development or single-container CI), transactions are unavailable.

To guarantee correctness in all environments without making false atomicity claims:
1. **Replica Set Deployments (ACID Transactions)**:
   All multi-document operations (`reorderQueue`, `advanceToNextTrack`, `handleMemberDeparted`) execute inside a MongoDB transaction session via `runInTransaction(async (session) => { ... })`. If any write or version check fails, the entire transaction is rolled back by the database engine.
2. **Standalone Deployments (Recoverable CAS Protocol)**:
   Operations execute using single-document atomic Compare-And-Swap (CAS) filters (`findOneAndUpdate` matching status and version), unique database partial indexes, transition UUIDs, and automated rollback/reconciliation protocols.

---

## 2. Transition Protection Matrix

| Transition Pathway | Database Documents Modified | Replica Set Protection | Standalone CAS Protection | Fencing / Idempotency Key |
| :--- | :--- | :--- | :--- | :--- |
| **Queue Reorder** | Multiple `RoomQueueItem` documents, `RoomPlaybackState` | Multi-document ACID Transaction (`runInTransaction`) | Full-coverage check (`INVALID_REORDER_ITEM_COUNT`) + CAS on `queueVersion` | `expectedQueueVersion` |
| **Natural Track Completion** | Old `RoomQueueItem`, Next `RoomQueueItem`, `RoomPlaybackState`, `Room` | Multi-document ACID Transaction (`runInTransaction`) | CAS candidate claim + `commitConditionalPlaybackTransition` with lease verification | `expectedPlaybackVersion` + `expectedCurrentQueueItemId` + `leaseToken` |
| **Host / Singer Skip** | Old `RoomQueueItem`, Next `RoomQueueItem`, `RoomPlaybackState`, `Room` | Multi-document ACID Transaction (`runInTransaction`) | Preempts worker lease, CAS candidate claim + conditional playback update | `expectedPlaybackVersion` + `expectedCurrentQueueItemId` |
| **Play / Pause / Seek / Stop** | `RoomPlaybackState` (+ `RoomQueueItem` if stopped) | Conditional CAS Update | `commitConditionalPlaybackTransition` matching `playbackVersion` | `expectedPlaybackVersion` |
| **Member Departure / Kick** | Departed user's `RoomQueueItem` documents, `RoomPlaybackState` (if active singer) | Multi-document ACID Transaction (`runInTransaction`) | Atomic `updateMany` for queued items, CAS next track advance for active singer | `expectedCurrentQueueItemId` |
| **Room Closure** | `RoomPlaybackState`, all active `RoomQueueItem` documents, `Room` | Atomic sequential purge | `Room.status = 'closed'` check blocks all future mutations; CAS purge to idle | `room.status !== 'closed'` |

---

## 3. Queue Reorder Multi-Document Atomicity

### The Multi-Document Problem
MongoDB `bulkWrite()` alone executes operations sequentially on the server. Without an active transaction session, a crash or concurrent command between bulk write steps can leave duplicate or missing positions.

### The Sprint 2.4.1.1 Hardened Protocol
1. **Host Role & Room Status Verification**: Checked before entering mutation boundaries.
2. **Transaction Session Propagation**: In `reorderQueue`, `RoomQueueItemModel.find(...)`, `RoomQueueItemModel.bulkWrite(...)`, and `RoomPlaybackStateModel.findOneAndUpdate(...)` all receive the transaction `session`.
3. **Full Coverage Enforcement**:
   - Compares `dto.itemIds.length` against `queuedItems.length`.
   - Validates that `new Set(dto.itemIds).size === dto.itemIds.length`.
   - Verifies every item ID exists in the active queued set.
   - Any omission or duplicate throws `INVALID_REORDER_ITEM_COUNT` (HTTP 400), preventing incomplete reorders from creating duplicate positions.
4. **CAS Version Fencing**:
   `RoomPlaybackStateModel.findOneAndUpdate({ roomId, queueVersion: expectedVersion }, { $set: { queueVersion: nextVersion } })`.
   If a concurrent operation modified `queueVersion`, the query matches 0 documents and throws `STALE_QUEUE_VERSION` (HTTP 409), triggering an automatic transaction abort and rollback.

---

## 4. Distributed Worker Lease Fencing

### The Stale Worker Hazard
If a distributed worker claims an overdue playback lease but experiences a GC pause or network delay exceeding the lease duration (15 seconds), a second worker or a host command could process the room. When the delayed worker resumes, an unfenced outcome write would corrupt playback state by double-advancing the track.

### The Conditional Outcome Write Solution
1. **Atomic Lease Acquisition**:
   `RoomPlaybackStateModel.claimDuePlayback(instanceId, 15000)` claims overdue playbacks with a cryptographically random `leaseToken`, `leaseExpiresAt`, and increments `leaseVersion`.
2. **Conditional Outcome Write ([commitConditionalPlaybackTransition](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts))**:
   Every worker transition commits via an atomic `findOneAndUpdate` filter requiring:
   - `playbackVersion: expectedPlaybackVersion`
   - `currentQueueItemId: expectedCurrentQueueItemId`
   - `leaseToken: workerLeaseToken`
   - `leaseExpiresAt: { $gt: new Date() }`
3. **Immediate Invalidation on Expiry**:
   If the lease expired, was released, or was preempted by a host command, the update matches zero documents and returns `null`. The worker aborts with zero side effects.
4. **Idempotent Cleanup**:
   Worker's `finally` block calls `releasePlaybackLease(roomId, leaseToken)`, which only clears lease fields if `leaseToken` still matches.

---

## 5. Playback Completion & Automatic Advancement

### Dual-Layer Completion Engine
1. **Precision In-Memory Timers**:
   - Anchored to the exact completion millisecond ($\text{delayMs} = \text{durationMs} - \text{positionMs}$).
   - Supplies `expectedPlaybackVersion` and `expectedCurrentQueueItemId`.
   - If the track was paused, skipped, or stopped, the timer fires harmlessly and aborts without mutating state.
2. **Distributed Polling Worker (`KaraokePlaybackWorker`)**:
   - Polls MongoDB every 2000ms.
   - Recovers any playbacks where the precision timer was missed due to a process crash or restart.
   - Acts as a fault-tolerant safety net.

### Automatic Next-Track Selection & Requester Eligibility
- Selects the earliest valid item: `status: 'queued'`, ordered by `position: 1, addedAt: 1`.
- **Dynamic Membership Verification**: Verifies `RoomMembershipModel`. If the requester is no longer active in the room (departed or kicked), their item is marked `removed` (`reason: 'requester_departed'`), and the loop evaluates the next candidate.
- If queue is empty, playback transitions to `idle` and room song metadata is cleared.

---

## 6. Race-Safe Lifecycle Cleanups

1. **Member Departure & Kick**:
   - `leaveRoom` and `kickMember` both invoke `handleMemberDeparted(roomId, userId)`.
   - All pending requests are transitioned to `removed`, and remaining queue positions are rebalanced.
   - If the departed user was the active singer, playback advances to the next track using `expectedCurrentQueueItemId: currentItem._id.toString()`.
   - If a skip or natural completion raced and already advanced the track, the fencing check aborts safely, preventing a double track advancement.
2. **Room Closure**:
   - `closeRoom` invokes `handleRoomClosed(roomId)`.
   - Precision timers are canceled.
   - Playback is reset to `idle`, all queue items are marked `removed`, and cleared state snapshots are broadcast to connected clients before disconnection.
   - All playback and queue mutations reject closed rooms immediately with `FORBIDDEN_ROOM_CLOSED`.

---

## 7. Self-Healing Reconciliation Correctness

[KaraokeReconciliationService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke-reconciliation.service.ts) runs on server startup and periodic maintenance cycles:

1. **Closed Room with Active State**: Purges active items to `removed` and resets playback to `idle`.
2. **Multiple Playing Items**: Deduplicates to at most 1 playing item, marking extras `skipped`.
3. **Queue Playing Item with Idle Playback**: Transitions stray playing items to `completed`.
4. **Playback Playing without Playing Item**: Advances to next track or resets playback to `idle`.
5. **Playback References Missing or Foreign Item**: Resets playback to `idle`.
6. **Playback References Terminal Item**: Advances to next track.
7. **Overdue Playback**: Advances to next track using version and current item fencing.
8. **Position Gaps or Duplicates**: Rebalances queue positions to a contiguous $1 \dots N$ sequence.
9. **Expired Worker Leases**: Clears dangling leases database-wide via `releaseExpiredLeases()`.
10. **Repairs Use CAS**: All reconciliation updates use conditional CAS filters to ensure they never overwrite valid concurrent mutations.
11. **Post-Commit Publication**: Realtime updates are broadcast to Socket.IO only after reconciliation writes have successfully committed.
