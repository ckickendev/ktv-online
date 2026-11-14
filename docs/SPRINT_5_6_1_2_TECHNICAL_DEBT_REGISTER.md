# Sprint 5.6.1.2: Master Technical Debt Register

**Milestone:** Invitation Identity Enforcement & Database Error Integrity  
**Baseline Commit:** `2ba32d7`  
**Date:** November 2026  
**Status:** Canonical & Reconciled  

---

## 1. Social Presence & Invitations Register (`SOC-` Series)

All eight items originating from Sprint 5.6 and its audits are now verified and resolved at source code level:

| Debt ID | Title & Description | Source Evidence | Status |
| :--- | :--- | :--- | :--- |
| **SOC-01** | Proactive Presence Broadcasts | `friend.events.ts#L96`, `socket.server.ts#L65`, `room.events.ts#L173` | **RESOLVED** |
| **SOC-02** | Room Switching Cleanup in `addSocket` | `presence.manager.ts#L73-L90` | **RESOLVED** |
| **SOC-03** | Disconnect Grace Period Synchronization | `global-presence.manager.ts#L79-L118` | **RESOLVED** |
| **SOC-04** | Atomic Reciprocal Friend Request Concurrency | `friendship.service.ts#L156-L213` | **RESOLVED** |
| **SOC-05** | Atomic Friendship State Transitions | `friendship.service.ts#L230-L388` | **RESOLVED** |
| **SOC-06** | Multi-Friend Invitation Isolation & Identity Enforcement | `invitation.service.ts#L98`, `#L267`, `#L405`, `invitation.model.ts#L14` | **RESOLVED** |
| **SOC-07** | Authoritative Host Authorization Guard | `friendship.service.ts#L642`, `invitation.service.ts#L55` | **RESOLVED** |
| **SOC-08** | Client Invitation Notification Listener | `invitation-notification-listener.tsx`, `auth-initializer.tsx` | **RESOLVED** |

---

## 2. Sprint 5.6.1.1 Audit Findings Status

| Finding ID | Severity | Category | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **AUD-INV-01** | **Medium** | Security / Token Isolation | Unauthenticated / mismatched recipient guard bypass in `previewInvitation` and `validateInvitation`. | **RESOLVED** (Sprint 5.6.1.2) |
| **AUD-FR-01** | **Low** | Code Hygiene / Error Integrity | Overly broad MongoServerError predicate in `sendRequest` catch block. | **RESOLVED** (Sprint 5.6.1.2) |
| **AUD-INV-02** | **Low** | Product Authorization Policy | Host-only direct friend invitations across public and private rooms. | **CLOSED** (Confirmed Intentional Product Policy) |

---

## 3. Canonical Session Memories & Karaoke History Register (`HIST-` Series)

Items originating from Sprint 5.3 remain open pending staging operational verification:

| Debt ID | Title & Scope | Status | Notes |
| :--- | :--- | :--- | :--- |
| **HIST-01** | Stale / abandoned room session closure policy | Open | Background worker or TTL sweep for abandoned rooms. |
| **HIST-02** | Participant attendance intervals | Open | Detailed interval accounting for multi-hour sessions. |
| **HIST-03** | Bounded participant data completeness | Open | Capping participant metadata retention for scalability. |
| **HIST-04** | Performance terminal-state race conditions | Open | Handling rapid concurrent song skipping near end-of-track. |
| **HIST-05** | Account deletion and history retention | Open | GDPR/CCPA anonymization hooks for deleted user histories. |
| **HIST-06** | Privacy authorization and cache behavior | Open | Cache invalidation on history privacy toggle. |
| **HIST-07** | Session and vocal duration accuracy | Open | Sub-second vocal telemetry precision vs network latency. |

---

## 4. Platform & Operational Technical Debt Register

| Debt ID | Area | Title & Description | Status | Target Milestone |
| :--- | :--- | :--- | :--- | :--- |
| **INFRA-01** | Scalability | Single-node in-memory presence and queue (no Redis) | Open | Production Scaling Sprint |
| **OPS-01** | Configuration | MongoDB database naming convention (`test`) | Open | Release Migration Sprint |
| **MIGRATION-01** | Reliability | Outbox collection schema migration unexecuted on staging | Open | Staging Release Gate Sprint |
| **AUDIO-01** | Karaoke Engine | Client-side anchor drift compensation under network jitter | Open | Audio Quality Sprint |
| **LIFECYCLE-01** | Room Engine | Host migration under rapid reconnect scenarios | Open | Room Stability Sprint |
| **LYRICS-01** | UI/UX | Untimed lyrics fallback relies on manual scrolling | Open | Song Catalog Sprint |
| **VOICE-01** | LiveKit | LiveKit token generation assumes single-region deployment | Open | Multi-Region Scaling Sprint |
