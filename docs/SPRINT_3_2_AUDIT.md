# KTVOnline — Sprint 3.2: Room Atmosphere & Lounge Identity Audit

**Audit Date**: 2026-11-11  
**Sprint**: 3.2  
**Scope**: Room Identity, Atmosphere Presets, Ambient Visual Experience, Room Presence & Activity, Empty & Waiting Experiences, Host Room Customization  
**Policy**: Code-only verification policy; static checks (`pnpm typecheck`, `pnpm lint`); zero destructive database actions; zero test suite modifications.

---

## 1. Executive Summary

Sprint 3.0 established the room layout with a responsive 3-zone architecture and mobile drawer navigation. Sprint 3.1 established the performance stage, singer turns, and singer spotlight. Sprint 3.2 establishes the mood, identity, and social atmosphere that envelops the lounge:
> *"Every lounge has its own vibe. Every night feels different."*

This audit examines the existing backend domain models, room state synchronization, host authorization policies, activity events, and frontend styling tokens.

---

## 2. Existing Architecture Analysis

### 2.1 Existing Room Metadata Reusability
- **In MongoDB (`RoomModel`)**:
  - `name`: String (2-60 chars, indexed).
  - `description`: String (max 250 chars, nullable).
  - `ownerId`: ObjectId referencing `User` (populates `username`, `avatar`).
  - `roomType`: Enum (`'standard'`, `'vip'`, `'party'`).
  - `visibility`: Enum (`'public'`, `'private'`).
  - `capacity`: Number (2-50, defaults to 10).
  - `status`: Enum (`'idle'`, `'singing'`, `'paused'`, `'closed'`).
  - `category`: Enum (`'all'`, `'pop'`, `'anime'`, `'rock'`, `'ballad'`, `'hiphop'`, `'rnb'`).
  - `currentParticipantsCount`: Number (tracked automatically via memberships).
  - `stateVersion`: Monotonic number (incremented on each room mutation).
  - `currentSongTitle`: String (updated during karaoke transitions).
  - `currentSingerName`: String (updated to active singer's display name).
- **Finding**: The room entity already has high-value identity metadata (`name`, `description`, `ownerId`/`host`, `category`, `visibility`, `capacity`, `currentParticipantsCount`). However, it lacks an explicit atmosphere/theme preset identifier.

### 2.2 Existing Customization Capabilities
- **In Backend API (`room.controller.ts` & `room.service.ts`)**:
  - `PATCH /api/rooms/:id`: `updateRoom` endpoint accepts `UpdateRoomDto`.
  - Authorizes that `req.user.id === ownerId` (strict host-only enforcement).
  - Validates that new capacity cannot be lower than `currentParticipantsCount`.
  - Publishes `room.settings.updated` Socket.IO event with incremented `stateVersion`.
- **In Frontend (`useUpdateRoom` & `use-room-state.ts`)**:
  - `useUpdateRoom()` TanStack mutation communicates with `PATCH /api/rooms/:id`.
  - `use-room-state.ts` listens to `room.settings.updated` and merges incoming partial settings into the local room state.
- **Finding**: The update pipeline exists and is already host-authorized and versioned. Extending it to accept and propagate an `atmospherePreset` is direct, safe, and backward-compatible.

### 2.3 Model Home for Atmosphere State
- **Evaluation**: Does atmosphere preset state belong in `RoomModel`, or a separate `RoomTheme` model?
- **Decision**: Atmosphere preset state belongs **directly in `RoomModel`** as a lightweight enum field:
  ```typescript
  atmospherePreset: {
    type: String,
    enum: ['midnight_lounge', 'neon_stage', 'cozy_acoustic', 'minimal_studio', 'classic_karaoke'],
    default: 'midnight_lounge',
  }
  ```
  *Why*:
  1. A separate collection would introduce multi-collection joins for every room fetch.
  2. The atmosphere preset is a single string identifier (not custom CSS or arbitrary assets).
  3. Storing it on `Room` allows it to be broadcast automatically within `room.settings.updated` and included in `RoomSnapshotDto`.
  4. Concurrency fencing (`stateVersion`) natively applies without cross-document synchronization.

### 2.4 Existing Host Authorization Boundaries
- In `room.controller.ts`:
  - `ownerId === req.user.id` is strictly checked before performing mutations.
  - The user ID is extracted from the verified JWT cookie (`req.user`), never from client request bodies.
  - Non-members and regular participants receive HTTP 403 Forbidden.
- In frontend:
  - `isHost = viewer?.role === 'host'`.
  - Settings and customization dialogs are guarded to render only when `isHost === true`.

### 2.5 Existing Room Activity Events & Presence Infrastructure
- **Presence**:
  - `presenceManager` tracks online Socket.IO sessions per user.
  - `totalOnline` and `onlineUserIds` reflect active realtime connections without altering persistent `Room.currentParticipantsCount`.
  - LiveKit voice state is tracked independently via `useVoiceClient` (`voice.participants`, `voice.isConnected`, `voice.isSpeaking`).
- **Activity Events**:
  - `RoomActivityDto` tracks: `member_joined`, `member_left`, `member_kicked`, `room_created`, `room_settings_updated`, `room_closed`.
  - Displayed in `RoomActivityTimeline` in the sidebar and mobile drawer.
  - `useRoomChat` buffers activities and messages with monotonic versioning.

### 2.6 Asset Handling and Image Conventions
- Tailwind CSS v4 is used with CSS variables (`--background`, `--surface`, `--primary`, `--secondary`).
- `next/image` is configured for local and remote avatars.
- Atmosphere styles should be declared as deterministic, curated CSS theme classes or data attributes, avoiding arbitrary user-submitted URLs, inline scripts, or runtime stylesheet injections.

---

## 3. Curated Atmosphere Presets Design

We define 5 curated, finite atmosphere presets:

| Preset Key | Display Name | Mood / Visual Direction | Gradients & Glows |
| :--- | :--- | :--- | :--- |
| `midnight_lounge` (Default) | Midnight Lounge | Deep navy, subtle indigo ambient glow, relaxed nightlife | `#070a14` base, indigo ambient rim, violet-blue accents |
| `neon_stage` | Neon Stage | Electric violet and cyan glow, high energy performance | `#080716` base, neon magenta/cyan rims, energetic spotlight |
| `cozy_acoustic` | Cozy Acoustic | Warm dark surfaces, soft amber lighting, intimate lounge | `#120e0b` base, warm amber/gold glows, wood-tone card borders |
| `minimal_studio` | Minimal Studio | Clean slate surfaces, restrained monochromes, vocal focus | `#090b0e` base, subtle cool slate rims, minimal distraction |
| `classic_karaoke` | Classic Karaoke | Nostalgic karaoke box atmosphere, warm ruby highlights | `#11090d` base, ruby/rose glows, lively karaoke warmth |

---

## 4. Architectural Gaps & Implementation Plan

1. **Contracts Extension (`@ktv/contracts`)**:
   - Add `RoomAtmospherePresetSchema`: enum of the 5 preset keys.
   - Add `atmospherePreset` to `RoomDtoSchema`, `RoomSnapshotDtoSchema`, `CreateRoomSchema`, and `UpdateRoomSchema`.
   - Add optional `expectedStateVersion` to `UpdateRoomSchema` for concurrency fencing.
2. **Backend Model & Service (`apps/api`)**:
   - Add `atmospherePreset` to `room.model.ts` and `room.types.ts`.
   - Update `roomService.update` to include `atmospherePreset` in `$set` and in `room.settings.updated` Socket.IO broadcast.
   - Enforce `expectedStateVersion` conflict detection (HTTP 409 Conflict if version mismatch).
3. **Frontend Atmosphere Theme Engine (`apps/web`)**:
   - Create `features/rooms/atmosphere/atmosphere-presets.ts`: defines visual tokens (stage backdrop, glow colors, accent gradients, glass-panel borders) for each preset.
   - Create `useRoomAtmosphere` hook: resolves active preset, provides host preview mode, and yields active theme styles.
   - Apply active atmosphere classes/styles to room layout, stage container, and lounge sidebar.
4. **Room Identity & Info Panel**:
   - Create `RoomIdentityDialog`: accessible from room header, displays room name, host info, category, visibility, capacity/occupancy, active atmosphere vibe, and quick invite link.
5. **Host Customization Experience**:
   - Create `RoomCustomizationDialog`: host-only modal allowing atmosphere preset selection with live preview, room name/description editing, and version-checked save.
6. **Room Presence & Waiting Experience Polish**:
   - Enhance empty stage state with atmospheric styling and clear "Be the first to perform" callout.
   - Enhance presence summary in room header and sidebar.
7. **Accessibility & Performance**:
   - Wrap ambient transitions in CSS transitions; respect `prefers-reduced-motion`.
   - Strictly code-only policy: static verification with `pnpm typecheck` and `pnpm lint`.
