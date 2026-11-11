# KTVOnline — Personalization Architecture & Design Specification

**Sprint:** 3.5 — Personalized Karaoke Experience  
**Date:** 2026-11-11  
**Status:** Implemented  

---

## 1. Vision & Core Principles

KTVOnline is a virtual karaoke lounge platform where social energy meets personal comfort. Users have diverse music tastes, languages, and accessibility needs:

- Some users sing actively; others prefer relaxing as audience members.
- Some prefer Vietnamese or English tracks; others prefer Japanese anime hits or Korean ballads.
- Some prefer larger, readable lyrics on smaller screens; others want compact views.
- Some users love vibrant stage celebrations with floating emoji reactions and virtual gifts; others experience visual fatigue and require reduced or minimal visual noise.

### Core Principles

1. **"The room belongs to everyone. The experience belongs to you."**  
   Personal preferences strictly modulate the individual client experience (viewing scale, effect density, discovery hints) and must **never** mutate room-level state (room atmosphere, active track, queue, host controls).
2. **Deterministic & Transparent — No AI Black Boxes.**  
   Discovery uses deterministic, user-auditable matching. No hidden recommendation algorithms, no dark patterns, and no automated sorting that hides active lounges from users.
3. **Resilient Defaults.**  
   Every preference has a safe, backwards-compatible default. Unauthenticated users or users who have not customized settings receive standard, high-quality defaults.
4. **Zero Overhead on Stage Clock.**  
   Lyrics font scaling and particle suppression run purely in the presentation layer without altering synchronization timestamps, Socket.IO message frequency, or audio pipelines.

---

## 2. Architecture & Scope Separation

```
+-----------------------------------------------------------------------------------+
|                                 USER PREFERENCES                                  |
|                                                                                   |
|  [Music Taste]             [Stage Viewing]              [Participation]           |
|  - Preferred Genres        - Lyrics Font Size           - Preferred Style         |
|  - Preferred Languages     - Visual Effects Intensity     ('singing' | 'audience' |
|                            - Show Reactions Toggle        | 'both')               |
|                            - Show Gifts Toggle                                    |
+-----------------------------------------------------------------------------------+
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
+------------------------------------+   +------------------------------------+
|          ROOM DISCOVERY            |   |         PERSONAL VIEWPORT          |
|                                    |   |                                    |
| - Deterministic "For You" Quick    |   | - Dynamic Lyrics Stage Font Scale  |
|   Category Filter Pill             |   |   (compact / normal / large)       |
| - Atmosphere Preset Filter Dropdown|   | - Stage Gift Particle Throttling   |
| - Explicit URL Sync & State Reset  |   |   (full / reduced / minimal)       |
| - Manual Overrides for All Users   |   | - Viewer Reaction & Gift Toggles   |
+------------------------------------+   +------------------------------------+
                   │                                           │
                   ▼                                           ▼
      [Does NOT affect Room State]               [Does NOT affect Room State]
      [Does NOT affect Host Rules]               [Does NOT affect Other Users]
```

---

## 3. Contracts & Data Model

### 3.1 Type Definitions (`@ktv/contracts`)

Located at `packages/contracts/src/preferences.ts` and exported via `packages/contracts/src/index.ts`:

```typescript
export const MUSIC_GENRES = [
  'pop',
  'ballad',
  'rock',
  'rap',
  'rnb',
  'edm',
  'acoustic',
  'traditional',
  'anime',
] as const;

export const MUSIC_LANGUAGES = ['vi', 'en', 'ko', 'ja', 'zh'] as const;

export const PARTICIPATION_STYLES = ['singing', 'audience', 'both'] as const;

export const LYRICS_FONT_SIZES = ['compact', 'normal', 'large'] as const;

export const VISUAL_EFFECTS_INTENSITIES = ['full', 'reduced', 'minimal'] as const;

export const UserPreferencesDtoSchema = z.object({
  preferredGenres: z.array(MusicGenreSchema).default(['pop']),
  preferredLanguages: z.array(MusicLanguageSchema).default(['vi', 'en']),
  participationStyle: ParticipationStyleSchema.default('both'),
  lyricsFontSize: LyricsFontSizeSchema.default('normal'),
  visualEffectsIntensity: VisualEffectsIntensitySchema.default('full'),
  showReactions: z.boolean().default(true),
  showGifts: z.boolean().default(true),
});

export const UpdateUserPreferencesSchema = UserPreferencesDtoSchema.partial();
```

### 3.2 Metadata Registry

To guarantee clean, localized, and emoji-enhanced display across the web client:

- `GENRE_METADATA`: Maps genre IDs to user-friendly titles and icons (e.g., `pop` -> "Pop & Billboard", `rock` -> "Rock & Metal", `anime` -> "Anime & J-Music").
- `LANGUAGE_METADATA`: Maps language codes to national labels (e.g., `vi` -> "Tiếng Việt", `en` -> "English", `ja` -> "日本語").

