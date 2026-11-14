# KTVOnline — Sprint 5.2: UX Implementation Report

## 1. Executive Purpose & Product Alignment

Sprint 5.2 delivers an improved **Karaoke Song Discovery & Catalog Experience** under the platform positioning:
> **"Your Virtual Hangout. Your Karaoke Night."**

The experience makes song discovery natural, fast, and transparent within the karaoke room. Singers can search for songs, filter across catalog dimensions (availability, genre, language), listen to authorized audio previews, distinguish playable karaoke tracks from commercial metadata entries, and queue songs with immediate, accurate feedback.

---

## 2. Component & Architecture Breakdown

### 2.1 Shared Contracts (`packages/contracts/src/karaoke.ts`)
- **Availability Filter Contract:** Added `SongAvailabilityFilterSchema = z.enum(['all', 'playable', 'metadata_only'])`.
- **Search Query Expansion:** Extended `SongSearchQuerySchema` with optional `availability: SongAvailabilityFilterSchema.optional()`, preserving full backward compatibility.

### 2.2 Backend Services & Provider (`apps/api`)
- **`ISongCatalogProvider` & `FixtureCatalogProvider` (`song-catalog.provider.ts`):**
  - Extended `SongSearchOptions` with `availability?: string`.
  - Filtered catalog fixtures when `availability === 'playable'` (`audioAvailability === 'audio_available'`) or `'metadata_only'` (`audioAvailability === 'metadata_only'`).
- **`SongService` (`song.service.ts`):**
  - Updated MongoDB query builder in `searchSongs` to apply `{ audioAvailability: 'audio_available' }` or `{ audioAvailability: 'metadata_only' }` dynamically.
- **Queue Protection in `KaraokeService` (`karaoke.service.ts`):**
  - Implemented authoritative check in `addToQueue`: rejects any song where `song.audioAvailability !== 'audio_available'` with `SONG_NOT_PLAYABLE`.
  - Prevents unplayable songs from entering the active room queue and subsequently failing during playback transitions.
- **Controller Error Mapping (`karaoke.controller.ts`):**
  - Mapped `SONG_NOT_PLAYABLE` to HTTP 400 with descriptive error: *"This song does not have an approved karaoke audio track and cannot be queued for playback."*

### 2.3 Client API & Hooks (`apps/web`)
- **`karaokeApi.searchSongs` (`karaoke-api.ts`):**
  - Updated query parameter serialization to pass `availability` to `GET /api/v1/songs/search`.
- **Query Caching (`queryKeys.karaoke.songs`):**
  - Cached search results by combined parameters `(q, genre, language, availability)` with 30s stale time and automatic out-of-order race discarding.

---

## 3. Screen & Interaction Breakdown

### 3.1 Search Header & Guidance Banner
- **Header:** Clear title *"Karaoke Song Catalog"* and descriptive subtitle.
- **Catalog Guidance Banner:** Transparently explains the distinction between green-badged tracks (verified karaoke audio + timed lyrics) and commercial entries (metadata-only).
- **Queue Position Indicator:** Displays prospective queue position (`Next position: #X / 50`) so singers know where their selection will land before queueing.

### 3.2 Prominent Search Input & Recent History
- **Search Bar:** High-contrast search input with magnifying glass, loading indicator, and instant clear button (`X`).
- **Recent Searches Chips:**
  - Persists the last 5 unique queries in `localStorage` under `ktv_song_search_recent`.
  - Displays clickable query chips when the search bar is focused or empty.
  - Includes a one-click "Clear history" action.

### 3.3 Multi-Dimensional Filter Bar
- **Availability Segment Control:**
  - `All Tracks` (complete catalog, 16 sample tracks).
  - `Playable Backing Tracks` (green indicator dot, filtered to tracks with audio).
  - `Commercial Metadata` (amber indicator dot, commercial discovery entries).
- **Genre Filter Chips:**
  - Pop, Rock, Ballad, Folk, City Pop, Anime, Hip Hop, R&B.
- **Language Filter Chips:**
  - All Languages, English (`en`), Japanese (`ja`).

