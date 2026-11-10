# Karaoke Playback Authorization Policy

## 1. Objective & Authority Scope

This specification governs all authorization rules for song catalog interaction, queue management, and server-authoritative playback control in **KTVOnline**.

Authorization decisions are strictly backend-authoritative. Clients submit commands; the backend authenticates the caller, resolves room membership and role, evaluates ownership against persistent state, and either commits the mutation or rejects it with structured error codes.

---

## 2. Authorization Matrix

| Action | Room Host | Active Singer | Active Room Member | Visitor / Non-Member |
| :--- | :---: | :---: | :---: | :---: |
| **Search Song Catalog** | Yes | Yes | Yes | Yes (Public catalog) |
| **View Queue Snapshot** | Yes | Yes | Yes | Yes (Public lounge) / No (Private) |
| **View Playback Snapshot** | Yes | Yes | Yes | Yes (Public lounge) / No (Private) |
| **Add Song to Queue** | Yes | Yes | Yes | **No** (Must join lounge) |
| **Remove Own Queued Song** | Yes | Yes | Yes (Owner) | **No** |
| **Remove Others' Queued Songs** | **Yes** | **No** | **No** | **No** |
| **Reorder Song Queue** | **Yes** | **No** | **No** | **No** |
| **Play (Start / Resume)** | **Yes** | **Yes** | **No** | **No** |
| **Pause Playback** | **Yes** | **Yes** | **No** | **No** |
| **Seek Playback Position** | **Yes** | **Yes** | **No** | **No** |
| **Skip Current Song** | **Yes** | **Yes** | **No** | **No** |
| **Stop Playback (Return to Idle)** | **Yes** | **Yes** | **No** | **No** |

---

## 3. Active Singer Definition & Verification

### 3.1 Definition
The **Active Singer** for a room is strictly defined as the user whose identity (`requestedBy`) matches the queue item currently in `'playing'` status referenced by `RoomPlaybackState.currentQueueItemId`.

### 3.2 Anti-Spoofing Guarantees
1. **Never Trust Client Flags**: Client payloads containing `isSinger: true` or `role: 'host'` are completely ignored. Singer identity is derived exclusively from the populated `RoomQueueItemModel` record in MongoDB.
2. **Dynamic Membership Re-Verification**: At the moment a command is received, the backend verifies that the caller has an active record in `RoomMembershipModel` with `status: 'active'` and `kickedAt: null`. If the active singer has departed or been kicked by the host, their command is rejected immediately with `FORBIDDEN_NOT_MEMBER`.
3. **Room Status Check**: If the room is closed (`status === 'closed'`), all playback and queue commands are rejected with `FORBIDDEN_ROOM_CLOSED`.
4. **Host Authority**: The room host retains overarching authority over the room and can pause, resume, seek, skip, stop, reorder, or remove any song at any time regardless of who is currently singing.

---

## 4. Lifecycle Edge Cases

1. **Active Singer Leaves Voluntarily**:
   - The singer's pending queue items are marked `removed`.
   - The currently playing track is immediately advanced to the next eligible track via the authoritative transition service.
2. **Active Singer is Kicked by Host**:
   - Membership is transitioned to `status: 'left'`.
   - The user's pending queue items are marked `removed`.
   - The active track is stopped or advanced, and the singer's socket is evicted from the room channel.
3. **Host Leaves / Room Closes**:
   - In KTVOnline, a host cannot leave an active room without closing it.
   - When the host closes the room, all active queue items (`queued`, `playing`) are transitioned to `removed`, playback is set to `idle`, and future mutations are blocked.
