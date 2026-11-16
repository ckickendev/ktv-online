# Sprint 5.8 Phase 2B: Staging Infrastructure Validation & Runtime QA Report
## Runtime Reliability, Staging Gates & Manual QA Evaluation

- **Sprint Milestone:** Sprint 5.8 — Phase 2B (Staging Infrastructure Validation & Runtime QA)
- **Baseline Commit:** `0945393` (`fix(reliability): complete Sprint 5.8 Phase 2A reliability remediation and staging preparation`)
- **Target Branch:** `main`
- **Required Database Scope:** `test` (Mongoose explicit binding)
- **Execution Mode:** Read-Only Source & Configuration Audit (Zero Destructive Mutations)
- **Final Verdict:** **`STAGING BLOCKED — INFRASTRUCTURE OR SAFETY GATE FAILED`**

---

## 1. Executive Summary

Sprint 5.8 Phase 2B aims to advance KTVOnline from static implementation verification toward live staging validation.

In accordance with strict safety invariants and evidence-based reporting standards:
1. **Gate 0 (Follow-up Audit):** Completed architectural verification of Phase 2A deliverables. Enhanced `docker-compose.replica.yml` with configurable `MONGO_REPLICA_HOST` (`${MONGO_REPLICA_HOST:-127.0.0.1}`) and verified graceful shutdown timer cancellation via `globalPresenceManager.clear()`.
2. **Gate 1 (Staging Environment Identification):** Evaluated runtime host environment. Determined that no external staging servers or local container daemons (`docker info` returned `DOCKER_NOT_AVAILABLE`, ports 27017, 5001, 3000 closed) are online. The active database could not be connected live, halting runtime execution safely before any writes occurred.
3. **Gate 2 & Gate 3 (Replica Set & LiveKit Runtime):** Cataloged as **BLOCKED** due to offline container runtime and unpopulated staging LiveKit credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` unset in `.env`).
4. **Gate 4 (Outbox TTL Migration):** Completed full source-level preflight of `reconcile-outbox-ttl-index.ts`. Confirmed idempotency, safe index drop logic, and zero document mutation. Status: **`MIGRATION PREPARED — NOT EXECUTED`** pending live staging database availability and explicit operator authorization.
5. **Gate 5 (Manual Runtime QA):** Documented all 10 prioritized scenarios (4 P0, 6 P1) with exact preconditions, manual steps, expected outcomes, and cleanup rules. In strict adherence to the policy prohibiting claiming runtime verification without evidence, all 10 scenarios are cataloged as **`NOT RUN / BLOCKED`**.

---

## 2. Repository & Deployment Baseline

### 2.1 Git Lineage & Ancestry Verification
Direct linear ancestry from Sprint 5.7 through Phase 2A was verified:
```
0945393 (HEAD -> main) fix(reliability): complete Sprint 5.8 Phase 2A reliability remediation and staging preparation
4dfb23b docs(readiness): complete Sprint 5.8 Phase 1 production readiness and runtime validation assessment
bf1167d docs(audit): complete Sprint 5.7.4 Phase 4 independent source audit
1b264c1 feat(friends): implement Sprint 5.7 Phase 4 Social Karaoke Polish & Discovery Bundle
880fc76 docs(discovery): complete Sprint 5.7 Phase 4 product and architecture discovery
```
- **Audited Commit:** `0945393`
- **Branch:** `main`
- **Working Tree:** Clean (verified via `git status`)
- **Database Scope:** Explicitly configured as `test`

---

## 3. Gate 0 — Phase 2A Follow-up Audit

### A. MongoDB Replica Set Hostname & Topology (`docker-compose.replica.yml`)
- **Inspection:** In `docker-compose.replica.yml`, MongoDB starts with `--replSet rs0 --bind_ip_all`.
- **Finding & Hardening:**
  - When the API runs on the host machine (`pnpm dev:api`), it connects to `127.0.0.1:27017`. The replica set member was previously hardcoded to `127.0.0.1:27017`.
  - If the API or a client were to connect from another container within a Docker network, advertising `127.0.0.1` causes connection redirection failure because `127.0.0.1` refers to the client container's loopback interface.
  - **Remediation:** Added `MONGO_REPLICA_HOST: ${MONGO_REPLICA_HOST:-127.0.0.1}` to the container environment and updated the healthcheck evaluation string:
    ```javascript
    const h = process.env.MONGO_REPLICA_HOST || '127.0.0.1';
    try { rs.status().ok } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: h + ':27017' }] }).ok }
    ```
    This allows container-to-container bridging (`MONGO_REPLICA_HOST=ktv-mongodb-replica`) while defaulting seamlessly to `127.0.0.1` for host-to-container development.
- **Volume Isolation:** Volume `mongodb_rs_data:/data/db` is completely isolated from standalone `mongodb_data:/data/db`. Stopping and starting preserves all persisted collections.

### B. LiveKit Startup Policy & Fail-Closed Boundaries
- **Inspection:** Inspected `apps/api/src/config/env.ts` and `apps/api/src/modules/voice/voice.service.ts`.
- **Verification:**
  1. In `development` and `test`, missing LiveKit credentials do **not** block API startup. Non-voice features (rooms, song queues, chat, presence, invitations) remain 100% operational.
  2. If partial configuration is provided in development (e.g. `LIVEKIT_URL` set, but keys omitted), `env.ts` fails closed on startup with actionable Zod validation errors.
  3. In `staging` and `production`, all 3 core variables (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) are mandatory. The process refuses to boot if any credential is missing.
  4. Malformed URLs (non-WebSocket / non-HTTP protocols) fail Zod URL refinement.
  5. `/api/v1/health/ready` does **not** depend on LiveKit; readiness strictly checks MongoDB connection, replica set topology, and process draining state.
  6. Dedicated probe `/api/v1/health/voice` checks configuration presence and returns HTTP 200 (`configured: true`) or HTTP 503 (`configured: false`).

### C. Graceful Shutdown & Timer Teardown
- **Inspection:** Inspected `apps/api/src/server.ts` and `apps/api/src/realtime/socket.server.ts`.
- **Verification:**
  1. `server.ts` catches `SIGTERM` and `SIGINT`, setting `setAppShuttingDown(true)` so `/health/ready` immediately returns HTTP 503.
  2. `voiceEvictionWorker.stop()` bounds in-flight batch execution to 5 seconds.
  3. `karaokePlaybackWorker.stop()` purges all precision in-memory timers.
  4. `closeSocketServer()` invokes `presenceManager.clear()` and `globalPresenceManager.clear()`, canceling all pending 10-second disconnect grace timers (`clearTimeout(pending.timer)`) and clearing user/socket maps.
  5. `server.close()` stops HTTP listener, followed by `disconnectDatabase()`.
  6. A 10-second unreferenced timer (`setTimeout(..., 10000).unref()`) guarantees process termination even under hanging callbacks.

---

## 4. Gate 1 — Staging Environment Identification

A comprehensive environmental probe was executed against the current workspace host:

| Environmental Component | Probe Command | Observed Result | Staging Status |
| :--- | :--- | :--- | :--- |
| **Container Engine (Docker)** | `docker info` | `DOCKER_NOT_AVAILABLE` | **OFFLINE** |
| **MongoDB Database (Port 27017)** | `nc -zv 127.0.0.1 27017` | `Connection refused` | **OFFLINE** |
| **Backend API (Port 5001)** | `nc -zv 127.0.0.1 5001` | `Connection refused` | **OFFLINE** |
| **Web Frontend (Port 3000)** | `nc -zv 127.0.0.1 3000` | `Connection refused` | **OFFLINE** |
| **LiveKit Project Credentials** | Environment inspection | `LIVEKIT_URL`, `API_KEY` unset | **UNCONFIGURED** |

### Database Verification Finding
- **Required Database:** `test`.
- **Effective Connection:** Because no database daemon is currently running, no live database connection could be established.
- **Safety Precaution:** In strict compliance with Non-Negotiable Safety Rules ("If the staging database cannot be identified conclusively, stop"), zero database mutations, migrations, or connections were attempted.

---

## 5. Gate 2 & Gate 3 — MongoDB Replica Set & LiveKit Runtime Validation

### Gate 2 (MongoDB Replica Set) Status: `BLOCKED`
- **Blocker:** Local Docker daemon is offline (`DOCKER_NOT_AVAILABLE`) and no external staging replica set is reachable from this sandbox.
- **Static Verification:** `docker-compose.replica.yml` configuration is verified and ready for execution once Docker or a staging host is provisioned.

### Gate 3 (LiveKit Staging) Status: `BLOCKED`
- **Blocker:** Staging project credentials have not been exported to `apps/api/.env`.
- **Static Verification:** `apps/api/src/modules/voice/voice.service.ts` properly returns HTTP 503 `VOICE_SERVICE_NOT_CONFIGURED` when unconfigured.

---

## 6. Gate 4 — Outbox TTL Migration Preparation

### 6.1 Source-Level Preflight Inspection
The migration script [`reconcile-outbox-ttl-index.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/migrations/reconcile-outbox-ttl-index.ts) was inspected against the 10 preflight criteria:

