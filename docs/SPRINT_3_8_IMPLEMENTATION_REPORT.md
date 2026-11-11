# KTVOnline — Sprint 3.8: Host & Room Moderation Experience Implementation Report

**Sprint:** 3.8  
**Baseline Commit:** `8b931b9feefb87397ead9c2e7408071ddadf36d8`  
**Mission:** Equip room hosts and designated co-moderators with authoritative, safe, and hierarchy-respecting tools to govern virtual karaoke lounges, voice conduct, stage queue turns, and access lifecycle.  
**Final Status:** `CODE COMPLETE — NOT RUNTIME VERIFIED`  

---

## 1. Executive Summary

Sprint 3.8 establishes a comprehensive Host & Moderation architecture across KTVOnline. It introduces:
1. **Delegated Role Hierarchy:** Extended room roles to include `'moderator'` alongside `'host'` and `'member'`.
2. **Authoritative Voice Muting:** Double-enforced voice muting via LiveKit Server SDK track mute/permission revocation AND database persistence on `RoomMembershipModel`, preventing token refresh bypasses.
3. **Room Locking Lifecycle:** An atomic `isLocked` flag that stops new joins (`ROOM_LOCKED`) without disrupting ongoing karaoke playback, voice chat, or existing participants.
4. **Safe Host Transfer:** Atomic ownership handoff from host to an active member with automatic role adjustments and room-wide realtime synchronization.
5. **Stage & Queue Authority:** Delegated playback commands (skip, pause, stop) and queue reordering/removal permissions for both hosts and moderators.
6. **Polished Frontend Experience:** Role badges (Crown, Shield), mute strike-through indicators, inline moderation actions, room lock toggle, and persistent alerts for muted participants.

---

## 2. Workstream Breakdown & Deliverables

### Workstream A: Shared Contracts (`packages/contracts`)
- **`src/room.ts`**:
  - Extended `RoomMembershipRoleSchema` to `z.enum(['host', 'moderator', 'member'])`.
  - Added `isLocked: z.boolean().default(false).optional()` to `RoomDtoSchema` and `UpdateRoomSchema`.
  - Extended `RoomMembershipDtoSchema` with `isMuted: z.boolean().default(false)` and `mutedAt: z.string().datetime().optional().nullable()`.
  - Defined request schemas: `UpdateMemberRoleSchema`, `MuteMemberSchema`, `TransferHostSchema`, `LockRoomSchema`.
- **`src/room-state.ts`**:
  - Added `isLocked` to `RoomSnapshotDtoSchema`.
  - Added `role: 'moderator'` and `isMuted: z.boolean().default(false)` to `RoomViewerStateSchema`.
  - Added moderation event types to `RoomStateEventTypeSchema`: `'member.role.updated'`, `'member.muted'`, `'member.unmuted'`, `'room.lock.updated'`, `'room.host.transferred'`.
- **`src/realtime.ts`**:
  - Registered server socket events: `MEMBER_ROLE_UPDATED`, `MEMBER_MUTED`, `ROOM_LOCK_UPDATED`, `ROOM_HOST_TRANSFERRED`.
  - Added typed payload schemas: `MemberRoleUpdatedPayloadSchema`, `MemberMutedPayloadSchema`, `RoomLockUpdatedPayloadSchema`, `RoomHostTransferredPayloadSchema`.
- **`src/chat.ts`**:
  - Extended `RoomActivityTypeSchema` with moderation timeline activities: `'member_role_updated'`, `'member_muted'`, `'member_unmuted'`, `'room_host_transferred'`, `'room_locked'`, `'room_unlocked'`.

### Workstream B: Backend Persistence & Domain Logic (`apps/api`)
- **`modules/rooms/membership.model.ts` & `membership.types.ts`**:
  - Updated `role` enum in Mongoose schema to include `'moderator'`.
  - Added `isMuted: { type: Boolean, default: false }`, `mutedAt: { type: Date }`, `mutedBy: { type: Schema.Types.ObjectId, ref: 'User' }`.
  - Serialized moderation properties in `toJSON()`.
- **`modules/rooms/room.model.ts` & `room.types.ts`**:
  - Added `isLocked: { type: Boolean, default: false }` to `RoomModel` and serialized in `toJSON()`.
