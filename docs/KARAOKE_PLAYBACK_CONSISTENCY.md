# Karaoke Playback Consistency & Concurrency Architecture

## 1. Overview & Consistency Strategy

Sprint 2.4.1.2 establishes strict deployment-level consistency guarantees and verifies the cross-collection synchronization mechanisms of the karaoke domain under concurrent host commands, singer departures, room closures, worker execution delays, and reconciliation passes.

### Deployment Capability Matrix

| Environment | MongoDB Topology | Transaction Support | Enforced Behavior |
| :--- | :--- | :--- | :--- |
| **Local Development** | Standalone MongoDB (`docker-compose.yml` or native `mongod`) | Auto-detected: supported if replica set configured, unsupported if standalone | Runs under Recoverable CAS & Reconciliation Protocols when standalone; runs full ACID transactions when replica set is active. Explicitly logs topology mode. |
| **Staging** | MongoDB Replica Set (Atlas or multi-node container) | Required & Probed | Fails closed on startup or execution if transactions are unsupported. Mirrors production transaction boundaries. |
| **Production** | MongoDB Atlas / Replica Set (minimum 3-node cluster) | Required & Strictly Enforced | Strict Fail-Closed: Startup verification probe (`checkTransactionSupport`) rejects standalone topologies. Any operation requiring transactions throws [UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) if executed without a replica set session. Zero silent degradation to non-atomic writes. |

---

## 2. Transition Protection Matrix

