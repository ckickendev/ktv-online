# Sprint 5.8 Phase 2A: Reliability Remediation & Staging Preparation
## Technical Report & Audit Deliverable

- **Sprint:** Sprint 5.8 — Phase 2A (Reliability Remediation & Staging Preparation)
- **Baseline Commit:** `4dfb23b` (`docs(readiness): complete Sprint 5.8 Phase 1 production readiness and runtime validation assessment`)
- **Target Branch:** `main`
- **Database Scope:** `test` (enforced via explicit configuration)
- **Status:** Complete
- **Final Verdict:** **`PHASE 2A COMPLETE — READY FOR STAGING PREPARATION`**

---

## 1. Executive Summary

Sprint 5.8 Phase 2A addresses the reliability defects and infrastructure inconsistencies identified during Phase 1:
1. **DEF-VOICE-01 Remediation:** Standardized canonical error code `VOICE_SERVICE_NOT_CONFIGURED` across the voice service, token service, and controller, ensuring missing LiveKit configuration returns HTTP 503 instead of falling through to an unhandled HTTP 500.
2. **MongoDB Database Target Enforcement:** Resolved the discrepancy between reported `test` database scope and legacy `ktv_online` URI defaults. Added explicit `MONGODB_DB_NAME` configuration in `env.ts` and passed `{ dbName: env.MONGODB_DB_NAME }` directly to `mongoose.connect()`, making database selection explicit and predictable while dynamically reporting the active database in `/api/v1/health`.
3. **Local MongoDB Replica Set Configuration:** Prepared an isolated, non-destructive `docker-compose.replica.yml` single-node Replica Set (`rs0`) configuration with self-initiating healthchecks and npm lifecycle scripts, preserving the existing standalone `docker-compose.yml` setup.
4. **Transaction Dependency Audit:** Cataloged all transactional entry points and CAS fallbacks across the platform.
5. **Graceful Shutdown Hardening:** Audited shutdown sequences, added `globalPresenceManager.clear()` to `closeSocketServer()` to clear pending disconnect timers, and verified 10-second bounded termination.
6. **LiveKit Staging Readiness:** Added fail-safe validation for partial LiveKit configurations and created an independent `/api/v1/health/voice` probe.

---

## 2. Task A: DEF-VOICE-01 Root Cause & Remediation

### Root Cause Analysis
During Sprint 5.8 Phase 1, an error code string mismatch was identified:
- `apps/api/src/modules/voice/voice.service.ts#L96` threw:
  `throw new Error('VOICE_NOT_CONFIGURED');`
- `apps/api/src/modules/voice/voice-token.service.ts#L14` threw:
  `throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured');`
- `apps/api/src/modules/voice/voice.controller.ts#L47` expected:
  `case 'VOICE_SERVICE_NOT_CONFIGURED':`
- `apps/web/src/features/voice/hooks/use-voice-client.ts#L41` handled:
  `if (errorMsg.includes('VOICE_SERVICE_NOT_CONFIGURED'))`

Because the service threw `'VOICE_NOT_CONFIGURED'`, `voice.controller.ts` failed to match the case, logged an unhandled error, and forwarded the error to Express `next(err)`, resulting in an HTTP 500 Internal Server Error instead of the intended HTTP 503 Service Unavailable.

### Remediation Applied
1. Standardized canonical error message to `'VOICE_SERVICE_NOT_CONFIGURED'` in:
   - `apps/api/src/modules/voice/voice.service.ts`
   - `apps/api/src/modules/voice/voice-token.service.ts`
2. Updated `apps/api/src/modules/voice/voice.controller.ts` to recognize both `'VOICE_SERVICE_NOT_CONFIGURED'` and `'VOICE_NOT_CONFIGURED'` (defense-in-depth alias), returning:
   ```json
   {
     "success": false,
     "error": {
       "code": "VOICE_SERVICE_NOT_CONFIGURED",
       "message": "Voice communication service is not currently configured on this server"
     }
   }
   ```
   with HTTP Status **503 Service Unavailable**.
3. Verified zero exposure of secrets, credentials, or internal stack traces in client responses.

