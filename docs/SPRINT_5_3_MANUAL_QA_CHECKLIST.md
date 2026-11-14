# Sprint 5.3: Session Memories & Karaoke History — Manual QA Checklist

**Scope:** Post-Implementation Runtime QA Verification  
**Environment Requirements:** Monorepo local development environment (`apps/api` on port 4000, `apps/web` on port 3000, MongoDB on port 27017 with db name `test`).  
**Status:** READY FOR OPERATOR RUNTIME EXECUTION  

---

## 1. Preconditions & Setup

- [ ] Node.js 22 and pnpm installed.
- [ ] MongoDB running locally with database `test`.
- [ ] API service started: `pnpm --filter api dev` (healthy on `http://localhost:4000/health`).
- [ ] Web frontend started: `pnpm --filter web dev` (accessible on `http://localhost:3000`).
- [ ] Two separate test accounts registered and logged in (User A and User B) in distinct browser contexts (e.g. Chrome normal and Chrome Incognito).

---

## 2. Test Scenarios

### Scenario 1: Authoritative Song Performance Recording
- **Objective:** Verify that songs only record into history when transitioning to `status: 'playing'`, and queue-only songs are never recorded.
- **Steps:**
  1. User A creates a public lounge named "Vocal Test Lounge".
  2. User A opens the song catalog and adds "Track 1" to the queue. Track 1 immediately starts playing (`status: 'playing'`).
  3. User A adds "Track 2" and "Track 3" to the queue (they remain in `status: 'queued'`).
  4. User A removes "Track 2" from the queue before it plays.
  5. In a new tab, navigate to User A's Profile (`/profile`).
  6. Inspect the "Recently Sung" tab and "Personal Karaoke Statistics".
- **Expected Results:**
  - [ ] "Track 1" appears in the Recently Sung list with status badge indicating playing/completed.
  - [ ] "Track 2" (which was queued and removed) DOES NOT appear in Recently Sung history.
  - [ ] "Track 3" (still queued) DOES NOT appear in history.
  - [ ] Total songs sung in stats displays 1.

### Scenario 2: Performance Outcome Transitions (Completed vs Skipped vs Interrupted)
- **Objective:** Verify accurate outcome assignment upon track completion, host stop/skip, and room closure.
- **Steps:**
  1. Let "Track 1" play until its duration finishes and the player advances automatically to "Track 3".
  2. While "Track 3" is playing, click "Stop / Skip Track" from the host controls.
  3. Add "Track 4", let it start playing, and immediately click "Close Lounge" from room settings.
  4. Navigate to User A's Profile (`/profile`) and inspect the performance list.
- **Expected Results:**
  - [ ] "Track 1" has an outcome badge of `Completed` (emerald badge).
  - [ ] "Track 3" has an outcome badge of `Skipped` (amber badge).
  - [ ] "Track 4" has an outcome badge of `Interrupted` (rose badge).
  - [ ] Recorded durations accurately reflect the actual seconds sung rather than the full nominal track duration for skipped/interrupted tracks.

### Scenario 3: Session Attendance & Participant Deduplication
- **Objective:** Verify session lifecycle tracking and ensure multi-tab or transient disconnects do not duplicate participant entries.
- **Steps:**
  1. User A creates a lounge.
  2. User B joins the lounge.
  3. User B opens a second browser tab with the same room URL.
  4. User B closes one of the tabs, waits 10 seconds, then navigates to the lobby and re-joins.
  5. User A closes the lounge.
  6. Inspect User B's Profile (`/profile` -> "Attended Lounges" tab).
- **Expected Results:**
  - [ ] The attended lounge session appears in User B's session history list.
  - [ ] User B only appears ONCE in the session's participant list (no duplicate avatar or username).
  - [ ] The total attended duration reflects cumulative active time in the room.

### Scenario 4: Session Recap Experience
- **Objective:** Verify the modal recap displays complete session summary, participant roster, and song performance history.
- **Steps:**
  1. On the Profile page, click "View Recap" on the closed session.
  2. Inspect the opened `SessionRecapDialog`.
- **Expected Results:**
  - [ ] Dialog opens smoothly displaying room title, host badge, total duration, total songs, and participant count.
  - [ ] Participant list displays avatars, usernames, and roles (Host / Singer / Audience).
  - [ ] Performance list displays each track performed during the session in chronological order with performer name and outcome badge.
  - [ ] Closing the modal restores full profile view without errors.

### Scenario 5: User History Privacy Controls
- **Objective:** Verify privacy-by-default behavior and toggle controls.
- **Steps:**
  1. User A checks their Profile settings. Both "Public Song History" and "Public Lounge History" should default to OFF (Private).
  2. User B visits `http://localhost:4000/api/v1/history/users/<User_A_ID>/songs`.
  3. User A toggles "Public Song History" to ON in the History & Privacy section.
  4. User B refreshes the API call or checks User A's public history endpoint.
  5. User A toggles "Public Song History" back to OFF.
- **Expected Results:**
  - [ ] When private: User B receives HTTP 403 `FORBIDDEN_PRIVATE_HISTORY`.
  - [ ] When public: User B successfully receives the list of performances.
  - [ ] Toggling back to OFF immediately restores HTTP 403 privacy barrier.
  - [ ] UI displays feedback toasts/indicators upon toggling.

### Scenario 6: Private Lounge Access Control on Session Recaps
- **Objective:** Ensure non-participants cannot inspect session recaps for private lounges.
- **Steps:**
  1. User A creates a **Private** lounge (`visibility: 'private'`).
  2. User A performs a song and closes the lounge.
  3. User A retrieves the `sessionId` from their Profile.
  4. User B (who was never in the room) attempts to fetch `GET /api/v1/history/sessions/<sessionId>`.
  5. User A attempts to fetch `GET /api/v1/history/sessions/<sessionId>`.
- **Expected Results:**
  - [ ] User B receives HTTP 403 `FORBIDDEN_PRIVATE_SESSION`.
  - [ ] User A receives HTTP 200 with the full recap.

---

## 3. Edge Case Matrix

| Edge Case | Expected System Behavior |
| :--- | :--- |
| User joins room but sings no songs | Session is recorded in "Attended Lounges"; songs sung stat does not increment; recap shows 0 songs. |
| User closes tab during singing | Song outcome marked as `'interrupted'` upon room cleanup or skip; duration capped at disconnect time. |
| Host closes room with empty queue | Session closes cleanly with duration set; 0 performances recorded. |
| Fast skip (song stopped within 2 seconds) | Outcome recorded as `'skipped'` with ~2s duration. Unique index prevents collision. |
| User with zero history visits profile | Clean empty states displayed in stats cards, Recently Sung list, and Attended Lounges list. No uncaught errors or broken layouts. |
