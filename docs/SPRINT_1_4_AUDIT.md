# KTV Online — Sprint 1.4: Mandatory Repository Audit
**Room Discovery & Search Domain**

---

## 1. Executive Summary

Sprint 1.4 transforms `/rooms` from a basic list into a vibrant, production-grade social karaoke lounge discovery lobby.
This audit provides a comprehensive, read-only inspection of the current repository across backend (`apps/api`), frontend (`apps/web`), shared contracts (`packages/contracts`), and database indexing patterns.

The discovery experience must enable users to search, filter by category/mood, room style, room status, and capacity availability, sort deterministically, preview room details and host profiles, and navigate cleanly with shareable, URL-synchronized query parameters—all while strictly enforcing server-side visibility boundaries and preserving database performance.

---

## 2. Answers to the 14 Mandatory Audit Questions

| # | Audit Question | Current State & Authoritative Analysis |
|---|---|---|
| **1** | **Does the existing room list endpoint support search?** | **Partially.** `findRooms()` checks `query.search` and assigns `filter.$text = { $search: query.search }` supported by a MongoDB text index (`{ name: 'text', description: 'text' }`). However, MongoDB text search requires full stemmed words (failing partial substring matches like "pop" for "Popstar"), lacks input trimming, length boundaries, and regex escaping if regex fallback is desired. A sanitized, length-constrained substring search (regex-escaped) on `name` and `description` provides significantly superior discovery UX without unbounded query execution risks. |
| **2** | **Does it support category filtering?** | **Yes.** `RoomCategorySchema` in `@ktv/contracts` specifies `'all' \| 'pop' \| 'anime' \| 'rock' \| 'ballad' \| 'hiphop' \| 'rnb'`. When `category` is provided and not `'all'`, `findRooms()` filters by `category`. |
| **3** | **Does it support music mood filtering?** | **Yes, via category.** In KTV Online's domain, `category` is the canonical representation of music mood and musical genre (`pop`, `anime`, `rock`, `ballad`, `hiphop`, `rnb`). There is no separate `mood` column in MongoDB, and introducing a redundant field would create schema drift. |
| **4** | **Does it support room style filtering?** | **Yes.** `RoomTypeSchema` in `@ktv/contracts` supports `'standard' \| 'vip' \| 'party'`. `findRooms()` filters by `roomType` when present in `RoomQueryDto`. |
| **5** | **Does it support status filtering?** | **Yes.** `RoomStatusSchema` supports `'idle' \| 'singing' \| 'paused' \| 'closed'`. `findRooms()` filters by `status` when supplied. |
| **6** | **Does it support sorting?** | **No.** `findRooms()` hardcodes `.sort({ createdAt: -1 })`. `RoomQueryDto` does not define `sortBy`, and clients cannot request oldest first or popularity-based sorting. |
| **7** | **Does it support pagination?** | **Yes.** `PaginationQuerySchema` validates `page` (default 1) and `limit` (default 20, max 100). `roomController.getRooms` calculates `{ page, limit, total, totalPages, hasNextPage, hasPrevPage }`. |
| **8** | **Are private rooms excluded from public discovery?** | **CRITICAL SECURITY RISK IDENTIFIED.** In `room.service.ts`: `if (query.visibility) filter.visibility = query.visibility; else filter.visibility = 'public';`. If a client passes `?visibility=private`, private rooms are returned! In public discovery (`GET /api/v1/rooms`), `filter.visibility = 'public'` must be **strictly enforced**, completely ignoring client attempts to query private lounges. |
| **9** | **Are closed rooms excluded or separately filterable?** | **Filterable, but currently included in default listing.** In `findRooms()`, if `status` is omitted, closed rooms are returned alongside active rooms. In discovery, users should see active lounges by default, with an option to filter by status or availability. |
| **10** | **Is participant count accurate?** | **Yes.** `currentParticipantsCount` is updated atomically using MongoDB `$inc: 1` during `joinRoom` and `$inc: -1` during `leaveRoom`. It is initialized to 1 on room creation (the host). |
| **11** | **Is host information populated safely?** | **Partially populated, but lost during JSON serialization.** `findRooms()` runs `.populate('ownerId', 'username avatar')`. However, `RoomSchema.toJSON` transform collapses `ret.ownerId` into a string ID (`ret.ownerId = ret.ownerId.toString()`) and discards the populated `username` and `avatar`. Host information must be mapped into `ret.host = { id, username, avatar }` and added to `RoomDtoSchema` so discovery cards can display the host safely. |
| **12** | **Can the backend calculate room availability reliably?** | **Yes.** Capacity is stored in `capacity` (int 2-50) and occupancy in `currentParticipantsCount`. Availability can be evaluated in queries via MongoDB `$expr`: `available` (`{ $expr: { $lt: ['$currentParticipantsCount', '$capacity'] }, status: { $ne: 'closed' } }`) and `full` (`{ $expr: { $gte: ['$currentParticipantsCount', '$capacity'] } }`). |
| **13** | **Are there existing popularity metrics?** | **No fake metrics exist.** There are no arbitrary popularity scores, ratings, or simulated singer counts. The authentic, domain-grounded metric for popularity is active occupancy: `currentParticipantsCount: -1, createdAt: -1`. |
| **14** | **Are current indexes sufficient for expected discovery queries?** | **Yes, with minor index alignment.** `RoomModel` already has compound indexes: `{ visibility: 1, status: 1, createdAt: -1 }`, `{ category: 1, visibility: 1, createdAt: -1 }`, and text index `{ name: 'text', description: 'text' }`. Single-field indexes exist on `ownerId`, `roomType`, and `status`. Additional indexes for popularity sorting will be evaluated carefully to avoid write amplification. |

