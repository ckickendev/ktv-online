# KTVOnline — Sprint 3.8 Discovery & Architecture Audit: Host & Room Moderation Experience

**Baseline Commit:** `8b931b9feefb87397ead9c2e7408071ddadf36d8`  
**Phase:** Discovery & Architecture Audit  
**Author:** AI Coding Assistant & System Architect  
**Status:** In Progress -> Complete  

---

## 1. Executive Summary & Mission

KTVOnline is evolving from a functional karaoke lounge into a robust, social virtual nightlife platform:
> **"Your Virtual Hangout. Your Karaoke Night."**

Sprint 3.8 focuses on giving room hosts and designated moderators the authoritative tools to safely manage room participants, voice conduct, stage turns, and room access lifecycle without degrading the karaoke performance experience.

This audit inspects the existing room lifecycle, membership models, realtime socket architecture, LiveKit voice integration, karaoke queue/stage mechanics, and frontend control surfaces.

---

## 2. Codebase Inspection & Architecture Map

### 2.1 Key File Paths Inspected

| Subsystem | File Path | Current Role / Responsibility |
|---|---|---|
| **Room Models** | `apps/api/src/modules/rooms/room.model.ts`<br/>`apps/api/src/modules/rooms/room.types.ts` | Schema for `Room`: stores `ownerId`, `capacity`, `currentParticipantsCount`, `status`, `visibility`, `atmospherePreset`, `stateVersion`. Missing: `isLocked`. |
| **Membership Model** | `apps/api/src/modules/rooms/membership.model.ts`<br/>`apps/api/src/modules/rooms/membership.types.ts` | Schema for `RoomMembership`: stores `roomId`, `userId`, `role` (`'host' \| 'member'`), `status` (`'active' \| 'left'`), `joinedAt`, `kickedAt`, `kickedBy`. Missing: `'moderator'` role, `isMuted`, `mutedAt`, `mutedBy`. |
| **Room Service** | `apps/api/src/modules/rooms/room.service.ts` | Core operations: `create`, `joinRoom`, `leaveRoom`, `kickMember`, `closeRoom`, `getRoomStateSnapshot`. |
| **Room Controller & Routes** | `apps/api/src/modules/rooms/room.controller.ts`<br/>`apps/api/src/modules/rooms/room.routes.ts` | HTTP API endpoints for room management and membership. |
| **Voice Engine** | `apps/api/src/modules/voice/voice.service.ts`<br/>`apps/api/src/modules/voice/voice-token.service.ts` | Generates LiveKit access tokens; manages `evictLiveKitParticipant`, `evictUserFromAllRooms`, `closeLiveKitRoom`. |
| **Karaoke Service** | `apps/api/src/modules/karaoke/karaoke.service.ts` | Song queue, performer turns, playback commands (`play`, `pause`, `skip`), member departure cleanup. |
| **Realtime Gateway** | `apps/api/src/realtime/socket.server.ts`<br/>`apps/api/src/realtime/room.events.ts`<br/>`apps/api/src/realtime/room-state.publisher.ts` | Socket.IO server, channel routing, member eviction (`evictKickedMember`), monotonic room state events. |
| **Contracts** | `packages/contracts/src/room.ts`<br/>`packages/contracts/src/room-state.ts`<br/>`packages/contracts/src/realtime.ts` | Shared TypeScript interfaces and Zod validation schemas. |
| **Frontend UI** | `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`<br/>`apps/web/src/components/shared/room-member-list.tsx`<br/>`apps/web/src/components/rooms/kick-member-dialog.tsx`<br/>`apps/web/src/components/rooms/close-room-dialog.tsx`<br/>`apps/web/src/hooks/use-room-state.ts` | Client room state synchronization, member list, and dialogs. |

---

## 3. Detailed Subsystem Analysis

