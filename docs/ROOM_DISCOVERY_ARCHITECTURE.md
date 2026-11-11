# KTVOnline — Room Discovery & Joining Architecture Specification

**Sprint:** 3.6 — Room Discovery & Joining Experience  
**Date:** 2026-11-11  
**Status:** Implemented  

---

## 1. Product Vision & Journey

KTVOnline is a virtual karaoke platform where discovering a lounge and stepping onto the stage should be seamless, inviting, and reliable.

The complete journey:
```
+-----------------------------------------------------------------------------+
|                               DISCOVER                                      |
|  - Explore public lounges with search, category pills & atmosphere vibes   |
|  - Deterministic "For You" quick taste matching (Sprint 3.5)                |
|  - Quick preset filters: Singing Now, Open Slots, Recently Created          |
+-----------------------------------------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------+
|                                PREVIEW                                      |
|  - Inspect lounge atmosphere, host attribution, capacity, and live status  |
|  - Zero-state mutation: no membership created, no slot consumed, no audio  |
|  - Shareable lounge invite links with one-click copy                       |
+-----------------------------------------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------+
|                                 JOIN                                        |
|  - Explicit loading states & concurrency protection against double-joins    |
|  - Server-authoritative atomic capacity check and reservation               |
|  - Idempotent: existing active members re-routed without penalty            |
|  - Transparent error feedback (Full, Closed, Kicked, Private Lounge)       |
+-----------------------------------------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------+
|                              EXPERIENCE                                     |
|  - Direct entry to /rooms/:id with verified membership                     |
|  - Independent WebRTC voice connection lifecycle                            |
|  - Stage playback, synchronized lyrics, and audience interactions           |
+-----------------------------------------------------------------------------+
```

---

## 2. Architecture & Information Ownership

### 2.1 Public vs Private Room Boundary
- **Public Discovery:** `findRooms` in `apps/api/src/modules/rooms/room.service.ts` strictly queries `{ visibility: 'public' }`. Private lounges are never enumerated or leaked through discovery endpoints.
- **Private Room Protection:** `GET /api/rooms/:id` enforces authorization: non-owners or non-active members receive a `403 Forbidden` response.
- **Invitation Token Gap:** KTVOnline does not currently have a dedicated cryptographic invitation token architecture. Private rooms are strictly accessible only by the room owner or pre-registered members.

