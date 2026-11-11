# KTVOnline — Sprint 3.9: Karaoke Experience Polish Implementation Report

## A. Summary

- **Sprint Objective:** Improve the overall karaoke room experience by identifying and resolving UX, UI, interaction, responsiveness, and frontend reliability issues across the existing product.
- **Sprint Policy:** Strict Code-Only Development Policy. No tests created/modified, no test runners executed, no production build commands run.
- **Baseline Commit:** `6e22b14` (Sprint 3.8: Host & Room Moderation Experience)
- **Final HEAD Commit:** `8edc688`
- **Overall Implementation Status:** Complete. All prioritized findings from the Phase 0 audit have been implemented and statically validated.

---

## B. Findings Summary

| Issue ID | Severity | Affected Component(s) | Root Cause |
| :--- | :---: | :--- | :--- |
| **P0-1** | Critical | `KaraokePlayer.tsx` | Status bar only differentiated between `ON AIR`, `PAUSED`, and `STANDBY`. During source resolving, loading, or backend `loading`/`preparing` states, users were presented with a generic `STANDBY` badge with no preparation cues. |
| **P0-2** | Critical | `KaraokePlayer.tsx`, `SingerTurnIndicator.tsx` | No active visual transition indicator alerted the room or upcoming performers when the current song approached its end (`durationMs - currentPositionMs <= 15000`). |
| **P0-3** | Critical | `VoiceControls.tsx`, `page.tsx` | The voice mute toggle button only reflected local LiveKit state. When a participant was server-muted by room moderation (`viewer?.isMuted === true`), the button still appeared interactive with the label `Unmute`, causing state desynchronization upon attempted unmutes. |
| **P1-1** | Important | `LyricsStage.tsx` | Active and upcoming lyrics lacked background contrast backdrop and text shadow against vivid/neon room atmosphere backdrops, and no quick-switch CTA existed when a track was instrumental. |
| **P1-2** | Important | `SingerTurnIndicator.tsx` | The "Up Next" section only listed the upcoming singer's name, omitting the queued song title (`nextUpItem.song.title`). |
| **P1-3** | Important | `page.tsx` (Room Join Banner) | Non-members visiting a locked room (`room.isLocked === true`) were presented with "Slot available for you" and an active "Join Lounge" button, resulting in unhandled rejection errors (`ROOM_LOCKED`). |
| **P1-4** | Important | `page.tsx` (Mobile Dock Navigation) | Dock touch targets were smaller than the 44px minimum touch target size, and the voice button lacked loading/connecting feedback when renegotiating LiveKit tokens. |
| **P2-1** | Polish | `RoomChatPanel.tsx` | Messages from room moderators lacked a `MOD` badge, impairing chat governance transparency. |

---

## C. Implementation Details

### 1. Karaoke Playback Experience & State Clarity (P0)
- **Problem:** Users could not distinguish between a track that was loading/preparing, a song that was ending soon, or a completely idle stage.
- **Solution:**
  - Added `isPreparing` (`status === 'loading' || performerState === 'preparing' || executionState === 'resolving_source' || executionState === 'loading'`) with a dedicated `PREPARING` badge and spinning loader in `KaraokePlayer.tsx`.
  - Added `isEndingSoon` (`durationMs > 20000 && durationMs - currentPositionMs <= 15000`) with an `ENDING SOON` badge in the player header and a `Wrapping Up` badge in `SingerTurnIndicator.tsx`.
  - Added `isEnded` with a `SONG ENDED` badge to clearly signify song completion.
- **Changed Files:**
  - `apps/web/src/features/karaoke/components/KaraokePlayer.tsx`
  - `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx`

### 2. Lyrics Stage Contrast & Visualizer Transition (P1)
- **Problem:** When a song lacked timed lyrics or when vibrant room themes were applied, lyrics readability suffered and users had to search for the view switcher button.
- **Solution:**
  - In `LyricsStage.tsx`, added backdrop contrast styling (`bg-black/30 backdrop-blur-xs shadow-xs drop-shadow-md`) to active and upcoming lyric line rows.
  - In the instrumental/no-timed-lyrics state, added an inline CTA button (`Switch to Audio Wave Visualizer`) to switch immediately to visualizer mode.
