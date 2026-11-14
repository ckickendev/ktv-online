# Sprint 5.6.1: Master Technical Debt Register

**Milestone:** Social Integrity & Invitation Security Remediation  
**Baseline Commit:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`  
**Audit Date:** November 2026  
**Status:** Canonical & Reconciled  

---

## 1. Executive Summary

During Sprint 5.6.1, all eight social and invitation technical debt items identified in Sprint 5.6 (`SOC-01` through `SOC-08`) were remediated at source code level. Historical debts from prior sprints (`HIST-01` through `HIST-07`, operational, and architectural items) remain accurately tracked without ID collisions.

---

## 2. Sprint 5.6.1 Social Debt Remediation Register (`SOC-` Series)

| Debt ID | Defect ID | Title & Description | Status | Remediation Implementation |
| :--- | :--- | :--- | :--- | :--- |
| **SOC-01** | `DEF-PRES-01` | Proactive Presence Broadcast across socket, room, singing, and privacy events | **RESOLVED** | Implemented `broadcastUserPresenceToFriends` in `friend.events.ts`; wired into connection, disconnection, room join/leave, kick, playback updates, and privacy preferences. |
| **SOC-02** | `DEF-PRES-02` | Room Switching Cleanup in `presenceManager.addSocket` | **RESOLVED** | Added previous room eviction logic in `presenceManager.addSocket` before registering new room socket. |
| **SOC-03** | `DEF-PRES-03` | Disconnect Grace Period Synchronization in `GlobalPresenceManager` | **RESOLVED** | Implemented generation-fenced 10-second disconnect grace period in `GlobalPresenceManager.handleDisconnect`. |
| **SOC-04** | `DEF-FR-01` | Atomic Reciprocal Friend Request Concurrency (`E11000`) | **RESOLVED** | Intercepted duplicate key errors in `friendshipService.sendRequest`, fetching canonical pair and auto-accepting mutual requests atomically. |
| **SOC-05** | `DEF-FR-02` | Atomic Friendship State Transitions | **RESOLVED** | Replaced read-modify-save with atomic `findOneAndUpdate` and `findOneAndDelete` for accept, decline, cancel, and remove. |
| **SOC-06** | `DEF-INV-01` | Multi-Friend Invitation Token Isolation | **RESOLVED** | Implemented Option B: added `recipientId` to schema and `createFriendInvitation` to prevent cross-friend token invalidation. |
| **SOC-07** | `DEF-INV-02` | Authoritative Host Authorization Guard on Lounge Invitations | **RESOLVED** | Enforced `room.visibility === 'private' && room.ownerId !== userId` check returning `FORBIDDEN_NOT_HOST` (HTTP 403). |
| **SOC-08** | `DEF-INV-03` | Client Realtime Invitation Notification Listener | **RESOLVED** | Created `<InvitationNotificationListener />` in `apps/web` and mounted inside `AuthInitializer`. |

---

## 3. Session Memories & Karaoke History Register (`HIST-` Series)

These items originate from Sprint 5.3 and remain active pending staging operational verification:

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