- **`modules/rooms/room.service.ts`**:
  - `joinRoom`: Rejects non-members when `room.isLocked === true` with `{ success: false, error: 'ROOM_LOCKED' }`.
  - `kickMember`: Enforces moderation hierarchy (host can kick any non-host; moderator can kick members; moderator cannot kick host or peer moderators).
  - `updateMemberRole`: Host-only promotion/demotion between `'moderator'` and `'member'`. Emits `member.role.updated` event and records chat timeline activity.
  - `muteMember`: Host or moderator can mute/unmute voice. Updates database, invokes LiveKit server track mute, emits `member.muted`/`member.unmuted`, and records chat timeline activity.
  - `transferHost`: Host-only atomic ownership transfer. Sets `room.ownerId`, demotes previous host to `'member'`, promotes new host to `'host'`, bumps `stateVersion`, and dispatches `room.host.transferred`.
  - `setRoomLock`: Host-only toggle for `room.isLocked`. Emits `room.lock.updated` and records timeline activity.
  - `getRoomStateSnapshot`: Populates authoritative viewer moderation state (`viewer.isMuted`, `viewer.role`, `roomSnapshot.isLocked`).
- **`modules/karaoke/karaoke.service.ts`**:
  - Granted `'moderator'` permissions to remove queue items, reorder items, and execute playback commands (play, pause, skip, stop).
- **`modules/rooms/room.controller.ts` & `room.routes.ts`**:
  - Mounted REST endpoints:
    - `POST /api/rooms/:id/members/:userId/role`
    - `POST /api/rooms/:id/members/:userId/mute`
    - `POST /api/rooms/:id/transfer-host`
    - `POST /api/rooms/:id/lock`

### Workstream C: LiveKit WebRTC Voice Moderation (`apps/api/src/modules/voice`)
- **`voice-token.service.ts`**:
  - Token creation now checks `options.canPublish`. If false, grants `canPublishSources: []`.
- **`voice.service.ts`**:
  - `generateVoiceToken`: Verifies membership. If `membership.isMuted === true`, token is generated with `canPublish: false`, disallowing audio publishing.
  - `muteLiveKitParticipant`: Utilizes LiveKit Server SDK `RoomServiceClient` to update participant permissions (`canPublish: !isMuted`, `canPublishSources: []`) and calls `mutePublishedTrack` to immediately silence ongoing microphone audio.

### Workstream D: Frontend UI & Client State (`apps/web`)
- **`lib/api/endpoints/rooms.ts`**:
  - Added API client methods: `updateMemberRole`, `muteMember`, `transferHost`, `setRoomLock`.
- **`hooks/queries/use-room-mutations.ts`**:
  - Implemented TanStack mutations: `useUpdateMemberRole`, `useMuteMember`, `useTransferHost`, `useSetRoomLock`.
- **`hooks/use-room-state.ts`**:
  - Added real-time event listeners and local snapshot state transitions for:
    - `'member.role.updated'`
    - `'member.muted'`
    - `'member.unmuted'`
    - `'room.lock.updated'`
    - `'room.host.transferred'`
- **`features/karaoke/hooks/use-karaoke.ts`**:
  - Added `isModerator?: boolean` option and included moderator authority in `canControlPlayback`.
- **`components/rooms/transfer-host-dialog.tsx`**:
  - Created a dedicated confirmation modal with explicit warnings about irreversible host handoff.
- **`components/shared/room-member-list.tsx`**:
  - Renders Host Crown badge and Moderator Shield badge.
  - Renders Muted badge and strike-through indicator for muted members.
  - Action buttons with hierarchy-safe checks:
    - Mute/Unmute toggle (`MicOff` / `VolumeX`)
    - Promote/Demote Moderator (`Shield`)
    - Transfer Host (`Crown`)
    - Kick member (`UserX`)
- **`app/(platform)/rooms/[roomId]/page.tsx`**:
  - Room Header: Displays `Locked` badge when `room.isLocked`.
  - Host Controls: Added `Lock / Unlock` toggle button.
  - Moderator Badge: Displays `Mod` indicator for active moderators.
  - Target User Alert: Displays an amber notification banner when `viewer.isMuted`.
  - Wired all moderation dialogs (`TransferHostDialog`, `KickMemberDialog`).
  - Passed moderation permissions to queue and member lists for both desktop and mobile layouts.

