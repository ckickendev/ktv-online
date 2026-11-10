# Sprint 2.4.1.2.1 — Standalone Recovery Boundaries & Transaction Guard Verification Audit

## 1. Executive Summary & Audit Mission

Sprint 2.4.1.2.1 executes a final focused audit and targeted hardening of MongoDB consistency boundaries following Sprint 2.4.1.2.

The objective is to establish explicit, truthful guarantees for:
1. **Standalone MongoDB development limitations**: Local development using standalone MongoDB is explicitly acknowledged as non-ACID and incapable of multi-document atomicity.
2. **Production and staging transaction enforcement**: Production and staging topologies strictly require MongoDB replica set multi-document ACID transactions and fail closed both at startup and runtime.
3. **Transaction capability probing**: Verification that the capability probe is bounded, performs an ephemeral transaction attempt, safely aborts, and distinguishes topology limitations from transient failures.
4. **Atomic worker lease release**: Guaranteeing that lease releases are conditionally fenced by `leaseToken` and preserve monotonic `leaseVersion` increments, eliminating the race where an expired worker clears a newly acquired lease.
5. **Partial standalone queue reorder recovery**: Formal decision and enforcement of **Option A** (rejecting multi-document reorder on standalone instances) rather than attempting to reconstruct unrecorded user intent or corrupting queue positions.
6. **Reconciliation safety under ambiguous mutations**: Ensuring [KaraokeReconciliationService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke-reconciliation.service.ts) distinguishes deterministic position gaps from ambiguous duplicate position collisions, refusing to invent an authoritative ordering or increment `queueVersion` when data is ambiguous.

---

## 2. Workstream A — Explicit Standalone Development Boundaries

### 2.1 Audit of Transaction Fallback & Callers

We audited all invocations of [runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) and all multi-document mutation pathways across the karaoke domain:
- [reorderQueue](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts): Mutates $N$ [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts) positions and [RoomPlaybackState.queueVersion](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts).
- [advanceToNextTrack](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts): Updates current queue item, next queue item, playback state, and room current song.
- [removeFromQueue](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts): Marks target item removed, rebalances downstream positions, advances queueVersion.
- [handleMemberDeparted](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts): Purges queued items for departed member, rebalances remaining positions, advances playback if active singer left.
- [closeRoomPlayback](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts): Terminates playback state, marks active queue items completed, sets room status to closed.

### 2.2 Boundary Policy Formulation

#### Production & Staging Policy
- Production (`NODE_ENV === 'production'`) and Staging (`NODE_ENV === 'staging'`) strictly forbid standalone fallback.
- Multi-document consistency operations require MongoDB replica set transactions (`session.withTransaction()`).
- Any attempt to invoke [runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) on an unsupported topology immediately throws [UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts).
- The Kubernetes readiness probe (`/api/v1/health/ready`) reports HTTP 503 if transactions are unsupported, preventing traffic ingress.

#### Local Development Policy
- Standalone MongoDB (`docker-compose.yml` or native `mongod`) is permitted solely for local developer convenience.
- At startup, the database layer logs an explicit high-visibility warning:
  ```
  [MongoDB Topology Warning] Connected to standalone MongoDB.
  Multi-document ACID transactions are UNSUPPORTED in standalone mode.
  Local development runs under best-effort recovery protocols.
  Multi-document queue reordering is DISABLED.
  Production and staging environments REQUIRE a MongoDB replica set.
  ```
- Standalone mode is **never** described as ACID-compatible.
- Queue reorder (`reorderQueue`) is explicitly disabled in standalone mode under **Option A**.

---

## 3. Workstream B — Transaction Capability Probe Audit

### 3.1 Verification Checklist

