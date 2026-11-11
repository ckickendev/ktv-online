# KTVOnline — Sprint 3.9: Karaoke Experience Polish Audit

**Baseline Commit:** `6e22b14` (Sprint 3.8: Host & Room Moderation Experience)  
**Target Milestone:** Sprint 3.9 Product Polish  
**Mission:** Polish the core karaoke room experience across playback, voice UX, singer handoffs, mobile ergonomics, visual consistency, and reliability without introducing unnecessary feature bloat.

---

## 1. Architecture Overview

KTVOnline operates as an integrated social online karaoke platform:
- **Frontend (`apps/web`):** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, Zustand, TanStack Query.
- **Shared Contracts (`packages/contracts`):** Zod schemas and TypeScript interfaces for room models, playback state, queue items, and Socket.IO realtime events.
- **Backend API (`apps/api`):** Node.js 22, Express, TypeScript, Mongoose, Socket.IO server, LiveKit WebRTC SFU integration.
- **Core Experience Subsystems:**
  - **Karaoke Playback Engine (`features/karaoke`):** `KaraokePlayer`, `LyricsStage`, `CurrentSongPanel`, `PlaybackControls`, `SingerTurnIndicator`, `useKaraoke`, `useKaraokeAudio`.
  - **Voice Communication (`features/voice`):** `useVoiceClient`, `VoiceControls`, `AudioDeviceSettingsModal`, LiveKit WebRTC audio tracks.
  - **Room State & Presence (`hooks/use-room-state`):** Authoritative state versioning, monotonic sequence reconciliation, gap-recovery snapshots.
  - **Social Engagement (`features/rooms/atmosphere`, reactions, gifts):** Dynamic lounge themes, audience cheers, animated gifts, and personal viewing preferences.

---

## 2. Relevant Components, Hooks, Stores & Contracts

| Subsystem | Primary Files / Interfaces | Responsibility |
| :--- | :--- | :--- |
| **Room Page & Dock** | `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` | Main 3-zone layout, mobile dock, drawer, header actions, lifecycle banners |
| **Karaoke Player** | `apps/web/src/features/karaoke/components/KaraokePlayer.tsx` | Stage surface, playback timeline, status indicator, visualizer, gifts/reaction overlay |
| **Lyrics Stage** | `apps/web/src/features/karaoke/components/LyricsStage.tsx` | Syllable-timed and line-timed lyric rendering, auto-scrolling, translations, typography |
| **Singer Turn Indicator** | `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx` | Singer spotlight, LiveKit voice presence indicator, up-next teaser, stage cheer buttons |
| **Song Queue** | `apps/web/src/features/karaoke/components/RoomSongQueue.tsx` | Dynamic queue list, reorder controls, queue capacity, now-singing item, empty state |
| **Voice Client** | `apps/web/src/features/voice/hooks/use-voice-client.ts` | LiveKit session lifecycle, permission handling, token renewal, device selection |
| **Voice Controls** | `apps/web/src/features/voice/components/voice-controls.tsx` | Mute/unmute toggle, join/leave button, device modal trigger, active speaker status |
| **Room State** | `apps/web/src/hooks/use-room-state.ts` | Socket.IO event processing, snapshot hydration, state versioning, presence tracking |
| **Contracts** | `packages/contracts/src/` (`room.ts`, `room-state.ts`, `realtime.ts`, `chat.ts`) | Shared type safety for roles, room states, events, and moderation flags |

---

## 3. Discovered Issues & Classification

### 3.1 Playback & Audio Experience (Phase 1)
- **[P0-1] Ambiguous Playback Status During Track Preparation:**
  - *Location:* `KaraokePlayer.tsx` lines 277–291.
  - *Finding:* The stage top status bar only checks `isPlaying ? 'ON AIR' : isPaused ? 'PAUSED' : 'STANDBY'`. When a track is loading audio sources (`executionState === 'resolving_source' | 'loading'`) or the backend status is `preparing`, the stage displays `STANDBY` instead of an active `PREPARING` badge with progress spinner.
- **[P0-2] Missing "Song Ending Soon" Singer Transition Feedback:**
  - *Location:* `SingerTurnIndicator.tsx` & `KaraokePlayer.tsx`.
  - *Finding:* When the current song reaches its final seconds (`durationMs - currentPositionMs <= 15000`), there is no visible feedback alerting the room or the next singer that the song is wrapping up.
- **[P1-1] Lyric Line Readability on Vivid Atmosphere Backdrops:**
  - *Location:* `LyricsStage.tsx` lines 68–76.
  - *Finding:* Active and upcoming lyric text lacks background contrast padding or backdrop text shadow when high-intensity neon atmospheres (e.g. Cyberpunk / Retro Wave) are enabled.
- **[P1-2] Lyrics Stage Empty & Non-Timed States:**
  - *Location:* `LyricsStage.tsx` lines 263–280.
  - *Finding:* The instrumental/no-timed-lyrics state is visually sparse and does not provide an immediate action to switch to the animated audio wave visualizer.

