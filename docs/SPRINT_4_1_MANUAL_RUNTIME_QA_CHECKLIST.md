# KTVOnline — Sprint 4.1: Manual Runtime QA Execution Protocol

## 1. Instructions for the Project Owner / QA Operator

This checklist contains **14 interactive manual test procedures** designed to validate the runtime stability, multi-user synchronization, LiveKit WebRTC audio, and moderation enforcement of KTVOnline across real browsers and mobile devices.

### Environment Setup Requirements
1. **Database:** Running MongoDB instance (`ktv-mongodb` or local mongod).
2. **Backend API:** Start API service on port 5001:
   ```bash
   pnpm dev:api
   ```
3. **Frontend Web:** Start web application on port 3000:
   ```bash
   pnpm dev:web
   ```
4. **LiveKit Cloud or Dev Server:** Valid `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` must be set in `apps/api/.env`.
5. **Testing Devices:**
   - **Device A (Host):** Desktop/laptop running Chrome or Firefox (Logged in as User A).
   - **Device B (Member/Singer):** Second browser (Incognito) or separate mobile device (Logged in as User B).
   - **Device C (Audience/Listener):** Optional third browser session (Logged in as User C).

---

## 2. Test Execution Sheet (QA-01 to QA-14)

---

### QA-01: Normal Room Lifecycle
- **Preconditions:** User A and User B logged in. API and Web running.
- **Required Users/Devices:** User A (Host, Device A), User B (Member, Device B).
- **Exact Steps:**
  1. User A navigates to `/rooms` and clicks **Create Room**. Select "Neon Lounge", capacity 5. Click **Create**.
  2. Note the generated room code (`/room/[code]`).
  3. User B opens `/room/[code]` on Device B.
  4. User B clicks the **Leave Room** button.
  5. User B re-enters the room URL and clicks Join.
  6. User A clicks **Close Room** from the host moderation menu.
- **Expected Result:**
  - Room opens cleanly; User A displays as Host.
  - User B joins; member count shows 2; avatar appears in roster.
  - User B leaves; member count decrements to 1; status transitions to 'left' in DB.
  - User B successfully rejoins; capacity remains respected.
  - User A closes room; both clients receive `ROOM_CLOSED` and see "Room has been closed by host" banner.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Screenshot of Room Closed dialog on Device B; terminal log of `room:closed` event.

---

### QA-02: Multiple Tabs & Devices Presence
- **Preconditions:** Room active with User A as Host.
- **Required Users/Devices:** User B with two browser tabs on Device B.
- **Exact Steps:**
  1. User B opens `/room/[code]` in Tab 1.
  2. User B opens the exact same room URL in Tab 2.
  3. Observe User A's member roster on Device A.
  4. User B closes Tab 1.
  5. User B closes Tab 2.
- **Expected Result:**
  - User B appears exactly once in User A's member list (not duplicated).
  - In `presenceManager`, `deviceCount` shows 2 for User B.
  - When Tab 1 closes, User B remains visible and online in User A's roster.
  - When Tab 2 closes, User B's presence drops from User A's roster.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Console logs from socket connection showing socket count per user.

---

### QA-03: Unexpected Network Disconnect & Reconnect
- **Preconditions:** User A (Host) and User B (Member) connected in room.
- **Required Users/Devices:** User B (Device B, WiFi or DevTools Network throttling).
- **Exact Steps:**
  1. On Device B, toggle Chrome DevTools Network to **Offline** for 3 seconds.
  2. Toggle Network back to **Online**.
  3. Observe Device A's roster and Device B's UI state.
- **Expected Result:**
  - Socket.IO reconnects automatically on Device B.
  - Device B performs state snapshot reconciliation (`getRoomStateSnapshot`).
  - Active room membership in MongoDB remains active throughout.
  - Room state version on Device B matches Device A.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** DevTools Network WS tab showing reconnect handshake.

---

### QA-04: Host Disconnect & Ownership Authoritativeness
- **Preconditions:** User A (Host) and User B (Member) in active room.
- **Required Users/Devices:** User A (Host, Device A), User B (Member, Device B).
- **Exact Steps:**
  1. User A closes browser tab without clicking "Close Room".
  2. User B remains in room.
  3. User A re-opens the room URL on Device A.
  4. User A clicks **Transfer Host** to User B.