### 3.1 Room Lifecycle & Ownership
- **Ownership Representation**: `Room.ownerId` references `User._id`. The room owner is established at creation time and receives an initial `RoomMembership` with `role: 'host'`.
- **Room Closing**: `closeRoom(roomId)` transitions room status to `'closed'`, resets `currentParticipantsCount` to 0, sets all active memberships to `status: 'left'`, cleans up karaoke queue/playback, deletes the LiveKit room, and emits `room.closed`.
- **Host Departure**: In `room.service.ts:553`, the existing rule enforces:
  ```ts
  if (room.status !== 'closed' && room.ownerId.toString() === userId) {
    return { success: false, error: 'HOST_CANNOT_LEAVE' };
  }
  ```
  The host cannot leave an active lounge without either transferring host ownership or closing the room.
- **Room Access Control**:
  - `visibility: 'public' | 'private'` exists. Private rooms restrict joins to direct invitations.
  - **Locking gap**: There is currently no `isLocked` field on `RoomSchema`. A public room cannot be temporarily locked by the host to prevent new entries while keeping current members inside.

### 3.2 Membership & Role Representation
- **Role enum**:
  - In `membership.model.ts`: `enum: ['host', 'member']`.
  - In `packages/contracts/src/room.ts`: `RoomMembershipRoleSchema = z.enum(['host', 'member'])`.
  - In `packages/contracts/src/room-state.ts`: `RoomViewerStateSchema.role = z.enum(['host', 'member', 'viewer', 'none'])`.
  - **Finding**: The `'moderator'` role does NOT exist yet in database schemas or shared contracts.
- **Indexes & Uniqueness**:
  - Partial unique index `{ roomId: 1, userId: 1 }` with `{ status: 'active' }` guarantees only one active membership per user per room.
- **Kicking Mechanics**:
  - `RoomMembership` contains `kickedAt: Date` and `kickedBy: ObjectId`.
  - In `joinRoom`, a user with an existing `kickedAt != null` membership is blocked:
    ```ts
    if (kickedCheck && room.ownerId.toString() !== userId) {
      return { success: false, error: 'FORBIDDEN_KICKED' };
    }
    ```
  - **Finding**: Kicking currently requires `hostOwnerIdStr === hostUserId`. Moderators cannot kick. Furthermore, there is no mute state (`isMuted`) recorded on the membership.

### 3.3 LiveKit Voice Permissions & Moderation Mute
- **LiveKit Server SDK**: Uses `RoomServiceClient` from `livekit-server-sdk@2.19.2`.
- **Current Token Grants**: In `voice-token.service.ts:27`:
  ```ts
  token.addGrant({
    roomJoin: true,
    room: options.roomName,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
  });
  ```
- **LiveKit Server Capabilities**:
  `RoomServiceClient` provides:
  1. `updateParticipant(room, identity, metadata, permission)`: Allows dynamically setting `canPublish: false` on an active participant connection.
  2. `mutePublishedTrack(room, identity, trackSid, muted)`: Server-authoritative track mute.
  3. `removeParticipant(room, identity)`: Forcible eviction.
- **Finding & Requirement**:
  To prevent a muted participant from bypassing mute by requesting a new voice token or reconnecting, the server must store `isMuted: true` on `RoomMembership`. When `generateVoiceToken` is called, it must check `membership.isMuted` and issue a token with `canPublish: false` and `canPublishSources: []`.

### 3.4 Karaoke Queue & Playback Moderation
- **Removal**: In `karaoke.service.ts:536`, `removeFromQueue` authorizes:
  ```ts
  const isRequester = item.requestedBy.toString() === userId;
  const isHost = membership.role === 'host';
  if (!isRequester && !isHost) throw new Error('FORBIDDEN_UNAUTHORIZED_REMOVE');
  ```
  Moderators cannot currently remove queued songs.
- **Playback Skip/Pause**: In `karaoke.service.ts:775`, `handlePlaybackCommand` authorizes:
  ```ts
  let isAuthorized = membership.role === 'host';
  if (!isAuthorized && playbackState.currentQueueItemId) {
    const currentItem = await RoomQueueItemModel.findById(playbackState.currentQueueItemId).exec();
    if (currentItem && currentItem.requestedBy.toString() === userId) {
      isAuthorized = true;
    }
  }
  ```
  Moderators cannot currently skip or pause playback.
- **Reordering**: In `karaoke.service.ts:611`, `reorderQueue` restricts to `role: 'host'`.

---

## 4. Current vs. Target Permission Matrix

