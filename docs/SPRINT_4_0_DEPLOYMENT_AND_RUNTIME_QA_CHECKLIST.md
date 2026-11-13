# KTVOnline — Sprint 4.0 Deployment & Runtime QA Checklist

## 1. Overview & Purpose

This document provides operational instructions for deploying Sprint 4.0 platform updates to staging and production environments, executing the required Outbox TTL database migration, and conducting manual runtime QA across all 14 integration flows (FLOW-01 through FLOW-14).

> [!IMPORTANT]
> In accordance with the Code-Only Development Policy, runtime tests and database migrations were not executed during static development. This checklist serves as the authoritative deployment and verification guide for operational teams.

---

## 2. Pre-Deployment Database Checklist

Before deploying Sprint 4.0 backend containers:

- [ ] **Database Connection Verification:** Confirm MongoDB target is reachable and target database name is `test` (or production configured name).
- [ ] **Full Database Backup:** Take a snapshot or execute `mongodump` prior to index operations:
  ```bash
  mongodump --uri="$MONGODB_URI" --archive="ktvonline_pre_sprint4_$(date +%Y%m%d_%H%M%S).gz" --gzip
  ```
- [ ] **Inspect Existing Indexes on Outbox Collection:**
  ```javascript
  // Execute in mongosh
  use test;
  db.roomstateoutboxes.getIndexes();
  ```
  Check if `createdAt_1` with `expireAfterSeconds` is present.

---

## 3. Database Migration Execution (`reconcile-outbox-ttl-index.ts`)

Execute the idempotent index migration script in the backend environment:

```bash
cd apps/api
npx tsx src/database/migrations/reconcile-outbox-ttl-index.ts
```

### Expected Output:
```text
Connecting to MongoDB...
Current indexes on roomstateoutboxes: [ '_id_', 'roomId_1_version_1', 'status_1_scheduledFor_1', 'createdAt_1' ]
Dropping legacy createdAt TTL index: createdAt_1...
Dropped legacy index: createdAt_1
Creating standard single-field TTL index on expiresAt...
Created index: expiresAt_1_ttl
Final indexes on roomstateoutboxes: [
  { v: 2, key: { _id: 1 }, name: '_id_' },
  { v: 2, key: { roomId: 1, version: 1 }, name: 'roomId_1_version_1', unique: true },
  { v: 2, key: { status: 1, scheduledFor: 1 }, name: 'status_1_scheduledFor_1' },
  { v: 2, key: { expiresAt: 1 }, name: 'expiresAt_1_ttl', expireAfterSeconds: 0 }
]
Migration completed successfully.
```

- [ ] **Post-Migration Index Verification:**
  ```javascript
  // Confirm in mongosh:
  db.roomstateoutboxes.getIndexes().forEach(idx => {
    if (idx.name === 'expiresAt_1_ttl') {
      print("TTL Index verified with expireAfterSeconds: " + idx.expireAfterSeconds);
    }
  });
  ```

---

## 4. Application Deployment Sequence