| Criterion | Implementation in [apps/api/src/database/transaction.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) | Verification Status |
| :--- | :--- | :--- |
| **1. Connection != Transaction Support** | Connection to `env.MONGODB_URI` does not assume transaction support. A probe function `checkTransactionSupport()` executes after connection. | Verified |
| **2. Active Probe vs Topology Metadata** | Probe does not solely inspect topology strings. It initializes a `ClientSession`, starts an ephemeral transaction, executes a ping (`session.client.db().command({ ping: 1 }, { session })`), and aborts. | Verified |
| **3. Ephemeral Execution & Safe Abort** | Probe executes `await session.abortTransaction()` in all pathways and calls `session.endSession()` inside a `finally` block. Leaves zero persistent database mutations. | Verified |
| **4. Unsupported Errors vs System Failures** | Distinguishes MongoDB transaction error code 20 (`IllegalOperation`: *Transaction numbers are only allowed on a replica set member or mongos*) or messages containing `replica set` from generic database connection failures. | Verified |
| **5. Bounded Probe Execution** | Bounded using `Promise.race` with `PROBE_TIMEOUT_MS = 5000`. Probe times out after 5 seconds rather than hanging server startup indefinitely. | Verified |
| **6. Fail-Closed in Production & Staging** | In `NODE_ENV === 'production'` or `NODE_ENV === 'staging'`, unsupported topology or probe failure throws [UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts), terminating startup. | Verified |
| **7. Runtime Transaction Guarding** | Startup verification does not guarantee every future transaction will succeed (e.g. transient network splits, replica set stepdowns). [runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) dynamically verifies session validity and wraps transaction execution with [TransactionAbortedError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts). | Verified |

### 3.2 Inherent Probe Limitations
A startup capability probe verifies topology capability at a single point in time. It cannot guarantee immunity against subsequent runtime operational events, including:
- Primary stepdown or replica set election pauses.
- Write concern / majority replication timeouts under network partitions.
- Transient driver disconnections.
Consequently, domain callers continue to use runtime transaction error handling and idempotency fences.

---

## 4. Workstream C — Atomic Lease Release Audit

### 4.1 Stale Worker Release Race Hazard
In distributed playback automation, multiple worker instances periodically evaluate track expiration:
1. Worker A acquires lease generation 1 on room $R$ (`leaseToken = token_A`, `leaseVersion = 1`, `leaseExpiresAt = t`).
2. Worker A experiences an unexpected 20-second pause (garbage collection or CPU starvation).
3. The lease expires (`leaseExpiresAt <= now`).
4. Worker B claims lease generation 2 on room $R$ (`leaseToken = token_B`, `leaseVersion = 2`, `leaseExpiresAt = now + 15s`).
5. Worker A wakes up and issues a lease release command.

### 4.2 Hazard Prevention Verification
If the release query were unfenced:
- Querying expired leases first and issuing an unfenced update would clear Worker B's valid lease.
- Releasing based solely on `roomId` would clear Worker B's valid lease.
- Failing to verify `leaseToken` would allow any worker to wipe the lease.

### 4.3 Hardened Implementation in [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts)

```ts
public static async releasePlaybackLease(
  roomId: string | Types.ObjectId,
  leaseToken: string
): Promise<boolean> {
  if (!leaseToken || typeof leaseToken !== 'string') {
    return false;
  }

  const roomObjectId = typeof roomId === 'string' ? new Types.ObjectId(roomId) : roomId;

  const result = await this.updateOne(
    {
      roomId: roomObjectId,
      leaseToken: leaseToken,
    },
    {
      $set: {
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        leaseToken: null,
      },
      $inc: {
        leaseVersion: 1,
      },
    }
  );

  return result.modifiedCount > 0;
}
```

Key Invariants Enforced:
1. **Strict Identity Match**: The update filter strictly specifies `{ roomId, leaseToken }`. Because `leaseToken` in the database is `token_B`, Worker A's update matches **0 documents** and returns `false`.
2. **Monotonic Version Increment**: Every release executes `$inc: { leaseVersion: 1 }`.
3. **Safe Bulk Expiry Sweep**: [releaseExpiredLeases](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts) uses a conditional atomic filter `{ leaseExpiresAt: { $lte: now }, leaseToken: { $ne: null } }` and increments `leaseVersion`. It never executes an unfenced room update.
4. **Idempotence**: Calling `releasePlaybackLease` multiple times with the same token is safe and idempotent (subsequent calls return `false` without side effects).

---

## 5. Workstream D — Partial Standalone Reorder Recovery Audit

### 5.1 The Ambiguity Hazard of Partial Reorders
Consider a standalone MongoDB instance where a host requests a reorder of 5 items: $[A, B, C, D, E] \to [E, D, C, B, A]$.
1. A standalone `bulkWrite` sequentially writes new positions to individual documents.
2. Suppose items $E$ and $D$ receive positions 1 and 2, but the process or server crashes before $C, B, A$ are updated.
3. At this moment:
   - $E$ has position 1.
   - $D$ has position 2.
   - $C$ still has position 3.
   - $B$ still has position 2 (collision with $D$).
   - $A$ still has position 1 (collision with $E$).
