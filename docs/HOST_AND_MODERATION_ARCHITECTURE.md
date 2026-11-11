# KTVOnline — Host & Room Moderation Architecture

## 1. Executive Summary & Vision

**Mission:** "Your Virtual Hangout. Your Karaoke Night."  
Sprint 3.8 elevates KTVOnline from a casual shared lounge into a well-governed, safe, and authoritative social karaoke space. As lounges grow in popularity and social activity, room hosts and their designated co-moderators need clear, immediate, and hierarchy-safe controls over room access, stage conduct, voice communication, and lounge lifecycle.

---

## 2. Role & Authority Hierarchy

The moderation system is built upon a strict role-based access control (RBAC) hierarchy:

```
┌────────────────────────────────────────────────────────┐
│                      ROOM HOST                         │
│  Full ownership, atmospheric control, lock, transfer   │
└───────────────────────────┬────────────────────────────┘
                            │ Delegates moderation
┌───────────────────────────▼────────────────────────────┐
│                   ROOM MODERATOR                       │
│  Voice muting, kicking members, queue & playback       │
└───────────────────────────┬────────────────────────────┘
                            │ Governs
┌───────────────────────────▼────────────────────────────┐
│                    ROOM MEMBER                         │
│  Queueing songs, singing, voice chat, gifts, reactions │
└───────────────────────────┬────────────────────────────┘
                            │ Governs
┌───────────────────────────▼────────────────────────────┐
│                    ROOM VIEWER                         │
│  Lobby preview, watching stage, listening to voice     │
└────────────────────────────────────────────────────────┘
```

### 2.1 Permissions Matrix

| Capability | Host | Moderator | Member | Viewer |
| :--- | :---: | :---: | :---: | :---: |
| **Lock / Unlock Room** (`setRoomLock`) | ✅ | ❌ | ❌ | ❌ |
| **Customize Atmosphere & Identity** | ✅ | ❌ | ❌ | ❌ |
| **Transfer Lounge Ownership** (`transferHost`) | ✅ | ❌ | ❌ | ❌ |
| **Appoint / Revoke Moderator** (`updateMemberRole`) | ✅ | ❌ | ❌ | ❌ |
| **Close Room Permanently** (`deleteRoom`) | ✅ | ❌ | ❌ | ❌ |
| **Mute Member Voice** (`muteMember`) | ✅ (All non-hosts) | ✅ (Regular members) | ❌ | ❌ |
| **Kick Member from Lounge** (`kickMember`) | ✅ (All non-hosts) | ✅ (Regular members) | ❌ | ❌ |
| **Remove Any Song from Queue** | ✅ | ✅ | ❌ (Own only) | ❌ |
| **Reorder Queue Items** | ✅ | ✅ | ❌ | ❌ |
| **Control Playback (Skip / Pause / Seek)** | ✅ | ✅ | ❌ (Current singer only) | ❌ |
| **Queue Songs onto Stage** | ✅ | ✅ | ✅ | ❌ |
| **Send Gifts & Reactions** | ✅ | ✅ | ✅ | ❌ |
| **Publish Microphone Audio** | ✅ | ✅ (unless muted) | ✅ (unless muted) | ❌ |

### 2.2 Invariant Hierarchy Rules

1. **Host Inviolability:** No user (including moderators or the host themselves) can mute, kick, or demote the Host.
2. **Peer Moderator Safety:** A moderator cannot kick, mute, or demote another moderator. Only the Host can change a moderator's role or mute/kick them.
3. **No Self-Moderation:** Users cannot kick or mute themselves via moderation APIs (leaving the room is handled via standard member leave).

---

## 3. Room Access Lifecycle: Room Locking vs Visibility

KTVOnline maintains a distinct separation between **Visibility** and **Room Locking**:

```
                       ┌─────────────────────────┐
                       │ Room Visibility Setting │
                       └────────────┬────────────┘
                                    │
               ┌────────────────────┴───────────────────┐
               ▼                                        ▼
      [Public Visibility]                      [Private Visibility]
      • Listed in Lounge Browser               • Unlisted in Lounge Browser
      • Searchable and discoverable            • Direct URL access only
               │                                        │
               └────────────────────┬───────────────────┘
                                    ▼
                       ┌─────────────────────────┐
                       │    Room Lock Status     │
                       └────────────┬────────────┘
                                    │
               ┌────────────────────┴───────────────────┐
               ▼                                        ▼
       [Unlocked: false]                         [Locked: true]
       • Allows new participants to join        • Rejects new join requests ('ROOM_LOCKED')
       • Up to room capacity limit              • Preserves active members & voice sessions
                                                • Ongoing stage karaoke continues uninterrupted
```

### 3.1 Lock Semantics
- **Atomic state flag:** `isLocked: boolean` on `IRoom` schema and contract `RoomDtoSchema`.
- **Join validation:** When `room.isLocked === true`, any user who is not already an active member and not the room owner is rejected with `{ success: false, error: 'ROOM_LOCKED' }`.
- **Non-disruptive:** Existing members remain connected; LiveKit audio, stage playback, and lyrics synchronization continue without dropouts.
- **Visual status:** A prominent `Locked` badge appears on the room header for all participants; the Host has a real-time lock/unlock toggle button.

