# Sprint 5.6 Source Audit: Global Presence Lifecycle & Synchronization

**Audit Target:** Real-time Presence Architecture, Sockets, and Lifecycle Synchronization  
**Sprint Baseline Commit:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`  
**Files Inspected:**
- `apps/api/src/realtime/global-presence.manager.ts`
- `apps/api/src/realtime/presence.manager.ts`
- `apps/api/src/realtime/socket.server.ts`
- `apps/api/src/realtime/room.events.ts`
- `apps/api/src/realtime/friend.events.ts`
- `apps/web/src/features/friends/hooks/use-friends.ts`
**Audit Date:** November 2026  
**Auditor:** Antigravity Source Security & Architecture Auditor  

---

## 1. Executive Summary

This audit evaluates the real-time presence system introduced in Sprint 5.6. The implementation combines two presence managers:
1. `RoomPresenceManager` (`apps/api/src/realtime/presence.manager.ts`): Scoped to room occupants, managing room join/leave and a 10-second disconnection grace period.
2. `GlobalPresenceManager` (`apps/api/src/realtime/global-presence.manager.ts`): Tracks all authenticated sockets connected to the server and computes presence states (`offline`, `online`, `in_lounge`, `singing`).

The audit verified core multi-socket handling and room masking, but uncovered **three critical source-level defects** in lifecycle synchronization and proactive event broadcast.

---

## 2. Detailed Lifecycle & Concurrency Verification

### 2.1. Multiple Sockets per User
- **Location:** `apps/api/src/realtime/global-presence.manager.ts#L16-L30`
- **Source Verification:**
  ```typescript
  addSocket(userId: string, socketId: string): { isFirstConnection: boolean; totalOnline: number } {
    let sockets = this.userSockets.get(userId);
    const isFirstConnection = !sockets || sockets.size === 0;

    if (!sockets) {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    return { isFirstConnection, totalOnline: this.userSockets.size };
  }
  ```
- **Finding:** Correct. The `userSockets` map stores a `Set<string>` of active socket IDs per user. Multiple browser tabs or devices correctly increment the set without race conditions.

### 2.2. Disconnection of Single Socket vs. Last Socket
- **Location:** `apps/api/src/realtime/global-presence.manager.ts#L35-L52`
- **Source Verification:**
  ```typescript
  removeSocket(userId: string, socketId: string): { isLastDisconnection: boolean; totalOnline: number } {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return { isLastDisconnection: false, totalOnline: this.userSockets.size };
    }

    sockets.delete(socketId);
    const isLastDisconnection = sockets.size === 0;
    if (isLastDisconnection) {
      this.userSockets.delete(userId);
    }
    return { isLastDisconnection, totalOnline: this.userSockets.size };
  }
  ```
- **Finding:** Correct. If tab 1 disconnects while tab 2 is open, `sockets.size === 1`, so `isLastDisconnection` is false and the user remains `online`. Only when the last socket drops does `isLastDisconnection` return true and the user key is evicted.

---

## 3. Discovered Source-Level Defects & Inconsistencies

### 3.1. DEFECT-PRES-01: Proactive Presence Broadcast Decoupling (Dead-End Helper)
- **Locations:**
  - `apps/api/src/realtime/friend.events.ts#L39-L46`
  - `apps/api/src/realtime/socket.server.ts#L62-L67`
  - `apps/web/src/features/friends/hooks/use-friends.ts#L48-L77`
- **Evidence:**
  `apps/api/src/realtime/friend.events.ts` exports:
  ```typescript
  export function emitFriendPresenceUpdate(
    io: Server<any, any, any, AuthenticatedSocketData> | null,
    recipientUserId: string,
    payload: FriendPresenceUpdatedPayload
  ): void {
    if (!io) return;
    io.to(getUserChannel(recipientUserId)).emit(SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED, payload);
  }
  ```
  A search across the entire codebase reveals that `emitFriendPresenceUpdate` is **never called anywhere in `apps/api`**.
  - When a user connects or disconnects (`socket.server.ts#L52-L67`), no presence update is emitted to their friends.
  - When a user joins or leaves a room (`room.events.ts`), no presence update is emitted to their friends.
  - When a user transitions to `singing` or finishes singing (`karaoke.events.ts`), no presence update is emitted to their friends.
  - Furthermore, `apps/web` never sends `SOCKET_EVENTS.CLIENT.FRIEND_PRESENCE_REQUEST`.
- **Impact:** Real-time presence updates over Socket.IO are non-functional in practice. The client only receives updated presence because `useFriends()` in `apps/web/src/features/friends/hooks/use-friends.ts#L22` falls back to polling `GET /api/v1/friends` every 30 seconds (`refetchInterval: 30_000`). Presence transitions lag by up to 30 seconds.