---

## 3. Current Architecture & Asset Audit

### 3.1 Backend Architecture (`apps/api`)
- **Model (`RoomModel` in `modules/rooms/room.model.ts`):**
  - Fields: `name`, `description`, `ownerId` (ref User), `roomType` (`standard`, `vip`, `party`), `visibility` (`public`, `private`), `capacity` (2-50), `status` (`idle`, `singing`, `paused`, `closed`), `category` (`all`, `pop`, `anime`, `rock`, `ballad`, `hiphop`, `rnb`), `currentParticipantsCount`, `currentSongTitle`, `currentSingerName`.
  - Serialization: `toJSON` converts `_id` to `id`, but discards populated host data.
  - Compound indexes:
    - `{ visibility: 1, status: 1, createdAt: -1 }`
    - `{ category: 1, visibility: 1, createdAt: -1 }`
    - `{ name: 'text', description: 'text' }`
- **Service (`RoomService` in `modules/rooms/room.service.ts`):**
  - `findRooms(query)`: Handles query filtering, count, pagination, and population.
- **Controller (`RoomController` in `modules/rooms/room.controller.ts`):**
  - `getRooms()`: Validates query parameters and formats standard paginated response envelope.
- **Routes (`room.routes.ts`):**
  - `GET /` -> `validateQuery(RoomQuerySchema)`, `roomController.getRooms`.

### 3.2 Shared Contracts (`packages/contracts/src/room.ts`)
- `RoomQuerySchema`:
  ```typescript
  export const RoomQuerySchema = PaginationQuerySchema.extend({
    search: z.string().optional(),
    category: RoomCategorySchema.optional(),
    status: RoomStatusSchema.optional(),
    roomType: RoomTypeSchema.optional(),
    visibility: RoomVisibilitySchema.optional(),
  });
  ```
- Missing discovery params:
  - `availability`: `z.enum(['all', 'available', 'full']).optional()`
  - `sortBy`: `z.enum(['newest', 'oldest', 'popular']).optional()`
- `RoomDtoSchema`: Needs optional `host?: HostDtoSchema` where `HostDtoSchema = z.object({ id: z.string(), username: z.string(), avatar: z.string().nullable().optional() })`.

