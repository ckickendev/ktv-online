# KTVOnline — Sprint 4.3: Release QA Gate Checklist

## 1. Overview & Execution Rules

This comprehensive Release QA Gate consolidates all runtime verification procedures across Room Lifecycle, Realtime Presence, WebRTC Voice, Karaoke Playback, Moderation Security, and Outbox Data Retention.

### Operator Instructions
- **Target Environments:** Staging environment and Pre-Production cluster.
- **Prerequisites:** Backend API (`apps/api`) running on port 5001, Frontend (`apps/web`) running on port 3000, LiveKit SFU configured, and MongoDB running with the Outbox TTL migration applied.
- **Execution Policy:** In accordance with the Code-Only Development Policy, **no scenario is pre-marked as passed**. Every scenario must be interactively executed by the designated QA operator and documented below.

---

## 2. Test Execution Suite

---

### Area 1: Room Lifecycle & Realtime Presence

#### QA-ROOM-01: Normal Room Creation & Closure
- **QA ID:** `QA-ROOM-01`
- **Preconditions:** User A authenticated on Device A.
- **Steps:**
  1. User A navigates to `/rooms` and clicks **Create Room**.
  2. Enter room title "Alpha Lounge", capacity 8, select "Neon" theme.
  3. Click **Create** and verify redirect to `/room/[code]`.
  4. User A opens Host Controls and clicks **Close Room**. Confirm dialog.
- **Expected Result:**
  - Room document created with `stateVersion: 1` and `ownerId: User A`.
  - UI displays Host badge.
  - On close, `ROOM_CLOSED` event is broadcasted. Occupants see banner "Room has been closed by host" and redirect to `/rooms`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-02: Multi-Tab Presence Isolation
- **QA ID:** `QA-ROOM-02`
- **Preconditions:** Room active with User A (Host) on Device A.
- **Steps:**
  1. User B opens `/room/[code]` in Browser Tab 1 on Device B.
  2. User B opens the same room URL in Browser Tab 2 on Device B.
  3. Observe User A's participant roster on Device A.
  4. User B closes Tab 1.
  5. User B closes Tab 2.
- **Expected Result:**
  - User B appears exactly once in the roster (no duplicate avatar).
  - In `RoomPresenceManager`, `deviceCount` shows 2 for User B.
  - Closing Tab 1 does NOT emit `MEMBER_LEFT`; User B remains visible and online in User A's roster.
  - Closing Tab 2 (last tab) drops User B from User A's roster.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-03: Explicit Room Leave
- **QA ID:** `QA-ROOM-03`
- **Preconditions:** User A (Host) and User B (Member) in active room.
- **Steps:**
  1. User B clicks the **Leave Room** button in the header.
  2. Observe User A's member roster on Device A immediately.
- **Expected Result:**
  - `ROOM_LEAVE` socket event is emitted immediately with zero delay.
  - `presenceManager.removeSocket()` runs immediately, bypassing any grace period.
  - User A's screen updates immediately, removing User B and decrementing member count.
  - Database `RoomMembershipModel.status` transitions to `'left'`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-04: Unexpected Disconnect & Reconnect Within 10 Seconds (Grace Period)
- **QA ID:** `QA-ROOM-04`
- **Preconditions:** User A (Host, Device A) and User B (Member, Device B) in room. User B has 1 tab open.
- **Steps:**
  1. On Device B, refresh the browser page (F5) or toggle DevTools Network Offline for 3 seconds, then back Online.
  2. Observe User A's screen on Device A.
- **Expected Result:**
  - User A's screen does NOT emit `MEMBER_LEFT` or flash the roster.
  - In `RoomPresenceManager`, a 10s timer with generation G1 is scheduled upon disconnect.
  - When User B reconnects at t=3s, `addSocket()` cancels the timer, increments generation to G2, and sets `isFirstConnection: false`.
  - Redundant `MEMBER_JOINED` broadcast is suppressed. User A observes zero UI presence jitter.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-05: Disconnect Lasting Longer Than 10 Seconds
- **QA ID:** `QA-ROOM-05`
- **Preconditions:** User A (Host, Device A) and User B (Member, Device B) in room.
- **Steps:**
  1. On Device B, disconnect network or close browser tab abruptly without unmount.
  2. Keep Device B disconnected for at least 15 seconds.
  3. Observe User A's screen during this time.