| Capability | Current State | Target State (Sprint 3.8) |
|---|---|---|
| **View member roster** | Anyone in room | Anyone in room (Host, Mod, Member, Viewer) |
| **Assign moderator** | Not implemented | **Host only** |
| **Revoke moderator** | Not implemented | **Host only** |
| **Mute participant voice** | Client-side only (self-toggle) | **Host & Moderator** (Server-authoritative via LiveKit & membership) |
| **Unmute participant voice** | Client-side only | **Host & Moderator** |
| **Remove member (kick)** | Host only | **Host & Moderator** (Mod cannot kick Host or other Mods) |
| **Transfer host ownership** | Not implemented | **Host only** |
| **Lock / unlock room** | Not implemented | **Host only** |
| **Close room** | Host only | **Host only** |
| **Remove song from queue** | Host & Requester | **Host, Moderator, & Requester** |
| **Skip current track** | Host & Performer | **Host, Moderator, & Performer** |
| **Reorder queue** | Host only | **Host & Moderator** |

---

## 5. Critical Risks & Invariant Analysis

1. **Host leaves while participants remain**:
   - *Current Behavior*: `leaveRoom` returns `HOST_CANNOT_LEAVE`. Host is forced to close the room.
   - *Risk*: If host disconnects their network, the room stays open with other singers, which is desirable, but the host cannot cleanly depart without killing the room.
   - *Resolution*: Implement atomic **Host Transfer**. Host transfers ownership to a moderator or active member, then can safely leave as a normal participant.
2. **Kicked participant retains active LiveKit audio session**:
   - *Current Behavior*: `roomService.kickMember` calls `voiceService.evictLiveKitParticipant(roomId, targetUserId)`.
   - *Verification*: If LiveKit server is unreachable, `recordPendingEviction` persists a task.
   - *Risk*: Target attempts to reconnect to voice with a cached token or fetches a new token.
   - *Resolution*: `generateVoiceToken` already checks `membership.kickedAt != null` and rejects with `FORBIDDEN_KICKED`. Verified secure.
3. **Muted participant bypasses mute via page refresh**:
   - *Risk*: If mute is only a LiveKit call or frontend flag, refreshing the browser requests a new voice token with `canPublish: true`.
   - *Resolution*: Persist `isMuted: true` on `RoomMembershipModel`. Check `membership.isMuted` in `generateVoiceToken` to enforce `canPublish: false`.
4. **Moderator attempts privilege escalation or mutual demotion**:
   - *Risk*: A rogue moderator tries to demote another moderator, kick the host, or promote themselves to host.
   - *Resolution*: All operations derive `actingUserId` from `req.user.id` (JWT). Strict role hierarchy validation on server:
     - `actor.role === 'host'` is required for: promote mod, demote mod, transfer host, lock room, close room.
     - Moderators can only moderate ordinary `member` participants. Target with `role === 'host'` or `role === 'moderator'` is rejected.
5. **Concurrent Host Transfers creating multiple hosts**:
   - *Risk*: Two concurrent transfer requests or a race condition during transfer could leave two hosts or an orphaned room.
   - *Resolution*: Conditional MongoDB query on `RoomModel.findOneAndUpdate({ _id: roomId, ownerId: currentHostId }, { $set: { ownerId: targetUserId }, $inc: { stateVersion: 1 } })`. If `nModified === 0`, the transfer aborts atomically.

---

## 6. Implementation Architecture Plan

### Phase 1: Shared Contracts (`packages/contracts`)
1. Extend `RoomMembershipRoleSchema` to `z.enum(['host', 'moderator', 'member'])`.
2. Extend `RoomViewerStateSchema.role` to `z.enum(['host', 'moderator', 'member', 'viewer', 'none'])`.
3. Add `isMuted?: boolean`, `mutedAt?: string | null` to `RoomMembershipDtoSchema`.
4. Add `isLocked?: boolean` to `RoomDtoSchema`, `RoomSnapshotDtoSchema`, and `UpdateRoomSchema`.
5. Add DTOs and payload schemas:
   - `UpdateMemberRoleSchema` (`role: 'moderator' | 'member'`)
   - `MuteMemberSchema` (`isMuted: boolean`, `reason?: string`)
   - `TransferHostSchema` (`newHostUserId: string`)
   - `LockRoomSchema` (`isLocked: boolean`)