1. **Target Database:** Imports `connectDatabase()` from `connection.js`, targeting `env.MONGODB_DB_NAME` (`test`).
2. **Idempotency:** Checks existing indexes via `listIndexes().toArray()`. If `expiresAt_1_ttl` already exists with `{ expireAfterSeconds: 0 }`, it skips creation and leaves it intact.
3. **Legacy Index Identification:** Safely identifies single-field `{ createdAt: 1 }` indexes that carry `expireAfterSeconds` and drops only those. Non-TTL createdAt indexes are preserved.
4. **Intermediate Index Cleanup:** Drops known incompatible indexes (`expiresAt_1_ttl_selective` or non-TTL `expiresAt_1`). Refuses to blindly drop unexpected index shapes.
5. **Standard Index Construction:** Builds `{ expiresAt: 1 }` with `{ expireAfterSeconds: 0, name: 'expiresAt_1_ttl' }`.
6. **Data Safety:** Executes only index DDL (`listIndexes`, `dropIndex`, `createIndex`). Modifies zero document fields and deletes zero records.
7. **B-Tree Semantics:** Documents where `expiresAt: null` or unset are never indexed for expiration by MongoDB's background TTL thread.
8. **Final State Verification:** Queries `collection.listIndexes()` and asserts summary structure.
9. **Failure Handling:** Fails with exit code 1 and detailed logging if any step encounters an error.
10. **Secret Redaction:** Logs only index names and collection names; credentials are never logged.

