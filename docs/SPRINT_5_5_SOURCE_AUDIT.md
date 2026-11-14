# Sprint 5.5: Live Karaoke Performance Experience — Source Audit

**Milestone:** Sprint 5.5 Phase 0 Baseline Audit  
**Date:** 2026-11-14  
**Expected Baseline Commit:** `e5b5cc1`  
**Actual HEAD Commit:** `e5b5cc12709fc0b1a41684c56c3ac10b85c84541`  
**Working Tree Status:** Clean  
**MongoDB Database Name:** `test` (strictly preserved)  

---

## 1. Baseline & Repository Verification

- Current Git HEAD matches expected baseline `e5b5cc1` (`feat(voice): implement Sprint 5.4 Singer Studio, live microphone input meter, vocal processing, and audio lifecycle controls`).
- Working tree is clean on branch `main`.
- Monorepo structure:
  - `apps/web`: Next.js 15.2 (React 19), Tailwind CSS v4, Zustand, TanStack Query.
  - `apps/api`: Node.js 22, Express, TypeScript, Mongoose, Socket.IO, LiveKit.
  - `packages/contracts`: Shared TypeScript types and Zod schemas.
- Database: MongoDB `test` database preserved in configuration and connection layers.

---

## 2. Existing Karaoke & Stage Architecture Inspection

### 2.1 Stage Components (`apps/web/src/features/karaoke/components/`)
1. **`KaraokePlayer.tsx`**:
   - Master orchestrator for stage visual rendering, audio playback hook (`useKaraokeAudio`), lyrics vs visualizer view switcher, seekable timeline progress bar, and transition overlays.
   - Tracks `performerState`, `isTransitioning`, `isEndingSoon`, `executionState`, and `isAutoplayBlocked`.
   - Integrates `SingerTurnIndicator`, `LyricsStage`, `CurrentSongPanel`, and `PlaybackControls`.
2. **`SingerTurnIndicator.tsx`**:
   - Renders 3 distinct views based on viewer role:
     - *View 1 (You are singing)*: "You are in the Spotlight!" banner with lead singer avatar, mic live badge, and cheer buttons.
     - *View 2 (You are up next)*: "You Are Up Next!" reminder with song title and stage handoff notice.
     - *View 3 (Audience view)*: Current singer avatar, name, live singing badge, requester attribution, and audience cheer buttons.
   - Renders floating reaction particles with animated float/fade effects and polite screen reader announcements.
3. **`LyricsStage.tsx`**:
   - Fetches synchronized lyrics via `karaokeApi.getLyrics(songId)`.
   - Memoized `LyricLineRow` component reduces render complexity from $O(N)$ to $O(1)$ per tick.
   - Supports word-level timing with progressive gradient clip-path, line-level timing fallback with horizontal sweep, and translation display.
   - Auto-scrolls vertically to center the active line unless paused by manual user scroll.
4. **`CurrentSongPanel.tsx`**:
   - Renders track album thumbnail (with rotating vinyl effect when playing), song title, artist, audio availability badge, timed lyrics badge, licensing badge, and requester details.
5. **`StageGiftOverlay.tsx`**:
   - Renders animated virtual gifts (e.g. flowers, microphones, trophies, rockets) floating across the stage.
6. **`PlaybackControls.tsx`**:
   - Backing audio controls (Play/Pause, Skip, Stop, Seek, Backing volume slider, Mute, Equalizer launcher).

### 2.2 Playback Lifecycle & State Machine (`apps/api/src/modules/karaoke/`)
1. **Authoritative Playback State (`RoomPlaybackStateModel`)**:
   - Document tracks `status` (`'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'`), `currentItem` (embedded queue item), `startedAt`, `positionMs`, `playbackVersion`, and lease locking fields (`workerId`, `leaseExpiresAt`).
2. **Clock Synchronization (`clock-sync.service.ts`)**:
   - Uses NTP-style time offset estimation:
     $$\Delta t = t_{\text{server}} - \left(t_{\text{recv}} - \frac{\text{RTT}}{2}\right)$$
   - Computes local playback elapsed time:
     $$\text{positionMs} = \text{lastPositionMs} + (t_{\text{now}} - t_{\text{lastSync}})$$
   - Smooths drift between estimated position and audio element position to prevent audible jitter.
3. **Queue Assignment vs Requester (`room-queue-item.model.ts`)**:
   - Explicitly stores `requestedBy` (user who queued the song) and `singer` (user assigned to sing). These are distinct identities.

### 2.3 Audience Engagement Hooks
1. **`use-stage-reactions.ts`**:
   - Sends reactions (`StageReactionEmoji`) via Socket.IO `stage:reaction`.
   - Maintains floating particle state with 2-second lifetime.
2. **`use-virtual-gifts.ts`**:
   - Sends gifts via `gift:send` and receives `gift:new` broadcasts.
   - Triggers celebratory overlays.

---

## 3. Confirmed UX & Architecture Gaps

| ID | Component / Area | Description of Gap | Severity |
| :--- | :--- | :--- | :--- |
| **GAP-01** | Stage Spotlight Cohesion | Performer spotlight and song panel are currently separated across multiple cards. The stage needs a unified, theatrical spotlight presentation directly anchoring the singer to the stage. | **High** |
| **GAP-02** | Stage Visual States | While status text exists, the visual atmosphere of the stage (backdrop lighting, spotlight pulse, transition cards) does not distinctly reflect states like "Singer Taking Stage", "Ending Soon", or "Interrupted". | **Medium** |
| **GAP-03** | Singer Handoff Clarity | When a performance ends and transitions to the next track, the handoff countdown and next-singer presentation should be immediate, reassuring, and visually intentional. | **Medium** |
| **GAP-04** | Static Lyrics Fallback | If a song lacks timed lyrics (only plain text lines or no lyrics), `LyricsStage` currently shows an empty callout. A plain-text scrollable lyrics reader fallback is needed for songs with untimed text. | **Medium** |
| **GAP-05** | Audience Cheer Feedback | Reactions float away after 2 seconds, but there is no running tally of audience cheers during a performance to give the singer a sense of collective room appreciation. | **Medium** |
| **GAP-06** | Mobile Stage Usability | On smaller mobile screens, the stacked singer turn indicator + stage + song panel can consume excessive vertical height. The layout needs responsive optimization with safe-area spacing. | **Medium** |

---

## 4. Reused Systems & Regression Boundaries

1. **Authoritative Backend Playback**: The client-side transition animation must remain strictly presentation-only. The server remains the sole authority for track advancement, queue shifting, and playback state.
2. **Sprint 5.3 History Guarantee**: Songs are only recorded in `KaraokePerformanceModel` when authoritative status becomes `'playing'`. Visual transitions must never trigger history recordings.
3. **Sprint 5.4 Voice & Moderation Guarantee**: Room moderation (server mute) must remain enforced during all stage transitions and cheers.
4. **Room Atmosphere Engine**: Atmospheric styles (`useRoomAtmosphere`) must be reused to power stage lighting and spotlight accents.
