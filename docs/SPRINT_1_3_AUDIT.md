# KTV Online — Sprint 1.3: Mandatory Repository Audit
**Room Creation & Management Domain**

---

## 1. Executive Summary

Sprint 1.3 focuses on implementing a complete, secure, and production-ready **Room Creation & Management** experience for KTV Online. This audit provides an authoritative inspection of the current repository across backend (`apps/api`), frontend (`apps/web`), and shared contracts (`packages/contracts`).

The objective is to enable authenticated users to:
1. Create a virtual karaoke lounge with custom configuration (name, description, visibility, capacity, category).
2. View their owned rooms in a dedicated dashboard (`/my-rooms`).
3. Manage and update settings for rooms they own (`/rooms/[roomId]/manage`).
4. Close their rooms safely with confirmation and appropriate state handling.
5. Discover rooms and trigger creation directly from discovery views and navigation.

All features will be implemented without introducing realtime voice streaming, WebSockets, or live karaoke synchronization (scheduled for future sprints).

---

## 2. Current Architecture & Asset Audit

### 2.1 Backend Room Architecture (`apps/api`)
- **Model (`RoomModel` in `modules/rooms/room.model.ts`):**
  - Fields: `name` (2-60 chars), `description` (<=250 chars), `ownerId` (ObjectId ref User), `roomType` (`standard`, `vip`, `party`), `visibility` (`public`, `private`), `capacity` (min 2, max 50, default 10), `status` (`idle`, `singing`, `paused`, `closed`), `category` (`all`, `pop`, `anime`, `rock`, `ballad`, `hiphop`, `rnb`), `currentParticipantsCount` (Number, default 0, min 0), `currentSongTitle`, `currentSingerName`.
  - Timestamps: `createdAt`, `updatedAt`.
  - Indexes:
    - `{ visibility: 1, status: 1, createdAt: -1 }`
    - `{ category: 1, visibility: 1, createdAt: -1 }`
    - `{ name: 'text', description: 'text' }`
- **Membership Model (`RoomMembershipModel` in `modules/rooms/membership.model.ts`):**
  - Tracks room participants with `{ roomId, userId, role: 'host' | 'member', status: 'active' | 'left', joinedAt, leftAt }`.
  - Compound index: `{ roomId: 1, userId: 1 }` (unique).
- **Service (`RoomService` in `modules/rooms/room.service.ts`):**
  - `findById(id)`: Fetches room and populates `ownerId (username, avatar)`.
  - `findRooms(query)`: Paginated query filtering by `visibility: 'public'` (by default), `category`, `status`, `roomType`, `search`.
  - `create(ownerId, data)`: Creates room, assigns `ownerId`, sets `status: 'idle'`, initializes `currentParticipantsCount: 1`, and automatically creates host membership.
  - `update(id, data)`: Exists in service (`findByIdAndUpdate`), but has **no route or controller wired up**, lacks ownership verification, and lacks capacity integrity checks against `currentParticipantsCount`.
  - `joinRoom(roomId, userId)`: Idempotent join with atomic capacity reservation (`$expr: { $lt: ['$currentParticipantsCount', '$capacity'] }`).
  - `leaveRoom(roomId, userId)`: Sets membership to `left` and safely decrements `currentParticipantsCount`.
  - `getActiveMembers(roomId)`: Fetches active members.
- **Routes (`room.routes.ts`):**
  - `GET /` -> `roomController.getRooms`
  - `GET /:id` -> `roomController.getRoomById`
  - `GET /:id/members` -> `roomController.getMembers`
  - `POST /` (requireAuth) -> `roomController.createRoom`
  - `POST /:id/join` (requireAuth) -> `roomController.joinRoom`
  - `POST /:id/leave` (requireAuth) -> `roomController.leaveRoom`

