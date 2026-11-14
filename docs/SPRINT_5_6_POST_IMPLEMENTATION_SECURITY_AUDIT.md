# Sprint 5.6 Post-Implementation Security & Architecture Audit

**Milestone:** Social Presence & Friendship Experience  
**Audit Type:** Read-Only Source Security & Architecture Audit  
**Sprint Commit Baseline:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`  
**Repository Branch:** `main`  
**Database Target:** `test` (MongoDB)  
**Monorepo:** `pnpm` workspace (`apps/api`, `apps/web`, `packages/contracts`)  
**Audit Date:** November 2026  
**Final Audit Verdict:** **AUDIT FAILED — SOURCE-LEVEL DEFECTS IDENTIFIED**  

---

## 1. Executive Summary

This post-implementation audit performed an exhaustive, read-only source review of the friendship, global presence, privacy, and direct room invitation systems delivered in Sprint 5.6.

While the mathematical schema design (`pairKey` canonical ordering), presence calculation logic (`GlobalPresenceManager.getUserPresence`), and private room masking algorithms are structurally sound, the audit discovered **six source-level defects**, including **two critical security/functional flaws** in room invitations and **one high-severity race condition**:

1. **CRITICAL:** `sendLoungeInviteToFriend` calls `createInvitation`, which unconditionally revokes all prior active invitations for the room. Inviting a second friend immediately invalidates the first friend's invitation token (**DEF-INV-01**).
2. **CRITICAL:** `sendLoungeInviteToFriend` lacks an authorization check on the caller, and forges the room owner's identity to bypass host checks, allowing any user to generate invites to any private room (**DEF-INV-02**).
3. **HIGH:** Real-time presence updates are never broadcast proactively over Socket.IO because `emitFriendPresenceUpdate` is never called; the frontend relies entirely on 30-second polling (**DEF-PRES-01**).
4. **HIGH:** Simultaneous reciprocal friend requests trigger an unhandled MongoDB `E11000` duplicate key exception, crashing the endpoint with HTTP 500 (**DEF-FR-01**).
5. **HIGH:** Real-time invitation events emitted by the server (`friend:invitation:received`) are completely unhandled on the client (**DEF-INV-03**).
6. **MEDIUM:** Room switching without explicit `room:leave` leaks orphaned sockets in `RoomPresenceManager.roomUsers`, corrupting `getUserRoom` lookup (**DEF-PRES-02**).

---

## 2. Summary of Sub-Audits

### 2.1. Audit 1 — Global Presence Lifecycle
Detailed in [SPRINT_5_6_PRESENCE_LIFECYCLE_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_5_6_PRESENCE_LIFECYCLE_AUDIT.md):
- **Multiple Sockets:** Verified. `GlobalPresenceManager` correctly maintains a `Set<string>` of socket IDs per user.
- **Last Socket Eviction:** Verified. `isLastDisconnection` correctly triggers only when all sockets for a user disconnect.
- **Real-time Event Decoupling (DEF-PRES-01):** The server helper `emitFriendPresenceUpdate` is never invoked during socket connection, room join/leave, or playback singing transitions.
- **Room Switching Leak (DEF-PRES-02):** `RoomPresenceManager.socketMeta` overwrites room IDs without removing the socket from the previous room map, causing stale presence reports.
- **Grace Period Asymmetry (DEF-PRES-03):** Global presence disconnects immediately while room presence waits 10 seconds, causing user presence to flicker to `offline` on browser refreshes.

### 2.2. Audit 2 — Privacy Enforcement
- **Privacy Settings:** Verified. `getUserPresence` strictly checks `presenceVisibility` (`'everyone'`, `'friends'`, `'none'`). Non-friends querying users with `'friends'` visibility receive `status: 'offline'`.
- **Private Lounge Masking:** Verified. When a friend is in a private room (`room.visibility === 'private'`), non-occupants receive `roomId: null`, `roomTitle: "Private Lounge"`, and `songTitle: null`.
- **Search & Request Isolation:** Verified. User search (`/friends/search`) and friend request listings never leak presence data.
- **Privacy Change Invalidation:** When a user sets `presenceVisibility: 'none'`, no socket event pushes to friends. Friends see cached presence until their next HTTP poll (up to 30 seconds).

### 2.3. Audit 3 — Friendship Data Integrity
Detailed in [SPRINT_5_6_FRIENDSHIP_INTEGRITY_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_5_6_FRIENDSHIP_INTEGRITY_AUDIT.md):
- **Canonical Ordering:** Verified. `computePairKey` produces deterministic string pairs backed by a compound unique index on `{ pairKey: 1 }`.
- **Self-Friending Prevention:** Verified. Intercepted before database interaction.
- **Reciprocal Request Race (DEF-FR-01):** Simultaneous reciprocal requests bypass the initial `findOne` check, causing one request to throw `E11000` duplicate key error, resulting in an unhandled HTTP 500.
- **Non-Atomic State Transitions (DEF-FR-02):** `acceptRequest` and `cancelRequest` use read-modify-save (`findById` + `.save()`) instead of atomic conditional queries (`findOneAndUpdate`).

### 2.4. Audit 4 — Invitation Security
Detailed in [SPRINT_5_6_INVITATION_SECURITY_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_5_6_INVITATION_SECURITY_AUDIT.md):
- **Serial Token Invalidation (DEF-INV-01):** Each invite dispatched to a friend revokes all prior invitation tokens for the room, rendering earlier invites invalid.
- **Caller Authorization Failure (DEF-INV-02):** `sendLoungeInviteToFriend` forges `room.ownerId` when calling `createInvitation`, allowing arbitrary users to generate room invitations for any private room.
- **Client Event Drop (DEF-INV-03):** `apps/web` registers no listener for `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED`.
- **Access Control on Redemption:** Verified. Token redemption enforces kicked status, room lock, and room capacity.

### 2.5. Audit 5 — Technical Debt Reconciliation
Detailed in [SPRINT_5_6_TECHNICAL_DEBT_RECONCILIATION.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_5_6_TECHNICAL_DEBT_RECONCILIATION.md):
- Identified collision where Sprint 5.6 report reassigned `HIST-01` through `HIST-07` away from their Sprint 5.3–5.5 meanings.
- Re-established canonical status for the original history items (`HIST-01` through `HIST-07`).
- Re-assigned general operational items to canonical categories (`AUDIO-01`, `LIFECYCLE-01`, `INFRA-01`, `OPS-01`, `MIGRATION-01`, `LYRICS-01`, `VOICE-01`).
- Formally registered new Sprint 5.6 follow-ups (`SOC-01` through `SOC-08`).

---

## 3. Discovered Defects Classification

| Defect ID | Category | Description | Severity | Remediated in this Audit? |
|---|---|---|---|---|
| **DEF-INV-01** | Functional / Security | Inviting a friend revokes tokens of all previously invited friends | **Critical** | No (Read-only audit) |
| **DEF-INV-02** | Security / Auth | Missing caller host check in `sendLoungeInviteToFriend` allows unauthorized invitation generation | **Critical** | No (Read-only audit) |
| **DEF-PRES-01** | Real-time Lifecycle | `emitFriendPresenceUpdate` is uninvoked; real-time presence relies on 30s polling | **High** | No (Read-only audit) |
| **DEF-FR-01** | Concurrency / Data | Simultaneous reciprocal requests trigger unhandled `E11000` duplicate key HTTP 500 | **High** | No (Read-only audit) |
| **DEF-INV-03** | Frontend Integration | Real-time `friend:invitation:received` event is unhandled by client | **High** | No (Read-only audit) |
| **DEF-PRES-02** | Real-time Memory | Room switching without explicit `room:leave` leaks sockets in `RoomPresenceManager` | **Medium** | No (Read-only audit) |
| **DEF-PRES-03** | UX / Lifecycle | Absence of global disconnect grace timer causes presence to flicker offline on refresh | **Medium** | No (Read-only audit) |
| **DEF-FR-02** | Concurrency | Read-modify-save in `acceptRequest` / `cancelRequest` permits race conditions | **Medium** | No (Read-only audit) |

---

## 4. Remediation Recommendations & Priority

### Priority 1: Critical Security & Functional Fixes
1. **Fix `sendLoungeInviteToFriend` Authorization (DEF-INV-02):** Verify `room.ownerId.toString() === userId` before creating or sending an invite.
2. **Fix Token Re-use in Lounge Invites (DEF-INV-01):** Retrieve the active unexpired invitation token for the room; only create a new token if no valid token exists.

### Priority 2: Real-time Event Wiring
3. **Wire Proactive Presence Broadcasts (DEF-PRES-01):** Call `emitFriendPresenceUpdate` on socket connect, disconnect, room join, room leave, and singing playback updates.
4. **Register Client Invitation Listener (DEF-INV-03):** Implement a socket listener in `apps/web` for `friend:invitation:received` to show interactive toasts.
5. **Handle Reciprocal Friend Request Race (DEF-FR-01):** Catch MongoDB `E11000` in `sendRequest` and auto-transition to `accepted`.

### Priority 3: Concurrency & State Cleanup
6. **Clean Previous Room on `addSocket` (DEF-PRES-02):** Evict socket from previous room if `socketMeta` has an existing entry.
7. **Atomic Friendship Transitions (DEF-FR-02):** Replace `findById` + `.save()` with `findOneAndUpdate({ status: 'pending' })`.
8. **Add Disconnect Grace Period to Global Presence (DEF-PRES-03):** Buffer global socket disconnection with a short grace timer.