- **Expected Result:**
  - Between t=0s and t=10s, User B remains listed in presence (grace period active).
  - At t=10s, the generation-fenced timer fires: `userId` is removed from `roomUsers`, and `MEMBER_LEFT` is emitted.
  - User A's screen displays member departure exactly 10 seconds post-disconnect.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-06: Host Disconnect & Reconnect
- **QA ID:** `QA-ROOM-06`
- **Preconditions:** User A (Host) and User B (Member) in active room.
- **Steps:**
  1. User A closes browser window without closing room.
  2. User B observes room state on Device B.
  3. User A re-opens `/room/[code]` on Device A within 2 minutes.
- **Expected Result:**
  - Room remains in `status: 'active'`. `RoomModel.ownerId` remains User A in MongoDB.
  - User B's playback and queue continue uninterrupted.
  - User A reconnects; server validates `room.ownerId === user.id`, assigns `role: 'host'`, and restores Host Controls toolbar.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-07: Explicit Host Transfer
- **QA ID:** `QA-ROOM-07`
- **Preconditions:** User A (Host) and User B (Member) in active room.
- **Steps:**
  1. User A opens Host Controls, selects User B, and clicks **Transfer Host**.
  2. Observe UI state on Device A and Device B.
- **Expected Result:**
  - `RoomModel.ownerId` atomically updates to User B; `stateVersion` increments.
  - User B receives `room.host.transferred` and is promoted to Host with full controls.
  - User A's role is demoted to regular member; host controls toolbar disappears.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-08: Last Participant Leaving (Empty Room Persistence)
- **QA ID:** `QA-ROOM-08`
- **Preconditions:** User B is the last remaining occupant in room.
- **Steps:**
  1. User B clicks **Leave Room**.
  2. Inspect MongoDB `RoomModel` and `RoomPresenceManager`.
- **Expected Result:**
  - Presence drops to 0 online users.
  - In MongoDB, `RoomModel.status` remains `'active'` (documented governance decision GOV-01: no automated auto-close worker currently exists).
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-ROOM-09: Room Closure During Active Playback
- **QA ID:** `QA-ROOM-09`
- **Preconditions:** A karaoke track is actively playing in the room.
- **Steps:**
  1. Host clicks **Close Room** while song is at 01:00 playback time.
- **Expected Result:**
  - Playback worker terminates active lease and timer scheduler.
  - Playback status transitions to `idle`.
  - All clients receive `ROOM_CLOSED` and are redirected to `/rooms`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

### Area 2: LiveKit Voice & Moderation

#### QA-VOICE-01: Normal LiveKit Connection & Audio Publication
- **QA ID:** `QA-VOICE-01`
- **Preconditions:** User A and User B in room with headsets/microphones.
- **Steps:**
  1. Both users click **Join Voice** and grant browser microphone permission.
  2. User A speaks into microphone.
- **Expected Result:**
  - `useVoiceClient` connects to LiveKit SFU (`connectionState: 'connected'`).
  - User A's voice is heard clearly on User B's device with low latency (<200ms).
  - Waveform indicator pulses on User A's avatar.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-VOICE-02: Listen-Only Mode for Muted Participants (INT-08 Fix)
- **QA ID:** `QA-VOICE-02`
- **Preconditions:** User A (Host) and User B (Member) connected in voice.
- **Steps:**
  1. Host clicks **Mute Member** on User B.
  2. Observe Voice Controls bar on Device B.
  3. User A speaks into microphone.
  4. User B attempts to click the mute toggle button.
  5. User B refreshes the browser page and clicks **Join Voice**.
- **Expected Result:**
  - `RoomEvent.ParticipantPermissionsChanged` fires on Device B: mic track stops immediately.
  - Button updates to "Muted by Mod" and is disabled.
  - User B can STILL hear User A speaking (listen-only mode preserved; no 403 `leaveVoice()` crash).
  - After page reload, User B connects in listen-only mode without throwing `PublishTrackError`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-VOICE-03: Moderator Unmute & Dynamic Permission Restoration
- **QA ID:** `QA-VOICE-03`
- **Preconditions:** User B is currently server-muted in voice.
- **Steps:**
  1. Host clicks **Unmute Member** on User B.
  2. User B observes Voice Controls bar.
  3. User B clicks the mute toggle button to unmute microphone and speaks.
- **Expected Result:**
  - Backend updates `RoomMembershipModel.isMuted = false` and updates LiveKit permissions to `canPublish: true`.
  - `ParticipantPermissionsChanged` fires on Device B: button becomes active and unmuted.
  - User B speaks and is heard by Host.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-VOICE-04: Microphone Permission Denied by Browser
