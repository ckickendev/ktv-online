# KTVOnline — Sprint 4.4: Staging Evidence Inventory & Gap Assessment

## 1. Executive Purpose & Baseline

This document establishes the authoritative inventory of operational and staging evidence for **KTVOnline** following Sprint 4.3. In accordance with the Sprint 4.4 mission, this assessment is strictly **evidence-driven**: gates are evaluated solely against verifiable runtime logs, database outputs, and signed records.

### Repository Baseline
- **Git Branch:** `main`
- **Sprint 4.3 Baseline Commit:** `10e2026386ca60d73cfa2178599501501243dab1` (`10e2026`)
- **Target Database Name:** `test` (preserved, unmutated)
- **Monorepo Structure:** pnpm workspace (`@ktv/contracts`, `apps/api`, `apps/web`)

---

## 2. Evidence Inventory & Verification Matrix

The table below catalogs every piece of operational evidence requested by the Sprint 4.4 mandate, its status in the repository, and the identified evidence gap.

| Artifact / Evidence Item | Target Scope | Required Artifact / Log | Repository Status | Evidence Gap / Evaluation |
| :--- | :--- | :--- | :--- | :--- |
| **OP-MIG-01.1** | Outbox Migration | Pre-migration database backup archive | **MISSING** | No `mongodump` archive or checksum provided. |
| **OP-MIG-01.2** | Outbox Migration | Migration execution terminal log | **MISSING** | `reconcile-outbox-ttl-index.ts` has not been executed on staging or prod DB. |
| **OP-MIG-01.3** | Outbox Migration | Migration exit code / status | **MISSING** | No process exit status recorded. |
| **OP-MIG-01.4** | Outbox Migration | Pre-migration MongoDB index listing | **MISSING** | `db.roomstateoutboxes.getIndexes()` before execution is absent. |
| **OP-MIG-01.5** | Outbox Migration | Post-migration MongoDB index listing | **MISSING** | `db.roomstateoutboxes.getIndexes()` after execution is absent. |
| **OP-MIG-01.6** | Outbox Migration | Verification of `{ expiresAt: 1 }` TTL index | **MISSING** | No runtime proof of `expiresAt_1_ttl` exists in MongoDB. |
| **OP-MIG-01.7** | Outbox Migration | Confirmation of `expireAfterSeconds: 0` | **MISSING** | No index property specification output from live database. |
| **OP-MIG-01.8** | Outbox Migration | Absence of legacy `createdAt` TTL index | **MISSING** | No confirmation that unconditional `createdAt_1` was dropped. |
| **OP-MIG-01.9** | Outbox Migration | Application logs post-migration | **MISSING** | No backend stdout showing outbox publisher operating post-migration. |
| **OP-MIG-01.10** | Outbox Migration | Pending/failed outbox records intact | **MISSING** | No database query verifying `status: 'pending'` records survived. |
| **OP-QA-01** | Runtime QA | Completed `SPRINT_4_3_RELEASE_QA_CHECKLIST.md` | **UNEXECUTED** | All 24 test scenarios have blank actual results and empty status fields. |
| **GOV-01** | Governance | Empty Room Auto-Close Policy sign-off | **PENDING** | Policy options documented; Product Owner signature line is blank. |
| **GOV-02** | Governance | Abandoned Host Succession Policy sign-off | **PENDING** | Policy options documented; Product Owner signature line is blank. |
| **GOV-03** | Governance | Data Retention & Pruning Policy sign-off | **PENDING** | Retention audit documented; Product Owner signature line is blank. |
| **GOV-04** | Governance | Single-Instance Deployment Invariant | **SOURCE-VERIFIED** | Enforced as architectural constraint (`replicas: 1`); PO sign-off pending. |
| **STATIC-01** | Static Verification | TypeScript typecheck (`pnpm typecheck`) | **PASS** | 0 errors across `@ktv/contracts`, `apps/api`, `apps/web`. |
| **STATIC-02** | Static Verification | ESLint code quality (`pnpm lint`) | **PASS** | 0 errors, 0 warnings across all workspaces. |
| **SOURCE-01** | Code Quality | Source-level integration defect resolution | **PASS** | `INT-01`, `INT-02A`, `INT-03`, `INT-06`, `INT-08` verified in source. |

---

## 3. Detailed Audit of Runtime QA Checklist (`OP-QA-01`)

An audit of `docs/SPRINT_4_3_RELEASE_QA_CHECKLIST.md` confirms that no interactive testing evidence has been entered into the repository:

