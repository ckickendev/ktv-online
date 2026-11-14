# KTVOnline — Sprint 5.2: Source, Provider & Architecture Audit

## 1. Executive Purpose & Baseline

Sprint 5.2 focuses on **Karaoke Song Discovery & Catalog Experience** under the platform positioning:
> *"Your Virtual Hangout. Your Karaoke Night."*

The objective is to make song discovery natural, fast, and transparent within the karaoke room experience. Users must be able to search for songs efficiently, filter by real catalog dimensions, clearly understand whether a song has an approved karaoke backing track or is metadata-only, and queue playable tracks without disrupting the ongoing performance or running into playback failures.

### Repository Baseline
- **Git Branch:** `main`
- **Starting HEAD Commit:** `33bff8d` (`feat(ftue): implement Sprint 5.1 first-time user experience, onboarding persistence, and contextual guidance`)
- **Database Name:** `test` (strictly preserved)
- **Monorepo Packages:** `@ktv/contracts`, `apps/api`, `apps/web`
- **Development Policy:** Strict Code-Only policy (no test modifications, no test runners, no production builds; `pnpm typecheck` and `pnpm lint` allowed).

---

## 2. Existing Song Search & Catalog Architecture

### 2.1 Backend Architecture
1. **Contracts (`packages/contracts/src/karaoke.ts`):**
   - Defines `SongDto`, `SongSearchQuerySchema`, `SongSearchResponseSchema`, `ResolvedAudioSourceDtoSchema`, `SongLyricsDtoSchema`, `RoomQueueItemDtoSchema`.
   - Distinct availability schemas:
     - `SongMediaAvailability`: `'available'`, `'restricted'`, `'unavailable'`, `'fixture_mock'`
     - `AudioAvailability`: `'metadata_only'`, `'audio_available'`, `'audio_unavailable'`, `'restricted'`
     - `LyricsAvailability`: `'timed_available'`, `'text_only'`, `'unavailable'`
     - `AudioLicenseClassification`: `'licensed_commercial'`, `'royalty_free'`, `'public_domain'`, `'user_supplied_authorized'`, `'development_fixture'`
   - `SongSearchQuerySchema` accepts:
     - `q`: string (search title/artist)
     - `genre`: string (filter by genre)
     - `language`: string (filter by language)
     - `page`: number (default 1)
     - `limit`: number (default 20, max 50)
2. **Database Model (`apps/api/src/modules/karaoke/song.model.ts`):**
   - Mongoose collection `songs`.
   - Compound unique index on `{ provider: 1, providerSongId: 1 }`.
   - Text search index on `{ title: 'text', artist: 'text' }`.
   - Indexed fields: `provider`, `title`, `artist`, `language`, `genre`, `mediaAvailability`, `audioAvailability`, `lyricsAvailability`, `licenseClassification`.
3. **Provider Layer (`apps/api/src/modules/karaoke/song-catalog.provider.ts`):**
   - Defines `ISongCatalogProvider` interface (`providerName`, `searchSongs`, `getSongById`, `getPlaybackAvailability`).
   - Implements `FixtureCatalogProvider`:
     - 4 Playable Development Fixtures with generated audio and timed lyrics:
       - `fix_auld_lang_syne` (Folk / Public Domain, English)
       - `fix_amazing_grace` (Ballad / Public Domain, English)
       - `fix_scarborough_fair` (Folk / Public Domain, English)
       - `fix_synth_groove` (City Pop / Royalty Free, English)
     - 12 Commercial Catalog Fixtures (Metadata Only):
       - `fix_blinding_lights` (The Weeknd - Pop, English)
       - `fix_cruel_summer` (Taylor Swift - Pop, English)
       - `fix_bohemian_rhapsody` (Queen - Rock, English)
       - `fix_hotel_california` (Eagles - Rock, English)
       - `fix_stay_with_me` (Miki Matsubara - City Pop, Japanese)
       - `fix_gurenge` (LiSA - Anime, Japanese)
       - `fix_fly_me_to_the_moon` (Frank Sinatra - Ballad, English)
       - `fix_someone_like_you` (Adele - Ballad, English)
       - `fix_cant_hold_us` (Macklemore & Ryan Lewis - Hip Hop, English)
       - `fix_treasure` (Bruno Mars - R&B, English)
       - `fix_unravel` (TK from Ling Tosite Sigure - Anime, Japanese)
       - `fix_shape_of_you` (Ed Sheeran - Pop, English)
4. **Service & Controller Layer:**
   - `SongService` (`song.service.ts`):
     - Seeds fixtures into MongoDB idempotently on startup.
     - Performs MongoDB queries for `searchSongs` and `getSongById`.
   - `KaraokeController` (`karaoke.controller.ts`):
     - `GET /api/v1/songs/search` -> `karaokeController.searchSongs`
     - `GET /api/v1/songs/:songId` -> `karaokeController.getSongById`
     - `GET /api/v1/songs/:songId/audio/resolve` -> resolves audio stream URL
     - `GET /api/v1/songs/:songId/audio/stream` -> streams WAV audio buffer with HTTP 206 byte-range support
     - `GET /api/v1/songs/:songId/lyrics` -> returns timed lyric lines

---

## 3. Playback & Lyrics Provider Inventory