- **QA ID:** `QA-VOICE-04`
- **Preconditions:** User joins room on a fresh browser profile.
- **Steps:**
  1. User clicks **Join Voice**.
  2. When the browser prompts for microphone permissions, click **Block / Deny**.
- **Expected Result:**
  - `classifyDeviceError` identifies `NotAllowedError`.
  - Banner informs user: "Microphone permission was denied. Please allow microphone permissions in your browser settings and try again."
  - User is not left in an unhandled crash or infinite loading state.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-VOICE-05: Audio Device Switching (Input & Output)
- **QA ID:** `QA-VOICE-05`
- **Preconditions:** Device with multiple audio inputs/outputs (e.g. built-in mic + USB headset).
- **Steps:**
  1. Open Voice Audio Settings dialog.
  2. Switch active microphone from Default to USB Headset.
  3. Switch audio output from Default to Headphones (if browser supports `setSinkId`).
- **Expected Result:**
  - LiveKit `room.switchActiveDevice` switches hardware tracks seamlessly.
  - No audio disruption or disconnects occur.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-VOICE-06: LiveKit Reconnection & Token Refresh
- **QA ID:** `QA-VOICE-06`
- **Preconditions:** User connected in voice for >5 minutes.
- **Steps:**
  1. Observe network tab during token expiration window (at 80% of token TTL).
  2. Simulate momentary network drop (toggle Airplane mode for 2s).
- **Expected Result:**
  - Background `scheduleTokenRenewal` fetches fresh token from `/api/v1/rooms/:id/voice-token` without audio interruption.
  - Reconnection uses fresh token with re-validated database membership permissions.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

### Area 3: Karaoke Playback & Queue Synchronization

#### QA-KARAOKE-01: Queue Addition, Reordering & Removal
- **QA ID:** `QA-KARAOKE-01`
- **Preconditions:** User A (Host) and User B (Member) in room.
- **Steps:**
  1. User B adds Song 1 and Song 2 to queue.
  2. Host drags Song 2 to position 1.
  3. User B removes Song 1.
- **Expected Result:**
  - Queue drawer updates optimistically on Device B and broadcasts `ROOM_QUEUE_UPDATED` with incremented `queueVersion`.
  - Reordering persists monotonic positions in MongoDB `RoomQueueItemModel`.
  - Queue removal transitions status to `'removed'`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-KARAOKE-02: Playback Synchronization & NTP Clock Sync
- **QA ID:** `QA-KARAOKE-02`
- **Preconditions:** Song queued in room.
- **Steps:**
  1. Host clicks **Play**.
  2. Compare video timestamp and lyrics progress on Device A and Device B.
- **Expected Result:**
  - Authoritative `anchorStartedAt` timestamp aligns video playhead within <150ms across devices.
  - Lyrics highlight syllables synchronously.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-KARAOKE-03: Pause, Resume & Seek Controls
- **QA ID:** `QA-KARAOKE-03`
- **Preconditions:** Song actively playing.
- **Steps:**
  1. Host presses **Pause**. Wait 3 seconds.
  2. Host presses **Play**.
  3. Host seeks forward by 45 seconds.
- **Expected Result:**
  - Pause stops audio/video immediately for all occupants.
  - Resume starts smoothly without audio stutter.
  - Seek aligns all clients to the new position accurately.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-KARAOKE-04: Track Completion & Singer Handoff (INT-03 Verification)
- **QA ID:** `QA-KARAOKE-04`
- **Preconditions:** Song 1 currently playing; Song 2 queued with User B as assigned singer.
- **Steps:**
  1. Seek to final 5 seconds of Song 1 and let it finish.
- **Expected Result:**
  - When Song 1 finishes, player immediately enters `TRANSITIONING` status (zero dead freeze at `00:00`).
  - `SingerTurnIndicator` overlay renders: "Up Next: User B - [Song 2 Title]".
  - Within ~500ms, Song 2 begins playing and User B is designated as active singer.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-KARAOKE-05: Playback Recovery After Reconnect
- **QA ID:** `QA-KARAOKE-05`
- **Preconditions:** Song playing at 01:15.
- **Steps:**
  1. On Device B, refresh browser tab.