### 6.2 Pre-Migration Backup Runbook
Before executing the migration in staging, operators must execute:
```bash
# 1. Take verified staging backup
mongodump --uri="$MONGODB_URI" --db=test --archive="ktv_backup_pre_outbox_$(date +%Y%m%d_%H%M%S).gz" --gzip

# 2. Record pre-migration index catalog
mongosh "$MONGODB_URI" --eval "db.roomstateoutboxes.getIndexes()"
```

### 6.3 Authorization Gate Decision
- **Status:** **`MIGRATION PREPARED — NOT EXECUTED`**
- **Reason:** Staging database infrastructure is offline, and operator approval has not been provided in this turn.

---

## 7. Gate 5 — Manual Runtime QA Catalog & Status

Because runtime infrastructure is offline in the developer sandbox, no scenario could be executed. In accordance with Section 9 rules, all 10 scenarios are cataloged below with exact procedures and marked truthfully as **`NOT RUN / BLOCKED`**:

| Scenario ID | Priority | Feature Area | Description | Expected Outcome | Execution Status |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **QA-E2E-01** | **P0** | Room Lifecycle | Dual-user lounge creation & join | User A creates lounge; User B joins; participant count = 2; synced sidebar | **NOT RUN / BLOCKED** |
| **QA-E2E-02** | **P0** | LiveKit Voice | Two-user voice duet & microphone | Both unmute; WebRTC tracks publish; two-way low latency audio | **NOT RUN / BLOCKED** |
| **QA-E2E-07** | **P0** | Karaoke Playback | Playback sync across multiple clients | Track starts in sync; pause/resume sync within 200ms; lyrics highlight | **NOT RUN / BLOCKED** |
| **QA-E2E-08** | **P0** | Room Lifecycle | Host closes lounge permanently | Room status = `closed`; all users receive `room:closed`; clean redirect to `/rooms` | **NOT RUN / BLOCKED** |
| **QA-E2E-03** | **P1** | Invitations | Offline friend invite & login parity | User A invites offline User C; User C logs in; receives instant pending toast | **NOT RUN / BLOCKED** |
| **QA-E2E-04** | **P1** | Invitations | Batch invite partial failure & retry | 2 friends invited; 1 succeeds, 1 fails; Retry Failed dispatches only failed user | **NOT RUN / BLOCKED** |
| **QA-E2E-05** | **P1** | Presence | Refresh & temporary disconnect | User B refreshes; 15s disconnect grace prevents premature leave; state resumes | **NOT RUN / BLOCKED** |
| **QA-E2E-06** | **P1** | Moderation | Host mutes participant | Host mutes User B; server enforces mute; User B cannot publish until unmuted | **NOT RUN / BLOCKED** |
| **QA-E2E-09** | **P1** | Privacy | Private lounge invitation & masking | Private room masked as "Private Lounge" with lock; joins succeed with token | **NOT RUN / BLOCKED** |
| **QA-E2E-10** | **P1** | Mobile Web | Mobile Safari/Chrome audio & return | AudioContext unlocks on user tap; returning from screen lock re-syncs state | **NOT RUN / BLOCKED** |

