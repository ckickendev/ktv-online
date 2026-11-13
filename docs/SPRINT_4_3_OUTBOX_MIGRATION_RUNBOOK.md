# KTVOnline — Sprint 4.3: Outbox TTL Index Migration Runbook

## 1. Overview & Purpose

This operational runbook provides the exact, verified deployment procedure for executing the Outbox TTL Index Migration on the `roomstateoutboxes` collection in MongoDB.

### 1.1 Objective & Data-Safety Impact
- **Problem Remediated:** Legacy schema versions established an unconditional TTL index on `{ createdAt: 1 }` with a 7-day expiration. Under high retry latency or network partitions, MongoDB's background TTL thread could delete pending or failed outbox records before they were published to clients.
- **Remediation Contract:** Replaces the legacy index with a standard single-field TTL index on `{ expiresAt: 1 }` with `expireAfterSeconds: 0` and name `expiresAt_1_ttl`.
- **Zero Data Loss Guarantee:** MongoDB natively skips indexing documents where `expiresAt` is `null` or missing. Pending events (`publishedAt === null`) and failed events maintain `expiresAt: null` and are **never deleted**. Only successfully published events receive an explicit `expiresAt = publishedAt + 7 days`.
- **Migration Scope:** The migration script **only inspects and drops/creates collection indexes**. It does **NOT** delete, update, or mutate any document records in the database.

> [!CRITICAL]
> In accordance with the Code-Only Development Policy, this migration has **NOT been executed** during development. Actual production database index state remains unverified until an authorized operator runs this runbook against the staging and production clusters.

---

## 2. Preconditions & Access Requirements

Before executing the migration:

1. **Operator Privileges:** The database connection user must hold `readWrite` and `dbAdmin` privileges (required for `listIndexes`, `createIndex`, and `dropIndex` operations on `roomstateoutboxes`).
2. **Database Target:** Verify the target database name in the connection string matches the target environment (e.g. `test` or production name).
3. **Environment Isolation:** Execute in a staging environment and verify before applying to production.
4. **Maintenance Window:** Recommended during low-traffic periods, although MongoDB index creation and deletion on `roomstateoutboxes` is non-blocking in MongoDB 4.4+.

---

## 3. Database Backup Procedure

Prior to executing any index migration, perform a full point-in-time snapshot or dump of the target database:

```bash
# Set MONGODB_URI environment variable
export MONGODB_URI="mongodb://username:password@cluster-host:27017/database_name?authSource=admin"

# Execute mongodump archive
mongodump --uri="$MONGODB_URI" --archive="ktv_backup_pre_outbox_migration_$(date +%Y%m%d_%H%M%S).gz" --gzip
```

Verify archive size and integrity:
```bash
ls -lh ktv_backup_pre_outbox_migration_*.gz
```

---

## 4. Staging Pre-Verification (`mongosh`)

Connect to the MongoDB cluster via `mongosh` to inspect current indexes:

```javascript
// Switch to target database
use test; // or production database name

// List existing indexes on roomstateoutboxes
db.roomstateoutboxes.getIndexes();
```

### Analysis of Expected Pre-Migration State
You may observe one of the following states:
- **Legacy State (Sprint 2.2–3.10):**
  - `{ createdAt: 1 }` with `expireAfterSeconds: 604800` (7 days).
- **Intermediate State (Sprint 4.0 Phase 3 / 3.1):**
  - `{ expiresAt: 1 }` with name `expiresAt_1` (non-TTL) or `expiresAt_1_ttl_selective` (unsupported partial filter).
- **Clean State:**
  - Standard indexes only (`_id_`, `roomId_1_version_1`, `status_1_scheduledFor_1`).

The migration script safely handles all recognized intermediate variants. If an unrecognized index on `expiresAt` exists, the script safely aborts without dropping anything.

---

## 5. Execution Procedure