- **Expected Result:**
  - `getRoomStateSnapshot` and `getKaraokeSnapshot` are fetched on load.
  - Player resumes playback at the current live timestamp (~01:18) without restarting from 00:00.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

### Area 4: Security, Moderation & Eviction

#### QA-SEC-01: Member Kick & Rejoin Ban Enforcement
- **QA ID:** `QA-SEC-01`
- **Preconditions:** User A (Host) and User B (Member) in room.
- **Steps:**
  1. Host clicks **Kick** on User B.
  2. User B observes screen.
  3. User B attempts to rejoin via REST `POST /api/v1/rooms/:id/join`.
  4. User B attempts to connect via Socket `ROOM_JOIN`.
- **Expected Result:**
  - User B is immediately evicted from LiveKit voice, Socket channel, and room UI.
  - Redirected to `/rooms` with toast notification.
  - REST join rejected with 403 `FORBIDDEN_KICKED`.
  - Socket join rejected with error `FORBIDDEN_KICKED`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-SEC-02: Kicked User Voice Token Denial
- **QA ID:** `QA-SEC-02`
- **Preconditions:** User B was kicked from room.
- **Steps:**
  1. User B sends a manual request to `POST /api/v1/rooms/:id/voice-token`.
- **Expected Result:**
  - Backend `generateVoiceToken()` checks `membership.kickedAt != null` and throws `FORBIDDEN_KICKED`.
  - HTTP 403 response returned; zero LiveKit tokens minted.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-SEC-03: Moderator Permission Boundaries
- **QA ID:** `QA-SEC-03`
- **Preconditions:** Room with Host (User A), Moderator (User B), and Member (User C).
- **Steps:**
  1. Moderator attempts to kick Host (User A).
  2. Moderator attempts to transfer ownership of the room.
  3. Moderator kicks Member (User C).
- **Expected Result:**
  - Kick Host rejected with 400 `CANNOT_KICK_HOST`.
  - Transfer Host rejected with 403 `FORBIDDEN_NOT_HOST`.
  - Kick Member succeeds cleanly.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-SEC-04: Room Lock Enforcement
- **QA ID:** `QA-SEC-04`
- **Preconditions:** Host locks room via room settings.
- **Steps:**
  1. A new user attempts to join the locked room URL.
- **Expected Result:**
  - Join rejected with `ROOM_LOCKED`.
  - Existing active members remain unaffected.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

### Area 5: Outbox Retention & Database TTL

#### QA-DB-01: Outbox Event Expiration Assignment
- **QA ID:** `QA-DB-01`
- **Preconditions:** MongoDB access to inspect `roomstateoutboxes`.
- **Steps:**
  1. Host creates room and queues a song.
  2. Query `db.roomstateoutboxes.find({ roomId: ObjectId(...) })` in `mongosh`.
- **Expected Result:**
  - Successfully published events have `publishedAt: ISODate(...)` and `expiresAt: ISODate(...)` set to exactly 7 days post-broadcast.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-DB-02: Pending & Failed Outbox Records Survive TTL
- **QA ID:** `QA-DB-02`
- **Preconditions:** Create a simulated failed outbox record with `publishedAt: null, expiresAt: null, createdAt: new Date(Date.now() - 30 * 86400000)`.
- **Steps:**
  1. Verify document presence in collection after 24 hours.
- **Expected Result:**
  - Document is NEVER deleted by MongoDB TTL thread because `expiresAt` is `null`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

#### QA-DB-03: Post-Migration TTL Index Specification
- **QA ID:** `QA-DB-03`
- **Preconditions:** Migration runbook executed by operator.
- **Steps:**
  1. Run `db.roomstateoutboxes.getIndexes()` in `mongosh`.
- **Expected Result:**
  - Index `expiresAt_1_ttl` exists with `{ expiresAt: 1 }` and `expireAfterSeconds: 0`.
  - Legacy `createdAt_1` TTL index is completely absent.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Evidence / Notes:** `[                                                            ]`

---

## 3. QA Gate Sign-Off Form

| Role | Name | Signature | Date | Decision (Approved / Rejected) |
| :--- | :--- | :--- | :--- | :---: |
| **QA Lead** | `____________________` | `____________________` | `________` | `[ ] APPROVED   [ ] REJECTED` |
| **Engineering Lead**| `____________________` | `____________________` | `________` | `[ ] APPROVED   [ ] REJECTED` |
| **Product Owner** | `____________________` | `____________________` | `________` | `[ ] APPROVED   [ ] REJECTED` |