---

## 4. Authoritative Voice Muting Architecture

Voice communication in KTVOnline is powered by LiveKit WebRTC SFU. To prevent abuse and guarantee conduct compliance, voice muting is enforced across two authoritative layers:

```
Moderator Action: Mute Target User
                 │
                 ▼
       [apps/api: RoomService]
                 │
        ┌────────┴───────────────────────────┐
        ▼                                    ▼
[Database Persistence]               [LiveKit Server SDK]
RoomMembership.isMuted = true        updateParticipant(room, identity, {
RoomMembership.mutedAt = Date          canPublish: false,
RoomMembership.mutedBy = ActorId       canPublishSources: []
                                     })
                                     mutePublishedTrack(room, identity, trackSid, true)
        │                                    │
        └────────┬───────────────────────────┘
                 ▼
      [Realtime Socket.IO]
      SOCKET_EVENTS.SERVER.MEMBER_MUTED
      RoomStateEvent: 'member.muted'
                 │
        ┌────────┴───────────────────────────┐
        ▼                                    ▼
[All Room Participants]              [Target Muted Client]
• Member roster shows Red Muted icon • Persistent warning banner displayed
• Voice status shows MicOff          • Microphone hardware track unpublished
• Activity timeline logs event       • New voice tokens will reject audio publish
```

### 4.1 Token Generation Invariant
When any user requests a LiveKit voice token (`/api/rooms/:id/voice/token`), the voice service queries `RoomMembershipModel`. If `membership.isMuted === true`, the token is generated with:
- `canPublish: false`
- `canPublishSources: []`

This prevents malicious users from circumventing a mute by reconnecting their WebRTC socket or refreshing their browser.

---

## 5. Host Ownership Transfer Architecture

When a host departs or wishes to hand over the lounge, ownership transfer must execute cleanly without desynchronizing state or stranding members.

```
Host selects Target Member from Lounge Roster
                    │
                    ▼
         [TransferHostDialog]
     (Requires explicit confirmation)
                    │
                    ▼
      POST /api/rooms/:id/transfer-host
                    │
                    ▼
          [apps/api: RoomService]
                    │
    ┌───────────────┴────────────────┐
    ▼                                ▼
[Atomic Room Update]        [Atomic Membership Updates]
Room.ownerId = newHostId     Old Host: role = 'member'
stateVersion = version + 1   New Host: role = 'host'
    │                                │
    └───────────────┬────────────────┘
                    ▼
          [Realtime Broadcast]
     SOCKET_EVENTS.SERVER.ROOM_HOST_TRANSFERRED
     RoomStateEvent: 'room.host.transferred'
                    │
                    ▼
           [All Connected Clients]
     • UI updates host crown badge immediately
     • Demoted host receives member UI controls
     • Promoted host receives host moderation controls
     • Timeline logs: "@oldHost transferred host to @newHost"
```

---

## 6. Realtime Synchronization & Event Schema

All moderation actions increment the authoritative `stateVersion` of the room snapshot and emit strongly-typed Socket.IO payloads defined in `@ktv/contracts`:

1. **Role Updated:** `SOCKET_EVENTS.SERVER.MEMBER_ROLE_UPDATED`
   - Payload: `{ roomId, userId, role, updatedBy, stateVersion }`
2. **Member Muted:** `SOCKET_EVENTS.SERVER.MEMBER_MUTED`
   - Payload: `{ roomId, userId, isMuted, mutedBy, reason?, stateVersion }`
3. **Room Lock Updated:** `SOCKET_EVENTS.SERVER.ROOM_LOCK_UPDATED`
   - Payload: `{ roomId, isLocked, updatedBy, stateVersion }`
4. **Host Transferred:** `SOCKET_EVENTS.SERVER.ROOM_HOST_TRANSFERRED`
   - Payload: `{ roomId, previousHostId, newHostId, stateVersion }`

Every event updates local Zustand/TanStack client caches and records a permanent activity entry in `RoomActivityTimeline`.

---

## 7. Frontend User Experience Surfaces

1. **Member Roster (`RoomMemberList`):**
   - Crown badge for Host.
   - Shield badge for Moderator.
   - Muted badge (`MicOff`) and red strike-through indicator.
   - Inline action buttons with role-aware visibility:
     - Mute / Unmute (`MicOff` / `VolumeX`)
     - Role Change (`Shield`)
     - Transfer Host (`Crown`)
     - Kick (`UserX`)
2. **Room Header:**
   - Real-time `Locked` indicator badge.
   - Host `Lock / Unlock` toggle action button.
   - Moderator status pill (`Mod`).
3. **Stage & Playback Controls:**
   - Both Host and Moderator have playback skip, pause, stop, and queue reorder/removal permissions.
4. **Target User Alerts:**
   - Muted Banner: When `viewer.isMuted`, an amber banner informs the user that their microphone has been muted by moderation.
   - Kicked Banner: Clear explanation when removed from the room, with a one-click return to lobby.
