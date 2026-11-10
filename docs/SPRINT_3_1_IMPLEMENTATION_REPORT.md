# KTVOnline — Sprint 3.1: Stage & Singer Experience Implementation Report

**Execution Date**: 2026-11-11  
**Sprint**: 3.1  
**Scope**: Stage & Singer Experience, Singer Spotlight, Singer Handoff, Audience Engagement, Queue Journey  
**Policy**: Strict code-only development policy; static checks (`pnpm typecheck`, `pnpm lint`); zero destructive database actions; zero test suite modifications.

---

## 1. Final Verdict

```
CODE COMPLETE — NOT RUNTIME VERIFIED
```

All source code modifications, contracts, models, services, hooks, and presentation components for Sprint 3.1 have been implemented, static-type-checked, and lint-verified with 0 errors and 0 warnings. Per policy, runtime end-to-end execution and live hardware/audio playback remain deferred to the RV-00 verification runbook.

---

## 2. Phase Summaries & Deliverables

### Phase 1 — Architecture Audit (`docs/SPRINT_3_1_AUDIT.md`)
- Conducted full inspection of karaoke domain, playback worker lifecycle, realtime Socket.IO contracts, frontend components, and LiveKit voice integration.
- Identified the source of truth for current singer and next singer.
- Identified legacy placeholder in `room.currentSingerName` and fixed it to record authoritative user display names.
- Documented backward-compatible extension strategy for distinguishing between Song Requester and Assigned Singer.

### Phase 2 — Singer Turn Experience
- Extended `@ktv/contracts` with optional `singer` on `RoomQueueItemDto` and optional `singerId` on `AddQueueItemDto`.
- Updated `RoomQueueItemModel` to persist and populate `singer` references.
- Updated `KaraokeService` to record real performer names, handle singer assignment, and automatically handle departed performers.
- Enhanced `useKaraoke` hook with:
  - `currentSinger`, `currentRequester`, `nextSinger`, `nextRequester`
  - `isCurrentSinger`, `isCurrentRequester`, `isNextUpSinger`, `isNextUpRequester`
  - `currentPerformerState`: `'singing' | 'paused' | 'preparing' | 'ended' | 'idle'`
  - `addToQueue(songId, singerId?)`

### Phase 3 — Singer Spotlight
- Redesigned `SingerTurnIndicator.tsx` into a high-visibility Stage Performer Spotlight:
  - Prominent performer avatar and display name with lead vocal badge.
  - Performance status badge (Singing, Paused, Preparing, Ended, Idle).
  - Authoritative LiveKit voice activity detection: displays pulsing green audio indicator when `isSpeaking === true`; shows muted mic badge when muted; shows connected/ready when unmuted.
  - Seamlessly decoupled from 10 Hz lyric ticks to prevent UI layout shifts and reflows.

### Phase 4 — Singer Handoff Experience
- Synchronized visual indicators with backend authoritative state transitions.
- Displays upcoming singer teaser ("Up Next: [Name] with '[Song]'").
- Seamlessly transitions when tracks complete naturally, are skipped, or when a singer departs the room.
- Gracefully handles empty queue by returning to an inviting "Stage is Open" state.

### Phase 5 — Audience Experience
- Upgraded `QueueItem.tsx` to clearly distinguish when a song was queued on behalf of another singer ("Singer: X (by Y)").
- Introduced Stage Cheer Floating Emoji Particles (👏, 🔥, ❤️, 🎉, 🎤) that drift upwards and fade out over the stage screen without any database persistence overhead.
- Clear visual hierarchy between "Now Singing" and "Up Next" queues in `RoomSongQueue.tsx`.

### Phase 6 — Join Queue Flow
- Upgraded `SongSearchDialog.tsx` with:
  - Queue position preview banner: calculates and displays "Will be #X in queue (max 50)".
  - Duplicate submission guards: disables button and displays animated spinner during mutation.
  - Instant CTA buttons on both stage screen and room sidebar queue.

### Phase 7 — Stage Visual Polish
- Added `@keyframes floatFade` and `.animate-float-fade` in `globals.css` for high-performance GPU-accelerated cheer animations.
- Preserved existing `data-testid` attributes (`singer-turn-active`, `singer-turn-next`, `singer-turn-other`, `singer-turn-empty`) for backward-compatible test selector stability.
- Desktop 3-zone layout and mobile slide-over drawers maintained with high responsiveness.

---

## 3. Modified & Created Artifacts

| File | Change Description |
| :--- | :--- |
| `packages/contracts/src/karaoke.ts` | Added `singer` to `RoomQueueItemDtoSchema` and `singerId` to `AddQueueItemDtoSchema` |
| `packages/contracts/dist/*` | Recompiled contracts package dist via tsup |
| `apps/api/src/modules/karaoke/room-queue-item.model.ts` | Added `singer` reference, schema definition, and `toJSON` transform |
| `apps/api/src/modules/karaoke/karaoke.service.ts` | Populated `singer`, stored real `currentSingerName`, cleaned up departed performers |
| `apps/web/src/features/karaoke/hooks/use-karaoke.ts` | Exported `currentSinger`, `nextSinger`, `currentPerformerState`, and `isNextUpSinger` |
| `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx` | Full Stage Spotlight with performer avatar, voice speaking wave, and floating cheer emojis |
| `apps/web/src/features/karaoke/components/KaraokePlayer.tsx` | Integrated Singer Spotlight into stage area with voice indicator props |
| `apps/web/src/features/karaoke/components/QueueItem.tsx` | Added explicit Requester vs Assigned Singer visual differentiation |
| `apps/web/src/features/karaoke/components/SongSearchDialog.tsx` | Added queue position preview ("Will be #X in queue") and duplicate submission guard |
| `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` | Connected LiveKit voice speaking state to stage spotlight and passed queue length to dialog |
| `apps/web/src/app/globals.css` | Added `floatFade` keyframe animation for stage particles |
| `docs/SPRINT_3_1_AUDIT.md` | Architecture and component audit |
| `docs/STAGE_AND_SINGER_EXPERIENCE.md` | Stage & Singer Experience architectural specification |
| `docs/SPRINT_3_1_IMPLEMENTATION_REPORT.md` | This document |

---

## 4. Static Verification Results

### `pnpm typecheck`
```
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 777ms
apps/api typecheck$ tsc --noEmit
└─ Done in 1.6s
apps/web typecheck$ tsc --noEmit
└─ Done in 2.2s
```
**Exit Code**: 0  
**Errors**: 0

### `pnpm lint`
```
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 463ms
apps/api lint$ eslint src/
└─ Done in 1s
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 1.8s
```
**Exit Code**: 0  
**Errors**: 0  
**Warnings**: 0

---

## 5. Deferred Verification Scenarios (from RV-00)

Per policy, the following runtime tests are recorded as deferred for manual or test harness validation:
1. **RV-04-01**: Playback synchronization and stage transition on song end.
2. **RV-04-04**: Singer departure during playback triggering immediate stage handoff.
3. **RV-03-02**: LiveKit voice speaking indicator (`isSpeaking`) waveform activation under real audio input.
4. **RV-02-05**: Host queue reordering reflection across multiple browser tabs.