- **Changed Files:**
  - `apps/web/src/features/karaoke/components/LyricsStage.tsx`
  - `apps/web/src/features/karaoke/components/KaraokePlayer.tsx`

### 3. Voice Moderation Mute & Reconnection UX (P0/P1)
- **Problem:** Server-muted participants were misled into believing their microphone was locally toggleable.
- **Solution:**
  - Added `isServerMuted?: boolean` to `VoiceControlsProps`.
  - When `isServerMuted === true`, the mute toggle button displays `MicOff`, label `Muted by Mod`, disabled styling (`cursor-not-allowed opacity-90`), and an explanatory tooltip (`Your microphone has been muted by room moderation`).
  - In `page.tsx`, passed `isServerMuted={Boolean(viewer?.isMuted)}` to `VoiceControls`.
  - Updated the mobile dock voice button to render `Loader2` during connection negotiation and prevent invalid mute toggles while server-muted.
- **Changed Files:**
  - `apps/web/src/features/voice/components/voice-controls.tsx`
  - `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`

### 4. Stage & Singer Handoff Polish (P1)
- **Problem:** Audiences and performers could see who was up next, but not what song they would be performing.
- **Solution:**
  - In `SingerTurnIndicator.tsx`, updated both the singer's view and the audience's view to display `nextUpItem.song.title` alongside `nextSingerName`.
  - Integrated `isEndingSoon` into the turn indicator so both the active singer and the next singer know when a song turn is drawing to a close.
- **Changed Files:**
  - `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx`

### 5. Room Access Lifecycle & Locked Room Join Feedback (P1)
- **Problem:** Non-members entering a locked room were given false affordance to join, triggering backend rejection errors.
- **Solution:**
  - Added an explicit `room.isLocked` branch to the join callout banner in `page.tsx`.
  - Renders a prominent `room-locked-notice` alerting the visitor that the lounge has been locked by the host, with a disabled `Lounge Locked` button.
- **Changed Files:**
  - `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`

### 6. Mobile Ergonomics & Visual Consistency (P1/P2)
- **Problem:** Mobile dock buttons were too small (< 44px touch target) and moderator messages in chat lacked role distinction.
- **Solution:**
  - Expanded all mobile navigation dock buttons to `min-h-[44px] min-w-[44px] justify-center` with explicit safe area handling.
  - Added `overscroll-contain` to the mobile bottom sheet drawer to prevent background chaining during drawer scrolling.
  - In `RoomChatPanel.tsx`, added a sky-blue `MOD` badge for messages sent by room moderators (`message.senderRole === 'moderator'`).
- **Changed Files:**
  - `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`
  - `apps/web/src/components/chat/room-chat-panel.tsx`

---

## D. Deferred Work

1. **3D Virtual Room Avatars & Mini-games:** Planned for Sprint 4.0 (Social Entertainment) per Roadmap.
2. **Audio Track Pitch Shifter & Auto-tune DSP:** Deferred to audio processing hardening phase to maintain strict Web Audio API backward compatibility.
3. **Advanced Multi-track Stem Separation:** Requires server-side AI processing out of scope for lightweight frontend polish.

---

## E. Static Validation

### 1. Monorepo Type Check (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit (Done in 828ms)
apps/api typecheck$ tsc --noEmit (Done in 2.4s)
apps/web typecheck$ tsc --noEmit (Done in 2.5s)
```
**Result:** 0 errors across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`.

### 2. Monorepo Linter (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/ (Done in 772ms)
apps/api lint$ eslint src/ (Done in 1s)
apps/web lint$ next lint (Done in 2.3s, No ESLint warnings or errors)
```
**Result:** 0 errors, 0 warnings across all workspace projects.

---

## F. Runtime Verification

**NOT PERFORMED — Runtime verification is outside the scope of this sprint.**  
*(Per the mandatory Code-Only Engineering Policy, no test runners were executed and no runtime claims are made).*

---

## G. Final Verdict

**`CODE COMPLETE — NOT RUNTIME VERIFIED`**