| Test Area | Scenario ID | Scenario Name | Actual Result Field | Status Field | Operator Signature | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Room Lifecycle** | `QA-ROOM-01` | Normal Room Creation & Closure | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-02` | Multi-Tab Presence Isolation | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-03` | Explicit Room Leave | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-04` | Abrupt Socket Disconnect & Grace Window | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-05` | Reconnection Within Grace Window | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-06` | Grace Period Expiration & Host Succession | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-07` | Explicit Host Transfer | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-08` | Heartbeat Ping/Pong & Zombie Eviction | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-ROOM-09` | Capacity Enforcement (Room Full) | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| **Voice & Audio** | `QA-VOICE-01` | Listen-Only Audience Token Enforcement | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-VOICE-02` | Singer Mic Activation & Token Upgrade | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-VOICE-03` | Host Voice Moderation (Force Mute) | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-VOICE-04` | WebRTC Reconnect on Network Glitch | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-VOICE-05` | Audio Track Unpublish on Track Finish | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-VOICE-06` | Multi-User Voice Concurrency & Quality | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| **Karaoke Playback**| `QA-KARAOKE-01`| Song Queueing & Search | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-KARAOKE-02`| Playback Start & Audio Interpolation | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-KARAOKE-03`| Automatic Song Completion Transition | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-KARAOKE-04`| Host Skip & Queue Reordering | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-KARAOKE-05`| Singer Handoff & Auto Mic Revocation | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| **Security & Auth** | `QA-SEC-01` | Unauthorized Host Action Rejection | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-SEC-02` | Participant Kick & Socket Disconnection | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-SEC-03` | JWT Expiration & Re-authentication | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-SEC-04` | Cross-Room Audio & Socket Leakage | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| **Database Outbox** | `QA-DB-01` | Broadcast Outbox Event Expiration | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-DB-02` | Pending / Failed Event Retention | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |
| | `QA-DB-03` | Post-Migration TTL Index Verification | Empty (`[ ]`) | `[ ] Pass [ ] Fail [ ] Blocked` | None | **NOT VERIFIED** |

---

## 4. Technical Domain Evidence Classification

In strict compliance with the mandate that **source inspection must never be equated to runtime proof**, each architectural domain is classified below across its verification tiers:

| Architectural Domain | Source Code Verification | Static Verification (TSC/Lint) | Staging Runtime Verification | Production Verification | Current State |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. Room Lifecycle & Presence** | **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Code correct; needs live multi-client testing. |
| **2. Disconnect Grace Period** | **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Timer logic sound; network glitch behavior unproven. |
| **3. Host Transfer & Auth** | **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Service guards sound; UI role transfer unproven. |
| **4. LiveKit Listen-Only Perms** | **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Token claims hardened; SFU audio publish unproven. |
| **5. Playback Sync & Recovery** | **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | 1s lease loop sound; client drift unproven. |
| **6. Outbox Lifecycle & Retention**| **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Model schema sound; migration unexecuted on live DB. |
| **7. Authentication & Moderation**| **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Guards sound; multi-user moderation unproven. |
| **8. Deployment Configuration** | **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Zod validation sound; staging env unbootstrapped. |
| **9. Single-Instance Constraints**| **VERIFIED** | **PASSED** | **NOT VERIFIED** | **NOT VERIFIED** | Architecture invariant enforced (`replicas: 1`). |

---

## 5. Missing Evidence Action Register

To unblock the release gates, the designated human operators must execute the following procedures and commit the resulting artifacts:

1. **For `OP-MIG-01` (DevOps Operator):**
   - Execute MongoDB backup:
     ```bash
     mongodump --uri="$MONGODB_URI" --archive="ktv_backup_pre_outbox_$(date +%Y%m%d%H%M%S).archive" --gzip
     ```
   - Execute migration script:
     ```bash
     npx tsx src/database/migrations/reconcile-outbox-ttl-index.ts
     ```
   - Capture before and after index definitions:
     ```javascript
     db.roomstateoutboxes.getIndexes()
     ```
   - Document output in `docs/evidence/outbox_migration_staging.log`.

2. **For `OP-QA-01` (QA Team):**
   - Deploy backend, frontend, and LiveKit SFU on staging cluster.
   - Execute all 24 scenarios in `docs/SPRINT_4_3_RELEASE_QA_CHECKLIST.md` using two physical devices and multi-tab browser sessions.
   - Record actual results, timestamps, and pass/fail verdicts directly into the checklist file.

3. **For `GOV-01–03` (Product Owner):**
   - Review proposed options in `docs/SPRINT_4_3_GOVERNANCE_DECISIONS.md`.
   - Provide explicit written approval / signature for room expiration, host succession, and data retention policies.