### 3.2. DEFECT-PRES-02: Room Switching without Explicit Leave Causes Presence Map Leak
- **Locations:**
  - `apps/api/src/realtime/presence.manager.ts#L74-L92`
  - `apps/api/src/realtime/presence.manager.ts#L344-L355`
  - `apps/api/src/realtime/room.events.ts#L148-L155`
- **Evidence:**
  In `RoomPresenceManager.addSocket`:
  ```typescript
  this.socketMeta.set(socketId, { userId, username, avatar, role, roomId });
  ```
  `socketMeta` is a `Map<string, SocketMetadata>`, storing only ONE `roomId` per `socketId`.
  If a client socket navigates from `roomA` to `roomB` without first dispatching `room:leave`:
  1. `this.roomUsers.get('roomA')` still holds `socketId` under `userId`.
  2. `this.roomUsers.get('roomB')` now also adds `socketId` under `userId`.
  3. `this.socketMeta.set(socketId, ...)` overwrites metadata with `roomId: 'roomB'`.
  4. In `RoomPresenceManager.getUserRoom(userId)`:
     ```typescript
     for (const [roomId, userMap] of this.roomUsers.entries()) {
       const userSockets = userMap.get(userId);
       if (userSockets && userSockets.size > 0) {
         const details = this.userDetails.get(userId);
         return { roomId, role: details?.role || 'member' };
       }
     }
     ```
     `getUserRoom` iterates `this.roomUsers.entries()`. Whichever room was inserted first into the Map (`roomA`) is returned, causing `GlobalPresenceManager` to falsely report the user as being in `roomA` indefinitely.
  5. When the socket disconnects, `removeSocket(socketId)` reads `meta.roomId` (`roomB`) and deletes the socket from `roomB`. `roomA` retains the orphaned socket ID in its `userSockets` set until server restart.

### 3.3. DEFECT-PRES-03: Grace Period Asymmetry Between Global and Room Presence
- **Locations:**
  - `apps/api/src/realtime/socket.server.ts#L65-L67`
  - `apps/api/src/realtime/room.events.ts#L330-L355`
  - `apps/api/src/realtime/global-presence.manager.ts#L116-L118`
- **Evidence:**
  - In `socket.server.ts#L65`:
    ```typescript
    socket.on('disconnect', () => {
      globalPresenceManager.removeSocket(userId, socket.id);
    });
    ```
    `globalPresenceManager.removeSocket` immediately deletes the user's socket synchronously upon disconnection.
  - In `room.events.ts#L332`, `RoomPresenceManager` starts a **10-second grace timer**:
    ```typescript
    presenceManager.removeSocket(socket.id, 10000, async () => { ... });
    ```
  - If a user on a single tab refreshes their browser or suffers a momentary 1-second packet drop:
    - For 1 second, `globalPresenceManager.isUserOnline(userId)` is `false`.
    - Any friend querying `getUserPresence` during this interval is returned `status: 'offline'` (line 116: `if (!this.isUserOnline(targetUserId)) return offlinePresence;`).
    - After the socket reconnects (e.g. 1.2s later), `RoomPresenceManager`'s grace timer is cancelled and the user returns to `in_lounge`.
  - This asymmetry causes user presence to flicker to `offline` on every page refresh or temporary socket reconnect.

---

## 4. Presence State Verification Matrix

| Real-World Scenario | `GlobalPresenceManager` State | `RoomPresenceManager` State | Reported Status | Verification Status |
|---|---|---|---|---|
| User connects to web app, not in any room | 1 socket | Empty | `'online'` | **Verified** |
| User enters a public room | 1 socket | Occupant in `roomMap` | `'in_lounge'` (with room details) | **Verified** |
| User is assigned singer on stage | 1 socket | Occupant in `roomMap`, playback singer match | `'singing'` (with song title) | **Verified** |
| User in private room | 1 socket | Occupant in private room | `'in_lounge'` (`roomId: null`, masked) | **Verified** |
| User explicitly leaves room | 1 socket | Evicted from `roomMap` | `'online'` | **Verified** |
| User kicked by host | 1 socket | Evicted from `roomMap` | `'online'` | **Verified** |
| User closes browser tab | 0 sockets | Grace period timer active (10s) | `'offline'` (immediate, flickers) | **Defect (DEF-PRES-03)** |
| User switches room without `room:leave` | 1 socket | Duplicate entries in `roomA` & `roomB` | Stuck on older room | **Defect (DEF-PRES-02)** |
| User starts singing on stage | 1 socket | Playing | Friends not notified in realtime | **Defect (DEF-PRES-01)** |

---

## 5. Audit Conclusion

The presence hierarchy and privacy masking algorithms in `GlobalPresenceManager.getUserPresence` are mathematically sound. However, the presence subsystem is **not fully integrated into the event lifecycle**: presence updates do not broadcast proactively (DEF-PRES-01), room switching without explicit leave leaks presence metadata (DEF-PRES-02), and grace periods between room and global presence are unsynchronized (DEF-PRES-03).