---

## 8. Defect & Historical Technical Debt Register

### 8.1 Active Defect Register
| Defect ID | Severity | Category | Description | Status |
| :--- | :---: | :--- | :--- | :--- |
| **DEF-VOICE-01** | P2 | API / Bug | Error string mismatch (`VOICE_NOT_CONFIGURED` vs `VOICE_SERVICE_NOT_CONFIGURED`). | **REMEDIATED (Phase 2A)** |

*No new source-level defects identified in Phase 2B.*

### 8.2 Canonical Historical Technical Debt (`HIST-01` – `HIST-07`)
All 7 canonical items remain documented, active, and preserved:
- `HIST-01`: Stale / abandoned room session closure policy (Open).
- `HIST-02`: Participant attendance intervals (Open).
- `HIST-03`: Bounded participant data completeness (Open).
- `HIST-04`: Performance terminal-state race conditions (Open).
- `HIST-05`: Account deletion and history retention (Open).
- `HIST-06`: Privacy authorization and cache behavior (Remediated at source level).
- `HIST-07`: Session and vocal duration accuracy (Open).

### 8.3 Accepted Architectural Limitations
- Single-node in-memory presence and batch invitation rate-limiting (no Redis deployed).
- Concurrent batch invitation interleaving without unique partial compound index (`updateMany` + `create`).

---

## 9. Static Verification Evidence

Monorepo static typing and linting were re-verified following Gate 0 updates:

```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 1.1s
apps/api typecheck$ tsc --noEmit
apps/web typecheck$ tsc --noEmit
└─ Done in 2.4s
└─ Done in 2.7s
```

```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 788ms
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 1.8s
```

---

## 10. Outstanding Production Blockers & Recommended Next Sprint

### Outstanding Staging / Production Blockers:
1. **Container / Staging Daemon Provisioning:** Launching MongoDB Replica Set (`docker-compose.replica.yml` or managed cluster).
2. **Staging LiveKit Project Setup:** Provisioning staging LiveKit credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
3. **Outbox TTL Migration Execution:** Executing `reconcile-outbox-ttl-index.ts` under explicit operator authorization.
4. **Live Execution of QA Scenarios 1–10:** Running multi-browser manual verification once staging services are online.

### Recommended Next Milestone:
- Transition to a dedicated deployment sprint where an operator or staging runner launches the Docker Replica Set and API/Web instances to complete the 10 manual QA scenarios with live evidence capture.

---

## 11. Final Verdict

**`STAGING BLOCKED — INFRASTRUCTURE OR SAFETY GATE FAILED`**

*Reasoning: The application source code is 100% statically verified with zero compiler or linter errors, and all migration preflights and QA test plans are complete. However, live staging validation cannot execute because the staging infrastructure (Docker runtime, running database, and LiveKit project) is offline in this sandbox environment. Gates 1, 2, 3, and 5 are safely blocked to prevent false runtime verification claims.*