1. **Deploy Backend API Service (`apps/api`):**
   - Environment variables required:
     - `MONGODB_URI`: Mongo connection string.
     - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`: LiveKit media server credentials.
     - `CORS_ORIGIN`: Allowed web frontend origins.
   - Restart API worker processes or deploy container pods.
   - Verify health check: `GET /health` returns `200 OK`.

2. **Deploy Frontend Web Application (`apps/web`):**
   - Environment variables required:
     - `NEXT_PUBLIC_API_URL`: Backend API URL.
     - `NEXT_PUBLIC_SOCKET_URL`: Socket.IO URL.
     - `NEXT_PUBLIC_LIVEKIT_URL`: LiveKit SFU URL.
   - Deploy Next.js frontend pods / static deployment.
   - Verify homepage loads cleanly without console hydration errors.

---

## 5. Runtime QA Test Suite (FLOW-01 to FLOW-14)

Execute the following 14 manual test procedures across two separate browser sessions (Host and Audience Member).

---

### Test Case 01: Room Creation (FLOW-01)
- **Role:** Host
- **Steps:**
  1. Log in as User A.
  2. Navigate to `/rooms` and click **Create Room**.
  3. Fill in title "KTV Studio Alpha", select "Neon" atmosphere, capacity 10, click Submit.
- **Expected Results:**
  - [ ] Room document created in MongoDB with `stateVersion: 1`.
  - [ ] Browser redirects to `/room/KTV-XXXXX`.
  - [ ] Zustand store initializes; user displays with Host badge.

---

### Test Case 02: Room Join & Realtime Presence (FLOW-02)
- **Role:** Host (User A) + Audience Member (User B)
- **Steps:**
  1. User B logs in on an incognito browser window.
  2. User B navigates to `/room/KTV-XXXXX`.
  3. User B opens a second tab on the same room URL.
- **Expected Results:**
  - [ ] Host's member roster updates immediately without page refresh.
  - [ ] Member count increments to 2.
  - [ ] User B's multi-tab presence does not duplicate avatar in the roster.

---

### Test Case 03: Room Leave, Disconnect & Unmount (FLOW-03)
- **Role:** Audience Member (User B) + Host (User A)
- **Steps:**
  1. User B clicks the "Leave Room" button or navigates to `/rooms`.
  2. Observe Host's roster.
  3. User B rejoins, then simulates network drop by killing the browser tab.
- **Expected Results:**
  - [ ] On navigation leave: User B immediately leaves roster (`ROOM_LEAVE` emitted).
  - [ ] On abrupt tab kill: 10-second grace period elapses before presence marks User B offline.
  - [ ] Active participant counter in database decrements accurately.

---

### Test Case 04: Song Search & Queue Addition (FLOW-04)
- **Role:** Audience Member (User B)
- **Steps:**
  1. Open Song Search catalog.
  2. Search for "Bohemian Rhapsody" and click **Add to Queue**.
- **Expected Results:**
  - [ ] Song appears in the queue drawer for both Host and Audience.
  - [ ] Backend outbox increments `queueVersion`.
  - [ ] Activity feed displays notification: "User B queued Bohemian Rhapsody".

---

### Test Case 05: Queue Reordering & Removal (FLOW-05)
- **Role:** Host (User A) + Audience Member (User B)
- **Steps:**
  1. Add 3 songs to queue.
  2. Host drags Song 3 to Position 1.
  3. User B attempts to remove Host's song (should be forbidden or disabled).
  4. Host removes Song 2.
- **Expected Results:**
  - [ ] Queue updates in real-time across all clients.
  - [ ] Song positions in `RoomQueueItemModel` re-index monotonically (1, 2, 3).
  - [ ] Non-host cannot delete another member's queued track.

---

### Test Case 06: Playback Start & Video Synchronization (FLOW-06)
- **Role:** Host (User A) + Audience (User B)
- **Steps:**
  1. Host clicks **Start Playback** on the first song.
  2. Compare video playback timestamp on Host and Audience screens.
- **Expected Results:**
  - [ ] `RoomPlaybackStateModel` acquires lease lock.
  - [ ] Both screens begin video playback with audio within <150ms sync difference.
  - [ ] Status updates to `playing`.

---

### Test Case 07: Track Completion & Singer Handoff (FLOW-07)
- **Role:** Host (User A) + Next Singer (User B)
- **Steps:**
  1. Let song play to the final 5 seconds (or fast-forward).
  2. Track finishes duration.
- **Expected Results:**
  - [ ] UI immediately enters `TRANSITIONING` status (no 2-second freeze at `00:00`).
  - [ ] `SingerTurnIndicator` overlay renders: "Up Next: User B - [Song Title]".
  - [ ] Within ~500ms, the next song begins playing and User B is highlighted as active singer.

---

### Test Case 08: Pause, Resume & Seek Controls (FLOW-08)
- **Role:** Host (User A)
- **Steps:**
  1. Host presses **Pause**.
  2. Wait 3 seconds, then press **Play**.
  3. Host drags seekbar to 01:30.
- **Expected Results:**
  - [ ] Video pauses simultaneously for all participants.
  - [ ] Resume starts smoothly without stutter.
  - [ ] Seek aligns all viewers to 01:30 accurately.

---

### Test Case 09: LiveKit Voice WebRTC Connection (FLOW-09)
- **Role:** Host (User A) & Singer (User B)
- **Steps:**
  1. Both users click **Join Voice** and grant microphone permissions.
  2. User B speaks into microphone.
- **Expected Results:**
  - [ ] LiveKit audio track connects via WebRTC SFU.
  - [ ] User A hears User B's voice through speaker/headphones.
  - [ ] Voice waveform indicator animates next to User B's avatar.

---

### Test Case 10: Host Microphone Moderation (FLOW-10)
- **Role:** Host (User A) & Audience Member (User B)
- **Steps:**
  1. User B un-mutes microphone.
  2. Host clicks the **Mute** icon on User B in the member list.
- **Expected Results:**
  - [ ] User B's audio stops transmitting instantly (server SFU track mute).
  - [ ] User B's UI reflects "Muted by Host".
  - [ ] User B cannot un-mute until Host un-mutes them or policy permits.

---

### Test Case 11: Member Kick & Eviction (FLOW-11)
- **Role:** Host (User A) & Disruptive Member (User B)
- **Steps:**
  1. Host clicks **Kick** on User B's profile menu in the lounge.
- **Expected Results:**
  - [ ] User B is immediately disconnected from LiveKit voice and Socket.IO.
  - [ ] User B's browser displays "You have been removed from the room" and redirects to `/rooms`.
  - [ ] User B is prevented from rejoining the room.

---

### Test Case 12: Realtime Live Chat & Rate Limiting (FLOW-12)
- **Role:** Audience Member (User B)
- **Steps:**
  1. Send 3 chat messages in quick succession ("Hello", "Great song!", "Woo!").
  2. Rapidly spam 10 messages within 2 seconds.
- **Expected Results:**
  - [ ] First 3 messages render in real-time in the chat drawer.
  - [ ] Rate limiter blocks spam messages after threshold with a warning notice.
  - [ ] Messages persist up to the 30-day retention window.

---

### Test Case 13: Reaction Bursts & Cheer Overlays (FLOW-13)
- **Role:** Audience Member (User B)
- **Steps:**
  1. Click the microphone/heart cheer reaction 10 times in 3 seconds.
- **Expected Results:**
  - [ ] Canvas particle burst animates across video player for both Host and Audience.
  - [ ] No frame rate drops or UI stuttering during cheer bursts.
  - [ ] Events are non-blocking and do not bloat MongoDB outbox.

---

### Test Case 14: Network Drop & State Snapshot Reconciliation (FLOW-14)
- **Role:** Audience Member (User B)
- **Steps:**
  1. While song is playing, disconnect network (toggle Airplane mode or disable WiFi) for 10 seconds.
  2. Re-enable network.
- **Expected Results:**
  - [ ] Socket.IO reconnects automatically.
  - [ ] Client detects missing version sequence and invokes `getRoomStateSnapshot`.
  - [ ] Player resynchronizes to the current song position without manual page refresh.

---

## 6. Operational Rollback Plan

If unexpected regressions occur during staging or production deployment:

1. **Backend Rollback:**
   - Revert backend image to previous release tag (`git checkout 295a044`).
   - The Outbox TTL index on `expiresAt` is backward compatible and will **not** harm previous backend code (it simply purges documents marked with `expiresAt`).
2. **Frontend Rollback:**
   - Revert web image to previous release tag.
3. **Emergency Escalation Contacts:**
   - Core Engineering Lead
   - Infrastructure & Database On-Call
