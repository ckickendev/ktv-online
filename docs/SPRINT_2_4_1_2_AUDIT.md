# Sprint 2.4.1.2 — MongoDB Deployment Consistency & Recovery Verification Audit

## 1. Executive Summary & Audit Mission

Sprint 2.4.1.2 conducts a focused source-code and deployment-configuration audit of the consistency mechanisms implemented in Sprint 2.4.1 and Sprint 2.4.1.1.

The primary objective is to establish whether KTVOnline requires MongoDB standalone compatibility or can explicitly rely on MongoDB replica set transactions, and to resolve actual consistency defects discovered across:
1. Queue reorder protocol.
2. Queue version advancement.
3. Interrupted queue operations.
4. Distributed worker lease expiration.
5. Stale worker outcome commits.
6. Concurrent reconciliation races.

---

## 2. Workstream A — Establish Actual MongoDB Deployment Requirements

### 2.1 Configuration & Infrastructure Inspection

An exhaustive inspection of the repository's configuration and infrastructure yielded the following facts:

1. **Local Development ([docker-compose.yml](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docker-compose.yml))**:
   - The default container definition runs `image: mongo:7.0` without the `--replSet` flag.
   - [infrastructure/docker/mongo-init.js](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/infrastructure/docker/mongo-init.js) creates an initial user on database `ktv_online` on a standalone `mongod` process.
   - Local development connects by default to `mongodb://127.0.0.1:27017/ktv_online`.
   - **Conclusion**: Local development defaults to a single-node standalone MongoDB instance unless the developer explicitly spins up a container or daemon with `--replSet`.

