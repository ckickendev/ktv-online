# KTV Online — Sprint 2.2 Implementation Report

**Document:** Sprint 2.2 Implementation Report  
**Sprint:** Sprint 2.2 — Realtime Room State & Synchronization (Code-Only)  
**Status:** CODE COMPLETE — NOT RUNTIME VERIFIED  
**Date:** November 2026  
**Audience:** Technical Leads, Backend Engineers, Frontend Engineers, Architecture Reviewers

---

## 1. Executive Summary & Verdict

### Final Sprint Verdict
`CODE COMPLETE — NOT RUNTIME VERIFIED`

All architectural requirements and code-only implementation goals of **Sprint 2.2** have been completed and verified with static typecheck and linting across the monorepo (`packages/contracts`, `apps/api`, `apps/web`).

In accordance with the **Mandatory Code-Only Policy**:
- **Zero test execution:** No test runners (`pnpm test`, Vitest, Jest, Playwright, Cypress) were executed.
- **Zero test files modified or created:** All existing test files were left untouched as source code.
- **Zero production builds executed:** No production bundles were built.
- **Zero media contamination:** Strictly no WebRTC, LiveKit, audio streaming, voice chat, microphone permissions, karaoke playback, song queues, lyrics synchronization, gifts, or speculative Redis migrations were introduced.
- **Zero claims of runtime verification:** Every operational behavior is honestly documented as statically verified and deferred to future authorized runtime verification environments.

---

## 2. Architecture Decisions

1. **Separation of Persistent Domain State from Ephemeral Presence:**
   - Persistent room domain state (room metadata, capacity, active memberships, host role, settings, participant count) is stored exclusively in MongoDB.
   - Realtime presence (connected sockets, online status, multi-tab sessions) is tracked exclusively in-memory by `RoomPresenceManager`.
   - Ephemeral socket connect/disconnect operations **never** alter persistent membership and **never** increment `Room.currentParticipantsCount` or `stateVersion`.
   - Invariant preserved: `Room.currentParticipantsCount === count(active RoomMemberships)`.

2. **Monotonic Room State Versioning:**
   - Stored directly on `RoomModel` as `stateVersion: { type: Number, default: 1, min: 1 }`.
   - Every persistent mutation (`room.settings.updated`, `member.joined`, `member.left`, `member.kicked`, `room.closed`) executes an atomic `$inc: { stateVersion: 1 }` on the `Room` document.
   - Provides monotonic sequencing without requiring multi-document distributed lock engines or external event sourcing.

3. **Authoritative Room Snapshot with Dual Access (REST & Socket):**
   - Implemented `GET /api/v1/rooms/:id/state` and Socket event `room:state:snapshot` (with `room:state:request` on reconnect/gap).
   - Snapshot synthesizes persistent database state (`Room`, `Host`, active `RoomMembership[]`) with ephemeral presence (`RoomPresenceManager.getRoomOnlineUsers()`).
   - Private room authorization and moderation status are strictly validated at the server boundary before returning snapshot data.

4. **Self-Healing Version Gap & Reconnect Recovery:**
   - Client ignores duplicate or stale events (`event.version <= client.version`).
   - Client applies strictly sequential events (`event.version === client.version + 1`).
   - If a gap is detected (`event.version > client.version + 1`), the client transitions to `desynchronized` and requests an authoritative snapshot, safely recovering consistency even if intermediate socket broadcasts were lost during process hiccups or temporary network drops.

5. **Client-Side Unified State Layer (`useRoomState`):**
   - Replaced fragmented, competing React queries and socket presence listeners on the room page with a single authoritative hook: `useRoomState`.
   - Provides synchronized `room`, `host`, `members`, `onlineUserIds`, `viewer`, `version`, `syncStatus`, and `connectionStatus`.

---

## 3. Files Changed

### 3.1 Shared Contracts (`packages/contracts`)
- **[packages/contracts/src/room-state.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/room-state.ts)** (NEW)
  - `RoomSnapshotDtoSchema` / `RoomSnapshotDto`
  - `RoomViewerStateSchema` / `RoomViewerState`
  - `RoomStateSnapshotSchema` / `RoomStateSnapshotDto`
  - `RoomStateEventTypeSchema` / `RoomStateEventType`
  - `RoomStateEventSchema` / `RoomStateEventDto`
  - `RoomStateRequestPayloadSchema` / `RoomStateRequestPayload`
- **[packages/contracts/src/index.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/index.ts)**
  - Re-exported all `./room-state.js` types and schemas.
- **[packages/contracts/src/room.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/room.ts)**
  - Added `stateVersion: z.number().int().positive().default(1).optional()` to `RoomDtoSchema`.