6. Extend `RoomStateEventTypeSchema` with:
   - `'member.role.updated'`
   - `'member.muted'`
   - `'member.unmuted'`
   - `'room.lock.updated'`
   - `'room.host.transferred'`

### Phase 2: Backend Persistence & API (`apps/api`)
1. **`membership.model.ts`**:
   - Update `role` enum to `['host', 'moderator', 'member']`.
   - Add `isMuted: { type: Boolean, default: false }`, `mutedAt: { type: Date, default: null }`, `mutedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }`.
2. **`room.model.ts`**:
   - Add `isLocked: { type: Boolean, default: false }`.
3. **`voice.service.ts` & `voice-token.service.ts`**:
   - In `generateVoiceToken`: check `membership.isMuted`. If muted, pass `canPublish: false` to `voiceTokenService.generateToken`.
   - Implement `muteLiveKitParticipant(roomId, userId, isMuted)` using `RoomServiceClient.updateParticipant` and `mutePublishedTrack`.
4. **`room.service.ts`**:
   - `updateMemberRole(roomId, actorId, targetUserId, newRole)`: Host assigns/revokes moderator.
   - `muteMember(roomId, actorId, targetUserId, isMuted, reason)`: Host or Moderator mutes/unmutes participant.
   - `kickMember(roomId, actorId, targetUserId, reason)`: Updated to allow Moderators to kick ordinary members (preserving host and mod protection).
   - `transferHost(roomId, currentHostId, targetUserId)`: Atomic ownership handover.
   - `setRoomLock(roomId, hostId, isLocked)`: Host toggles room lock.
   - `joinRoom`: Rejects new joins if `room.isLocked && !existingMembership && !isHost`.
5. **`karaoke.service.ts`**:
   - Allow `moderator` to remove queued tracks, skip tracks, and reorder queue.
6. **`room.controller.ts` & `room.routes.ts`**:
   - Mount `POST /api/rooms/:id/members/:userId/role`
   - Mount `POST /api/rooms/:id/members/:userId/mute`
   - Mount `POST /api/rooms/:id/transfer-host`
   - Mount `POST /api/rooms/:id/lock`

### Phase 3: Realtime & Socket Integration
1. Extend `RoomStatePublisher` events to emit authoritative state updates for role changes, mutes, locks, and transfers.
2. In `socket.server.ts`:
   - When a member is muted, notify their socket and broadcast `room:member:muted`.
   - When a host is transferred, broadcast `room:host:transferred`.
3. Update `use-room-state.ts` to handle `'member.role.updated'`, `'member.muted'`, `'member.unmuted'`, `'room.lock.updated'`, and `'room.host.transferred'` monotonically.

### Phase 4: Frontend UI Components
1. **`RoomMemberList`**:
   - Display role badges: Crown for Host, Shield for Moderator.
   - Context action menu for Host & Moderator:
     - Mute / Unmute microphone.
     - Remove from room (Kick).
     - Promote to Moderator / Demote to Member (Host only).
     - Transfer Room Host (Host only).
2. **`RoomManagementPanel` / Dialog**:
   - Compact Host controls in room header:
     - Room Lock toggle with live indicator.
     - Close room dialog.
3. **Notification / Feedback**:
   - Toast/banner when viewer is muted by a moderator.
   - Realtime update when viewer is promoted or demoted.

---

## 7. Deferred Items & Limitations

- **Platform-wide global bans / IP blacklists**: Deferred. In-room moderation is strictly room-scoped via `RoomMembership.kickedAt`.
- **Scheduled temporary bans (e.g. 15-minute timeout)**: Deferred to keep time synchronization simple; kicked users remain expelled until the room closes or the host reinstates them.
- **Audio stream packet inspection**: LiveKit handles WebRTC transport; moderation relies on LiveKit server track mute and permission grants.

---

## 8. Audit Verdict

**`AUDIT COMPLETE`**
No architectural blockers found. Ready to proceed to implementation.
