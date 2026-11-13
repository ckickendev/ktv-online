# KTVOnline — Sprint 4.3: Product & Operational Governance Register

## 1. Executive Purpose

This document formally records all architectural, lifecycle, and data-retention decisions that require executive or product stakeholder sign-off before implementation. In accordance with the Code-Only Development Policy and Sprint 4.3 constraints, **none of these policies have been implemented as automated background workers or schema modifications**.

---

## 2. Governance Decision Register

---

### GOV-01: Empty Room Auto-Close Policy

#### Current Production Behavior
- When all participants leave or disconnect from a room, online presence drops to 0 (`presenceManager.getRoomPresence(roomId).length === 0`).
- However, in MongoDB, `RoomModel.status` remains `'active'` indefinitely.
- No background cron, scheduled task, or TTL index purges empty rooms.
- The room remains visible in room discovery until the host explicitly calls `closeRoom()` or an operator intervenes.

#### Proposed Policy Options for Product Owner Sign-Off:
1. **Option A (Manual Closure Only — Current Status Quo):**
   - Rooms remain open until the host explicitly clicks "Close Room".
   - *Pros:* Hosts can leave and return to their lounge later with queue and history intact.
   - *Cons:* Stale, empty rooms accumulate in database and clutter public discovery feeds.
2. **Option B (Inactivity-Based Auto-Close — Recommended for MVP):**
   - A scheduled cron worker (e.g. running every 5 minutes) inspects active rooms. If `currentParticipantsCount === 0` and the last active socket disconnected $>30$ minutes ago, transition room status to `'closed'`.
   - *Pros:* Keeps public discovery feed fresh; bounds active database working set.
   - *Cons:* If a host temporarily disconnects for 35 minutes, their lounge closes.
3. **Option C (Tiered Public vs. Private Lounges):**
   - Public rooms auto-close after 30 minutes of inactivity.
   - Private lounges remain active for 24 hours.

> [!NOTE]
> **Implementation Status:** Awaiting Product Owner selection. No background cleanup worker has been deployed in Sprint 4.3.

---

### GOV-02: Abandoned Host Promotion Policy

#### Current Production Behavior
- Host ownership is strictly bound to `RoomModel.ownerId`.
- In `room.service.ts`, `leaveRoom()` explicitly rejects hosts (`HOST_CANNOT_LEAVE`), requiring an explicit call to `transferHost(roomId, currentHostId, newHostId)` or `closeRoom()`.
- If a host abruptly closes their browser or loses connectivity permanently without transferring ownership, the room remains in `'active'` status with the offline host recorded as owner.
- Remaining members and moderators cannot trigger host transfer, kick participants, or close the room.

#### Proposed Policy Options for Product Owner Sign-Off:
1. **Option A (Strict Owner Authority — Current Status Quo):**
   - Only the host can transfer ownership. If the host abandons the lounge, members must leave and create a new lounge.
   - *Pros:* Prevents host role hijacking or unexpected leadership changes during network blips.
   - *Cons:* Lounges can become "orphaned" with members unable to close or control the room.
2. **Option B (Senior Moderator Promotion on Timeout — Recommended):**
   - If the host has been offline for $>15$ consecutive minutes while other participants remain active:
     - Automatically promote the oldest active moderator to Host.
     - If no moderator exists, promote the longest-tenured active member.
3. **Option C (Democratic "Vote to Claim Host"):**
   - If the host is offline for $>5$ minutes, active members can trigger a vote to reassign the host badge.

> [!NOTE]
> **Implementation Status:** Awaiting Product Owner selection. Host reassignment remains strictly manual via `transferHost()`.

---

### GOV-03: Data Retention & Pruning Policies

#### Current Production Implementations & Gaps:

| Data Collection | Model Name | Current Retention Mechanism | Open Governance Decision | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Outbox Events** | `RoomStateOutboxModel` | Single-field TTL index on `expiresAt` (7 days post-broadcast). Pending/failed never expire. | **RESOLVED IN SPRINT 4.0-4.2** | Deploy `reconcile-outbox-ttl-index.ts`. |
| **Chat Messages** | `RoomMessageModel` | 30-day TTL index on `createdAt` (`expireAfterSeconds: 2592000`). | Is 30-day deletion acceptable for Trust & Safety / abuse reports? | Retain 30-day TTL as default. |
| **Room Activities** | `RoomActivityModel` | 7-day TTL index on `createdAt` (`expireAfterSeconds: 604800`). | Moderation logs (`member_kicked`, `member_muted`) are purged after 7 days alongside ephemeral cheers. | Separate moderation audit logs into dedicated collection. |
| **Karaoke Queue** | `RoomQueueItemModel` | **No TTL index.** Completed and skipped songs remain indefinitely. | Should completed songs be pruned after 14 days, or retained for user singing history? | Retain completed songs until user singing analytics are designed. |
| **Voice Evictions** | `VoiceEvictionTaskModel`| 24-hour TTL on completed/cancelled tasks; bounded retries (5 max). | Fully bounded; safe. | No change required. |

> [!NOTE]
> **Implementation Status:** Existing 30-day chat TTL and 7-day activity TTL are preserved. No new indexes or TTL modifications applied.

---

### GOV-04: Single-Instance Architectural Constraints

#### Current Architecture
- Realtime socket presence is managed by `RoomPresenceManager` using an in-memory `Map<roomId, Map<userId, Set<socketId>>>`.
- Karaoke playback advancement operates on an in-memory worker timer with MongoDB atomic distributed lease locking (`RoomPlaybackStateModel`).
- **No Redis adapter** or distributed Pub/Sub message broker is currently deployed.

#### Operational Invariants:
1. **Single Node Production Requirement:** The backend API service (`apps/api`) must be deployed as a **single container / single Node.js process** in Phase 1 production.
2. **Horizontal Scaling Block:** Running multiple container replicas behind a load balancer without sticky sessions and a Redis Socket.IO adapter will cause split-brain presence (users connected to Node A will not see users connected to Node B).
3. **Milestone 5.0 Roadmap:** Deploying `@socket.io/redis-adapter` and distributed Redis presence is scheduled for Milestone 5.0.

> [!CRITICAL]
> Operating teams must configure production container orchestrators (e.g. AWS ECS, Kubernetes, Railway) with `replicas: 1` until Milestone 5.0 is completed.