- **[packages/contracts/src/realtime.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/realtime.ts)**
  - Added `ROOM_STATE_REQUEST: 'room:state:request'` to `SOCKET_EVENTS.CLIENT`.
  - Added `ROOM_STATE_SNAPSHOT: 'room:state:snapshot'` and `ROOM_STATE_EVENT: 'room:state:event'` to `SOCKET_EVENTS.SERVER`.

### 3.2 Backend Service & Socket Gateway (`apps/api`)
- **[apps/api/src/modules/rooms/room.types.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.types.ts)**
  - Added `stateVersion: number;` to `IRoom` interface.
- **[apps/api/src/modules/rooms/room.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts)**
  - Added `stateVersion: { type: Number, default: 1, min: 1 }` to `RoomSchema`.
  - Added `ret.stateVersion = doc.stateVersion ?? 1` to `toJSON` transform.
- **[apps/api/src/realtime/room-state.publisher.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room-state.publisher.ts)** (NEW)
  - Implemented `publishRoomStateEvent(roomId, type, payload, version)` which generates a unique `eventId`, current timestamp, and broadcasts `room:state:event` to room channel subscribers.
- **[apps/api/src/modules/rooms/room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts)**
  - `create`: Initializes `stateVersion: 1`.
  - `update`: Atomically increments `stateVersion: 1` and calls `publishRoomStateEvent('room.settings.updated')`.
  - `closeRoom`: Atomically increments `stateVersion: 1` and calls `publishRoomStateEvent('room.closed')`.
  - `joinRoom`: Atomically increments `currentParticipantsCount: 1` and `stateVersion: 1`, clears `kickedAt/kickedBy` on rejoin, and calls `publishRoomStateEvent('member.joined')`.
  - `leaveRoom`: Atomically decrements `currentParticipantsCount: -1` and increments `stateVersion: 1`, and calls `publishRoomStateEvent('member.left')`.
  - `kickMember`: Atomically decrements `currentParticipantsCount: -1` and increments `stateVersion: 1`, and calls `publishRoomStateEvent('member.kicked')`.
  - Implemented `getRoomStateSnapshot(roomId, requestingUserId)` with private room checks, kicked member guards, safe public DTO sanitization, presence integration, and viewer role computation.
- **[apps/api/src/modules/rooms/room.controller.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.controller.ts)**
  - Implemented `getRoomState` controller handler with 401/403/404 mapping and correlation logging.
- **[apps/api/src/modules/rooms/room.routes.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.routes.ts)**
  - Mounted `GET /:id/state` with `optionalAuth` to permit both guest viewers (for public rooms) and authenticated members.
- **[apps/api/src/realtime/room.events.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room.events.ts)**
  - Sends authoritative `room:state:snapshot` to the joining socket upon successful `room:join`.
  - Registered listener for `room:state:request` allowing clients to pull fresh authoritative snapshots over websocket with ack callbacks.

### 3.3 Frontend Application & Hooks (`apps/web`)
- **[apps/web/src/lib/api/endpoints/rooms.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/lib/api/endpoints/rooms.ts)**
  - Added `roomApi.getRoomState(roomId): Promise<RoomStateSnapshotDto>`.
- **[apps/web/src/hooks/queries/query-keys.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/queries/query-keys.ts)**
  - Added `queryKeys.rooms.state(roomId)`.
- **[apps/web/src/hooks/queries/use-room.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/queries/use-room.ts)**
  - Added `queryKeys.rooms.state(roomId)` invalidation to `useJoinRoom` and `useLeaveRoom`.
- **[apps/web/src/hooks/use-room-state.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/use-room-state.ts)** (NEW)
  - Centralized authoritative synchronization hook.
  - Handles initial REST snapshot hydration, monotonic event sequencing, stale/duplicate event suppression, version gap detection, snapshot refresh via socket or REST, ephemeral presence tracking, and reconnect re-synchronization.
- **[apps/web/src/components/shared/room-member-list.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/components/shared/room-member-list.tsx)**
  - Enhanced to accept optional authoritative `members` and `onRefresh` props, avoiding duplicate API calls and keeping member roster strictly unified with the room state hook.
- **[apps/web/src/app/(platform)/rooms/[roomId]/page.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/[roomId]/page.tsx)**
  - Integrated `useRoomState`.
  - Added subtle state synchronization status indicator into the realtime pill (`v{version}`, `synced`, `re-syncing`, `reconnecting`).
  - Unified member list, host controls, participation banner, and kick banners with authoritative state.

### 3.4 Documentation
- **[docs/SPRINT_2_2_AUDIT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_2_AUDIT.md)** (NEW)
- **[docs/ROOM_STATE_ARCHITECTURE.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/ROOM_STATE_ARCHITECTURE.md)** (NEW)
- **[docs/ROOM_MODERATION.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/ROOM_MODERATION.md)** (Updated)
- **[docs/SPRINT_2_2_IMPLEMENTATION_REPORT.md](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_2_IMPLEMENTATION_REPORT.md)** (NEW)

