# KTVOnline — Sprint 3.5 Architecture Audit: Personalized Karaoke Experience

**Baseline Commit:** `d491ced40dc49e394a766336cd793d211e814947`  
**Date:** 2026-11-11  
**Sprint:** 3.5 — Personalized Karaoke Experience  

---

## 1. Executive Summary

Sprint 3.4 established virtual gifts and audience appreciation. Sprint 3.5 focuses on **personalizing the karaoke and discovery experience** for individual users without over-engineering or introducing black-box AI recommendation engines.

Product principle:
> **"Your karaoke experience should feel like yours."**
> **"The room belongs to everyone. The experience belongs to each user."**

Personalization distinguishes strictly between:
1. **User-level Preferences:** Music taste (genres, languages), participation style (singing, audience, both), personal lyrics scale, and personal visual effects intensity.
2. **Room-level Configuration:** Room atmosphere presets, room capacity, visibility, and category established by the host. Personal preferences must **never** overwrite or mutate room-level settings.

---

## 2. Existing Repository State & Findings

### 2.1 User Profile & Settings Architecture
- **Files:** `apps/api/src/modules/users/user.model.ts`, `packages/contracts/src/user.ts`, `apps/web/src/app/(platform)/profile/page.tsx`
- **Findings:**
  - `UserModel` currently tracks `username`, `email`, `passwordHash`, `avatar`, `role`, and `status`.
  - There is currently **no `preferences` field** on the user schema or in `UserDto`.
  - `apps/api/src/modules/users/user.routes.ts` only exposes `POST /register` and `GET /:id`.
  - `apps/web/src/app/(platform)/profile/page.tsx` displays user profile stats (songs sung, lounges hosted, cheers received), but has placeholder hardware settings and lacks a dedicated karaoke preferences management panel.
- **Architectural Decision:**
  - Embed a strongly typed `preferences` object directly into `UserModel` with backwards-compatible defaults (`default: { ... }`).
  - Introduce `GET /api/users/me/preferences` and `PATCH /api/users/me/preferences` backed by authenticated user session (`req.user.id`).
  - Avoid separate database collections or migrations.

### 2.2 Room Discovery Architecture
- **Files:** `apps/api/src/modules/rooms/room.service.ts` (`findRooms`), `packages/contracts/src/room.ts` (`RoomQuerySchema`), `apps/web/src/app/(platform)/rooms/page.tsx`
- **Findings:**
  - `findRooms` in `room.service.ts` filters public rooms by `category` (`pop`, `anime`, `rock`, `ballad`, `hiphop`, `rnb`), `status`, `roomType`, `availability`, and `search`.
  - `RoomAtmospherePreset` exists (`midnight_lounge`, `neon_stage`, `cozy_acoustic`, `minimal_studio`, `classic_karaoke`), but `atmospherePreset` is currently missing from `RoomQuerySchema`.
  - `apps/web/src/app/(platform)/rooms/page.tsx` manages URL-based query parameters with debounced search, category pills, and sort dropdowns.
- **Enhancement for Sprint 3.5:**
  - Add `atmospherePreset` to `RoomQuerySchema` and `room.service.ts`.
  - Provide a deterministic "Personalized / For You" filter toggle that maps the user's preferred genres to category filters.
  - Never hide other public rooms automatically; always allow users to browse and toggle off filters.

### 2.3 Lyrics Rendering & Personal Viewing Experience
- **Files:** `apps/web/src/features/karaoke/components/LyricsStage.tsx`, `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx`, `apps/web/src/features/karaoke/components/StageGiftOverlay.tsx`
- **Findings:**
  - `LyricsStage.tsx` renders lyrics at 10 Hz with word-level clipping. Line font sizes are currently static (`text-lg sm:text-2xl` for active, `text-sm sm:text-base` for past/future).
  - `SingerTurnIndicator.tsx` (Sprint 3.3) renders floating emoji particles.
  - `StageGiftOverlay.tsx` (Sprint 3.4) renders stage celebration banners and floating particles.
  - Both components respect `@media (prefers-reduced-motion: reduce)`.
- **Enhancement for Sprint 3.5:**
  - Allow viewer-level `lyricsFontSize: 'compact' | 'normal' | 'large'` without affecting timing or other participants.
  - Allow viewer-level `visualEffectsIntensity: 'full' | 'reduced' | 'minimal'`, `showReactions`, and `showGifts`.
  - Personal viewing preferences are purely local to the viewer and never broadcast or saved to the room.

---

## 3. Implementation Gaps & Sprint 3.5 Roadmap

```
+-----------------------------------------------------------------------------------+
|                              1. Contract & Schemas                                |
|  - Define Music Genres, Languages, Participation Styles, Lyrics Font Sizes,       |
|    and Visual Intensity in `@ktv/contracts/src/preferences.ts`                    |
|  - Extend `RoomQuerySchema` with `atmospherePreset`                               |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                              2. Backend API Extension                             |
|  - Add `preferences` schema to `UserModel` with safe defaults                     |
|  - Implement `GET /api/users/me/preferences` & `PATCH /api/users/me/preferences`   |
|  - Add `atmospherePreset` filtering to `room.service.ts`                          |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                              3. Frontend Settings UI                              |
|  - Add Personal Preferences section to `/profile` with multi-select genre/language|
|    chips, participation styles, and viewing options                               |
|  - TanStack Query hooks `useUserPreferences` & `useUpdateUserPreferences`         |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        4. Personalized Room Discovery                             |
|  - "My Taste / For You" filter preset in `/rooms`                                 |
|  - Atmosphere preset filter in discovery                                          |
|  - Clear empty states and manual filter override                                  |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                     5. Personal Karaoke Viewing Experience                        |
|  - Viewer-level lyrics font sizing in `LyricsStage.tsx`                           |
|  - Viewer-level particle / banner suppression in `SingerTurnIndicator` &         |
|    `StageGiftOverlay`                                                             |
+-----------------------------------------------------------------------------------+
```

---

## 4. Verification Strategy

Following the mandatory **Code-Only Policy**:
- No test files created or modified.
- No test runners executed.
- Static verification only via:
  - `pnpm typecheck`
  - `pnpm lint`
- Runtime verification scenarios documented as deferred in the implementation report.