4. The server restarts. `queueVersion` was never advanced because the transaction boundary was absent.
5. **The Fundamental Reality**: The database holds **no durable log of the host's intended order**. An external process observing $[A: 1, E: 1, B: 2, D: 2, C: 3]$ cannot know whether $E$ was meant to precede $A$ or $A$ was meant to precede $E$.
6. Any algorithm that attempts to "fix" this by sorting on `addedAt` or randomly renumbering positions is **inventing an ordering** that does not reflect user intent and silently presenting corrupted data as authoritative.

### 5.2 Decision: Option A — Reject Standalone Multi-Document Reorder
Rather than permitting silent data corruption under Option B, we enforced **Option A**:
- Queue reordering requires multi-document atomicity and is strictly disabled on standalone MongoDB.
- Calling `reorderQueue` when `!isTransactionSupported()` throws `UnsupportedTopologyError`.
- The REST API maps this to HTTP 501 (`Not Implemented / Unsupported Topology`).
- The WebSocket gateway maps this to code `UNSUPPORTED_TOPOLOGY_FOR_REORDER`.
- Developers requiring queue reorder testing must run MongoDB with replica set enabled (`mongod --replSet rs0`).

---

## 6. Workstream E — Reconciliation Safety Audit

### 6.1 Audit of Invariant 7 in [KaraokeReconciliationService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke-reconciliation.service.ts)

We audited the queue position repair logic in `reconcileRoom`.

#### Distinguishing Deterministic Gaps from Ambiguous Collisions
1. **Deterministic Position Gaps** (e.g. $[1, 3, 4]$):
   - Cause: Single-document item deletion (`removeFromQueue`) where an item was removed.
   - Characteristics: All positions are unique ($unique == total$).
   - Safety: Compact positions sequentially to $[1, 2, 3]$ without altering relative order. Monotonicity and relative intent are 100% preserved.
2. **Ambiguous Position Collisions** (e.g. $[1, 1, 2, 2, 3]$):
   - Cause: Interrupted non-atomic mutation or race condition.
   - Characteristics: Duplicate positions exist ($unique < total$).
   - Safety: **Unrepairable without durable operation log**. Reconciliation must NOT invent an ordering, must NOT overwrite user intent, and must NOT increment `queueVersion` to mask the ambiguity.

#### Hardened Reconciliation Behavior
When duplicate positions are encountered:
1. Logs a structured warning with full diagnostic metadata:
   ```json
   {
     "roomId": "...",
     "totalQueued": 5,
     "uniquePositions": 3,
     "positions": [1, 1, 2, 2, 3],
     "itemIds": ["...", "..."]
   }
   ```
2. Flags `operatorInterventionRequired: true` and `ambiguityDetected: true`.
3. Sets `result.code = 'AMBIGUOUS_QUEUE_FLAGGED'`.
4. Leaves queue positions untouched, refusing to invent an order.
5. Does not broadcast an invented queue ordering to connected clients.

---

## 7. Static Verification Results

Static verification commands executed:
- `pnpm typecheck` (tsc across all workspace projects): Exit code 0, 0 errors.
- `pnpm lint` (eslint across all workspace projects): Exit code 0, 0 errors, 0 warnings.
- Zero test files created or modified.
- Zero test runners executed.
- Zero database migrations or destructive operations executed.

---

## 8. Audit Conclusion & Final Verdict

The consistency boundaries of KTVOnline have been fully hardened and truthfully specified:
- Standalone MongoDB is strictly designated as a development-only convenience without ACID guarantees.
- Multi-document reordering is rejected on standalone topologies (Option A).
- Production and staging fail closed on startup and execution if transactions are unsupported.
- Capability probe execution is bounded (5000ms timeout) and ephemeral.
- Worker lease releases are conditionally fenced by `leaseToken` and preserve monotonic `leaseVersion` increments.
- Reconciliation distinguishes repairable sequential gaps from ambiguous collisions, refusing to invent authoritativeness.

**Final Verdict**: `CODE COMPLETE — NOT RUNTIME VERIFIED`
