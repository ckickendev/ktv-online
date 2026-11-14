# Sprint 5.6 Technical Debt Register Reconciliation

**Milestone:** Social Presence & Friendship Experience  
**Sprint Baseline Commit:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`  
**Purpose:** Reconcile historical technical debt identifiers (HIST-01 through HIST-07), restore unbroken traceability to Sprint 5.3–5.5 documentation, and register new Sprint 5.6-specific follow-ups.  
**Audit Date:** November 2026  

---

## 1. Discrepancy Analysis

In Sprint 5.4 (`docs/SPRINT_5_4_FINAL_REPORT.md#L121-L130`) and Sprint 5.5 (`docs/SPRINT_5_5_FINAL_REPORT.md#L164-L173`), the technical debt register formally tracked seven items originating from the Sprint 5.3 Session Memories and Karaoke History milestone (`HIST-01` through `HIST-07`).

During Sprint 5.6, the documentation (`docs/SPRINT_5_6_SOURCE_AUDIT.md#L77-L86` and `docs/SPRINT_5_6_FINAL_REPORT.md#L90-L100`) inadvertently reassigned the prefixes `HIST-01` through `HIST-07` to a set of broad operational and audio synchronization debts from earlier sprints (Sprint 3.10 through 4.3). This created an ID collision and temporarily obscured the status of the original history debts.

This document formally reconciles both registers, preserves historical traceability, and establishes clean canonical namespaces.

---

## 2. Reconciliation Matrix

| Original ID (Sprint 5.3–5.5) | Original Meaning | Sprint 5.6 Misassigned Meaning | Original Item Status | Recommended Canonical ID for Original Item | Canonical ID for Misassigned Sprint 5.6 Item |
|---|---|---|---|---|---|
| **HIST-01** | Stale / abandoned room session closure policy | Client-side anchor drift compensation | **Open** | **HIST-01** (Stale room closure) | **AUDIO-01** (Anchor drift sync) |
| **HIST-02** | Participant attendance intervals | Room host migration under rapid reconnects | **Open** | **HIST-02** (Attendance intervals) | **LIFECYCLE-01** (Host migration reconnects) |
| **HIST-03** | Bounded participant data completeness | Single-node in-memory presence and queue | **Open** | **HIST-03** (Participant completeness) | **INFRA-01** (Single-node memory presence) |
| **HIST-04** | Performance terminal-state race conditions | MongoDB database naming convention (`test`) | **Open** | **HIST-04** (Performance terminal races) | **OPS-01** (Database naming convention) |
| **HIST-05** | Account deletion and history retention | Outbox collection schema migration unexecuted | **Open** | **HIST-05** (Account deletion history) | **MIGRATION-01** (Outbox schema migration) |
| **HIST-06** | Privacy authorization and cache behavior | Untimed lyrics fallback relies on manual scroll | **Open** | **HIST-06** (Privacy & history caching) | **LYRICS-01** (Untimed lyrics manual scroll) |
| **HIST-07** | Session and vocal duration accuracy | LiveKit token generation assumes single-region | **Open** | **HIST-07** (Vocal duration accuracy) | **VOICE-01** (LiveKit single-region constraint) |

---

## 3. Sprint 5.6 Social & Presence Technical Debt Register (`SOC-01` through `SOC-08`)

The source audit of Sprint 5.6 identified eight new follow-ups specific to the social presence and invitation systems. These are registered below under the canonical prefix `SOC-`:

| ID | Title & Description | Source Location | Severity |
|---|---|---|---|
| **SOC-01** | **Proactive Presence Broadcast:** Wire `emitFriendPresenceUpdate` into socket connection, room join/leave, singing state, and disconnection events so presence updates push in real time rather than relying on 30s HTTP polling. | `apps/api/src/realtime/friend.events.ts#L39` | High |
| **SOC-02** | **Room Switching Cleanup:** Ensure `presenceManager.addSocket` removes the socket from its previous room if the user switches rooms without sending `room:leave`. | `apps/api/src/realtime/presence.manager.ts#L74` | High |
| **SOC-03** | **Grace Period Synchronization:** Align `GlobalPresenceManager` with `RoomPresenceManager`'s 10-second disconnection grace period to prevent presence flickering on page refresh. | `apps/api/src/realtime/socket.server.ts#L65` | Medium |
| **SOC-04** | **Atomic Reciprocal Friend Requests:** Catch MongoDB `E11000` duplicate key errors in `friendshipService.sendRequest` and auto-transition to `accepted` instead of bubbling an HTTP 500. | `apps/api/src/modules/friends/friendship.service.ts#L131` | High |
| **SOC-05** | **Atomic State Transitions:** Replace read-modify-save (`findById` + `.save()`) with atomic `findOneAndUpdate({ status: 'pending' })` in `acceptRequest`, `declineRequest`, and `cancelRequest`. | `apps/api/src/modules/friends/friendship.service.ts#L185` | Medium |
| **SOC-06** | **Multi-Friend Invitation Isolation:** Prevent `sendLoungeInviteToFriend` from calling `createInvitation` (which revokes all prior tokens); re-use active tokens or issue per-invite credentials. | `apps/api/src/modules/friends/friendship.service.ts#L561` | Critical |
| **SOC-07** | **Host Authorization Guard:** Verify `userId === room.ownerId` (or active member authorization) before dispatching room invitations in `sendLoungeInviteToFriend`. | `apps/api/src/modules/friends/friendship.service.ts#L550` | Critical |
| **SOC-08** | **Client Invitation Listener:** Register an active listener for `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED` in `apps/web` to render user-facing invitation notifications. | `apps/web/src/features/friends/` | High |

---

## 4. Preservation & Governance Recommendation

1. **Retain Canonical HIST Register:** Do not repurpose `HIST-01` through `HIST-07` for infrastructure items. Retain them for Session Memories and History.
2. **Adopt Domain Prefixes:**
   - History: `HIST-`
   - Realtime Audio/Lyrics: `AUDIO-`, `LYRICS-`
   - Infrastructure & Operations: `INFRA-`, `OPS-`, `MIGRATION-`
   - Social Presence & Invitations: `SOC-`
3. **Traceability Guarantee:** All historical items from Sprint 5.3–5.5 remain documented and open.