### 3.3 Database Storage (`apps/api`)

Embedded directly into `UserModel` (`apps/api/src/modules/users/user.model.ts`):

```typescript
preferences: {
  preferredGenres: { type: [String], default: ['pop'] },
  preferredLanguages: { type: [String], default: ['vi', 'en'] },
  participationStyle: { type: String, enum: ['singing', 'audience', 'both'], default: 'both' },
  lyricsFontSize: { type: String, enum: ['compact', 'normal', 'large'], default: 'normal' },
  visualEffectsIntensity: { type: String, enum: ['full', 'reduced', 'minimal'], default: 'full' },
  showReactions: { type: Boolean, default: true },
  showGifts: { type: Boolean, default: true },
}
```

**Benefits:**
- Zero database migrations or separate lookup queries.
- Atomically retrieved alongside user profiles.
- Seamless fallback values for existing users.

---

## 4. Backend Endpoints

Mounted in `apps/api/src/modules/users/user.routes.ts`:

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/me/preferences` | Required (`requireAuth`) | Retrieves the current user's personalized preferences |
| `PATCH` | `/api/users/me/preferences` | Required (`requireAuth`) | Updates partial preferences (`UpdateUserPreferencesSchema`) |

### Room Discovery Filtering Backend

`findRooms` in `apps/api/src/modules/rooms/room.service.ts` supports atmosphere preset filtering:
```typescript
if (query.atmospherePreset) {
  filter.atmospherePreset = query.atmospherePreset;
}
```

---

## 5. Frontend Implementation

### 5.1 Personal Preferences Management Card

Component: `apps/web/src/components/profile/personal-preferences-card.tsx`  
Mounted: `apps/web/src/app/(platform)/profile/page.tsx`

Features:
- **Genre & Language Chips:** Multi-select toggle buttons with visual indicators and badge counters.
- **Participation Style Selector:** 3-way toggle (`Singing Focus`, `Audience Fan`, `Balanced Lounge Lover`).
- **Stage Viewing Settings:**
  - Lyrics Font Size Segmented Control (`Compact`, `Normal`, `Large`).
  - Visual Effects Intensity Control (`Full Vibrant`, `Reduced`, `Minimal Clean`).
  - Reaction Overlay & Stage Gift Toggles with real-time feedback.
- **Form Lifecycle:** Dirty-state tracking, Reset to Defaults action, and TanStack Mutation state feedback.

### 5.2 Room Discovery Adaptation

Component: `apps/web/src/app/(platform)/rooms/page.tsx`

Features:
- **"✨ For You" Quick Filter Pill:** Dynamically detects the user's top preferred genre and maps it directly to room categories.
- **Atmosphere Preset Filter:** Dropdown filter allowing users to select their favorite lounge vibe (Neon Stage, Midnight Lounge, Cozy Acoustic, etc.).
- **URL Parameter Synchronization:** Clean URL sync (`atmospherePreset`, `category`) supporting direct sharing and browser history.

### 5.3 Personal Karaoke Viewing Adaptation

Component: `apps/web/src/features/karaoke/components/KaraokePlayer.tsx`  
Sub-components: `LyricsStage.tsx`, `StageGiftOverlay.tsx`, `SingerTurnIndicator.tsx`

1. **Lyrics Font Sizing (`LyricsStage`):**
   - `compact`: Active line `text-base sm:text-xl font-bold`, preview lines `text-xs sm:text-sm`.
   - `normal`: Active line `text-lg sm:text-2xl font-black`, preview lines `text-sm sm:text-base`.
   - `large`: Active line `text-xl sm:text-3xl font-black tracking-wide`, preview lines `text-base sm:text-lg`.
   - Component memoization updated to compare `fontSize` alongside playback timestamps.

2. **Visual Effects Intensity & Toggles:**
   - `showReactions = false`: Suppresses reaction animations in `SingerTurnIndicator`.
   - `showGifts = false`: Completely hides `StageGiftOverlay`.
   - `visualEffectsIntensity = 'minimal'`: Suppresses secondary confetti and floating sparkles, rendering only the celebration banner.
   - `visualEffectsIntensity = 'reduced'`: Caps particle counts to 2.
   - `visualEffectsIntensity = 'full'`: Displays standard 6 floating celebratory particles.

---

## 6. Static Verification & Quality Assurance

- Strict Code-Only policy adhered to (no test file alterations or test executions).
- `@ktv/contracts`, `@ktv/api`, and `@ktv/web` verified with:
  - `pnpm typecheck` — 0 TypeScript errors.
  - `pnpm lint` — 0 ESLint warnings or errors.
- Verification status: **CODE COMPLETE — NOT RUNTIME VERIFIED**.