- **Expected Result:**
  - When User A disconnects, the room remains active and `ownerId` remains User A in MongoDB.
  - When User A reconnects, User A immediately regains host badges and controls.
  - After Transfer Host is clicked, User B receives `room.host.transferred` and gains host controls, while User A becomes a regular member.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Host Controls toolbar appearance on Device B after transfer.

---

### QA-05: LiveKit Voice Connection & Microphone Publication
- **Preconditions:** LiveKit SFU running; microphone hardware connected.
- **Required Users/Devices:** User A and User B on separate devices with headsets/mics.
- **Exact Steps:**
  1. User A clicks **Join Voice**.
  2. Grant browser microphone permission.
  3. User B clicks **Join Voice** and grants microphone permission.
  4. User A speaks into microphone.
- **Expected Result:**
  - Both users connect to LiveKit SFU (`connectionState: 'connected'`).
  - User A's voice is heard clearly through User B's headphones.
  - Speaking indicator / waveform pulses next to User A's avatar.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** LiveKit dashboard participant list; audio verification.

---

### QA-06: Voice Reconnection & Audio Device Switching
- **Preconditions:** User B connected in voice lounge.
- **Required Users/Devices:** User B (Device B).
- **Exact Steps:**
  1. Open Voice Audio Settings dialog on Device B.
  2. Select an alternate microphone or audio output from the dropdown.
  3. Simulate brief network drop (toggle Airplane mode for 2s).
- **Expected Result:**
  - Device switches without throwing `NotReadableError` or audio drop.
  - LiveKit `attemptReconnect` restores connection with fresh backend token.
  - Microphone status (`isMuted`) is preserved after reconnect.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Audio settings dialog screenshot; console logs of device switch.

---

### QA-07: Moderation Mute & Listen-Only Mode (Sprint 4.1 Fix Verification)
- **Preconditions:** User A (Host) and User B (Member) connected in voice.
- **Required Users/Devices:** User A (Device A), User B (Device B).
- **Exact Steps:**
  1. User B un-mutes microphone and speaks.
  2. User A clicks **Mute Member** on User B's avatar.
  3. User B observes Voice Controls bar.
  4. User B attempts to click the mute toggle button.
  5. User A speaks into their microphone.
  6. User B refreshes browser tab and clicks **Join Voice**.
- **Expected Result:**
  - User B's audio stops immediately (LiveKit SFU track mute).
  - User B's button displays "Muted by Mod" and is disabled.
  - User B can STILL hear User A speaking (Listen-Only Mode preserved; no disconnect crash).
  - After tab refresh, User B can re-join voice in listen-only mode without throwing 403 `PublishTrackError`.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Screenshot of "Muted by Mod" button; confirmation that incoming audio is audible.

---

### QA-08: Member Kick & Immediate Eviction
- **Preconditions:** User A (Host) and User B (Member) in room with voice active.
- **Required Users/Devices:** User A (Device A), User B (Device B).
- **Exact Steps:**
  1. User A clicks **Kick** on User B's menu. Provide reason: "Disruptive behavior".
  2. Observe Device B's screen.
  3. User B attempts to navigate back to `/room/[code]`.
- **Expected Result:**
  - User B is immediately disconnected from LiveKit voice and Socket.IO.
  - Device B displays a toast: "You were removed from this room: Disruptive behavior" and redirects to `/rooms`.
  - Rejoining the room is rejected with `FORBIDDEN_KICKED`.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Screenshot of redirection toast on Device B; MongoDB `RoomMembershipModel.kickedAt`.

---

### QA-09: Playback Synchronization & NTP Clock Drift Alignment
- **Preconditions:** Room active; catalog song added to queue.
- **Required Users/Devices:** User A and User B looking at the video player.
- **Exact Steps:**
  1. User A starts playback of Track 1.
  2. Compare video timestamp and lyrics progress on Device A vs Device B.
  3. User A clicks **Pause**. Wait 2 seconds. User A clicks **Play**.
  4. User A seeks forward by 30 seconds.
- **Expected Result:**
  - Playhead positions on both screens differ by less than ~150ms.
  - Lyrics highlight the exact same syllable synchronously.
  - Pause stops playback on both devices immediately.
  - Resume and seek align playhead smoothly across both viewers.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Video recording of both screens side-by-side during seek.

