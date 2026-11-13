# KTVOnline — Sprint 4.4: Release Gate Register

## 1. Release Gate Classification Framework

Every release gate in the KTVOnline deployment pipeline is formally evaluated and assigned one of four standard statuses based on verifiable operational evidence:

- **PASS:** Sufficient, verifiable evidence confirms the condition has been met in full.
- **BLOCKED:** A mandatory release condition is not satisfied; deployment cannot proceed.
- **CONDITIONAL:** An approved exception with a documented risk mitigation plan and designated risk owner.
- **NOT VERIFIED:** Evidence is missing, incomplete, or inconclusive.

---

## 2. Master Release Gate Status Matrix

| Gate ID | Gate Name | Mandate & Criteria | Gate Owner | Required Evidence Artifact | Current Status | Unblocking Action Required |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **OP-MIG-01** | Outbox TTL Index Migration | Staging/prod DB migrated to single-field `{ expiresAt: 1 }` TTL; legacy index absent | DevOps / Database Lead | `mongosh` index dump & migration execution logs | **BLOCKED** | Execute `reconcile-outbox-ttl-index.ts` runbook and record terminal logs. |
| **OP-QA-01** | Interactive Manual Runtime QA | All 24 test scenarios in Release QA Checklist executed & passed across 2+ devices | QA Lead | Completed & signed `SPRINT_4_3_RELEASE_QA_CHECKLIST.md` | **BLOCKED** | Deploy staging cluster and execute 24 manual verification scenarios. |
| **GOV-01** | Empty Room Auto-Close Policy | Policy choice selected & approved by Product Management | Product Owner | Signed `SPRINT_4_3_GOVERNANCE_DECISIONS.md` | **CONDITIONAL** | PO selects preferred option (Option B recommended) and signs register. |
| **GOV-02** | Abandoned Host Succession Policy | Policy choice selected & approved by Product Management | Product Owner | Signed `SPRINT_4_3_GOVERNANCE_DECISIONS.md` | **CONDITIONAL** | PO selects preferred option (Option B recommended) and signs register. |
| **GOV-03** | Data Retention & Pruning Policy | Chat, activity, and queue retention periods approved | Product Owner | Signed `SPRINT_4_3_GOVERNANCE_DECISIONS.md` | **CONDITIONAL** | PO approves 30-day chat, 7-day activity, and queue retention policies. |
| **GOV-04** | Single-Instance Deployment Invariant | Backend API container must be strictly deployed with `replicas: 1` | Cloud DevOps Lead | Container orchestration manifest / deployment spec | **PASS** | Verify `replicas: 1` in production ECS task / Kubernetes deployment spec. |
| **STATIC-01** | Static Code Validation | TypeScript typecheck and ESLint pass with 0 errors across workspace | Engineering Team | Terminal output of `pnpm typecheck` and `pnpm lint` | **PASS** | Maintained across all commits; verified in Sprint 4.4. |
| **SOURCE-01** | Source Integration Integrity | Zero open P0/P1 static integration defects in application code | Tech Lead | Integration audit & closed issue references (`INT-01`–`INT-08`) | **PASS** | Source code verified; zero static architectural defects remaining. |

---

## 3. Detailed Gate Analysis & Unblocking Criteria

### Gate 1: OP-MIG-01 — Outbox TTL Index Migration
- **Status:** **BLOCKED**
- **Justification:** While the script `apps/api/src/database/migrations/reconcile-outbox-ttl-index.ts` is verified to be safe and idempotent, no log output or index verification dump exists from an actual execution against the target database.
- **Risk if Bypassed:** Running on an un-migrated MongoDB database with the legacy unconditional TTL index will prematurely delete unsent outbox events after 7 days, resulting in dropped room state updates.
- **Unblocking Criteria:**
  1. Operator executes migration against staging database.
  2. Output of `db.roomstateoutboxes.getIndexes()` shows `{ "expiresAt": 1 }` with `"expireAfterSeconds": 0`.
  3. No index on `createdAt` with `expireAfterSeconds` is present.
  4. Execution logs committed to `docs/evidence/outbox_migration_staging.log`.

---

### Gate 2: OP-QA-01 — Interactive Manual Runtime QA
- **Status:** **BLOCKED**
- **Justification:** `docs/SPRINT_4_3_RELEASE_QA_CHECKLIST.md` contains 24 unexecuted scenarios. No actual results, pass/fail ticks, timestamps, or operator initials have been recorded.
- **Risk if Bypassed:** High probability of undetected WebRTC audio permission failures, WebSocket disconnection race conditions, or audio-lyrics desynchronization in real multi-user mobile/desktop environments.
- **Unblocking Criteria:**
  1. QA team deploys staging environment with running LiveKit SFU.
  2. QA operators execute all 24 scenarios across at least two independent devices.
  3. All scenarios marked as `Pass` (or minor non-blocking UI issues documented with bug tickets).
  4. QA Lead and Engineering Lead sign the checklist sign-off block.

---

### Gate 3: GOV-01, GOV-02, GOV-03 — Governance Policy Decisions
- **Status:** **CONDITIONAL**
- **Justification:** Clear architectural options are documented in `docs/SPRINT_4_3_GOVERNANCE_DECISIONS.md`, but executive product sign-off remains pending.
- **Risk Assessment:**
  - Empty rooms remain open indefinitely until manual closure (minor operational clutter).
  - Abandoned rooms require participants to leave and create a new room (minor user inconvenience).
  - These conditions do not cause data corruption or system crashes, making them acceptable under conditional approval for early staging testing, but requiring formal sign-off for general availability.
- **Risk Owner:** Product Owner
- **Unblocking Criteria:**
  - Product Owner records decision choices in `docs/SPRINT_4_3_GOVERNANCE_DECISIONS.md`.

---

### Gate 4: GOV-04 — Single-Instance Deployment Invariant
- **Status:** **PASS**
- **Justification:** In-memory presence and playback loops require a single backend instance until Redis distributed adapters are introduced in Milestone 5.0. This constraint is documented as a hard invariant in deployment runbooks.
- **Enforcement:** Container orchestration configs (Kubernetes, AWS ECS, Railway) must set `replicas: 1`.

---

### Gate 5: STATIC-01 — Static Code Validation
- **Status:** **PASS**
- **Justification:** Running `pnpm typecheck` confirms 0 TypeScript compiler errors across `@ktv/contracts`, `apps/api`, and `apps/web`. Running `pnpm lint` confirms 0 ESLint errors and warnings across all workspaces.

---

### Gate 6: SOURCE-01 — Source Integration Integrity
- **Status:** **PASS**
- **Justification:** All historical integration audit defects identified in Sprint 4.0 (`INT-01`, `INT-02A`, `INT-03`, `INT-06`, `INT-08`) have been remediated in source code and validated against architecture specifications.