---

## 3. Files Created & Modified

| File Path | Action | Description |
| :--- | :---: | :--- |
| `packages/contracts/src/room.ts` | Modified | Added `isLocked`, `moderator` role, mute fields, and validation schemas |
| `packages/contracts/src/room-state.ts` | Modified | Added moderation events, `isLocked`, and viewer `isMuted` |
| `packages/contracts/src/realtime.ts` | Modified | Registered moderation socket events and payload schemas |
| `packages/contracts/src/chat.ts` | Modified | Added moderation activities to `RoomActivityTypeSchema` |
| `apps/api/src/modules/rooms/membership.types.ts` | Modified | Added `role: 'moderator'`, `isMuted`, `mutedAt`, `mutedBy` |
| `apps/api/src/modules/rooms/membership.model.ts` | Modified | Mongoose schema updates and serialization for moderation fields |
| `apps/api/src/modules/rooms/room.types.ts` | Modified | Added `isLocked` to room interface |
| `apps/api/src/modules/rooms/room.model.ts` | Modified | Mongoose schema updates for `isLocked` |
| `apps/api/src/modules/rooms/room.service.ts` | Modified | Implemented lock, mute, role update, transfer, and kick hierarchy |
| `apps/api/src/modules/rooms/room.validation.ts` | Modified | Exported moderation Zod schemas |
| `apps/api/src/modules/rooms/room.controller.ts` | Modified | Added moderation HTTP route handlers |
| `apps/api/src/modules/rooms/room.routes.ts` | Modified | Mounted moderation endpoints |
| `apps/api/src/modules/karaoke/karaoke.service.ts` | Modified | Granted moderator queue and playback command permissions |
| `apps/api/src/modules/voice/voice.types.ts` | Modified | Added `canPublish` to voice token options |
| `apps/api/src/modules/voice/voice-token.service.ts` | Modified | Applied `canPublish` permissions to LiveKit JWT tokens |
| `apps/api/src/modules/voice/voice.service.ts` | Modified | Enforced mute checks in token generation and live LiveKit participant mute |
| `apps/web/src/lib/api/endpoints/rooms.ts` | Modified | Added moderation API endpoints |
| `apps/web/src/hooks/queries/use-room-mutations.ts` | Modified | Added TanStack mutation hooks for moderation |
| `apps/web/src/hooks/use-room-state.ts` | Modified | Applied realtime state transitions for all moderation events |
| `apps/web/src/features/karaoke/hooks/use-karaoke.ts` | Modified | Added `isModerator` to karaoke hook and playback permissions |
| `apps/web/src/components/rooms/transfer-host-dialog.tsx` | **Created** | Host ownership transfer confirmation dialog |
| `apps/web/src/components/shared/room-member-list.tsx` | Modified | Role badges, mute indicators, and inline moderation actions |
| `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` | Modified | Wired header lock toggle, mod badge, muted banner, and moderation dialogs |
| `docs/SPRINT_3_8_AUDIT.md` | **Created** | Discovery & Architecture audit deliverable |
| `docs/HOST_AND_MODERATION_ARCHITECTURE.md` | **Created** | Full system design & permission architecture document |
| `docs/SPRINT_3_8_IMPLEMENTATION_REPORT.md` | **Created** | Implementation report and verification status |

---

## 4. Verification & Static Quality Checks

In strict accordance with the mandatory Code-Only Development Policy:
- **No test files were created or modified.**
- **No test runners (`vitest`, `playwright`, `jest`, etc.) were executed.**
- **No production build commands (`pnpm build`) were run.**

Allowed verification commands executed cleanly:

### 4.1 Monorepo Static Type Checking (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit (Done in 787ms)
apps/api typecheck$ tsc --noEmit (Done in 1.3s)
apps/web typecheck$ tsc --noEmit (Done in 2.3s)
```
**Result:** 0 errors across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`.

### 4.2 Monorepo Linter (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/ (Done in 739ms)
apps/api lint$ eslint src/ (Done in 1s)
apps/web lint$ next lint (Done in 2.2s, No ESLint warnings or errors)
```
**Result:** 0 errors, 0 warnings across all packages.

---

## 5. Final Verdict

**`CODE COMPLETE — NOT RUNTIME VERIFIED`**