---

### QA-10: Track Completion & Singer Handoff Transition
- **Preconditions:** 2 songs in queue (Song 1: requested by User A; Song 2: requested by User B).
- **Required Users/Devices:** User A and User B.
- **Exact Steps:**
  1. Play Song 1 until final 5 seconds (or seek near the end).
  2. Observe the player when Song 1 duration completes.
- **Expected Result:**
  - Player enters `TRANSITIONING` status without a 2-second freeze at `00:00`.
  - `SingerTurnIndicator` overlay renders: "Up Next: User B - [Song 2 Title]".
  - Backend worker acquires lease lock and advances queue within ~500ms.
  - Song 2 starts playing and User B is highlighted as the active singer.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Screenshot of SingerTurnIndicator overlay during transition.

---

### QA-11: Queue Consistency & Singer Role Separation
- **Preconditions:** Room active with Host, User B, and User C.
- **Required Users/Devices:** User B and User C.
- **Exact Steps:**
  1. User B adds Song X to the queue and assigns User C as the singer.
  2. Inspect queue drawer on all devices.
  3. User C leaves the room before Song X plays.
  4. Song X reaches the top of the queue.
- **Expected Result:**
  - Queue shows "Requested by User B" and "Singer: User C".
  - When User C leaves, the backend selection loop detects performer departure and safely skips Song X (status: 'removed') without deadlocking playback.
  - Next eligible song begins playing.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Queue drawer UI screenshot showing distinct requestedBy/singer avatars.

---

### QA-12: Versioned Room State & Outbox Gap Recovery
- **Preconditions:** Room active with User A and User B.
- **Required Users/Devices:** User B (Device B).
- **Exact Steps:**
  1. Open DevTools Network on Device B and block WS packets for 5 seconds while User A updates room atmosphere preset and adds a song.
  2. Unblock WS packets.
- **Expected Result:**
  - Client detects `stateVersion` gap (`event.version > currentVersion + 1`).
  - Client transitions `syncStatus` to `desynchronized`.
  - Client triggers `getRoomStateSnapshot` and recovers complete updated room settings and queue.
  - Sync status returns to `synced`.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Console log: `Version gap detected; triggered snapshot recovery`.

---

### QA-13: Backend Authorization & Role Permissions Enforcement
- **Preconditions:** User A (Host) and User B (regular member).
- **Required Users/Devices:** User B (Device B, DevTools console / Postman).
- **Exact Steps:**
  1. User B attempts to send a REST or Socket request to kick User A or skip playback.
  2. User B attempts to delete User A's queued song.
- **Expected Result:**
  - Server rejects the kick attempt with `CANNOT_KICK_HOST` or `FORBIDDEN_NOT_AUTHORIZED`.
  - Server rejects playback controls with `FORBIDDEN_NOT_HOST`.
  - Server rejects queue removal with `FORBIDDEN_NOT_OWNER`.
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Server response JSON showing 403 error codes.

---

### QA-14: Ephemeral Audience Interactions (Reactions & Virtual Gifts)
- **Preconditions:** Song currently playing in room.
- **Required Users/Devices:** User B (Audience, Device B), User A (Singer, Device A).
- **Exact Steps:**
  1. User B rapidly clicks the Heart/Microphone cheer button 10 times in 2 seconds.
  2. User B selects a virtual gift ("Golden Mic") and clicks Send Gift.
  3. Check MongoDB `test` database for any unexpected document writes in `roomstateoutboxes`.
- **Expected Result:**
  - First 5 cheer reactions burst particle animations on both screens; remainder throttled by token bucket limiter.
  - Golden Mic gift banner animates across video stage with sender and performer name.
  - MongoDB outbox collection size remains unchanged (zero persistence for ephemeral cheers/gifts).
- **Actual Result:** `[                                                            ]`
- **Status:** `[ ] Pass  [ ] Fail  [ ] Blocked`
- **Evidence to Capture:** Screen recording of particle cheer animation overlay.

---

## 3. QA Summary Sign-Off

- **Tester Name:** `________________________________`
- **Execution Date:** `____________________________`
- **Environment Tested:** Staging / Local Dev
- **Overall Verdict:** `[ ] PASSED    [ ] FAILED    [ ] BLOCKED`
- **Notes / Observations:**
