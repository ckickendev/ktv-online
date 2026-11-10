# Sprint 2.4.1.1 — Karaoke Consistency Protocol Audit

## 1. Audit Mission & Scope

This focused audit inspects the source code of the karaoke domain to verify and validate the consistency protocols, concurrency boundaries, and distributed lease mechanisms implemented in Sprint 2.4.1.

The objective is to establish **truthful, explicit guarantees** rather than inferred or nominal guarantees.

---

## 2. Workstream A — Queue Reorder Atomicity Audit

### 2.1 Baseline Inspection
In the baseline Sprint 2.4.1 implementation of `reorderQueue`:
- `RoomQueueItemModel.bulkWrite(bulkOps)` was executed sequentially without a MongoDB transaction session.
- `playbackState.save()` was invoked after `bulkWrite()`.
- The reorder payload validation only verified that `dto.itemIds` were contained in the active queue set (`existingIds.has(id)`), but did **not** verify that `dto.itemIds.length === queuedItems.length` or that `dto.itemIds` contained no duplicates.

### 2.2 Critical Vulnerabilities Discovered
1. **Multi-Document Atomicity Void**:
   MongoDB `bulkWrite()` without an active transaction session executes each write operation individually. If a concurrent `addToQueue`, `removeFromQueue`, or server crash occurred during execution, the database could be left with partial updates, missing positions, or duplicate positions.
2. **Partial Reorder Vulnerability**:
   If a room had 5 queued items and the host submitted a reorder payload with only 3 items, positions 1, 2, and 3 were assigned to those 3 items, while items 4 and 5 retained their previous positions (e.g. 1 and 2), creating corrupted duplicate positions.
3. **TOCTOU Gap in `queueVersion`**:
   `expectedQueueVersion` was verified against an in-memory document fetched before `bulkWrite()`. An interleaving mutation between the read and `playbackState.save()` was not fenced, potentially overwriting a newer `queueVersion`.

### 2.3 Remediation Architecture
- **Transaction Session Propagation**: Introduced [runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts), which binds `bulkWrite` and `queueVersion` updates into a single atomic ACID transaction when a replica set is active.
- **Full Coverage Validation**: Enforces `dto.itemIds.length === queuedItems.length` and `new Set(dto.itemIds).size === dto.itemIds.length` prior to any write operations. Rejects partial lists with `INVALID_REORDER_ITEM_COUNT`.
- **Atomic CAS Fallback**: On standalone deployments, version advancement is executed via `findOneAndUpdate({ roomId, queueVersion: expectedVersion }, ...)`, rejecting stale reorders atomically.

---

## 3. Workstream B — Cross-Collection Playback Transitions Audit

### 3.1 Transition Analysis Matrix