| Transition Pathway | Database Documents Modified | Production Replica Set Protection | Local Standalone CAS Protection | Fencing / Idempotency Key |
| :--- | :--- | :--- | :--- | :--- |
| **Queue Reorder** | Multiple [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts) documents, [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) | Multi-document ACID Transaction ([runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) | Full-coverage check (`INVALID_REORDER_ITEM_COUNT`) + CAS on `queueVersion` | `expectedQueueVersion` |
| **Queue Item Removal** | Target [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), remaining queued items (rebalanced), [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) | Multi-document ACID Transaction ([runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) | Sequential CAS update + position rebalancing | Monotonic `queueVersion` increment |
| **Natural Track Completion** | Old [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), Next [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts), [Room](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts) | Multi-document ACID Transaction ([runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) | CAS candidate claim + [commitConditionalPlaybackTransition](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) with lease verification | `expectedPlaybackVersion` + `expectedCurrentQueueItemId` + `leaseToken` |
| **Host / Singer Skip** | Old [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), Next [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts), [Room](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts) | Multi-document ACID Transaction ([runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) | Preempts worker lease, CAS candidate claim + conditional playback update | `expectedPlaybackVersion` + `expectedCurrentQueueItemId` |
| **Play / Pause / Seek** | [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) | Conditional CAS Update | [commitConditionalPlaybackTransition](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) matching `playbackVersion` | `expectedPlaybackVersion` |
| **Stop** | Current [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts), [Room](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts) | Multi-document ACID Transaction ([runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) | CAS playback reset + mark item skipped | `expectedPlaybackVersion` |
| **Member Departure / Kick** | Departed user's [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts) documents, rebalanced queued items, [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) (advance if active singer) | Multi-document ACID Transaction ([runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) | Atomic `updateMany` for queued items, CAS next track advance for active singer | `expectedCurrentQueueItemId` |
| **Room Closure** | [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts), all active [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts) documents, [Room](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts) | Multi-document ACID Transaction ([runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) | `Room.status = 'closed'` terminal check blocks all future mutations; CAS purge to idle | `room.status !== 'closed'` |

---

## 3. Queue Reorder Protocol

### The Multi-Document Problem
In MongoDB, `bulkWrite()` across multiple documents does not execute atomically unless wrapped inside a multi-document transaction session. In standalone MongoDB deployments:
1. **Crash Window**: If the node or database crashes midway through `bulkWrite()`, partial position modifications are persisted.
2. **Concurrency Window**: In standalone mode, if `bulkWrite()` succeeds on queue items but the subsequent CAS advancement on `RoomPlaybackState.queueVersion` fails (due to a concurrent reorder), queue positions have been updated without advancing the room's canonical `queueVersion`.

### Production Protection (ACID Transactions)
In production, multi-document transactions are mandatory:
1. **All Reads Use Session**: [RoomPlaybackStateModel.findOne](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) and [RoomQueueItemModel.find](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts) receive `session`.
2. **BulkWrite Bound to Session**: `RoomQueueItemModel.bulkWrite(bulkOps, { session })` ensures writes remain uncommitted until the transaction succeeds.
3. **QueueVersion Bound to Session**: `RoomPlaybackStateModel.findOneAndUpdate({ queueVersion }, ..., { session })` participates in the same ACID boundary.
4. **Structured Conflict on Stale Version**: If `expectedQueueVersion !== playbackState.queueVersion`, throws `STALE_QUEUE_VERSION` (HTTP 409).
5. **Abort Leaves Zero Partial State**: If any write or version check fails, MongoDB aborts the entire transaction; no partial queue reorders are visible.
6. **Post-Commit Publication**: Realtime events (`broadcastKaraokeQueueUpdated`) are dispatched strictly after the transaction commits.

---

## 4. Version Semantics & Ownership

| Version Attribute | Model Location | Authoritative Responsibility | Mutation Triggers |
| :--- | :--- | :--- | :--- |
| `queueVersion` | [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) | Canonical coordinator for room song queue ordering and membership | Enqueue song, remove song, reorder queue, rebalance positions, member departure purge, track completion |
| `playbackVersion` | [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) | Authoritative coordinator for playback state machine and player lifecycle | Play, pause, seek, stop, skip, natural track completion |
| `stateVersion` | [RoomModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts) | Authoritative coordinator for room membership, participation, and lifecycle | Join room, leave room, kick member, close room, update room metadata |

### Why `queueVersion` is Stored in `RoomPlaybackStateModel`
Because active queue items are stored as independent individual documents in [RoomQueueItemModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), there is no single "RoomQueue" document. [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) maintains a strict 1-to-1 relationship with the Room via a unique index (`{ roomId: 1 }`). Storing `queueVersion` in `RoomPlaybackStateModel` avoids introducing an extraneous single-field collection while providing an atomic CAS target for all queue mutations.

---

## 5. Distributed Worker Lease Fencing

### Stale Worker Race Prevention
Consider the race condition:
1. **Worker A** claims lease generation 1 on room $R$ (`leaseToken_A`, `leaseExpiresAt: t + 15s`).
2. Worker A experiences an execution pause (GC or network delay) exceeding 15 seconds.
3. The lease expires (`leaseExpiresAt <= now`).
4. **Worker B** claims lease generation 2 on room $R$ (`leaseToken_B`, `leaseExpiresAt: now + 15s`, `leaseVersion: 2`).
5. Worker A wakes up and attempts to commit its outcome write via [commitConditionalPlaybackTransition](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts):
   ```ts
   filter: {
     roomId: roomObjectId,
     playbackVersion: expectedPlaybackVersion,
     leaseToken: 'leaseToken_A',
     leaseExpiresAt: { $gt: now },
   }
   ```
6. In the database:
   - `leaseToken` is now `'leaseToken_B'`.
   - `leaseExpiresAt_A` is in the past.
7. MongoDB updates **zero documents** and returns `null`. Worker A safely aborts without mutating state.
8. Worker B remains the sole, valid owner.

### Lease Renewal Protection
The [renewPlaybackLease](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) method requires:
- `leaseToken: callerToken`
- `leaseExpiresAt: { $gt: now }`
This prevents a worker from renewing a lease that was already claimed by another worker.

---

## 6. Reconciliation Concurrency Hardening

### The `QUEUE_PLAYING_ITEM_WITH_IDLE_PLAYBACK` Race
1. **The Hazard**: Reconciliation detects a queue item in `playing` status while `RoomPlaybackState.status === 'idle'`. If a user enqueues or starts playing a new track immediately after the read snapshot, a naive `updateMany({ roomId, status: 'playing' }, { $set: { status: 'completed' } })` would complete the newly started track!
2. **The Hardened CAS Solution**:
   - Reconciliation targets **only** the specific item IDs identified during the initial read: `_id: { $in: orphanIds }`.
   - Before modifying any queue item, reconciliation executes a CAS fence on [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts):
     ```ts
     const fenced = await RoomPlaybackStateModel.findOneAndUpdate(
       { roomId, playbackVersion: snapshot.playbackVersion, status: 'idle' },
       { $inc: { queueVersion: 1 }, $set: { lastTransitionId: uuid } },
       { new: true }
     );
     ```
   - If a valid play command committed in the interim, `fenced` returns `null`. Reconciliation **aborts immediately** with zero modifications.
   - Only if `fenced` succeeds does reconciliation complete the targeted orphan items.
   - Realtime publication is dispatched strictly after verified database commits.
