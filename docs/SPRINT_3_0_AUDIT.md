# Sprint 3.0 — Karaoke Room Experience Audit

## Document Control
- **Monorepo**: `ktv-online-monorepo` (v0.1.0)
- **Baseline Git Commit**: `fce831c` (Sprint 2.6.4 / RV-00)
- **Status**: **`AUDIT COMPLETE`**
- **Date**: November 2026

---

## 1. Executive Summary

Sprint 3.0 focuses on transforming KTVOnline's virtual room from an administrative, component-heavy layout into a **cohesive, premium virtual karaoke lounge experience**. 

Under the product direction:
> **"KTVOnline — Your Virtual Karaoke Lounge"**

The karaoke stage must be the primary visual, functional, and acoustic focus. Participants, queue, chat, voice controls, and room telemetry must support the stage rather than compete with it for space and user attention.

This audit evaluates the current implementation in `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` and all child components across desktop and mobile form factors, identifying architectural debt, component reuse opportunities, and layout deficiencies.

---

## 2. Room Component & Hierarchy Audit

### 2.1. Existing Room Route Architecture
- **Route File**: [`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/[roomId]/page.tsx) (652 lines).
- **Current Layout Pattern**:
  ```
  +-----------------------------------------------------------------------------------------+
  | Room Header: Title, Category, Capacity (3/10), Realtime Pill, Voice Pill, Host/Leave    |
  +-----------------------------------------------------------------------------------------+
  | Notifications: Room Closed Alert / Kicked Alert                                         |
  +------------------------------------+--------------------------------+-------------------+
  | Left Column (3 cols):              | Center Column (6 cols):        | Right Column (3): |
  | - RoomMemberList                   | - Join Lounge Banner (if guest)| - Tabs:           |
  |   (Vertical list of all registered | - KaraokePlayer:               |   [Chat|Queue|Act]|
  |    room members, kick buttons,     |   * SingerTurnIndicator        | - RoomChatPanel   |
  |    online presence indicators)     |   * Autoplay/Error Banners     | - RoomSongQueue   |
  |                                    |   * Stage Box (Lyrics / Vis)   | - RoomActivity    |
  |                                    |   * Progress Bar & Timestamps  |   Timeline        |
  |                                    |   * CurrentSongPanel           |                   |
  |                                    |   * PlaybackControls           |                   |
  |                                    | - VoiceParticipants (Grid)     |                   |
  |                                    | - VoiceControls (Bar + Modal)  |                   |
  +------------------------------------+--------------------------------+-------------------+
  ```

### 2.2. Identified Architectural & UX Deficiencies
1. **Stage Squished into 50% Desktop Width**:
   - The central stage (`lg:col-span-6`) is flanked by two equally wide 3-column sidebars (`lg:col-span-3`).
   - The member list on the left consumes 25% of horizontal screen real estate merely to display a list of 2–10 names, starving the lyrics and visualizer of width.
2. **Excessive Vertical Stacking & Page Scrolling**:
   - The center column stacks: Join Banner + SingerTurnIndicator + Autoplay Banner + Stage Box + Progress + CurrentSongPanel + PlaybackControls + VoiceParticipants Grid + VoiceControls.
   - On standard 1080p and 1440p displays, users must scroll up and down repeatedly to adjust playback, view singer presence, and read lyrics.
3. **Severe Mobile Disruption**:
   - On mobile screens (`< 1024px`), Tailwind's `grid-cols-1` causes the layout to stack vertically in DOM order:
     1. Room Header
     2. `RoomMemberList` (consuming the entire initial mobile viewport!)
     3. Center Stage (users must scroll past the member list to even see the song playing)
     4. Voice Controls
     5. Chat/Queue Tabs
   - This directly violates mobile UX priorities where the stage should be visible immediately upon entering the room.
4. **Voice Controls Competing with Playback Controls**:
   - Voice controls (`VoiceControls`) and backing track playback controls (`PlaybackControls`) are rendered as two separate, disconnected cards stacked on top of each other.
   - This leads to user confusion between "Muting my microphone" vs "Muting the backing music track", and "Leaving the voice lounge" vs "Leaving the karaoke room".
5. **Split Participant Representation**:
   - Registered room members appear in `RoomMemberList` (Left Column).
   - Voice lounge participants appear in `VoiceParticipants` (Center Column).
   - This duplication confuses room membership with active voice participation and wastes precious screen area.

---

## 3. Workstream Findings & Component Analysis

### 3.1. Karaoke Stage & Lyrics (`KaraokePlayer`, `LyricsStage`, `CurrentSongPanel`)
- **Status**: Functionally robust (delivering sub-line word timing, 10 Hz $O(1)$ memoization, and 3-band backing EQ from Sprint 2.6.4).
- **Reuse Assessment**:
  - `LyricsStage.tsx`: 100% reusable. Memoization and word-level timing algorithms are production-grade.
  - `CurrentSongPanel.tsx`: Currently rendered as a separate rectangular card below the stage screen. It can be integrated directly into the stage frame (header/meta overlay) to save 120px of vertical space.
  - `SingerTurnIndicator.tsx`: Currently an external banner above the stage. It can be integrated as a sleek spotlight badge inside the stage viewport.

### 3.2. Voice Lounge & Audio Controls (`useVoiceClient`, `VoiceControls`, `VoiceParticipants`)
- **Status**: Stable LiveKit integration with device selection and audio constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`).
- **Reuse Assessment**:
  - `useVoiceClient.ts`: Unchanged. All state transitions, token renewals, and device methods preserved.
  - `AudioDeviceSettingsModal.tsx`: Fully functional modal providing mic input selection, speaker output selection (`setSinkId`), audio constraint toggles, and EQ preset controls.
  - `VoiceControls.tsx` & `VoiceParticipants.tsx`:
    - Voice controls should be elevated into a **persistent top-bar or docked control area** so singers can mute/unmute anywhere without searching down the page.
    - Voice participants should be integrated into a unified Lounge Presence component alongside room members, displaying speaking rings and mic states without cluttering the center stage.