---

## 3. Task B: MongoDB Database Target Policy & Configuration Matrix

### Problem Resolved
Phase 1 identified an inconsistency where the developer environment defaulted to `mongodb://127.0.0.1:27017/ktv_online` while sprint rules and audit checkpoints strictly required target database `test`.

### Policy & Implementation
1. **Explicit Database Configuration:**
   Added `MONGODB_DB_NAME: z.string().min(1).default('test')` in `apps/api/src/config/env.ts`.
2. **Explicit Connection Binding:**
   In `apps/api/src/database/connection.ts`:
   ```ts
   await mongoose.connect(env.MONGODB_URI, {
     dbName: env.MONGODB_DB_NAME,
     serverSelectionTimeoutMS: 3000,
     connectTimeoutMS: 5000,
   });
   ```
   Passing `dbName` guarantees that Mongoose targets the required database regardless of whether the URI path specifies a different database name.
3. **Dynamic Health Reporting:**
   Updated `apps/api/src/routes/health.routes.ts` so `/api/v1/health` reports the actual connected database name (`mongoose.connection.db?.databaseName || env.MONGODB_DB_NAME`) rather than a hardcoded string.
4. **Environment Default Updates:**
   Updated `apps/api/.env.example` and local `apps/api/.env` to default to `mongodb://127.0.0.1:27017/test` and `MONGODB_DB_NAME=test`.

### Database Configuration Matrix

| Environment | Intended Database Scope | Target Topology | Configuration Source | Invariant Enforcement |
| :--- | :---: | :--- | :--- | :--- |
| **Development** | `test` | Standalone or Replica Set | `apps/api/.env` (`MONGODB_DB_NAME=test`) | Standalone allowed with CAS fallback; explicit `dbName: 'test'` |
| **Test (CI/Automated)** | `test` | Standalone or In-Memory | Vitest / Memory Server | Auto-configured to `test`; isolated per run |
| **Staging** | `test` | Replica Set (`rs0`) | Staging Environment Config | `UnsupportedTopologyError` fail-closed if standalone |
| **Production** | `ktv_online` (or configured) | Replica Set / Atlas Cluster | Production Vault / Env | Mandatory Replica Set; strict multi-document ACID transactions |

---

## 4. Task C: Local MongoDB Replica Set Setup (`docker-compose.replica.yml`)

To allow developers and staging operators to test multi-document transactions locally without destroying or modifying their existing standalone setup, an isolated single-node replica set configuration was created.

### Architecture Highlights
- **File:** `docker-compose.replica.yml`
- **Container Name:** `ktv-mongodb-replica`
- **Image:** `mongo:7.0`
- **Command:** `["--replSet", "rs0", "--bind_ip_all"]`
- **Isolated Storage:** `mongodb_rs_data:/data/db` (completely isolated from standalone `mongodb_data`)
- **Self-Initiating Healthcheck:**
  ```yaml
  healthcheck:
    test:
      - "CMD"
      - "mongosh"
      - "--port"
      - "27017"
      - "--quiet"
      - "--eval"
      - "try { rs.status().ok } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27017' }] }).ok }"
    interval: 5s
    timeout: 5s
    retries: 10
    start_period: 5s
  ```
  Automatically executes `rs.initiate()` once on first boot and confirms healthy replica set status on subsequent health intervals.

### Operational Commands
Added root `package.json` convenience scripts:
```bash
# Start local Replica Set
pnpm docker:replica:up

# Check Replica Set logs & health
pnpm docker:replica:logs

# Stop local Replica Set (preserves data in mongodb_rs_data)
pnpm docker:replica:down
```

### Connection String for Staging-Like Local Testing:
```env
MONGODB_URI=mongodb://127.0.0.1:27017/test?replicaSet=rs0
MONGODB_DB_NAME=test
NODE_ENV=staging
```

---

## 5. Task D: Transaction Requirements & Dependency Audit

The platform services were audited to map all transactional requirements and CAS fallbacks:

| Domain / Operation | Transaction Required? | Models Involved | Fallback Behavior on Standalone | Data Inconsistency Risk if Fallback Fails |
| :--- | :---: | :--- | :--- | :--- |
| **Karaoke: Add Song to Queue** | Yes (in staging/prod) | `KaraokeRoomStateModel`, `SongQueueItemModel` | Best-effort sequential writes (`runInTransaction(null)`) | Low; queue item could exist without state pointer |
| **Karaoke: Reorder Queue** | **Mandatory** | `SongQueueItemModel` (multiple docs) | Disabled on standalone; returns `UNSUPPORTED_TOPOLOGY` | High if forced without Tx; fractional index collisions |
| **Karaoke: Advance Queue** | Yes (in staging/prod) | `KaraokeRoomStateModel`, `SongQueueItemModel`, `KaraokeHistoryModel` | Bounded CAS lease token with optimistic update | Medium; track advancement could duplicate if crashed |
| **Karaoke: Skip Song** | Yes (in staging/prod) | `KaraokeRoomStateModel`, `SongQueueItemModel` | Sequential CAS state transition | Low; lease token fencing prevents dual skips |
| **Karaoke: Reset / Clean Room** | Yes (in staging/prod) | `KaraokeRoomStateModel`, `SongQueueItemModel` | Sequential deletes and state reset | Low; orphan items cleaned by next room join |
| **Room Creation** | No | `RoomModel`, `RoomMembershipModel`, `KaraokeHistoryModel` | Sequential writes (`room.save()` -> `membership.create()`) | Low; room could exist without host if process dies |
| **Join Room (Capacity)** | No | `RoomModel`, `RoomMembershipModel` | Atomic CAS `$inc` with compensating rollback on failure | Low; rollback handles race conditions cleanly |
| **Host Transfer** | No | `RoomModel`, `RoomMembershipModel` | Atomic CAS `findOneAndUpdate` on room; sequential membership role updates | Medium; role lag until next state reconciliation |
| **Invitation Creation** | No | `RoomInvitationModel` | Atomic `create` with `updateMany` revocation | Low; accepted interleaving race (Sprint 5.7.3) |
| **Friend Request Accept** | No | `FriendshipModel` | Atomic CAS `findOneAndUpdate` with collision handling | None; atomic single-doc operation |

---

## 6. Task E: Graceful Shutdown Audit

### Sequence Verification
The shutdown lifecycle in `apps/api/src/server.ts` was audited against the 10 core shutdown criteria:

1. **Signal Interception:** Catches `SIGTERM` and `SIGINT`. Duplicate signals are ignored via `isShuttingDown` flag.
2. **Readiness Probe Invalidation:** Sets `setAppShuttingDown(true)`. `/health/ready` immediately responds with HTTP 503 (`Service is shutting down`), signaling ingress load balancers to stop routing new requests.
3. **Background Worker Halts:**
   - `voiceEvictionWorker.stop()`: Clears interval timer and waits up to 5s for in-flight eviction batch to finish.
   - `karaokePlaybackWorker.stop()`: Clears interval timer and purges all precision in-memory timers.
4. **Realtime Socket Drainage:**
   - Calls `closeSocketServer()`.
   - Clears `presenceManager` socket mappings.
   - **Hardening Added in Phase 2A:** Added `globalPresenceManager.clear()` to cancel all pending disconnect grace timers (`clearTimeout(pending.timer)`) and prevent dangling event loops.
   - Invokes `ioInstance.close()` to cleanly close engine transport.
5. **HTTP Server Closure:** Calls `server.close()`, stopping acceptance of new connections while in-flight requests finish.
6. **Persistence Disconnection:** `disconnectDatabase()` safely disconnects Mongoose from MongoDB.
7. **Bounded Forced Timeout:** Sets a 10-second `.unref()` timer (`setTimeout(() => process.exit(1), 10000)`) guaranteeing the process will terminate even if an asynchronous callback hangs.

---

## 7. Task F: LiveKit Staging Configuration Readiness

### Validation Rules in `apps/api/src/config/env.ts`
1. **Fail-Closed Staging / Production Rule:**
   When `NODE_ENV === 'production' || NODE_ENV === 'staging'`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are strictly required. Missing any credential throws an `Environment validation failed` startup error.