### 3.2 Voice Connection & Audio UX (Phase 2)
- **[P0-3] Frontend Mute vs Authoritative Server Mute Ambiguity:**
  - *Location:* `VoiceControls.tsx` lines 141–158 & `page.tsx` line 399.
  - *Finding:* The voice bar mute toggle only reflects local LiveKit mute state. When a participant is muted by room moderation (`viewer?.isMuted === true`), the button still appears active with the label `Unmute`. Clicking it attempts a local unmute that fails server-side because the JWT token has `canPublish: false`.
- **[P1-3] Reconnection & Disconnection Feedback:**
  - *Location:* `VoiceControls.tsx` & `page.tsx` mobile dock.
  - *Finding:* When voice reconnects, the mobile dock voice button does not show a loading spinner, appearing unresponsive during connection renegotiation.

### 3.3 Stage & Singer Handoff Polish (Phase 3)
- **[P1-4] Incomplete "Up Next" Information:**
  - *Location:* `SingerTurnIndicator.tsx` lines 213–220 & 385–393.
  - *Finding:* The "Up Next" teaser displays the upcoming performer's name but omits the song title (`nextUpItem.song.title`), leaving singers unaware of which song is about to begin.
- **[P2-1] Reduced-Motion Compliance on Stage Animations:**
  - *Location:* `SingerTurnIndicator.tsx` & `LyricsStage.tsx`.
  - *Finding:* Auto-scrolling in `LyricsStage` and particle floating in `SingerTurnIndicator` should strictly honor `prefers-reduced-motion` media queries.

### 3.4 Room Loading, Empty & Error States (Phase 4)
- **[P1-5] False "Slot Available" on Locked Rooms:**
  - *Location:* `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` lines 710–745.
  - *Finding:* If `room.isLocked === true` and an unauthenticated or non-member visitor visits the room, the join banner displays "Slot available for you" with an enabled "Join Lounge" button. Clicking it triggers an error toast (`ROOM_LOCKED`). The UI must preemptively show a `room-locked-notice` with a disabled button.
- **[P2-2] Moderator Message Badge in Chat:**
  - *Location:* `RoomChatPanel.tsx` lines 180–190.
  - *Finding:* Messages from hosts show a golden `HOST` badge, but messages from moderators (`senderRole === 'moderator'`) lack a `MOD` badge, impairing chat moderation transparency.

### 3.5 Mobile Experience Polish (Phase 5)
- **[P1-6] Touch Target Ergonomics on Mobile Dock Navigation:**
  - *Location:* `page.tsx` lines 940–1020.
  - *Finding:* Dock buttons had tight padding (`p-1.5`) below the recommended 44px minimum touch target size.
- **[P1-7] Mobile Drawer Scroll Isolation & Dismissal:**
  - *Location:* `page.tsx` lines 1022–1058.
  - *Finding:* The mobile drawer overlay needs clean backdrop click dismissal, touch scroll containment (`overscroll-contain`), and explicit safe area padding (`pb-[max(1.5rem,env(safe-area-inset-bottom))]`).

---

## 4. Prioritized Implementation Plan

1. **Phase 1 (P0): Playback State & Transition Polish**
   - Update `KaraokePlayer.tsx` to handle `preparing`, `loading`, `buffering`, and `ended` states with dedicated visual badges.
   - Add "Ending Soon / Wrap Up" indicator in `KaraokePlayer` and `SingerTurnIndicator` when within 15s of song completion.
   - Enhance `LyricsStage.tsx` contrast, line wrapping, and quick-switch to visualizer when lyrics are instrumental.
2. **Phase 2 (P0): Voice & Moderation Mute UX**
   - Add `isServerMuted` prop to `VoiceControls.tsx`.
   - When `viewer?.isMuted === true`, render a disabled "Muted by Mod" state with an explanatory tooltip.
   - Add loading spinner to mobile dock voice button when connecting/reconnecting.
3. **Phase 3 (P1): Singer Handoff & Up Next Teaser**
   - Display both the next singer and the next song title in `SingerTurnIndicator.tsx`.
   - Add turn transition indicator during song handoffs.
4. **Phase 4 (P1): Room Access Lifecycle Polish**
   - Add explicit `room.isLocked` branch in room entry callout in `page.tsx`.
   - Preemptively display "Lounge Locked" instead of "Slot available".
5. **Phase 5 (P1/P2): Mobile Ergonomics & Visual Consistency**
   - Expand mobile dock button touch targets to >= 44px (`min-h-[44px] min-w-[44px]`).
   - Add `MOD` badge to `RoomChatPanel.tsx` for moderator messages.
   - Ensure `prefers-reduced-motion` is respected across stage animations.

---

## 5. Explicitly Out-of-Scope Items

1. No new social entertainment features (e.g. mini-games, 3D avatars).
2. No replacement of LiveKit WebRTC SFU or Socket.IO core protocols.
3. No replacement of TanStack Query or Zustand state management.
4. No external lyrics providers or audio codecs outside current contracts.
5. No database schema breaking changes.
6. No test runner execution or production build commands (strictly code-only policy).

---

## 6. Audit Verdict

**`AUDIT COMPLETE`**  
All findings verified against existing source code. Ready to proceed with prioritized implementation.
