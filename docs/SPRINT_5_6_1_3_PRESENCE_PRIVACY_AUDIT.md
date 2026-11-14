# Sprint 5.6.1.3: Presence Lifecycle & Privacy Audit

## 1. Scope & Modules Inspected

- `apps/api/src/realtime/global-presence.manager.ts`
- `apps/api/src/realtime/presence.manager.ts`
- `apps/api/src/realtime/friend.events.ts`
- `apps/api/src/realtime/socket.server.ts`
- `apps/api/src/realtime/room.events.ts`
- `apps/api/src/realtime/karaoke.events.ts`
- `apps/api/src/modules/users/user.controller.ts`

---

## 2. Multi-Socket & Disconnect Grace Verification (Phase 5)

### 2.1 Multi-Socket State Tracking
In `GlobalPresenceManager`:
- Sockets are stored in `userSockets = new Map<string, Set<string>>()`.
- When a user opens multiple tabs or devices, each socket ID is added to the user's set.
- When one socket disconnects:
  ```typescript
  sockets.delete(socketId);
  if (sockets.size > 0) {
    return { isPendingGrace: false, immediateLastDisconnection: false };
  }
  ```
  If other sockets remain active, no grace timer is scheduled and presence remains online.

### 2.2 Generation-Fenced 10-Second Grace Period
- When the last active socket disconnects unexpectedly:
  ```typescript
  const generation = (this.userGenerations.get(userId) || 0) + 1;
  this.userGenerations.set(userId, generation);

  const timer = setTimeout(() => {
    this.pendingDisconnects.delete(userId);
    if (this.userGenerations.get(userId) === generation) {
      const remainingSockets = this.userSockets.get(userId);
      if (!remainingSockets || remainingSockets.size === 0) {
        this.userSockets.delete(userId);
        onGraceExpired();
      }
    }
  }, gracePeriodMs);
  ```
- If the user reconnects within 10 seconds:
  `addSocket` calls `cancelPendingDisconnect(userId)`, clearing the timer and incrementing `generation`. The user never transitions to offline.
- If the user does not reconnect within 10 seconds:
  `onGraceExpired()` fires, removing the user from `userSockets` and triggering `broadcastUserPresenceToFriends(io, userId)` with `status: 'offline'`.

### 2.3 Room Switching Association Cleanup
In `RoomPresenceManager.addSocket` (`presence.manager.ts#L74-L90`):
If a socket is already tracked under `socketMeta` with a different `roomId`, it is evicted from the previous room (`prevUserSockets.delete(socketId)`) and empty room maps are purged before joining the new room.

### 2.4 Immediate Departure on Explicit Actions
- `room:leave` immediately removes socket from `RoomPresenceManager` and emits `MEMBER_LEFT`.
- `evictKickedMember` immediately forces socket channel departure, clears room presence, and broadcasts `MEMBER_LEFT` and friend presence update.

---

## 3. Privacy Masking & Broadcast Recipient Protection

### 3.1 Stealth Mode (`presenceVisibility: 'none'`)
In `globalPresenceManager.getUserPresence`:
If `preferences.presenceVisibility === 'none'`, returns `offlinePresence` to all viewers except the user themselves.

### 3.2 Private Lounge Masking
When a user is inside a private room (`room.visibility === 'private'`):
If the viewer is NOT already inside the same room:
- `roomId`: `null`
- `roomTitle`: `'Private Lounge'` (generic constant; custom title hidden)
- `songTitle`: `null` (singing details hidden)
- `isPrivateLounge`: `true` (renders subtle lock indicator)

### 3.3 Broadcast Recipient Isolation
In `broadcastUserPresenceToFriends`:
Queries `FriendshipModel` where `(requesterId === userId || addresseeId === userId) && status === 'accepted'`. Emits strictly to `io.to(getUserChannel(friendUserId))` (i.e. `user:${friendUserId}`). Third parties and non-friends never receive presence updates.

### 3.4 Lifecycle Broadcast Triggers
Presence updates are triggered only upon real state transitions:
1. First socket connect (`socket.server.ts#L65`)
2. Disconnect grace expiration (`socket.server.ts#L72`)
3. Room join first connection (`room.events.ts#L173`)
4. Room leave last socket (`room.events.ts#L243`)
5. Room disconnect grace expiration (`room.events.ts#L361`)
6. Member kick (`socket.server.ts#L189`)
7. Karaoke performer change (`karaoke.events.ts#L68`)
8. Visibility preference update (`user.controller.ts#L107`)
No high-frequency loops or cyclic broadcasts exist.

---

## 4. Audit Conclusion
Presence lifecycle, disconnect grace, and privacy masking are **fully verified**. Zero defects identified.