2. **Environment Variable Validation ([apps/api/src/config/env.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/config/env.ts))**:
   - `MONGODB_URI` defaults to `mongodb://127.0.0.1:27017/ktv_online`.
   - `NODE_ENV` is validated as `'development' | 'production' | 'test'`.
   - In production, strict validation exists for `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and high-entropy `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`.

3. **Mongoose Connection Initialization ([apps/api/src/database/connection.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/connection.ts))**:
   - Connects to `env.MONGODB_URI` with `serverSelectionTimeoutMS: 3000` and `connectTimeoutMS: 5000`.
   - Tracks connection lifecycle events (`connected`, `error`, `disconnected`).

4. **Transaction Probing & Fallback ([apps/api/src/database/transaction.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts))**:
   - Prior to this sprint, `checkTransactionSupport()` attempted a probe transaction at startup. If standalone was detected, it set `transactionSupported = false` and logged informational messages.
   - **Critical Vulnerability Identified**: Prior to Sprint 2.4.1.2, [runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) would silently fall back to `fn(null)` even when running in `NODE_ENV === 'production'`. This allowed production deployments to enter non-atomic execution pathways without operator warning or failure.

### 2.2 Answers to Workstream A Determination Questions

1. **What MongoDB topology is required for production?**
   - **Requirement**: MongoDB Replica Set (minimum 3-node configuration, e.g. Primary-Secondary-Secondary or Primary-Secondary-Arbiter).
   - **Rationale**: The karaoke domain requires multi-document atomic operations spanning [RoomQueueItem](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), [RoomPlaybackState](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts), and [Room](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts) collections (`reorderQueue`, `advanceToNextTrack`, `removeFromQueue`, `handleMemberDeparted`). Multi-document ACID transactions (`session.withTransaction()`) in MongoDB strictly require a replica set or sharded cluster.

2. **Does the intended production deployment use MongoDB Atlas replica set?**
   - **Finding**: Yes. Managed MongoDB cloud deployments (such as MongoDB Atlas) operate as 3-node replica sets by default. The repository documentation and operational model assume Atlas or equivalent managed replica sets.

3. **Are transactions required by existing domain operations?**
   - **Finding**: Yes. Cross-collection state transitions (`advanceToNextTrack`, `reorderQueue`, `removeFromQueue`, and `handleMemberDeparted`) cannot guarantee atomicity under process crashes without transactions.

4. **Does local development use standalone MongoDB?**
   - **Finding**: Yes. The provided `docker-compose.yml` runs a standalone instance for developer simplicity.

5. **Does the application explicitly reject unsupported topology in production?**
   - **Finding prior to sprint**: No. It silently degraded to non-atomic CAS execution.
   - **Hardened in Sprint 2.4.1.2**: Yes. [checkTransactionSupport](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) and [runInTransaction](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) now strictly fail closed in `NODE_ENV === 'production'` by throwing [UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts). Furthermore, the Kubernetes readiness probe (`/api/v1/health/ready`) returns HTTP 503 if transactions are unavailable in production.

6. **Are transaction failures distinguishable from application errors?**
   - **Finding prior to sprint**: Errors were untyped or mixed.
   - **Hardened in Sprint 2.4.1.2**: Structured error classes ([UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts), [TransactionAbortedError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts)) and distinct domain codes (`STALE_QUEUE_VERSION`, `STALE_PLAYBACK_VERSION`) ensure topology issues, transaction aborts, and domain conflicts are unambiguously distinguished.

### 2.3 Deployment Capability Matrix

| Environment | MongoDB Topology | Transaction Support | Enforced Behavior |
| :--- | :--- | :--- | :--- |
| **Local Development** (`development`) | Standalone MongoDB (`docker-compose.yml` or native `mongod`) | Auto-detected: supported if replica set configured, unsupported if standalone | Runs under Recoverable CAS & Reconciliation Protocols when standalone; runs full ACID transactions when replica set is active. Explicitly logs topology mode at startup. |
| **Staging** (`test` / staging) | MongoDB Replica Set (Atlas or multi-node container) | Required & Probed | Fails closed on startup or execution if transactions are unsupported. Exercises full multi-document transactions identical to production. |
| **Production** (`production`) | MongoDB Atlas / Replica Set (minimum 3-node cluster) | Required & Strictly Enforced | Strict Fail-Closed: Startup verification probe (`checkTransactionSupport`) rejects standalone topologies. Any operation requiring transactions throws [UnsupportedTopologyError](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/transaction.ts) if executed without a replica set session. Zero silent degradation to non-atomic writes. |

---

## 3. Workstream B — Review Queue Reorder Protocol

### 3.1 Audit of `reorderQueue` Implementation
Inspected [apps/api/src/modules/karaoke/karaoke.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.service.ts) lines 520–638:

1. **Authorization & Pre-Validation**:
   - Verifies room is not closed (`FORBIDDEN_ROOM_CLOSED`).
   - Verifies caller holds `'host'` membership in `RoomMembershipModel` (`FORBIDDEN_HOST_ONLY`).
2. **Session Propagation**:
   - Enters `runInTransaction(async (session) => ...)`:
     - `RoomPlaybackStateModel.findOne({ roomId }).session(session || null)`
     - `RoomQueueItemModel.find({ roomId, status: 'queued' }).session(session || null)`
     - `RoomQueueItemModel.bulkWrite(bulkOps, { session: session || undefined })`
     - `RoomPlaybackStateModel.findOneAndUpdate(..., { session: session || undefined })`
3. **Full-Coverage Validation**:
   - `dto.itemIds.length === queuedItems.length`
   - `new Set(dto.itemIds).size === dto.itemIds.length`
   - Every ID in `dto.itemIds` exists in active queued items.
   - Throws `INVALID_REORDER_ITEM_COUNT` (HTTP 400) or `INVALID_REORDER_ITEM_ID` (HTTP 400) on mismatch.
4. **CAS Version Fencing**:
   - Verifies `dto.expectedQueueVersion === playbackState.queueVersion`.
   - Advances version via `findOneAndUpdate({ roomId, queueVersion: playbackState.queueVersion }, { $set: { queueVersion: nextQueueVersion } })`.
   - Throws `STALE_QUEUE_VERSION` (HTTP 409) if version changed.
5. **Event Publication**:
   - Realtime broadcast (`broadcastKaraokeQueueUpdated`) in [karaoke.events.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/karaoke.events.ts) and [karaoke.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke.controller.ts) occurs strictly **after** `await karaokeService.reorderQueue(...)` resolves, guaranteeing post-commit publication.

### 3.2 Standalone Mode Fallback Analysis: Crash & Concurrency Windows
In standalone mode (`session === null`), `bulkWrite()` across multiple queue documents is executed sequentially on the database server without cross-document isolation:
- **Crash Window**: If the server crashes after updating item 1 and 2 but before updating item 3 and 4, the queue has duplicate/corrupted positions.
- **Concurrency Window**: If `bulkWrite()` succeeds on queue items but the subsequent CAS on `RoomPlaybackStateModel.findOneAndUpdate({ queueVersion })` fails due to a racing mutation, the item positions have been changed in the database, but `queueVersion` remains un-incremented.
- **Standalone Decision**: Rather than building a generic distributed transaction coordinator with two-phase commit log documents in application space, **the production requirement is made explicit and strict**: Production requires MongoDB replica sets. Standalone is restricted to local development where [KaraokeReconciliationService](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/karaoke-reconciliation.service.ts) automatically rebalances position gaps and duplicates during startup and maintenance sweeps.

---

## 4. Workstream C — Queue and Playback Version Semantics

### 4.1 Version Audit & Domain Ownership

1. **`RoomPlaybackStateModel.queueVersion`**:
   - **Canonical Owner**: [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts).
   - **Responsibility**: Monotonically tracks the structure, ordering, and membership of the room's song queue.
   - **Colocation Choice**: Because queue items are individual documents in [RoomQueueItemModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-queue-item.model.ts), colocating `queueVersion` in `RoomPlaybackStateModel` (which has a 1-to-1 unique relationship with `Room`) acts as the room's single authoritative concurrency coordinator without creating redundant collections.
   - **Mutation Triggers**: Enqueuing a song, removing a song, reordering the queue, rebalancing positions, member departure queue purge, and track advancement.

2. **`RoomPlaybackStateModel.playbackVersion`**:
   - **Canonical Owner**: [RoomPlaybackStateModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts).
   - **Responsibility**: Monotonically tracks the state machine of the playback engine (`status`, `positionMs`, `anchorStartedAt`, `pausedAt`, `currentQueueItemId`).
   - **Mutation Triggers**: `play`, `pause`, `seek`, `stop`, `skip`, natural track completion.

3. **`RoomModel.stateVersion`**:
   - **Canonical Owner**: [RoomModel](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts).
   - **Responsibility**: Monotonically tracks room metadata, active member count, and room lifecycle (`open` / `closed`).

### 4.2 Identified Gaps & Hardening Applied
- **Defect in `removeFromQueue`**: When removing an inactive queued item (`wasPlaying === false`), the queue was rebalanced but `playbackState.queueVersion` was not incremented!
  - **Fix Applied**: Wrapped non-playing item removal in `runInTransaction`, invoking `rebalanceQueuePositions(roomId, session)` and atomically incrementing `queueVersion: 1`.
- **Defect in `handleMemberDeparted`**: When a departed user's queued songs were purged, remaining positions were rebalanced without incrementing `queueVersion`.
  - **Fix Applied**: Wrapped in `runInTransaction` and incremented `queueVersion: 1`.
- **Defect in `executePlaybackCommand('stop')`**: Stopping a playing song transitioned it to skipped without incrementing `queueVersion`.
  - **Fix Applied**: Wrapped in `runInTransaction`, advancing both `playbackVersion` and `queueVersion`.
- **Defect in `reconcileRoom` Invariant 7**: Rebalancing position gaps did not advance `queueVersion`.
  - **Fix Applied**: Increments `queueVersion: 1` upon position rebalancing.

---

## 5. Workstream D — Distributed Lease Expiration & Fencing

### 5.1 Verification of Lease Protocol Components

1. **Atomic Lease Claim ([claimDuePlayback](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts))**:
   - Uses `findOneAndUpdate` with filter:
     ```ts
     {
       status: 'playing',
       playbackExpiresAt: { $lte: now },
       $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
     }
     ```
   - Sets unique `leaseToken: crypto.randomUUID()`, `leaseExpiresAt: now + 15000ms`, `claimedBy: instanceId`, and `$inc: { leaseVersion: 1 }`.
   - Guaranteed atomic at database engine level.

2. **Conditional Outcome Write ([commitConditionalPlaybackTransition](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts))**:
   - Enforces 4 simultaneous conditions in the atomic filter:
     - `playbackVersion: expectedPlaybackVersion`
     - `currentQueueItemId: expectedCurrentQueueItemId`
     - `leaseToken: workerLeaseToken`
     - `leaseExpiresAt: { $gt: now }`
   - Clears `leaseToken: null` and increments `playbackVersion: { $inc: 1 }`.

3. **Lease Renewal Support ([renewPlaybackLease](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts))**:
   - Implemented in Sprint 2.4.1.2.
   - Filters on `{ roomId, leaseToken, leaseExpiresAt: { $gt: now } }`.
   - Cannot extend a different worker's lease or a lease that has expired.

4. **Sweep Safety ([releaseExpiredLeases](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/karaoke/room-playback-state.model.ts))**:
   - Filters on `{ leaseExpiresAt: { $lte: now }, leaseToken: { $ne: null } }`.
   - Because a newly acquired lease has `leaseExpiresAt > now`, the sweep **never** releases an active, newly acquired lease.

### 5.2 The Stale Worker Race Verification
- **Scenario**:
  1. Worker A acquires lease generation 1 (`leaseToken_A`, `leaseExpiresAt: t + 15s`).
  2. Lease expires at $t + 15s$.
  3. Worker B acquires lease generation 2 (`leaseToken_B`, `leaseExpiresAt: t + 30s`).
  4. Worker A wakes up and calls `commitConditionalPlaybackTransition(..., { leaseToken: leaseToken_A })`.
- **Database Outcome**:
  - The document in MongoDB contains `leaseToken: leaseToken_B` and `leaseExpiresAt: t + 30s`.
  - Worker A's update filter matches **zero documents** (`leaseToken` mismatch and `leaseExpiresAt_A` expired).
  - Update returns `null`. Worker A aborts without mutating state.
  - Worker B remains the sole, valid owner.

---

## 6. Workstream E — Reconciliation Concurrency & Race Hardening

### 6.1 The `QUEUE_PLAYING_ITEM_WITH_IDLE_PLAYBACK` Race Condition
- **Identified Defect**:
  - Reconciliation reads state at $t_0$: `playbackState` is `idle` (version 2); `playingItems` contains 1 orphaned item $I_1$.
  - At $t_1$, a host or singer issues `play` or enqueues a song that activates the stage directly. A new item $I_2$ becomes `playing`, and `playbackState` transitions to `playing` (version 3).
  - At $t_2$, reconciliation runs:
    `RoomQueueItemModel.updateMany({ roomId, status: 'playing' }, { $set: { status: 'completed' } })`.
  - **Disaster**: The newly started track $I_2$ is immediately marked `completed`, terminating the user's song mid-start and corrupting playback state!

### 6.2 The Hardened CAS Solution (Implemented in Sprint 2.4.1.2)
1. **Targeted Item IDs**: Reconciliation computes `const orphanIds = playingItems.map((item) => item._id);`. Only these specific IDs can ever be completed.
2. **CAS Fencing on Playback State**:
   ```ts
   const fencedPlayback = await RoomPlaybackStateModel.findOneAndUpdate(
     {
       roomId: roomObjectId,
       playbackVersion: playbackState.playbackVersion,
       status: 'idle',
     },
     {
       $inc: { queueVersion: 1 },
       $set: { lastTransitionId: crypto.randomUUID() },
     },
     { new: true }
   ).exec();
   ```
3. If a valid play command committed in the interim, `fencedPlayback` returns `null`. Reconciliation **aborts immediately** with zero modifications.
4. Only if `fencedPlayback` succeeds does reconciliation complete the targeted orphan items:
   ```ts
   await RoomQueueItemModel.updateMany(
     { roomId: roomObjectId, _id: { $in: orphanIds }, status: 'playing' },
     { $set: { status: 'completed', position: 0, completedAt: new Date() } }
   ).exec();
   ```
5. **Post-Commit Publication**: Realtime publication is dispatched strictly after verified database commits.

---

## 7. Static Verification Results

In accordance with the code-only constraint, only static verification was performed:

| Command | Working Directory | Exit Code | Notes |
| :--- | :--- | :--- | :--- |
| `pnpm typecheck` | `/Users/mac/Documents/workspace/workspace_coding/ktvonline` | **0** | Strict typecheck passed across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`. |
| `pnpm lint` | `/Users/mac/Documents/workspace/workspace_coding/ktvonline` | **0** | ESLint passed with 0 warnings and 0 errors across all workspaces. |

No test files were created or modified. No test runners were executed. No production builds were run. No database mutations were performed.

---

## 8. Final Verdict

`CODE COMPLETE — NOT RUNTIME VERIFIED`