### 3.4 Song Result Cards & Availability Actions
Every song card presents comprehensive metadata:
- **Visuals:** High-resolution album artwork/thumbnail (or music icon fallback).
- **Metadata Hierarchy:** Title, Artist, Genre, Language, and formatted Duration (`MM:SS`).
- **Availability Badges:**
  - **`AVAILABLE` (Karaoke Ready):** Green badge with check icon + cyan `Timed Lyrics` badge.
  - **`METADATA ONLY`:** Amber badge with info icon + *"Metadata Only"* indicator.
- **Action Matrix:**
  | Song Availability | Audio Preview Action | Primary Queue Action |
  | :--- | :--- | :--- |
  | **`audio_available`** | Interactive 15-second audio preview button with play/stop toggle. | "Queue Song" (`Plus` icon). Displays "Queued" with green checkmark for 3s upon success. |
  | **`metadata_only`** | Disabled (shows "Licensing Info" button). | Disabled "Not Playable" button. Clicking opens commercial licensing explanation modal. |

### 3.5 Audio Preview Player
- **Mechanism:** Leverages native browser `HTMLAudioElement` fetching authorized procedural WAV audio from `/api/v1/songs/:songId/audio/stream`.
- **Safety Bounds:**
  - Automatically stops after 15 seconds.
  - Clicking another preview stops the previous preview immediately.
  - Closing the search dialog or unmounting cleans up the audio element instantly, ensuring preview audio never bleeds into active room playback.
- **Volume:** Set to comfortable 0.7 gain to avoid jarring loudness.

### 3.6 Commercial Catalog Notice Modal
When a user clicks on a `metadata_only` song or its licensing info:
- A non-intrusive modal opens explaining:
  - The song is indexed for search and discovery demonstration.
  - Direct karaoke backing playback requires active commercial synchronization licensing agreements (ASCAP/BMI/VCPMC).
  - Why the track cannot be queued in this environment.

---

## 4. Empty States & Error Handling Matrix

| Context | Trigger | Title | Explanation | Primary CTA |
| :--- | :--- | :--- | :--- | :--- |
| **Search Miss** | No results matching `debouncedQuery` | No songs found for "{query}" | Try searching for a different artist, title, or resetting filters. | Clear All Filters |
| **Category Miss** | Genre or language filter yields 0 items | No songs matching the active filters | There are currently no tracks matching these filters. Try switching to "All Tracks". | Clear All Filters |
| **Playable Miss** | `availability: 'playable'` with no matches | No songs matching the active filters | There are currently no playable tracks matching these filters. | Clear All Filters |
| **Network Error** | API unreachable or HTTP 5xx | Failed to Load Song Catalog | Could not connect to the catalog server. Please check your network connection. | Retry Search |
| **Queue Error** | Queue capacity reached (50 items) | Room Queue Full (Banner) | The room queue is currently full (maximum 50 songs). | Dismiss / Retry |
| **Unplayable Attempt** | Attempting to queue metadata track | Unplayable Track (Banner) | This track cannot be queued because it does not have an authorized karaoke audio stream. | Dismiss |

---

## 5. Accessibility (a11y) & Responsive Verification

1. **Tap Targets:** All buttons (preview, queue, filter chips, dismiss, close) enforce minimum 44px tap targets or explicit min-height constraints.
2. **Screen Reader Support:** Semantic ARIA labels on all icon-only buttons (`aria-label="Close song discovery"`, `aria-label="Clear search query"`).
3. **Contrast:** High-contrast text colors (`text-white`, `text-slate-300`, `text-cyan-400`, `text-emerald-400`, `text-amber-400`) on dark backgrounds (`#0c101c`, `#0e121e`).
4. **Keyboard Accessibility:** Full Escape key handling (closes licensing modal first, then main dialog), autofocus on search input, standard focus visible rings.
5. **Mobile Responsiveness:**
   - Adapts to a bottom-sheet modal on mobile (`rounded-t-3xl sm:rounded-3xl max-h-[92vh] sm:max-h-[85vh]`).
   - Action buttons align neatly at the bottom right of song cards on smaller viewports.