### 3.3 Frontend Architecture (`apps/web`)
- `/rooms/page.tsx`: Existing room discovery page with basic search input and category pills. Missing style filter, availability filter, sort dropdown, pagination controls, URL parameter synchronization, debounced search, rich room cards with host information, and loading skeletons.
- `apps/web/src/components/shared/room-card.tsx`: Basic room card lacking host avatar/name and availability indicator.
- `apps/web/src/lib/api/endpoints/rooms.ts`: `roomApi.getRooms(params)` already accepts `RoomQueryDto`.
- `apps/web/src/hooks/queries/use-rooms.ts`: `useRooms(filters)` query hook with 30s stale time.
- `apps/web/src/hooks/queries/query-keys.ts`: `queryKeys.rooms.list(filters)` key generator.

---

## 4. Missing Capabilities & Identified Vulnerabilities

1. **Vulnerability: Private Room Discovery Leakage**
   - Cause: `roomService.findRooms` honors `query.visibility` if passed by client.
   - Remediation: Enforce `filter.visibility = 'public'` unconditionally in `findRooms` or public controller to make private room query impossible via the public endpoint.

2. **Missing Search Sanitization & Robust Substring Matching**
   - Current: `$text` search only matches complete words and crashes or ignores partial titles.
   - Remediation: Support regex-escaped substring matching (`escapeRegex`) on `name` and `description` with a max length constraint (e.g. 50 characters) and input trimming.

3. **Missing Availability Filter**
   - Current: No way to filter rooms by "Available" (has open seats) or "Full".
   - Remediation: Add `availability` query parameter (`'all' | 'available' | 'full'`) using `$expr` comparison between `currentParticipantsCount` and `capacity`.

4. **Missing Sorting Options**
   - Current: Hardcoded `createdAt: -1`.
   - Remediation: Add `sortBy` parameter supporting:
     - `'newest'`: `{ createdAt: -1 }` (default)
     - `'oldest'`: `{ createdAt: 1 }`
     - `'popular'`: `{ currentParticipantsCount: -1, createdAt: -1 }` (honest metric based on real participant count).

5. **Missing Host Profile Exposure in API Response**
   - Current: `toJSON` transform drops populated `ownerId` username and avatar.
   - Remediation: Preserve `ret.host = { id, username, avatar }` while maintaining `ret.ownerId = id`.

6. **Missing Frontend URL Synchronization & Debounce**
   - Current: Filter state lives in component `useState` and is lost on refresh or navigation.
   - Remediation: Mirror all discovery state in URL search parameters (`useSearchParams`, `useRouter`, `usePathname`), with 300ms debounced search input, Suspense boundary, and page reset on filter changes.

---

## 5. Potential Database Performance Risks & Index Analysis

1. **Unbounded Regex Search Risk:**
   - Unanchored regexes (`.*search.*`) cannot use B-tree index prefixes and cause collection scans.
   - Mitigation: Enforce maximum search length (max 50 chars), trim whitespace, reject malformed strings, and rely on bounded pagination (`limit <= 100`, default 20) with indexed visibility filter (`visibility: 'public'`).
2. **Compound Index Coverage:**
   - Existing: `{ visibility: 1, status: 1, createdAt: -1 }` and `{ category: 1, visibility: 1, createdAt: -1 }`.
   - For popular sort queries: `{ visibility: 1, currentParticipantsCount: -1, createdAt: -1 }`.
   - Evaluation: In high-scale production, adding `{ visibility: 1, currentParticipantsCount: -1, createdAt: -1 }` would support popular sorting without in-memory sort stages.
   - Migration plan: Can be added non-destructively via `RoomSchema.index({ visibility: 1, currentParticipantsCount: -1, createdAt: -1 })`. Existing indexes are preserved.

---

## 6. Proposed Implementation Plan