| Transition | Preconditions | Expected Versions | Documents Modified | Atomicity Boundary | Idempotency / Fencing Key | Realtime Event Point | Recovery on Failure |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Play (from paused)** | `status: 'paused'` | `expectedPlaybackVersion` | `RoomPlaybackState` | Conditional CAS / Transaction | `playbackVersion` CAS match | Post-commit emit `playback.updated` | Discarded on version conflict |
| **Play (from idle)** | `status: 'idle'` | `expectedPlaybackVersion` | `RoomPlaybackState`, `RoomQueueItem` (next), `Room` | `runInTransaction` / Recoverable CAS | `playbackVersion` + `RoomQueueItem` CAS | Post-commit emit `playback.updated` + `queue.updated` | Auto-reconciled to idle if candidate claim fails |
| **Pause** | `status: 'playing'` | `expectedPlaybackVersion` | `RoomPlaybackState` | Conditional CAS / Transaction | `playbackVersion` CAS match | Post-commit emit `playback.updated` | Discarded on version conflict |
| **Seek** | Active song | `expectedPlaybackVersion` | `RoomPlaybackState` | Conditional CAS / Transaction | `playbackVersion` CAS match | Post-commit emit `playback.updated` | Discarded on version conflict |
| **Skip (Host / Singer)** | `status: 'playing'` | `expectedPlaybackVersion`, `currentQueueItemId` | `RoomQueueItem` (old), `RoomQueueItem` (next), `RoomPlaybackState`, `Room` | `runInTransaction` / Recoverable CAS | `expectedPlaybackVersion` + `expectedCurrentQueueItemId` | Post-commit emit `playback.updated` + `queue.updated` | Self-healing via `reconcileRoom` |
| **Natural Completion** | `playbackExpiresAt <= now` | `expectedPlaybackVersion`, `currentQueueItemId` | `RoomQueueItem` (old), `RoomQueueItem` (next), `RoomPlaybackState`, `Room` | `runInTransaction` / Lease Fencing | `leaseToken` + `playbackVersion` + `currentQueueItemId` | Post-commit emit `playback.updated` + `queue.updated` | Worker lease expiry + reconciliation |
| **Stop** | Active playback | `expectedPlaybackVersion` | `RoomQueueItem` (old), `RoomPlaybackState`, `Room` | Conditional CAS / Transaction | `playbackVersion` CAS match | Post-commit emit `playback.updated` + `queue.updated` | Self-healing via `reconcileRoom` |
| **Member Departure / Kick** | Member leaves or is kicked | Singer's `currentQueueItemId` | `RoomQueueItem` (user's queued), `RoomPlaybackState` (if singer) | `runInTransaction` / CAS | `expectedCurrentQueueItemId` | Post-commit emit `queue.updated` + `playback.updated` | Idempotent cleanup |
| **Room Closure** | Host closes room | N/A | `RoomPlaybackState`, `RoomQueueItem` (all active), `Room` | Sequential atomic batch + timer cancel | CAS reset to idle | Post-cleanup emit cleared states | Reconciled on startup sweep |

---

## 4. Workstream C — Distributed Worker Lease Fencing Audit

### 4.1 Vulnerabilities in Baseline
In Sprint 2.4.1, `KaraokePlaybackWorker` claimed a lease via `claimDuePlayback`, but `advanceToNextTrack` did not verify the `leaseToken` or lease expiration during its outcome write.
- If a worker experienced an unexpected delay or GC pause exceeding 15 seconds, its lease could expire, allowing a second worker or a host skip to process the room.
- When the first worker resumed, it would commit its transition regardless, advancing the track a second time.

### 4.2 Remediation
1. `commitConditionalPlaybackTransition` was introduced on [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts).
2. The outcome write requires:
   - `playbackVersion: expectedPlaybackVersion`
   - `leaseToken: options.leaseToken` (if leased)
   - `leaseExpiresAt: { $gt: new Date() }`
   - `currentQueueItemId: options.expectedCurrentQueueItemId`
3. An expired or pre-empted worker matches 0 documents, aborting its transition safely with zero state corruption.

---

## 5. Workstream D — Completion & Automatic Advancement Audit

1. **Race between Host Skip and Natural Completion**:
   - Both pathways supply `expectedPlaybackVersion` and `expectedCurrentQueueItemId`.
   - The first transition commits and increments `playbackVersion`.
   - The second transition fails version fencing and aborts safely. It cannot advance a second song.
2. **Precision Timers vs Lease Polling**:
   - Precision timers provide low-latency sub-second transitions for connected users.
   - When a precision timer fires, it passes `expectedCurrentQueueItemId` and `expectedPlaybackVersion`. If the track was paused, skipped, or stopped, the timer aborts cleanly.
   - The background lease worker serves as an authoritative, crash-resilient safety net.

---

## 6. Workstream E & F — Lifecycle Safety & Reconciliation Audit

### 6.1 Reconciliation Gaps Identified & Remediated
- **Stray Playing Item Detection**: The baseline reconciliation did not detect scenarios where `RoomPlaybackState` was `idle` but stray `RoomQueueItem` documents remained in `playing` status. Added `QUEUE_PLAYING_ITEM_WITH_IDLE_PLAYBACK` check.
- **Position Duplicates**: Replaced simple index check with unique set check (`uniquePositions.size !== queuedItems.length`).
- **Expired Leases**: Added `EXPIRED_WORKER_LEASE_DETECTED` and `releaseExpiredLeases()` database-wide sweep.
- **CAS Repairs**: All repairs now execute through `commitConditionalPlaybackTransition` or atomic CAS filters, preventing reconciliation from overwriting concurrent active commands.