### 3.3. Song Queue (`RoomSongQueue`, `QueueItem`, `SongSearchDialog`)
- **Status**: Complete with host reordering, member removal permissions, and search modal.
- **Reuse Assessment**:
  - `RoomSongQueue.tsx`: Fully reusable. Needs enhanced visual distinction between "Now Playing" track and "Upcoming in Queue", plus explicit empty/loading skeleton states.
  - `QueueItem.tsx`: Reusable. Position indices and drag/move buttons operate cleanly.
  - `SongSearchDialog.tsx`: Reusable modal for searching and queueing songs.

### 3.4. Chat & Activity Timeline (`RoomChatPanel`, `RoomActivityTimeline`)
- **Status**: Implements cursor-based chat, reactions, host deletion, and system activity logs.
- **Reuse Assessment**:
  - `RoomChatPanel.tsx`: Reusable. Ensure typing and message arrival do not trigger stage re-renders.
  - `RoomActivityTimeline.tsx`: Reusable tab content.

---

## 4. Proposed Layout Architecture (Sprint 3.0)

### 4.1. Desktop: Three-Zone Composition
```
+---------------------------------------------------------------------------------------------------------+
| Zone 1: Persistent Room Header & Voice Lounge Bar                                                      |
| [Lounge Title & Badges] [Capacity] [Realtime Pill] | [Voice: Mic Mute | Speaking | Settings | Leave] | [Exit] |
+-----------------------------------------------------------------------+---------------------------------+
| Zone 2: Main Karaoke Stage (Greatest Visual Weight ~70% Width)        | Zone 3: Supporting Lounge Sidebar|
| +-------------------------------------------------------------------+ | [ Queue (4) | Chat | People ]   |
| | Stage Screen:                                                     | | +-----------------------------+ |
| | - Song Title, Artist, Requester, Artwork Backdrop & Disco Glow     | | | Active Tab Content:         | |
| | - Timed Lyrics Display (Word & Line Highlight Sweeps)             | | | - Interactive Song Queue    | |
| | - Visualizer Audio Wave Mode                                      | | | - Live Room Chat Panel      | |
| | - Singer Spotlight Indicator                                      | | | - Unified Participant Roster| |
| +-------------------------------------------------------------------+ | |   (Host/Member, Mic, Voice) | |
| | Stage Footer Bar:                                                 | | |                             | |
| | - Seekable Progress Bar & Duration Timestamps                     | | |                             | |
| | - Authoritative Playback Controls (Play/Pause/Skip/Stop/Vol/EQ)   | | |                             | |
| +-------------------------------------------------------------------+ | +-----------------------------+ |
+-----------------------------------------------------------------------+---------------------------------+
```

### 4.2. Mobile: Dedicated Touch Composition
```
+-------------------------------------------------------+
| Mobile Header: Room Title, Voice Status, Settings     |
+-------------------------------------------------------+
| Main Stage: Optimized 16:9 / 4:3 Aspect Frame         |
| - High-contrast timed lyrics                          |
| - Compact playback controls                           |
| - Singer turn pill                                    |
+-------------------------------------------------------+
| Docked Voice & Action Bar (Safe Area Compliant):      |
| [Mic Mute/Unmute] [Queue Drawer] [Chat Drawer] [Menu] |
+-------------------------------------------------------+
```

---

## 5. Summary of Component Reorganization Decisions

| Component | Existing Responsibility | Sprint 3.0 Architectural Decision |
| :--- | :--- | :--- |
| **`RoomDetailPage`** | Monolithic 3-column container with mixed concerns. | Refactor into modular desktop 3-zone layout + mobile responsive drawers. |
| **`KaraokePlayer`** | Standalone player with disconnected panels. | Redesign as a unified, immersive **Karaoke Stage Frame** with integrated header and playback controls. |
| **`CurrentSongPanel`** | Disconnected box below stage. | Integrate as a compact header overlay within the stage viewport. |
| **`SingerTurnIndicator`** | Plain banner above stage. | Refactor into a sleek spotlight badge embedded in the stage screen. |
| **`VoiceControls`** | Heavy card below the stage. | Elevate into the **Persistent Room Header & Voice Control Bar**. |
| **`VoiceParticipants`** | Separate 2-column grid. | Merge with `RoomMemberList` into a unified **Lounge Participants Panel** in the sidebar. |
| **`RoomMemberList`** | Consumes full left column. | Relocate into the sidebar tabs ("People" / "Members") to maximize stage width. |
| **`RoomSongQueue`** | Right sidebar tab. | Elevate visual styling (distinct playing track card, add song CTA, smooth empty state). |
| **`RoomChatPanel`** | Right sidebar tab. | Preserve 100% of contracts and events; optimize container height and mobile drawer rendering. |

---

## 6. Audit Verdict
**Ready for Implementation**: All existing contracts, Socket.IO event listeners, LiveKit hooks, and Web Audio services are verified and directly reusable. Proceeding with Workstreams B through H.