### Step 1: Shared Contracts (`packages/contracts`)
- Update `RoomQuerySchema` with `availability: z.enum(['all', 'available', 'full']).optional()` and `sortBy: z.enum(['newest', 'oldest', 'popular']).optional()`.
- Update `RoomDtoSchema` with optional `host: z.object({ id: z.string(), username: z.string(), avatar: z.string().nullable().optional() }).optional()`.

### Step 2: Backend API Enhancement (`apps/api`)
- In `room.model.ts`:
  - Enhance `toJSON` to serialize `host: { id, username, avatar }` when `ownerId` is populated.
  - Add compound index `{ visibility: 1, currentParticipantsCount: -1, createdAt: -1 }` to optimize popularity sorting.
- In `room.service.ts`:
  - Strictly enforce `filter.visibility = 'public'` for public discovery.
  - Implement availability filtering (`available` vs `full`).
  - Implement sanitized regex search on `name` and `description` (with regex escaping).
  - Implement deterministic sorting (`newest`, `oldest`, `popular`).

### Step 3: Frontend Experience (`apps/web`)
- Wrap discovery page content in `<React.Suspense>` for safe App Router search params.
- Implement bidirectional URL search params synchronization.
- Implement 300ms debounced search with clear action and loading indicator.
- Category pills with "All Lounges" and active glow.
- Filter toolbar: Room style selector (`all`, `standard`, `vip`, `party`), Availability toggle (`all`, `available`, `full`), Status dropdown (`all`, `singing`, `idle`, `paused`), Sort selector (`newest`, `oldest`, `popular`).
- Active filter badge tags with "Clear all filters" button.
- Upgraded `RoomCard` with:
  - Branded gradient cover / atmospheric header.
  - Room name & description.
  - Host avatar and username.
  - Style badge (Standard, VIP, Party).
  - Category pill.
  - Live status indicator.
  - Availability pill: `Available` (green dot) vs `Full` (amber dot) vs `Closed` (slate).
  - Participant counter: `3 / 10`.
  - Honest CTA: "View Lounge".
- Comprehensive UX states: Card skeletons, Empty state with "Reset Filters" and "Host Lounge" CTA, Error state with retry.
- Pagination controls with total count and page navigation.

### Step 4: Verification & Automated Tests
- Backend test suite: `room-discovery.test.ts` testing search, category, style, status, availability, sorting, pagination, and private room exclusion.
- Frontend test suite: `room-discovery.test.tsx` testing discovery UI, debouncing, filter combinations, sorting, pagination, empty state, and URL sync.
- Run full quality gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

---

## 7. Expected Files to Change

### Contracts
- `packages/contracts/src/room.ts`

### Backend (`apps/api`)
- `src/modules/rooms/room.model.ts`
- `src/modules/rooms/room.service.ts`
- `src/__tests__/room-discovery.test.ts` (New test suite)

### Frontend (`apps/web`)
- `src/app/(platform)/rooms/page.tsx`
- `src/components/shared/room-card.tsx`
- `src/components/shared/room-card-skeleton.tsx` (New component)
- `src/hooks/queries/use-rooms.ts`
- `src/__tests__/room-discovery.test.tsx` (New test suite)

---

## 8. Features Deferred to Future Sprints

The following features are intentionally out of scope for Sprint 1.4:
- Room join/leave mutations from discovery cards (reserved for Sprint 1.5).
- LiveKit voice chat and WebRTC audio streaming (Sprint 2).
- Realtime WebSocket updates / Redis PubSub (Sprint 2).
- Song selection and queue management (Sprint 3).
- Virtual gifts, tips, and room ranking leaderboards.
- Fabricated popularity metrics, fake online users, or AI room recommendations.

---

## 9. Audit Conclusion

The repository is well-architected to support advanced room discovery. Remediating the private room visibility check, enhancing query contracts to support availability and sorting, serializing host profile metadata safely, and creating a URL-synchronized, responsive discovery UI will make KTV Online feel like a premier social karaoke lobby while strictly upholding backend integrity and security.