---

## 4. Endpoints & Realtime Contracts

### 4.1 REST Endpoints

| Method | Path | Auth Policy | Description | Response Schema |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/rooms/:id/state` | `optionalAuth` | Authoritative room state snapshot | `RoomStateSnapshotDto` |

**Security Controls:**
- Public rooms: Anonymous viewers receive snapshot with `viewer: { isMember: false, role: 'none', isKicked: false }`.
- Private rooms: Unauthenticated or non-member users receive `403 Forbidden` (`PRIVATE_ROOM_ACCESS_DENIED`).
- Kicked users: Users with an active kick record receive `403 Forbidden` (`FORBIDDEN_KICKED`).
- Data sanitization: Strip passwords, emails, refresh tokens, session identifiers, and MongoDB internal properties (`__v`).

### 4.2 Socket.IO Events

| Direction | Event Name | Payload Schema | Semantic |
| :--- | :--- | :--- | :--- |
| Server -> Client | `room:state:snapshot` | `RoomStateSnapshotSchema` | Delivered upon successful `room:join` subscription or re-subscription. |
| Server -> Client | `room:state:event` | `RoomStateEventSchema` | Versioned mutation broadcast for setting updates, joins, leaves, kicks, closure. |
| Client -> Server | `room:state:request` | `RoomStateRequestPayloadSchema` | Client request for immediate snapshot recovery upon gap detection or reconnect. |
| Server -> Client | `room:presence:snapshot` | `RoomPresenceSnapshotPayloadSchema` | Ephemeral list of online connected sockets (does not touch version). |
| Server -> Client | `room:member:joined` | `RoomMemberJoinedPayloadSchema` | Ephemeral user online transition (does not touch version). |
| Server -> Client | `room:member:left` | `RoomMemberLeftPayloadSchema` | Ephemeral user offline transition (does not touch version). |

---

## 5. Implementation Status Breakdown

### 5.1 Implemented and Statically Checked
- [x] Shared data contracts in `packages/contracts` (`RoomStateSnapshotSchema`, `RoomStateEventSchema`, `RoomViewerStateSchema`, `RoomSnapshotDtoSchema`).
- [x] Mongoose model field `stateVersion: number` with safe default of `1`.
- [x] Atomic `$inc: { stateVersion: 1 }` on all persistent room mutation paths in `RoomService`.
- [x] `RoomStatePublisher` broadcasting versioned `room:state:event` with monotonic versions.
- [x] `GET /api/v1/rooms/:id/state` REST endpoint with bounded queries and privacy/moderation guards.
- [x] Socket gateway emitting `room:state:snapshot` on `room:join` and handling `room:state:request`.
- [x] Frontend `useRoomState` hook with version gap detection, stale event suppression, and automatic snapshot rehydration.
- [x] Visual realtime synchronization status indicator (`v{version}`, `synced`, `re-syncing...`).
- [x] Ephemeral presence decoupled from persistent membership and occupancy invariants.
- [x] Complete static typecheck passing across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`.
- [x] Complete linting passing across monorepo with 0 errors and 0 warnings.

### 5.2 Implemented but Not Runtime Verified
- Socket reconnect under sustained high-latency network drops (deferred due to code-only policy).
- Multi-tab concurrence under simultaneous member kick and browser tab closure.
- Database rollback behavior under MongoDB server unexpected power interruption.

### 5.3 Deferred Features
- Multi-instance Socket.IO Redis adapter clustering (single-instance Node.js deployment assumption documented in audit).
- Generic distributed event sourcing outbox (snapshot recovery provides self-healing convergence without distributed queue overhead).

### 5.4 Blocked
- None.

---

## 6. Static Verification Results

### 6.1 TypeScript Compilation (`pnpm typecheck`)
```
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 729ms
apps/api typecheck$ tsc --noEmit
apps/web typecheck$ tsc --noEmit
└─ Done in 1.6s
└─ Done in 1.9s
```
**Result:** PASSED (0 errors).

### 6.2 ESLint Validation (`pnpm lint`)
```
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 737ms
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 883ms
└─ Done in 2s
```
**Result:** PASSED (0 errors, 0 warnings).

---

## 7. Database Migration & Deployment Instructions

### 7.1 Schema Changes
1. Added `stateVersion: { type: Number, default: 1, min: 1 }` to `RoomSchema`.
2. Existing rooms in the database without `stateVersion` automatically default to `1` when read or updated by Mongoose.
3. No destructive schema migrations are required.

### 7.2 Safe Database Backfill (Optional)
For existing production databases with pre-existing room documents:
```javascript
db.rooms.updateMany(
  { stateVersion: { $exists: false } },
  { $set: { stateVersion: 1 } }
);
```

---

## 8. Final Verdict

`CODE COMPLETE — NOT RUNTIME VERIFIED`
