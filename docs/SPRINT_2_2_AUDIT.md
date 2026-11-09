# KTV Online — Sprint 2.2 Realtime Room State & Synchronization Architecture Audit

**Author:** Antigravity Architect & Senior Engineering Team  
**Date:** November 9, 2026  
**Status:** COMPLETE — ARCHITECTURE GATE REVIEW  
**Scope:** Server-Authoritative Room State Snapshot, Versioned State Events, Presence Separation, Reconnection Reconciliation, Session Moderation  
**Policy:** Code-Only Implementation (No Test Execution)

---

## 1. Executive Summary

Sprint 2.2 addresses the fundamental synchronization challenges of virtual karaoke rooms. In previous sprints, room state (metadata, settings, participant count, membership roster) was queried through discrete REST endpoints, while realtime events were limited to ephemeral presence (`room:presence:snapshot`, `room:member:joined`, `room:member:left`) and text chat. Consequently, when room settings changed, or members joined, left, or were kicked, clients relied on fragmented query invalidations or remained out-of-sync during network hiccups and reconnection.

This audit evaluates the codebase across 5 required areas (A1–A5), identifies synchronization gaps and architectural risks, and establishes the blueprint for Phase B through Phase G.

---

## 2. Audit Findings

### A1. Existing Room Domain Model & Mutation Pathways

#### Schemas Inspected
- **`RoomModel` (`apps/api/src/modules/rooms/room.model.ts`):**
  - Fields: `name`, `description`, `ownerId`, `roomType`, `visibility`, `capacity`, `status` (`'idle' | 'singing' | 'paused' | 'closed'`), `category`, `currentParticipantsCount`, `isChatEnabled`, `currentSongTitle`, `currentSingerName`.
  - **DEFECT:** Does not contain a state version or sequence identifier (`stateVersion`). There is currently no way to detect stale, duplicate, or missing state mutations.
- **`RoomMembershipModel` (`apps/api/src/modules/rooms/membership.model.ts`):**
  - Fields: `roomId`, `userId`, `role` (`'host' | 'member'`), `status` (`'active' | 'left'`), `joinedAt`, `leftAt`, `kickedAt`, `kickedBy`.
  - Partial unique index on `{ roomId: 1, userId: 1 }` where `status: 'active'`, ensuring strictly one active membership per user per room.

#### Identified Mutation Pathways
1. **`RoomService.create`:** Creates room (`status: 'idle'`, `currentParticipantsCount: 1`) and host membership.
2. **`RoomService.update`:** Updates room metadata, visibility, status, category, chat toggle, or capacity (with CAS capacity check `currentParticipantsCount <= capacity`).
   - *Gap:* Does not publish any realtime event. Other participants in the room remain unaware of settings changes until a manual page refresh.
3. **`RoomService.closeRoom`:** Sets `status = 'closed'`, `currentParticipantsCount = 0`, sets memberships to `'left'`.
   - *Current Behavior:* Broadcasts `room:closed` via `broadcastRoomClosed`.
4. **`RoomService.joinRoom`:** Increments `currentParticipantsCount` by 1 and creates/reactivates membership.
   - *Gap:* Does not publish a versioned state event to existing occupants.
5. **`RoomService.leaveRoom`:** Transitions membership to `'left'` and decrements `currentParticipantsCount` by 1.
   - *Gap:* Does not publish a versioned state event.
6. **`RoomService.kickMember`:** Transitions membership to `'left'` (`role !== 'host'`), decrements `currentParticipantsCount` by 1, logs activity feed entry, and evicts sockets.
   - *Gap:* Socket eviction emits `room:member:kicked` and `room:member:left`, but no versioned room state transition event.
7. **`RoomReconciliationService`:** Compares `currentParticipantsCount` against count of active memberships and performs CAS repair if drifted.

---

### A2. Existing Socket.IO Architecture & Gaps

#### Handshake and Channels
- Handshake middleware (`socketAuthMiddleware`) validates JWT access token and queries `UserModel.findById(sub)` to verify account status is `'active'`.
- Room channel isolation maps each room to `room:${roomId}`.
- Handlers in `room.events.ts` manage `room:join`, `room:leave`, and `room:presence:request`.

#### Ephemeral Presence vs. Persistent Membership
- `RoomPresenceManager` tracks `roomId -> userId -> Set<socketId>`.
- Multi-tab connections are correctly handled: first socket connection emits `room:member:joined`; last socket disconnection emits `room:member:left`.
- **CRITICAL DISTINCTION:**
  - Socket presence is ephemeral and must **never** mutate persistent `RoomMembership` or `Room.currentParticipantsCount`.
  - Disconnecting a socket does **not** mean the user left the karaoke lounge—their seat remains reserved in `RoomMembershipModel`.
  - Conversely, an unauthenticated or non-member socket must never be represented as a room participant.

