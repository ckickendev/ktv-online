# KTVOnline — Sprint 4.0 — Phase 1: Realtime Connection & Presence Lifecycle Implementation Report

## A. Summary

- **Sprint:** 4.0 — Platform-Wide Subsystem Integration
- **Phase:** 1 — Realtime Connection & Presence Lifecycle (INT-01)
- **Baseline Commit:** `10089587eb4f6228feebbe16a0a4c787eda1cb2f` (Sprint 4.0 Phase 0 Audit)
- **Final Verdict:** `CODE COMPLETE — NOT RUNTIME VERIFIED`

---

## B. Problem & Root Cause (INT-01)

### 1. The Defect
When users navigated away from `/rooms/[roomId]` (e.g. returning to the discovery page `/rooms` or profile `/profile`), the Socket.IO connection remained active in the background. While [`use-room-state.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/use-room-state.ts) removed its local event listeners on unmount, it never sent `SOCKET_EVENTS.CLIENT.ROOM_LEAVE` to the server.

### 2. Root Cause
- **Unilateral Listener Detachment:** The client disconnected local callbacks but left the socket joined to `room:${roomId}` on the server.
- **Presence Ghosting:** Backend `RoomPresenceManager` only decremented online count upon socket disconnect. Navigation within the SPA left the user recorded as active in memory.
- **Cross-Room Channel Leakage:** Sockets navigating from Room A to Room B remained subscribed to Room A's channel on the server.
- **Unstable Callback Re-triggering:** `fetchSnapshot` had `room` in its dependency array, which caused `refreshState` to re-instantiate on every room state change, tearing down and re-subscribing the socket effect needlessly.

---

## C. Implementation Details

### 1. Emit `ROOM_LEAVE` in `useRoomState` Cleanup
In [`apps/web/src/hooks/use-room-state.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/use-room-state.ts), updated the `useEffect` cleanup return:
```typescript
return () => {
  // Leave room presence channel on unmount or when roomId changes
  if (socket.connected) {
    socket.emit(SOCKET_EVENTS.CLIENT.ROOM_LEAVE, { roomId: targetRoomId });
  }

  socket.off('connect', onConnectOrReconnect);
  socket.off(SOCKET_EVENTS.SERVER.ROOM_STATE_SNAPSHOT, handleRoomStateSnapshot);
  socket.off(SOCKET_EVENTS.SERVER.ROOM_STATE_EVENT, handleRoomStateEvent);
  socket.off(SOCKET_EVENTS.SERVER.PRESENCE_SNAPSHOT, handlePresenceSnapshot);
  socket.off(SOCKET_EVENTS.SERVER.MEMBER_JOINED, handleMemberJoinedPresence);
  socket.off(SOCKET_EVENTS.SERVER.MEMBER_LEFT, handleMemberLeftPresence);
  socket.off(SOCKET_EVENTS.SERVER.ROOM_CLOSED, handleRoomClosedNotice);
  bufferedEventsRef.current = [];
};
```

### 2. Stabilize Snapshot Callbacks with `roomRef`
Added `roomRef` to hold the latest `room` snapshot without triggering callback re-creation:
- `const roomRef = useRef<RoomSnapshotDto | null>(null); roomRef.current = room;`
- Removed `room` from `fetchSnapshot` dependencies.
- Removed `room?.status` from the background liveness check dependencies.
- Result: `fetchSnapshot`, `refreshState`, and the socket synchronization effect now have 100% stable references that only re-execute on genuine `roomId` or `enabled` transitions.

---

## D. Preserved Invariants

1. **Invariant A (Membership vs. Presence):** `ROOM_LEAVE` on the socket only leaves the Socket.IO channel and removes in-memory presence. It does NOT touch `RoomMembershipModel` in MongoDB.
2. **Invariant B (Multi-Device Safety):** `RoomPresenceManager.removeSocket()` operates per `socketId`. If a user has another active tab in the same room, `userSockets.size > 0` and the user remains online.
3. **Invariant C (Idempotent Cleanup):** Repeated cleanup calls on the server are safe no-ops (`this.socketMeta.get(socketId)` returns `null`).
4. **Invariant D (Route-Level Ownership):** `useRoomState` is the sole orchestrator of room subscription lifecycle in `page.tsx`. Child components never trigger premature unsubscriptions.
5. **Invariant E (Safe Room Switching):** When moving from Room A to Room B, the cleanup emits `ROOM_LEAVE` for Room A before the new effect emits `ROOM_JOIN` for Room B.
6. **Invariant F (Safe Reconnection):** Socket reconnect re-emits `ROOM_JOIN` only for the currently active `targetRoomId`.

---

## E. Files Changed

### Source Files Changed:
- [`apps/web/src/hooks/use-room-state.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/use-room-state.ts) — Added `ROOM_LEAVE` on cleanup, stabilized `fetchSnapshot` and liveness check with `roomRef`.

### Documentation Files Changed:
- [`docs/SPRINT_4_0_INTEGRATION_AUDIT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_4_0_INTEGRATION_AUDIT.md) — Added section `## INT-01 — Realtime Subscription Lifecycle Remediation`.
- [`docs/SPRINT_4_0_PHASE_1_IMPLEMENTATION_REPORT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_4_0_PHASE_1_IMPLEMENTATION_REPORT.md) — Created Phase 1 report.

---

## F. Static Verification

### 1. Monorepo Type Check (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 989ms
apps/api typecheck$ tsc --noEmit
apps/web typecheck$ tsc --noEmit
└─ Done in 1.7s
└─ Done in 2.4s
```
**Result:** PASSED (0 errors across contracts, API, and Web).

### 2. Monorepo Linting (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 739ms
apps/api lint$ eslint src/
└─ Done in 1s
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 2.1s
```
**Result:** PASSED (0 warnings, 0 errors).

---

## G. Deferred Runtime Verification Scenarios (Staging QA)

1. Open a room in one browser tab and navigate away to `/rooms`; verify online presence count decrements immediately on other users' screens.
2. Open the same room in two browser tabs; close one tab and verify the user remains online until the second tab is closed.
3. Switch rapidly from Room A to Room B; verify no events from Room A leak into Room B.
4. Simulate network disconnect and reconnect; verify active room presence and versioned state sync restore properly.
5. Verify that leaving a Socket.IO room channel does not remove the user's active membership in MongoDB.

---

## H. Final Verdict

`CODE COMPLETE — NOT RUNTIME VERIFIED`