The migration entry point is implemented in [`apps/api/src/database/migrations/reconcile-outbox-ttl-index.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/database/migrations/reconcile-outbox-ttl-index.ts).

### 5.1 Execution via TypeScript CLI (`tsx`)

From the repository root on the deployment server:

```bash
cd apps/api

# Ensure environment variables are loaded or provide inline
MONGODB_URI="$MONGODB_URI" npx tsx src/database/migrations/reconcile-outbox-ttl-index.ts
```

### 5.2 Execution in Compiled Production Container (`dist`)

If deploying inside a pre-built production container:

```bash
cd apps/api
node dist/database/migrations/reconcile-outbox-ttl-index.js
```

### 5.3 Expected Console Output
```text
{"level":30,"time":"2026-11-14T00:00:00.000Z","msg":"Connecting to MongoDB at mongodb://..."}
{"level":30,"time":"2026-11-14T00:00:00.100Z","collectionName":"roomstateoutboxes","msg":"🔍 Inspecting indexes on collection"}
{"level":30,"time":"2026-11-14T00:00:00.150Z","indexName":"createdAt_1","expireAfterSeconds":604800,"msg":"🗑️ Identified legacy unconditional createdAt TTL index. Dropping..."}
{"level":30,"time":"2026-11-14T00:00:00.200Z","indexName":"createdAt_1","msg":"✅ Successfully dropped legacy createdAt TTL index"}
{"level":30,"time":"2026-11-14T00:00:00.250Z","msg":"🛠️ Building standard single-field TTL index on { expiresAt: 1 } (expireAfterSeconds: 0)..."}
{"level":30,"time":"2026-11-14T00:00:00.300Z","msg":"✅ Successfully created standard expiresAt TTL index (expiresAt_1_ttl)"}
{"level":30,"time":"2026-11-14T00:00:00.350Z","msg":"🏁 Outbox TTL index reconciliation completed successfully"}
{"level":30,"time":"2026-11-14T00:00:00.400Z","msg":"Migration completed"}
```

---

## 6. Post-Migration Verification (`mongosh`)

Execute in `mongosh` immediately after the migration command completes:

```javascript
use test; // or production database name

// Fetch and format index specifications
db.roomstateoutboxes.getIndexes().forEach(idx => {
  printjson({
    name: idx.name,
    key: idx.key,
    unique: idx.unique || false,
    expireAfterSeconds: idx.expireAfterSeconds !== undefined ? idx.expireAfterSeconds : null
  });
});
```

### Required Verification Checklist:
- [ ] Index `createdAt_1` with `expireAfterSeconds` is **ABSENT**.
- [ ] Index `expiresAt_1_ttl` is **PRESENT** with `key: { expiresAt: 1 }` and `expireAfterSeconds: 0`.
- [ ] Unique index `roomId_1_version_1` is **PRESENT** with `unique: true`.
- [ ] Secondary index `publishedAt_1_createdAt_1` is **PRESENT**.
- [ ] Primary key index `_id_` is **PRESENT**.
- [ ] Total index count on `roomstateoutboxes` is exactly **4**.

---

## 7. Production Deployment Sequence

To prevent race conditions between old backend code and new index definitions, follow this deployment sequence:

```mermaid
flowchart TD
    Step1[1. Take Full MongoDB Backup] --> Step2[2. Deploy New Backend API Code]
    Step2 --> Step3[3. Run reconcile-outbox-ttl-index.ts]
    Step3 --> Step4[4. Verify getIndexes Output in mongosh]
    Step4 --> Step5[5. Deploy Frontend Web Code]
    Step5 --> Step6[6. Monitor Outbox Count & API Health]
```

1. **Pre-Deployment Backup:** Complete `mongodump`.
2. **Deploy Backend API Pods / Services:** Deploy backend code containing the updated `outbox.model.ts` and `room-state.publisher.ts`.
3. **Execute Migration Script:** Run `npx tsx src/database/migrations/reconcile-outbox-ttl-index.ts`.
4. **Verify Database Indexes:** Verify via `mongosh` as detailed in Section 6.
5. **Deploy Frontend Web Pods:** Deploy Next.js frontend code.
6. **Post-Deployment Health Checks:** Validate `GET /api/v1/health` returns `200 OK`.

---

## 8. Rollback & Emergency Recovery

If unexpected errors occur during the migration:

### 8.1 Reverting Indexes
If index creation fails or causes database performance degradation, the standard `expiresAt_1_ttl` index can be dropped manually in `mongosh`:

```javascript
use test;
db.roomstateoutboxes.dropIndex("expiresAt_1_ttl");
```
*Note: Dropping the TTL index stops automatic expiration of delivered events, but will NOT interrupt application traffic or cause event loss.*

### 8.2 Database Restore
If data corruption occurred (unrelated to index migration):
```bash
mongorestore --uri="$MONGODB_URI" --archive="ktv_backup_pre_outbox_migration_YYYYMMDD_HHMMSS.gz" --gzip --drop
```

---

## 9. Failure Handling & Troubleshooting

| Symptom | Root Cause | Operator Action |
| :--- | :--- | :--- |
| `Database connection failed` | Network partition, invalid `MONGODB_URI`, or bad credentials | Verify network route and credentials using `mongosh "$MONGODB_URI"`. |
| `Unexpected index detected on expiresAt` | A custom index was created manually with unexpected options | The script safely aborts. Inspect `db.roomstateoutboxes.getIndexes()`, drop the rogue index manually, and rerun script. |
| Migration script hangs | Long-running transaction holding metadata lock | Check current database operations with `db.currentOp()`; kill blocking locks if safe. |
| Events not expiring after 7 days | TTL thread runs every 60 seconds; check date timestamps | Verify `expiresAt` contains a valid BSON Date (`type 9`) and `now >= expiresAt`. |