#### Gaps in State Synchronization
- When a client emits `room:join`, the server currently returns only `room:presence:snapshot` (ephemeral presence) and an ACK with `{ roomId, totalOnline }`.
- The server does **not** send an authoritative room state snapshot (metadata, active member roster, host details, viewer role, state version).
- Sockets reconnecting after a network glitch have no protocol to request or reconcile authoritative room state, risking stale UI and missed mutations.

---

### A3. Existing Frontend State Architecture

#### Current Fragmented State
In `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`:
1. `useRoom(roomId)`: TanStack Query fetching `RoomDto` from `GET /api/v1/rooms/:id`.
2. `useMyRoomMembership(roomId)`: TanStack Query fetching `RoomMyMembershipDto` from `GET /api/v1/rooms/:id/membership`.
3. `useRoomMembers(roomId)` in `RoomMemberList`: TanStack Query fetching `RoomMembershipDto[]` from `GET /api/v1/rooms/:id/members`.
4. `useRoomSocket(roomId)`: Socket.IO hook managing in-memory `onlineUsers` and socket connection status.
5. `useRoomChat(roomId)`: Socket.IO and REST hook for messages and activity timeline.

#### Risks & Conflicting Sources of Truth
- **Competing Sources of Truth:** If a user is kicked or leaves, `useRoomMembers` might show cached members while `useRoomSocket` removes presence, or vice versa.
- **Cache Invalidation Latency:** Client relies on asynchronous REST refetches after socket events, leading to UI flicker and race conditions.
- **Missing Versioning:** The client has no monotonic version counter to detect whether an event was received out of order or dropped.

---

### A4. Session Revocation and Moderation

- **Handshake Expiration:** Handshake authentication validates token at connection time. However, long-lived sockets can outlive token expiration or session revocation unless actively checked.
- **Kicked Member Protection (from Sprint 2.1.1):**
  - `evictKickedMember` forces target sockets to leave `room:${roomId}`.
  - `room:join` checks `kickedAt != null` on `RoomMembershipModel` and rejects with `FORBIDDEN_KICKED`.
  - Message and reaction handlers independently re-verify active membership against MongoDB.
- **State Snapshot Protection (Sprint 2.2 Requirement):**
  - `GET /api/v1/rooms/:id/state` and `room:state:snapshot` must strictly verify that kicked members or unauthorized viewers of private rooms cannot access the snapshot or receive state events.
  - When a session is revoked or user is suspended, established sockets must be terminated via `disconnectUserSockets(userId)`.

---

### A5. Deployment Assumptions & Operational Model

1. **Topology:** Single-instance Node.js Socket.IO server. In-memory `RoomPresenceManager` is process-local.
2. **Redis Status:** No Redis adapter is installed or required in the current deployment topology. Per the sprint directive, Redis must not be introduced for speculative scalability.
3. **Database Versioning:**
   - Standalone MongoDB deployments (e.g. Docker local dev) do not support multi-document replica-set transactions.
   - Using atomic `$inc: { stateVersion: 1 }` on `RoomModel` provides guaranteed monotonic versioning without external transaction managers.
   - When mutations occur, advancing `stateVersion` in the same atomic update operation ensures database consistency.
   - If an event emission is lost during a server crash or network drop, the client's version gap detection will trigger an immediate authoritative snapshot fetch, guaranteeing eventual convergence.

---

## 3. Blueprint for Implementation

| Phase | Milestone | Deliverables |
| :--- | :--- | :--- |
| **Phase B** | Authoritative Room Snapshot | Define `RoomStateSnapshotSchema` / DTO in `@ktv/contracts`. Implement `RoomService.getRoomStateSnapshot` and REST endpoint `GET /api/v1/rooms/:id/state`. Implement `room:state:snapshot` socket event on `room:join` and `room:state:request`. |
| **Phase C** | Versioned State Events | Add `stateVersion: number` (default 1) to `RoomModel`. Define `RoomStateEventSchema` / DTO. Update all mutation pathways (`update`, `joinRoom`, `leaveRoom`, `kickMember`, `closeRoom`) to increment `stateVersion` and emit versioned `room:state:event`. |
| **Phase D** | Presence Integration | Keep ephemeral presence in `RoomPresenceManager`. Snapshot includes `presence: string[]` (online user IDs). Roster displays persistent members, highlighting online status without mutating membership. |
| **Phase E** | Frontend Reconciliation | Create focused `useRoomState` hook / store. Handles snapshot hydration, version gap detection (gap -> fetch fresh snapshot), stale/duplicate event suppression (`event.version <= current`), and reconnect synchronization indicator. |
| **Phase F** | Settings Synchronization | Emits versioned `room.settings.updated` on `updateRoom`. Updates room name, description, category, style, capacity, and chat toggle across all connected clients in real time. |
| **Phase G** | Moderation & Revocation | Ensure kicked or revoked users cannot fetch snapshots or receive versioned events. Ensure clean rejoin semantics. |

Proceeding to Phase B implementation.