| Component | Class / Implementation | Function | Content Supplied |
| :--- | :--- | :--- | :--- |
| **Catalog Provider** | `FixtureCatalogProvider` | Searchable song entries | Title, artist, genre, language, duration, thumbnail URL, availability flags |
| **Audio Source Provider** | `FixtureAudioSourceProvider` | Resolves playback streams | In-memory synthesized WAV buffers (44.1 kHz 16-bit PCM) via `FixtureAudioGenerator` |
| **Lyrics Provider** | `FixtureLyricsProvider` | Timed lyrics retrieval | Timed lyric lines & word-level timing offsets for 4 playable development fixtures |
| **Streaming Engine** | `AudioSourceService` | HTTP 206 Partial Content server | Handles byte ranges (`bytes=start-end`, `bytes=start-`, `bytes=-N`) RFC 7233 |

---

## 4. Current Queue Integration Flow & Defect Analysis

### 4.1 Queue Insertion Flow
1. User clicks "Queue" in `SongSearchDialog`.
2. Frontend calls `karaokeApi.addToQueue(roomId, { songId })`.
3. Backend route `POST /api/v1/rooms/:roomId/queue` invokes `karaokeController.addToQueue`.
4. `karaokeService.addToQueue` validates:
   - Room existence and non-closed status.
   - Active room membership for calling user.
   - Song exists in MongoDB `SongModel`.
   - Queue capacity limit (max 50 active items).
   - If playback is `idle` and `audioAvailability === 'audio_available'`, direct stage activation occurs.
   - Otherwise, song is appended to the queue as `status: 'queued'`.

### 4.2 Critical Defect Discovered in Existing Implementation
- **Issue:** In `karaokeService.addToQueue`, if `song.audioAvailability === 'metadata_only'`, the service did **not** reject queue insertion. Instead, it appended the unplayable song to the queue.
- **Consequence:** When the playback worker or host attempts to transition to this queue item, `karaokeService.executePlaybackCommand` or `transitionToNextQueueItem` detects `audioAvailability !== 'audio_available'` and marks the item as `status: 'failed'`.
- **Friction:** In `SongSearchDialog.tsx`, metadata-only songs had active "Queue" buttons, allowing users to queue songs that would instantly fail on playback!
- **Remediation:**
  1. Backend: In `karaokeService.addToQueue`, reject songs where `audioAvailability !== 'audio_available'` or `mediaAvailability === 'unavailable'` with `SONG_NOT_PLAYABLE` error.
  2. Frontend: Clearly render `METADATA ONLY` badge, disable or replace the queue button with an informative status, and prevent unplayable submissions.

---

## 5. Search UX & Frontend Component Assessment

### 5.1 Current Search Dialog (`SongSearchDialog.tsx`)
- **Strengths:**
  - Modern modal layout with backdrop blur.
  - 300ms debounce on search input.
  - Keyboard Escape close handler.
  - Visual queue position preview (`Will be #X in queue`).
  - Playable Audio filter pill (`playableOnly`).
  - Basic genre filters.
- **UX Gaps & Opportunities:**
  1. **No Language Filter:** The backend supports `language` filtering, but the dialog only had genre filters.
  2. **No Availability Segmented Controls:** Users could only toggle "Playable Audio Only" as a pill; no explicit selection between "All", "Playable Backing Tracks", and "Catalog Metadata".
  3. **No Audio Preview Player:** For playable tracks (`audio_available`), users had no way to listen to a quick 10-15s sample before queueing.
  4. **No Search History / Recent Searches:** Users had to retype titles every time they reopened the dialog.
  5. **Misleading Buttons:** Metadata-only tracks showed identical purple "Queue" buttons, confusing users.
  6. **Stale Search Response Protection:** Query results needed robust race prevention to guarantee that an earlier out-of-order response cannot overwrite a newer query.
  7. **Empty State Nuance:** Missing contextual differentiation between:
     - No search results for query.
     - Category filter with 0 items.
     - Search error / network failure.

---

## 6. Minimal Implementation Plan

1. **Phase 1: Contracts & Backend Refinement**
   - Add optional `availability` parameter (`all`, `playable`, `metadata_only`) to `SongSearchQuerySchema` in `@ktv/contracts`.
   - Update `SongService.searchSongs` in `apps/api` to filter by `audioAvailability` when requested.
   - Enforce `SONG_NOT_PLAYABLE` in `karaokeService.addToQueue` when an unplayable song is submitted.
   - Update `karaokeController.addToQueue` to return HTTP 400 with a clear explanatory error.
2. **Phase 2: Search Experience & Filters**
   - Expand `SongSearchDialog` filters with real catalog categories (Genre: Pop, Rock, Ballad, Folk, City Pop, Anime, Hip Hop, R&B; Language: English, Japanese).
   - Implement availability tab / filter (All, Playable Tracks, Metadata Only).
   - Integrate lightweight search history in `localStorage` (last 5 queries with one-tap removal).
3. **Phase 3: Song Result Cards & Availability Actions**
   - Visual distinction: `AVAILABLE` (green badge + "Queue" button), `METADATA ONLY` (amber badge + "Catalog Only" indicator + licensing tooltip), `UNAVAILABLE` (slate badge).
   - Provide an in-dialog audio preview player for playable tracks with play/stop toggle, automatic stop on dialog close or when starting another preview, with zero interference with room playback.
4. **Phase 4: Search Reliability & Static Verification**
   - Cancellation / generation fencing on search requests.
   - Run `pnpm typecheck` and `pnpm lint`.
   - Ensure clean monorepo compilation.