2. **Partial Configuration Prevention in Development:**
   Added validation ensuring that if *any* LiveKit variable is set, *all three* must be provided.
3. **Dedicated Voice Health Probe:**
   Added `GET /api/v1/health/voice`:
   - Returns **200 OK** (`{ "status": "configured", "configured": true }`) when all three credentials are present.
   - Returns **503 Service Unavailable** (`{ "status": "not_configured", "configured": false }`) when credentials are missing.
   - Enables operators to verify voice readiness independently of database health.

### Staging LiveKit Setup Instructions for Operators
When configuring a dedicated staging project:
1. Log in to [LiveKit Cloud](https://cloud.livekit.io) or your self-hosted LiveKit instance.
2. Create a dedicated project (e.g. `ktv-online-staging`).
3. Under Project Settings -> Keys, generate a dedicated API Key and Secret.
4. Export the credentials in the staging environment:
   ```env
   LIVEKIT_URL=wss://ktv-online-staging.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxxx
   LIVEKIT_API_SECRET=secxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. Verify configuration via `curl -i http://staging-api:5001/api/v1/health/voice`.

---

## 8. Summary of Changed Files

| File | Change Description |
| :--- | :--- |
| `apps/api/src/modules/voice/voice.service.ts` | Fixed `VOICE_SERVICE_NOT_CONFIGURED` error throw (DEF-VOICE-01). |
| `apps/api/src/modules/voice/voice-token.service.ts` | Aligned token service error throw with `VOICE_SERVICE_NOT_CONFIGURED`. |
| `apps/api/src/modules/voice/voice.controller.ts` | Handled `VOICE_NOT_CONFIGURED` as alias for `VOICE_SERVICE_NOT_CONFIGURED` (HTTP 503). |
| `apps/api/src/config/env.ts` | Added `MONGODB_DB_NAME: 'test'`, updated default URI to `test`, added partial LiveKit validation. |
| `apps/api/src/database/connection.ts` | Bound `dbName: env.MONGODB_DB_NAME`, enhanced connection log with target database name. |
| `apps/api/src/routes/health.routes.ts` | Reported dynamic connected database name in `/health`, added `/health/voice` probe. |
| `apps/api/src/realtime/socket.server.ts` | Added `globalPresenceManager.clear()` to shutdown sequence. |
| `apps/api/.env.example` | Updated default URI to `test`, added `MONGODB_DB_NAME`, added LiveKit descriptions. |
| `apps/api/.env` | Aligned local development target to `test` (`MONGODB_DB_NAME=test`). |
| `docker-compose.replica.yml` | Added isolated single-node MongoDB 7.0 Replica Set configuration with auto-init healthcheck. |
| `package.json` | Added `docker:replica:up`, `docker:replica:down`, and `docker:replica:logs` scripts. |
| `docs/DEVELOPMENT.md` | Updated database documentation and local replica set instructions. |

---

## 9. Static Verification Evidence

The changes were statically verified across all monorepo packages:

```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 1.1s
apps/api typecheck$ tsc --noEmit
apps/web typecheck$ tsc --noEmit
└─ Done in 2.5s
└─ Done in 2.8s
```

```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 796ms
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 1.8s
```

---

## 10. Outstanding Blockers for Phase 2B (Staging QA Execution)

Before executing the manual QA checklist in Phase 2B:
1. **Staging Replica Set Execution:** Start MongoDB using `pnpm docker:replica:up` or connect to staging replica set.
2. **Outbox TTL Migration Execution:** Run `npx tsx apps/api/src/database/migrations/reconcile-outbox-ttl-index.ts` against the staging database per `docs/SPRINT_4_3_OUTBOX_MIGRATION_RUNBOOK.md`.
3. **LiveKit Project Provisioning:** Populate staging `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in the staging environment.
4. **Daemon Launch:** Boot staging instances of `apps/api` (port 5001) and `apps/web` (port 3000).

---

## 11. Final Verdict

**`PHASE 2A COMPLETE — READY FOR STAGING PREPARATION`**