### 2.2 Data Transfer Objects (`RoomDto`)
Located in `packages/contracts/src/room.ts`:
```typescript
export const RoomDtoSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(60),
  description: z.string().max(250).optional().nullable(),
  ownerId: z.string(),
  host: HostDtoSchema.optional(),
  roomType: RoomTypeSchema,                     // 'standard' | 'vip' | 'party'
  visibility: RoomVisibilitySchema,             // 'public' | 'private'
  capacity: z.number().int().min(2).max(50),
  status: RoomStatusSchema,                     // 'idle' | 'singing' | 'paused' | 'closed'
  currentParticipantsCount: z.number().int().nonnegative().default(0),
  category: RoomCategorySchema.default('all'),
  isChatEnabled: z.boolean().default(true).optional(),
  atmospherePreset: RoomAtmospherePresetSchema.default('midnight_lounge').optional(),
  stateVersion: z.number().int().positive().default(1).optional(),
  currentSongTitle: z.string().optional().nullable(),
  currentSingerName: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

---

## 3. Room Card & Discovery Redesign

### 3.1 Card Components & Visual Tokens
Located at `apps/web/src/components/shared/room-card.tsx`:
- **Atmosphere Preset Badge:** Displays dynamic atmosphere vibe (e.g., "Midnight Lounge", "Neon Stage", "Cozy Acoustic") with custom styling from `ATMOSPHERE_PRESETS`.
- **Music Category & Room Style:** Displays category pills alongside VIP or Party badges.
- **Live Stage Banner:** If the room is actively in `singing` status, displays the currently performed track title and performer name. If idle, informs users that the queue is open.
- **Occupancy & Availability:** Displays current participants vs capacity (`3/8`) and an availability pill (`Open`, `Full`, or `Closed`).
- **Dual Action Controls:**
  - **Preview:** Opens the `RoomPreviewDialog` without creating membership.
  - **Quick Join:** Initiates server-authoritative join flow and navigates to the lounge.

### 3.2 Quick Discovery Presets & Filters
Located at `apps/web/src/app/(platform)/rooms/page.tsx`:
- **Category Pills:**
  - `All Lounges`: Clears category and status filters.
  - `✨ For You`: Deterministically filters by user's top preferred genre from `UserPreferencesDto`.
  - `🎤 Singing Now`: Filters by `status: 'singing'`.
  - `🌟 Open Slots`: Filters by `availability: 'available'`.
  - `🕒 Recently Created`: Sorts by `sortBy: 'newest'`.
  - Genre-specific pills: Pop, Anime, Rock, Ballad, Hip-Hop, R&B.
- **Secondary Filter Toolbar:**
  - Debounced search input (300ms) over room name and description.
  - Room Style filter (`All`, `Standard`, `VIP`, `Party`).
  - Availability filter (`All`, `Available Only`, `Full`).
  - Status filter (`All`, `Singing Now`, `Queue Open`, `Intermission`).
  - Atmosphere Preset filter (`All`, `Tokyo Neon Stage`, `Midnight Cyberpunk`, `Cozy Acoustic`, etc.).
  - Sort dropdown (`Newest First`, `Most Popular`, `Oldest First`).
  - Active filter chips with one-click individual removal and "Clear all filters".
- **URL Synchronization:**
  - Full bidirectional sync with browser history and search parameters.

---

## 4. Room Preview Experience

Component: `apps/web/src/components/rooms/room-preview-dialog.tsx`

### 4.1 Safety Guarantees
1. **Zero Membership Creation:** Does not call `POST /api/rooms/:id/join`.
2. **Zero Occupancy Reservation:** Does not increment `currentParticipantsCount`.
3. **Zero WebRTC Voice Connection:** Does not initialize LiveKit audio tracks or join voice rooms.
4. **Zero Privileged Event Subscriptions:** Does not subscribe to room-internal chat or queue events.
5. **No Fake Realtime:** Displays server snapshot information and clearly communicates preview status.

### 4.2 Preview Dialog Elements
- Room title, atmosphere badge, and VIP/Party badge.
- Host avatar, username, and verification badge.
- Full room description in a stylized panel.
- Live stage activity box (song title, active singer, or open mic indicator).
- Music category and singer capacity progress bar.
- Shareable room URL copy button with clipboard confirmation.
- Direct "Join Lounge" action button with in-flight loading spinner.

---

## 5. Room Joining Safety & Invariants

### 5.1 Authoritative Membership Lifecycle
`joinRoom` in `apps/api/src/modules/rooms/room.service.ts`:
1. **Validation:** Checks room existence, non-closed status, and privacy policy.
2. **Idempotent Join:** If user already has an active `RoomMembership`, returns 200 with `alreadyJoined: true`.
3. **Moderation Guard:** Kicked users cannot rejoin closed or active rooms unless reinstated.
4. **Atomic Reservation:** Atomically increments `currentParticipantsCount` using `$expr: { $lt: ['$currentParticipantsCount', '$capacity'] }`.
5. **Membership Record Creation:** Creates or updates `RoomMembershipModel` with `status: 'active'`.
6. **Rollback Safety:** If concurrent membership creation races, atomically decrements `currentParticipantsCount`.

### 5.2 Join vs Voice Separation
- **Joining a room** establishes persistent membership in MongoDB.
- **Connecting to voice** is an independent, non-blocking operation executed via LiveKit in `RoomDetailPage`.
- A microphone permission failure or WebRTC network disconnection **never** invalidates room membership.
- Users can remain in the lounge as audience members even without voice connectivity.

### 5.3 Join Error Semantics

| Error Code | HTTP Status | User Message |
|---|---|---|
| `ROOM_FULL` | 409 | "This lounge is currently at maximum capacity." |
| `ROOM_CLOSED` | 400 | "This lounge is closed and is no longer accepting new singers." |
| `FORBIDDEN_KICKED` | 403 | "You were removed from this lounge by the host and cannot rejoin." |
| `PRIVATE_ROOM` | 403 | "This lounge is private. Only invited guests may enter." |
| Network / Other | 400 | "Unable to join lounge. Please check your connection and try again." |

---

## 6. Performance & Data Fetching

1. **Snapshot Data Fetching:** Discovery relies on TanStack Query `useRooms(queryFilters)` with pagination and cache deduplication.
2. **Cache Invalidation:** Calling `useJoinRoom().mutateAsync()` invalidates `queryKeys.rooms.lists()`, `queryKeys.rooms.detail(id)`, and `queryKeys.rooms.joined()`.
3. **No Per-Card Sockets:** Discovery avoids per-card websocket connections, preventing connection storms when viewing large listings.
4. **Touch & Accessibility Standards:** All button touch targets adhere to >= 44x44px; modals include full keyboard trapping and accessible ARIA attributes.