### 2.2 Shared Contracts (`packages/contracts/src/room.ts`)
- `RoomTypeSchema`: `'standard' | 'vip' | 'party'`
- `RoomVisibilitySchema`: `'public' | 'private'`
- `RoomStatusSchema`: `'idle' | 'singing' | 'paused' | 'closed'`
- `RoomCategorySchema`: `'all' | 'pop' | 'anime' | 'rock' | 'ballad' | 'hiphop' | 'rnb'`
- `CreateRoomSchema`:
  - `name`: string (2-60)
  - `description`: string (max 250, optional)
  - `roomType`: RoomType (default `'standard'`)
  - `visibility`: RoomVisibility (default `'public'`)
  - `capacity`: number (2-50, default 10)
  - `category`: RoomCategory (default `'all'`)
- `UpdateRoomSchema`:
  - `name`: string (2-60, optional)
  - `description`: string (max 250, optional, nullable)
  - `visibility`: RoomVisibility (optional)
  - `capacity`: number (2-50, optional)
  - `status`: RoomStatus (optional)
  - `category`: RoomCategory (optional)

### 2.3 Frontend Room Architecture (`apps/web`)
- **Pages:**
  - `/rooms`: Room discovery list with search and category filters. Currently has a placeholder "Host New Lounge" alert button.
  - `/rooms/[roomId]`: Room stage view. Displays room details, live participants, mock queue, and mock chat.
- **API Client & Hooks:**
  - `roomApi`: Located in `apps/web/src/lib/api/endpoints/rooms.ts` (`getRooms`, `getRoomById`, `createRoom`, `joinRoom`, `leaveRoom`, `getMembers`).
  - `useRooms`: Query hook with filter params.
  - `useRoom`, `useRoomMembers`: Query hooks for room detail and members.
  - `useJoinRoom`, `useLeaveRoom`: Mutation hooks with cache invalidation.
- **Navigation:**
  - `AppHeader`: Displays "Host Lounge" link (currently navigating to `/rooms`) and authenticated profile link.

---

## 3. Detailed Verification of Capabilities (12 Key Questions)

| # | Question | Current State & Authoritative Answer |
|---|---|---|
| **1** | **What fields are supported when creating a room?** | `name` (2-60 chars, required), `description` (max 250 chars, optional), `roomType` (`standard`, `vip`, `party`), `visibility` (`public`, `private`), `capacity` (int 2-50, default 10), `category` (`all`, `pop`, `anime`, `rock`, `ballad`, `hiphop`, `rnb`). `ownerId` is strictly assigned from the verified JWT. Initial status is `'idle'` and `currentParticipantsCount` is 1 (creator host). |
| **2** | **What fields can the owner update?** | `name`, `description`, `visibility`, `capacity`, `status`, `category`. The owner cannot change `ownerId` or mutate `currentParticipantsCount` directly. |
| **3** | **What room statuses exist?** | `'idle'`, `'singing'`, `'paused'`, `'closed'`. Created rooms start as `'idle'`. Closing a room sets its status to `'closed'`. |
| **4** | **How is room ownership verified?** | `RoomModel.ownerId` stores the user's ObjectId. In endpoints modifying rooms, the backend verifies `room.ownerId.toString() === req.user.id`. Requests from non-owners must return 403 Forbidden. |
| **5** | **Can a room owner close their room?** | Yes, by transitioning status to `'closed'`. Once closed, `joinRoom` rejects prospective participants with `ROOM_CLOSED` (400). |
| **6** | **Can a closed room be reopened?** | In the backend schema, status is an enum. However, in KTV domain lifecycle, closing a room is treated as concluding the lounge session. The UI will not expose an arbitrary reopen button. |
| **7** | **Are private rooms supported?** | Yes. `visibility: 'private'` is stored in the database. `findRooms` defaults to `visibility: 'public'`, excluding private lounges from the public discovery feed. |
| **8** | **Are room passwords supported?** | **No.** Neither `RoomModel` nor contracts define a password field. In accordance with requirements, the frontend will not implement fake password controls. |
| **9** | **Are category and music mood supported?** | Yes. `category` supports `'pop'`, `'anime'`, `'rock'`, `'ballad'`, `'hiphop'`, `'rnb'`, and `'all'`. |
| **10** | **Are capacity limits enforced by the backend?** | Yes. Capacity is constrained to 2-50. `joinRoom` atomically tests `$lt: ['$currentParticipantsCount', '$capacity']`. In addition, when updating capacity, the backend must verify `capacity >= room.currentParticipantsCount`. |
| **11** | **Are there existing endpoints for listing rooms owned by current user?** | **No.** Currently `GET /rooms` only queries public rooms without owner filtering. A dedicated endpoint `GET /api/v1/rooms/my-rooms` (or `mine`) is required. |
| **12** | **How are room membership counts maintained?** | `RoomModel.currentParticipantsCount` tracks active participant count. On creation, it is set to 1. On `joinRoom`, it is incremented via `$inc`. On `leaveRoom`, it is decremented. |

