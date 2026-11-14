# Sprint 5.5: Live Karaoke Performance Experience — Manual QA Checklist

**Scope:** Post-Implementation Runtime QA Verification  
**Test Platforms:** Desktop Chrome, Desktop Safari, Mobile Safari (iOS), Mobile Chrome (Android)  
**Status:** READY FOR OPERATOR RUNTIME EXECUTION  

---

## 1. Environment Preconditions

- [ ] Node.js 22 and pnpm installed.
- [ ] MongoDB running locally with database `test`.
- [ ] API service running: `pnpm --filter api dev` on `http://localhost:4000`.
- [ ] Web application running: `pnpm --filter web dev` on `http://localhost:3000`.
- [ ] LiveKit server running and configured.
- [ ] Two separate test accounts (Performer A and Audience Member B) in distinct browser contexts.

---

## 2. Test Scenarios

### Scenario 1: Singer Starts a Performance & Spotlight Presentation
- **Steps:**
  1. Performer A queues a song from the catalog.
  2. Song starts playing on stage.
  3. Inspect Performer A's screen and Audience B's screen.
- **Expected Results:**
  - [ ] Performer A sees: "You are in the Spotlight! Lead Singer", live mic status dot, and track metadata.
  - [ ] Audience B sees: Performer A's avatar with active aura, name, "Performer" badge, track title, and artist.
  - [ ] Stage status badge transitions from `PREPARING` to `ON AIR` (pulsing red dot).
  - [ ] Backing audio plays synchronously on both clients.

### Scenario 2: Synchronized Lyrics & Word-Level Timing
- **Steps:**
  1. Play a song with word-level timed lyrics.
  2. Observe lyrics progression across both screens.
- **Expected Results:**
  - [ ] Active words highlight with a progressive gradient sweep matching vocal rhythm.
  - [ ] Active lyric line remains vertically centered in the viewport.
  - [ ] Upcoming lines are semi-transparent; completed lines dim gracefully.
  - [ ] No audio-visual drift or text stuttering.

### Scenario 3: Untimed Lyrics Reader Fallback
- **Steps:**
  1. Queue a song that has text lyrics but no timed timestamps (`text_only`).
  2. Inspect the central stage.
- **Expected Results:**
  - [ ] The stage displays the **Untimed Lyrics Reader** (`lyrics-untimed-reader`).
  - [ ] A badge indicates: *"Lyrics Reader (Untimed) &bull; Sing Along"*.
  - [ ] Singer can manually scroll through the full song lyrics while the backing track plays.
  - [ ] A button allows switching to the Audio Wave Visualizer if preferred.

### Scenario 4: Audience Cheers & Cumulative Cheer Tally
- **Steps:**
  1. While Performer A is singing, Audience B clicks the 🔥 cheer emoji 3 times and 👏 twice.
  2. Inspect Audience B's screen and Performer A's screen.
- **Expected Results:**
  - [ ] Floating emoji particles float gently upwards across the stage and fade out after 2 seconds.
  - [ ] Both screens display the live cheer counter: `🔥 5 cheers`.
  - [ ] On Performer A's screen, the counter reads: `🔥 5 cheers from room`.
  - [ ] Audience B does not see duplicate particles from server broadcasts.

### Scenario 5: Ending Soon & Singer Handoff (Transitions)
- **Steps:**
  1. Performer A is singing Song 1. Audience B has Song 2 queued up next.
  2. Let Song 1 reach its final 15 seconds.
  3. Let Song 1 reach duration completion.
- **Expected Results:**
  - [ ] In the final 15 seconds, stage displays `ENDING SOON` badge with amber spotlight pulse.
  - [ ] When the song ends, the stage enters `TRANSITIONING` state.
  - [ ] Stage transition card appears: *"Song Concluded &bull; Stage Transition"*, displaying: *"Next Up: [Song 2 Title] &bull; Audience B"*.
  - [ ] Audience B's indicator transitions to: *"Step Up to the Stage! Stage Handoff"*.
  - [ ] Authoritative backend advances queue; cheer counter resets to 0 for the new song; Song 2 starts playing.

### Scenario 6: Requester Differs from Assigned Singer
- **Steps:**
  1. User A queues a song and assigns User B as the singer.
  2. Let the song take the stage.
- **Expected Results:**
  - [ ] User B receives the singer spotlight.
  - [ ] Attribution note displays: *"Queued by User A"*.
  - [ ] User B's microphone status is mapped to the spotlight.

### Scenario 7: Playback Pause / Resume / Seek
- **Steps:**
  1. Room host pauses playback.
  2. Host resumes playback.
  3. Host clicks on the timeline progress bar to seek forward 30 seconds.
- **Expected Results:**
  - [ ] Stage status displays `PAUSED` in amber. Lyrics sweep halts.
  - [ ] Resuming restores `ON AIR` and audio resumes without delay.
  - [ ] Seeking repositions audio and active lyric line centers on the new timestamp immediately.

### Scenario 8: Mobile Karaoke Experience & Touch Targets
- **Steps:**
  1. Open the room on a mobile device (iPhone / Android) or mobile viewport.
  2. Verify stage, lyrics readability, and cheer buttons.
- **Expected Results:**
  - [ ] All cheer and playback buttons have minimum 44px touch targets.
  - [ ] Lyrics text scale adapts cleanly without horizontal overflow.
  - [ ] Safe-area padding prevents overlap with the mobile dock.
  - [ ] No layout jumping or page body scroll interference.

### Scenario 9: Reduced Motion Accessibility
- **Steps:**
  1. Enable "Reduce Motion" in OS settings or set `visualEffectsIntensity: 'minimal'`.
  2. Send cheers during a song.
- **Expected Results:**
  - [ ] Floating particles use subtle fade without aggressive motion.
  - [ ] Stage backdrop maintains static/calm illumination.
  - [ ] Screen reader live region announces cheers politely.
