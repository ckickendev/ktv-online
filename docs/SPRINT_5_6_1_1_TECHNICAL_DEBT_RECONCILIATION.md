# Sprint 5.6.1.1: Technical Debt Reconciliation

**Milestone:** Social Security Verification Audit  
**Baseline Commit:** `3253fbf069a88516c37e115ea5ea12fa4db5ef80`  
**Audit Date:** November 2026  

---

## 1. Executive Summary

This document verifies the technical debt register against actual source code in commit `3253fbf069a88516c37e115ea5ea12fa4db5ef80`.
- Canonical items `HIST-01` through `HIST-07` remain documented and open.
- Items `SOC-01` through `SOC-08` are audited against source code.
- New findings from Sprint 5.6.1.1 are registered under `AUD-INV-01`, `AUD-INV-02`, and `AUD-FR-01`.

---

## 2. Independent Audit of Sprint 5.6 Social Debt (`SOC-01` through `SOC-08`)

| Debt ID | Title & Description | Source Evidence | Audit Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **SOC-01** | Proactive Presence Broadcast | `friend.events.ts#L96-L135`<br>`socket.server.ts#L65`<br>`room.events.ts#L173` | **RESOLVED** | Verified across all 7 lifecycle trigger boundaries. |
| **SOC-02** | Room Switching Cleanup | `presence.manager.ts#L73-L90` | **RESOLVED** | Verified: previous room socket is evicted upon new room join. |
| **SOC-03** | Disconnect Grace Period Sync | `global-presence.manager.ts#L79-L118` | **RESOLVED** | Verified: generation-fenced 10-second grace prevents offline flicker. |
| **SOC-04** | Atomic Reciprocal Friend Requests | `friendship.service.ts#L156-L213` | **RESOLVED** | Verified: duplicate key error handled and reciprocal request auto-accepted. (See AUD-FR-01 for error predicate note). |
| **SOC-05** | Atomic Friendship State Transitions | `friendship.service.ts#L230-L388` | **RESOLVED** | Verified: `findOneAndUpdate` and `findOneAndDelete` used for all mutations. |
| **SOC-06** | Multi-Friend Invitation Isolation | `invitation.service.ts#L98-L140`<br>`invitation.model.ts#L14` | **PARTIALLY RESOLVED** | Multi-friend token revocation is isolated; however, unauthenticated preview/validation bypass was identified (`AUD-INV-01`). |
| **SOC-07** | Host Authorization Guard | `friendship.service.ts#L642-L645`<br>`invitation.service.ts#L55` | **RESOLVED** | Verified: non-hosts rejected with HTTP 403 `FORBIDDEN_NOT_HOST`. (See AUD-INV-02 for public room policy note). |
| **SOC-08** | Client Invitation Listener | `invitation-notification-listener.tsx`<br>`auth-initializer.tsx` | **RESOLVED** | Verified: mounted globally, handles deduplication, navigation, and dismiss. |

---

## 3. Newly Identified Debt Items (Sprint 5.6.1.1 Audit)

| Finding ID | Severity | Category | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **AUD-INV-01** | **Medium** | Security / Token Isolation | Enforce recipient identity check in `validateInvitation` and `previewInvitation` when `requestingUserId` is undefined/unauthenticated for recipient-bound tokens. | **OPEN (Requires Remediation)** |
| **AUD-INV-02** | **Low** | Policy Alignment | Evaluate whether active room members should be permitted to invite friends to public rooms (currently restricted to room owner). | **OPEN (Design Decision)** |
| **AUD-FR-01** | **Low** | Code Hygiene | Narrow error catching in `sendRequest` from `name === 'MongoServerError'` to specific duplicate key code `code === 11000`. | **OPEN (Code Hygiene)** |

---

## 4. Canonical Historical Technical Debt Register (`HIST-01` through `HIST-07`)

| ID | Title & Scope | Status | Notes |
| :--- | :--- | :--- | :--- |
| **HIST-01** | Stale / abandoned room session closure policy | Open | Background worker or TTL sweep for abandoned rooms. |
| **HIST-02** | Participant attendance intervals | Open | Detailed interval accounting for multi-hour sessions. |
| **HIST-03** | Bounded participant data completeness | Open | Capping participant metadata retention for scalability. |
| **HIST-04** | Performance terminal-state race conditions | Open | Handling rapid concurrent song skipping near end-of-track. |
| **HIST-05** | Account deletion and history retention | Open | GDPR/CCPA anonymization hooks for deleted user histories. |
| **HIST-06** | Privacy authorization and cache behavior | Open | Cache invalidation on history privacy toggle. |
| **HIST-07** | Session and vocal duration accuracy | Open | Sub-second vocal telemetry precision vs network latency. |