---

## 4. Missing Backend Capabilities & Implementation Strategy

To deliver a secure, robust room management experience without mock data or client-side trust, the backend must be enhanced with 3 endpoints:

1. **`GET /api/v1/rooms/my-rooms`:**
   - Middleware: `requireAuth`.
   - Behavior: Queries `RoomModel.find({ ownerId: req.user.id }).sort({ createdAt: -1 })`.
   - Returns all rooms owned by the user (public, private, active, closed) with pagination support.
   - Route placement: Registered *before* `/:id` to avoid route pattern collision.

2. **`PATCH /api/v1/rooms/:id`:**
   - Middleware: `requireAuth`, `validateBody(UpdateRoomSchema)`.
   - Behavior:
     - Fetches room by ID. Returns 404 if not found.
     - Verifies ownership: `if (room.ownerId.toString() !== req.user.id) return 403 Forbidden`.
     - Capacity check: If `data.capacity !== undefined && data.capacity < room.currentParticipantsCount`, returns 400 Bad Request ("Capacity cannot be less than current participants count").
     - Updates room via `roomService.update(id, data)` and returns updated `RoomDto`.

3. **`POST /api/v1/rooms/:id/close`:**
   - Middleware: `requireAuth`.
   - Behavior:
     - Verifies room exists and `room.ownerId.toString() === req.user.id`.
     - If already closed, idempotently returns current room.
     - Updates status to `'closed'` and returns updated `RoomDto`.

> [!NOTE]
> No database schema or index modifications are necessary. `RoomModel` already contains all required fields and indexes.

---

## 5. Frontend Architecture & Implementation Plan

### 5.1 API Client & TanStack Query Layer
- Extend `apps/web/src/lib/api/endpoints/rooms.ts`:
  - `getMyRooms()`
  - `updateRoom(roomId, payload)`
  - `closeRoom(roomId)`
- Update `apps/web/src/hooks/queries/query-keys.ts`:
  - `mine: () => [...queryKeys.rooms.all, 'mine'] as const`
- Add query & mutation hooks:
  - `useMyRooms()`: Queries `/rooms/my-rooms`.
  - `useCreateRoom()`: Mutation calling `createRoom`, invalidating `rooms.lists()` and `rooms.mine()`.
  - `useUpdateRoom()`: Mutation calling `updateRoom`, invalidating `rooms.detail(id)`, `rooms.mine()`, `rooms.lists()`.
  - `useCloseRoom()`: Mutation calling `closeRoom`, invalidating `rooms.detail(id)`, `rooms.mine()`, `rooms.lists()`.

### 5.2 UI Routes & Components
1. **Create Lounge Experience (`/rooms/create`):**
   - Protected route (`<ProtectedRoute>`).
   - Split-screen or card form layout using React Hook Form + Zod (`CreateRoomSchema`).
   - Fields: Name, Description, Category/Music Mood, Room Type, Visibility (Public/Private), Capacity selector (2 to 50 with quick pills: 4, 8, 12, 20).
   - Duplicate submission protection, loading spinner, server error handling.
   - On success: Navigate to the newly created room (`/rooms/${newRoom.id}`).

