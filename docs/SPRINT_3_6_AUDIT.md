# KTVOnline — Sprint 3.6 Architecture Audit: Room Discovery & Joining Experience

**Baseline Commit:** `942e19195ed45f41441fc3e20e9382f63809863e`  
**Date:** 2026-11-11  
**Sprint:** 3.6 — Room Discovery & Joining Experience  
**Status:** AUDIT COMPLETE  

---

## 1. Executive Summary

Sprint 3.6 focuses on the user journey from **Discovery → Preview → Join → Experience**.

Product principle:
> **"Find your people. Discover your room. Join the moment."**  
> **"A great room is not useful if users cannot find it. A great discovery page is not useful if joining is unreliable."**

This audit reviews the end-to-end discovery and joining architecture across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`. It maps existing capabilities, verifies domain constraints, and identifies gaps to be addressed in Sprint 3.6 without introducing architectural debt or breaking existing invariants.

---

## 2. Audit Findings Across Dimensions

### 2.1 Existing `/rooms` Discovery Page
- **File:** `apps/web/src/app/(platform)/rooms/page.tsx`
- **Current Architecture:**
  - Uses TanStack Query `useRooms(queryFilters)` for data fetching.
  - Synchronizes search, category, roomType, availability, status, atmospherePreset, sortBy, and page with URL query parameters via `useSearchParams()` and `useRouter().replace()`.
  - Integrates Sprint 3.5 personalized "✨ For You" quick filter targeting `userPreferences.preferredGenres`.
  - Renders a grid of `RoomCard` components with responsive pagination and empty/error states.
- **Identified Gaps:**
  - Cards currently only offer a single link button (`View Lounge`), which immediately navigates directly to the room route `/rooms/:id`.
  - No preview mechanism exists: users cannot inspect room details, performers, or atmosphere without navigating away from discovery.
  - Joining is performed only after navigating into the room page, where guest users see a large banner. There is no streamlined, authoritative "Quick Join" from discovery.
  - Category pills are limited to static genres plus "✨ For You". They lack activity-oriented presets such as "Singing Now", "Open Slots", or "Recently Created".

### 2.2 Room List & Room Query APIs
- **Backend:** `apps/api/src/modules/rooms/room.service.ts` (`findRooms`), `room.controller.ts` (`getRooms`), `room.routes.ts` (`GET /api/rooms`)
- **Contracts:** `packages/contracts/src/room.ts` (`RoomQuerySchema`, `RoomDtoSchema`)
- **Findings:**
  - `findRooms` enforces `visibility: 'public'`. Private rooms are strictly omitted from public discovery queries.
  - Filters supported: `category`, `status`, `roomType`, `atmospherePreset`, `availability` (`available` vs `full`), `search` (case-insensitive regex over `name` and `description`).
  - Sorting supported: `newest` (`createdAt: -1`), `oldest` (`createdAt: 1`), `popular` (`currentParticipantsCount: -1, createdAt: -1`).
  - Pagination supported: `page`, `limit` (max 100, default 20), returning `items` and `total`.

### 2.3 Room Identity & Atmosphere Metadata (Sprint 3.2)
- **Presets:** `midnight_lounge`, `neon_stage`, `cozy_acoustic`, `minimal_studio`, `classic_karaoke`.
- **Findings:**
  - Each preset provides distinctive visual tokens, ambient lighting gradients, and stage backdrops defined in `apps/web/src/features/rooms/atmosphere/tokens.ts`.
  - In `RoomCard`, atmosphere presets are currently not visually displayed or badged; only VIP/Party/Standard badges and category labels are shown.
  - Displaying the atmosphere preset on the card and preview dialog helps users immediately grasp the lounge's vibe before entering.

### 2.4 Room Occupancy & Membership Architecture
- **Model:** `RoomMembershipModel` (`apps/api/src/modules/rooms/membership.model.ts`)
- **Key Invariants:**
  - Strict distinction:
    - **Persistent Room Membership:** Document in `RoomMembershipModel` with `status: 'active'`.
    - **Room Occupancy (`currentParticipantsCount`):** Monitored counter in `RoomModel`. Atomic capacity enforcement prevents exceeding `capacity`.
    - **Online Presence:** In-memory socket tracking managed by `presenceManager` in `apps/api/src/realtime/presence.manager.ts`. Multiple tabs/sockets map to the same `userId`.
    - **LiveKit Voice Connection:** WebRTC audio track connection managed in `apps/web/src/features/voice/use-voice-client.ts`. Room membership does **not** equal a connected microphone.
  - Server-Authoritative Capacity:
    - `joinRoom` in `room.service.ts` runs an atomic conditional find-and-modify:
      ```typescript
      RoomModel.findOneAndUpdate(
        {
          _id: roomObjectId,
          status: { $ne: 'closed' },
          $expr: { $lt: ['$currentParticipantsCount', '$capacity'] },
        },
        { $inc: { currentParticipantsCount: 1 } },
        { new: true }
      )
      ```
    - If user is already active, it rolls back the reservation and returns `alreadyJoined: true`.
    - Closed rooms, full rooms, kicked users, and unauthorized private joins are strictly blocked with explicit error codes.

### 2.5 Room Preview Capabilities & Safeguards
- **Current State:** No dedicated preview UI component exists.
- **Safeguard Requirements:**
  - Preview must **not** invoke `POST /api/rooms/:id/join`.
  - Preview must **not** connect to LiveKit voice rooms.
  - Preview must **not** subscribe to room Socket.IO channels.
  - Preview uses existing public DTO data (`RoomDto`) or authorized `GET /api/rooms/:id`.
  - Private rooms must remain protected from unauthorized preview via existing 403 checks.

### 2.6 Public & Private Room Joining Flow
- **Public Joining:**
  - Unauthenticated users: Prompted to log in via `/login?redirect=...`.
  - Authenticated users: Can join via `useJoinRoom().mutateAsync(roomId)`.
  - Idempotent: Joining an already-joined room returns 200 with `alreadyJoined: true`.
- **Private Room Joining & Invitation Gap:**
  - `apps/api/src/modules/rooms/room.service.ts` line 328:
    ```typescript
    if (room.visibility === 'private' && room.ownerId.toString() !== userId) {
      return { success: false, error: 'PRIVATE_ROOM' };
    }
    ```
  - Gap Analysis: KTVOnline does not currently have an invitation token table or cryptographic invite link mechanism. Private rooms are strictly restricted to the room owner.
  - Constraint Compliance: Following Section 6.2 ("Do not invent a second invitation token system. If the current system lacks a safe invitation mechanism, document the gap and implement only the supported public joining flow"), we document this gap and keep private rooms strictly secured without unauthorized access.

### 2.7 Realtime Snapshot & Staleness Handling
- Discovery and preview use snapshot data fetched via TanStack Query.
- Cache invalidation on mutation (`useJoinRoom` invalidates `queryKeys.rooms.lists()` and room details).
- No per-card Socket.IO subscriptions to avoid excessive websocket load.

---

## 3. Reusable Modules & Components

| Module / Component | Path | Purpose |
|---|---|---|
| `RoomCard` | `apps/web/src/components/shared/room-card.tsx` | Base room card component |
| `useRooms` | `apps/web/src/hooks/queries/use-rooms.ts` | Paginated room listing query |
| `useRoom` | `apps/web/src/hooks/queries/use-room.ts` | Single room query with cache |
| `useJoinRoom` | `apps/web/src/hooks/queries/use-room.ts` | Join mutation with cache invalidation |
| `useUserPreferences` | `apps/web/src/hooks/queries/use-user-preferences.ts` | Sprint 3.5 personal preferences |
| `ATMOSPHERE_CONFIGS` | `apps/web/src/features/rooms/atmosphere/tokens.ts` | Atmosphere visual tokens and labels |
| `RoomStatusBadge` | `apps/web/src/components/shared/room-status-badge.tsx` | Consistent status indicators |
| `UserAvatar` | `apps/web/src/components/shared/user-avatar.tsx` | Host / singer avatar presentation |

---

## 4. Implementation Plan for Sprint 3.6

1. **Room Card Enhancement (`apps/web/src/components/shared/room-card.tsx`):**
   - Display atmosphere badge with mood icon and colors.
   - Display music genre and occupancy (`3/8`).
   - Display currently performing singer and song title if singing.
   - Dual actions: **"Preview"** (opens preview dialog) and **"Quick Join"** (instant join & entry).
2. **Room Preview Dialog (`apps/web/src/components/rooms/room-preview-dialog.tsx`):**
   - Responsive modal / sheet presenting comprehensive room metadata, host, atmosphere, active performer, and capacity without mutating state or joining voice.
   - "Join Room" button with loading state, error display, and link copy tool.
3. **Room Discovery Page Redesign (`apps/web/src/app/(platform)/rooms/page.tsx`):**
   - Quick Discovery Category presets: `All Lounges`, `✨ For You`, `🎤 Singing Now`, `🌟 Open Slots`, `🕒 Recently Created`.
   - Enhanced filter controls with responsive layout.
   - Error notification banner for join failures (e.g. room full, room closed).
   - Integration with `RoomPreviewDialog`.
4. **Documentation Deliverables:**
   - `docs/SPRINT_3_6_AUDIT.md` (this document)
   - `docs/ROOM_DISCOVERY_ARCHITECTURE.md`
   - `docs/SPRINT_3_6_IMPLEMENTATION_REPORT.md`
5. **Static Verification:**
   - Execute `pnpm typecheck` and `pnpm lint`.
   - Adhere strictly to the Code-Only policy.
