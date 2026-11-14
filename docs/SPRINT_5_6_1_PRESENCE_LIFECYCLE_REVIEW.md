# Sprint 5.6.1: Presence Realtime Lifecycle & Reliability Review

## 1. Executive Summary

Sprint 5.6.1 addressed three presence lifecycle defects identified during the Sprint 5.6 post-implementation audit:
1. **`DEF-PRES-01` (Severity: High / P1)**: `emitFriendPresenceUpdate` helper was defined but uninvoked by lifecycle events, leaving friend presence static unless manually polled.
2. **`DEF-PRES-02` (Severity: Low-Medium / P3)**: Lack of cross-room cleanup in `presenceManager.addSocket` when a client joined a new room without explicitly leaving the previous room.
3. **`DEF-PRES-03` (Severity: Medium / P3)**: `GlobalPresenceManager` lacked disconnect grace period alignment, causing temporary offline badge flicker on browser refreshes.

All three defects have been remediated in source code.

---

## 2. Realtime Presence Broadcast Wiring (`DEF-PRES-01`)

### 2.1 Implemented Broadcaster
In `apps/api/src/realtime/friend.events.ts`, implemented `broadcastUserPresenceToFriends`:
```typescript
export async function broadcastUserPresenceToFriends(
  io: Server<any, any, any, AuthenticatedSocketData> | null,
  userId: string
): Promise<void> {
  if (!io || !userId || !Types.ObjectId.isValid(userId)) return;

  try {
    const userObjectId = new Types.ObjectId(userId);
    const friendships = await FriendshipModel.find({
      $or: [
        { requesterId: userObjectId },
        { addresseeId: userObjectId },
      ],
      status: 'accepted',
    })
      .select('requesterId addresseeId')
      .lean()
      .exec();

    if (!friendships || friendships.length === 0) return;

    const userDoc = await UserModel.findById(userId).select('username').lean().exec();
    const username = userDoc?.username || '';

    await Promise.allSettled(
      friendships.map(async (f) => {
        const friendUserId =
          f.requesterId.toString() === userId
            ? f.addresseeId.toString()
            : f.requesterId.toString();

        const presence = await globalPresenceManager.getUserPresence(userId, friendUserId);
        emitFriendPresenceUpdate(io, friendUserId, {
          ...presence,
          username,
        });
      })
    );
  } catch (err) {
    logger.error({ err, userId }, 'Error broadcasting user presence to friends');
  }
}
```

### 2.2 Broadcast Trigger Points
`broadcastUserPresenceToFriends` is now triggered at all key state lifecycle boundaries:
1. **Socket Connection (`socket.server.ts`)**: When user opens their first tab/socket, broadcasting `online`.
2. **Socket Disconnection (`socket.server.ts`)**: When 10s grace period expires without reconnection, broadcasting `offline`.
3. **Room Join (`room.events.ts`)**: On first connection to room channel, transitioning status to `in_lounge` (or masked `Private Lounge`).
4. **Room Leave (`room.events.ts`)**: On explicit `room:leave` or room grace expiration, transitioning back to `online`.
5. **Member Eviction (`socket.server.ts`)**: When a host kicks a member, broadcasting their room departure.
6. **Karaoke Playback Transition (`karaoke.events.ts`)**: In `broadcastKaraokePlaybackUpdated`, broadcasting singing state for active performers.
7. **Privacy Visibility Update (`user.controller.ts`)**: When user updates `presenceVisibility` setting, broadcasting immediate visibility transition.

---

## 3. Room Switching Cleanup (`DEF-PRES-02`)

### 3.1 Problem
If a single client tab navigated directly from Room A to Room B via deep link or room browser without firing `room:leave`, `presenceManager.getUserRoom(userId)` continued referencing Room A or dual-registered the socket.

### 3.2 Fix
In `apps/api/src/realtime/presence.manager.ts` (`addSocket`):
```typescript
// Room switching cleanup (DEF-PRES-02): If socket was previously in a different room without explicit leave, evict it
const existingMeta = this.socketMeta.get(socketId);
if (existingMeta && existingMeta.roomId !== roomId) {
  const prevRoomId = existingMeta.roomId;
  const prevRoomMap = this.roomUsers.get(prevRoomId);
  if (prevRoomMap) {
    const prevUserSockets = prevRoomMap.get(existingMeta.userId);
    if (prevUserSockets) {
      prevUserSockets.delete(socketId);
      if (prevUserSockets.size === 0) {
        prevRoomMap.delete(existingMeta.userId);
      }
    }
    if (prevRoomMap.size === 0) {
      this.roomUsers.delete(prevRoomId);
    }
  }
}
```

---

## 4. Global Presence Disconnect Grace Period (`DEF-PRES-03`)

### 4.1 Problem
`RoomPresenceManager` had a 10-second grace period for unexpected socket disconnects, but `GlobalPresenceManager` had none. When a user refreshed their browser or navigated between pages, `GlobalPresenceManager.removeSocket` immediately removed the user from `userSockets`, causing friends to briefly see the user drop offline before popping back online 1 second later.

### 4.2 Fix: Generation-Fenced Disconnect Grace
In `apps/api/src/realtime/global-presence.manager.ts`:
- Added `pendingDisconnects = new Map<string, { timer: NodeJS.Timeout; generation: number }>()`.
- Added `userGenerations = new Map<string, number>()`.
- On unexpected socket disconnect:
  - `handleDisconnect(userId, socketId, 10000, onGraceExpired)`:
  - If other sockets remain active (multi-tab), no grace needed.
  - If last socket, starts a 10-second timer.
  - While timer is running, `isUserOnline(userId)` continues returning `true`.
  - If the client reconnects within 10 seconds, `addSocket` cancels the timer and increments generation fence.
  - If timer expires without reconnect, `userSockets.delete(userId)` executes and `broadcastUserPresenceToFriends` announces `offline`.
- On explicit logout or account eviction:
  - `removeSocket(userId, socketId)` cancels any pending grace timer and evicts immediately.

---

## 5. Lifecycle Summary

| Lifecycle Event | Presence State | Broadcast Emitted? | Grace Period Applied? |
| :--- | :--- | :--- | :--- |
| **Login / Connect** | `offline` -> `online` | Yes | Cancel pending grace if reconnect |
| **Page Refresh** | `online` (uninterrupted) | No spurious broadcast | 10s generation-fenced grace |
| **Network Drop (10s+)** | `online` -> `offline` | Yes (upon expiration) | 10s grace expires |
| **Join Public Room** | `online` -> `in_lounge` | Yes (`roomId`, `roomTitle`) | Room presence added |
| **Join Private Room** | `online` -> `in_lounge` | Yes (masked for outsiders) | Room presence added |
| **Start Singing** | `in_lounge` -> `singing` | Yes (`songTitle`) | Authoritative playback sync |
| **Leave Room** | `in_lounge` -> `online` | Yes | Room presence removed |