2. **My Lounges Dashboard (`/my-rooms`):**
   - Protected route (`<ProtectedRoute>`).
   - Statistics bar: Total Lounges, Active/Idle, Closed, Total Audience Capacity.
   - Grid of owned room cards displaying:
     - Room Name, Category pill, Visibility badge (Public vs Private with lock icon).
     - Capacity meter (`currentParticipantsCount / capacity`).
     - Status indicator (Idle, Singing, Paused, Closed).
     - Actions: **Enter Stage**, **Manage Settings**, **Close Lounge**.
   - Empty state: Engaging callout for first-time room creators with "Host Your First Lounge" button.
   - Skeletons for loading state and error retry boundary.

3. **Room Management Interface (`/rooms/[roomId]/manage`):**
   - Protected route (`<ProtectedRoute>`).
   - Verifies user is the owner (`room.ownerId === user.id`); if not, displays an unauthorized notice.
   - Edit form: Name, Description, Category, Visibility, Capacity (with minimum bound to `room.currentParticipantsCount`).
   - Danger Zone: "Close Lounge" action triggering confirmation dialog.

4. **Close Room Confirmation Dialog:**
   - Accessible modal explaining that closing the lounge stops new participants from entering.
   - Confirms closure and triggers `useCloseRoom()`.

5. **Discovery & Navigation Integration:**
   - `/rooms`: Replace placeholder alert button with Link to `/rooms/create`.
   - `AppHeader`: Update "Host Lounge" button to point to `/rooms/create`.
   - `AppHeader` navigation: Add "My Lounges" link (`/my-rooms`) when authenticated.

---

## 6. Security & Concurrency Considerations

- **Server-Side Authorization Boundary:** Ownership is strictly verified against `req.user.id` extracted from the cryptographically signed JWT. Frontend checks serve purely as UX conveniences.
- **Capacity Integrity:** Concurrency locks on `joinRoom` already use atomic `$expr: { $lt: ['$currentParticipantsCount', '$capacity'] }`. When updating capacity, backend ensures `newCapacity >= currentParticipantsCount`.
- **Query Cache Isolation:** On room update or closure, query keys for `rooms.detail(id)`, `rooms.mine()`, and `rooms.lists()` are invalidated to ensure no stale data remains visible.
- **CSRF & Credentials:** All mutations utilize the centralized `apiClient` with `credentials: 'include'` and in-memory JWT authorization header.

---

## 7. Files Expected to Change

### Backend (`apps/api`)
- `src/modules/rooms/room.service.ts` (Add `findRoomsByOwner`, update checks)
- `src/modules/rooms/room.controller.ts` (Add `getMyRooms`, `updateRoom`, `closeRoom`)
- `src/modules/rooms/room.routes.ts` (Mount routes for `GET /my-rooms`, `PATCH /:id`, `POST /:id/close`)
- `src/__tests__/room-management.test.ts` (New comprehensive integration tests for ownership, update, close, capacity limits)

### Frontend (`apps/web`)
- `src/lib/api/endpoints/rooms.ts` (Add `getMyRooms`, `updateRoom`, `closeRoom`)
- `src/hooks/queries/query-keys.ts` (Add `rooms.mine()`)
- `src/hooks/queries/use-rooms.ts` / `use-my-rooms.ts` / `use-room-mutations.ts`
- `src/app/(platform)/rooms/create/page.tsx` (Create lounge page)
- `src/app/(platform)/my-rooms/page.tsx` (My rooms dashboard)
- `src/app/(platform)/rooms/[roomId]/manage/page.tsx` (Room settings & management page)
- `src/app/(platform)/rooms/page.tsx` (Connect Host CTA)
- `src/components/layout/app-header.tsx` (Update Host Lounge link and navigation)
- `src/__tests__/room-management.test.tsx` (Frontend tests for room creation, management, validation, and dashboard)

---

## 8. Audit Conclusion

The existing architecture provides a solid database schema and contract foundation. Implementing the three missing backend endpoints (`GET /my-rooms`, `PATCH /:id`, `POST /:id/close`) allows us to build a completely authentic, secure, and production-ready Room Creation and Management experience without any mock data or schema drift.
