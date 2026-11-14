# Sprint 5.6.1.1: Presence Lifecycle & Privacy Audit

## 1. Objective & Scope

Audit presence broadcast wiring, generation fencing, room switching, disconnect grace periods, and privacy masking across:
- `apps/api/src/realtime/friend.events.ts`
- `apps/api/src/realtime/global-presence.manager.ts`
- `apps/api/src/realtime/presence.manager.ts`
- `apps/api/src/realtime/socket.server.ts`
- `apps/api/src/realtime/room.events.ts`
- `apps/api/src/realtime/karaoke.events.ts`
- `apps/api/src/modules/users/user.controller.ts`

---

## 2. Verification Checklist

### 2.1 Broadcast Trigger Wiring
**Status: VERIFIED.**
`broadcastUserPresenceToFriends(io, userId)` is fully wired to all core lifecycle transitions:
1. `socket.server.ts:65`: On first socket connection -> broadcasts `online`.
2. `socket.server.ts:72`: On disconnect grace expiration -> broadcasts `offline`.
3. `socket.server.ts:189`: On member kick -> broadcasts departure.
4. `room.events.ts:173`: On room join first connection -> broadcasts room presence.
5. `room.events.ts:243`: On room leave last socket -> broadcasts room exit.
6. `room.events.ts:361`: On room disconnect grace expiration -> broadcasts room exit.
7. `room.events.ts:378`: On immediate disconnect -> broadcasts room exit.
8. `karaoke.events.ts:68`: On playback update -> broadcasts singer state transition.
9. `user.controller.ts:107`: On user preference update -> broadcasts updated visibility.

### 2.2 Generation-Fenced Disconnection Grace Period
**Status: VERIFIED.**
In `GlobalPresenceManager`:
- Unexpected disconnects start a 10-second timer (`handleDisconnect`).
- Uses `userGenerations` map to fence timer execution.
- If user reconnects within 10s, `addSocket` invokes `cancelPendingDisconnect` and increments generation, preventing spurious offline emission.
- If last socket closes and 10s elapses, `onGraceExpired` executes and emits offline update.

### 2.3 Room Switching Association Cleanup
**Status: VERIFIED.**
In `RoomPresenceManager.addSocket` (`apps/api/src/realtime/presence.manager.ts:73-90`):
If `existingMeta && existingMeta.roomId !== roomId`, the socket is explicitly deleted from `prevRoomMap` and empty rooms are cleaned up prior to registering in the new room.

### 2.4 Immediate Explicit Leave and Eviction
**Status: VERIFIED.**
- `room:leave` immediately calls `presenceManager.removeSocket` and broadcasts `MEMBER_LEFT`.
- `evictKickedMember` immediately removes socket from channel and presence, and cleans up karaoke queue.

### 2.5 Privacy Masking & Stealth Enforcement
**Status: VERIFIED.**
In `globalPresenceManager.getUserPresence`:
- If `preferences.presenceVisibility === 'none'`, returns `offlinePresence` to all viewers except the user themselves.
- If `room.visibility === 'private'` and viewer is NOT inside the same room:
  - `roomId` is set to `null`
  - `roomTitle` is masked to `'Private Lounge'`
  - `songTitle` is set to `null`
  - `isPrivateLounge` is set to `true`
- Authorized friends only: `broadcastUserPresenceToFriends` queries `FriendshipModel` where `status === 'accepted'`, emitting only to `user:${friendUserId}` channels.

---

## 3. Findings
No source-level defects identified in the presence and privacy subsystem. All lifecycle events and privacy masking mechanisms are verified at source code level.
