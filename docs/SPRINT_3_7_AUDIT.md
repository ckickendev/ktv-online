# KTVOnline — Sprint 3.7 Architecture Audit: User Identity & Profile Experience

**Baseline Commit:** `fd3d728518939c0fa3e59eafe9093845b597c419`  
**Date:** 2026-11-11  
**Phase:** Discovery & Architecture Audit Only  
**Status:** AUDIT COMPLETE  

---

## 1. Executive Summary

As KTVOnline evolves into a social karaoke lounge platform, users participate in live stage performances, queue songs, send reactions and gifts, and browse lounges. However, user identity across the application is currently fragmented and minimal:

1. **Missing Display Name & Bio:** `UserModel` only stores a lowercase `username` (3-30 chars, alphanumeric). There is no `displayName` (e.g. casing, accents, emojis) and no `bio` / `introduction` field in the database.
2. **Missing Profile Update API:** While `userService.update(id, data)` and `UpdateUserSchema` exist in the codebase, there is **no HTTP route mounted** in `apps/api` allowing users to update their profile or avatar.
3. **Mock Profile Page:** The existing `/profile` route (`apps/web/src/app/(platform)/profile/page.tsx`) displays hardcoded mock statistics (142 songs, 28 lounges, 1,480 cheers, 96% score) and mock bio text. There is no edit form for identity details; only the Sprint 3.5 `<PersonalPreferencesCard />` is functional.
4. **Anticipated but Unpopulated `displayName`:** Several contracts and models (`GiftParticipantDtoSchema`, `RoomQueueRequesterDtoSchema`, `LiveKit` voice token generation) were engineered with `displayName || username`, but because `displayName` does not exist on `UserModel`, it always falls back to lowercase `username`.
5. **No Binary Asset Storage:** Avatars are stored strictly as optional HTTP/HTTPS URL strings. There is no file upload service, S3/GCS bucket, or Multer middleware in the repository.
6. **Snapshot Identity Invariants:** Room chat messages (`RoomMessageModel`), socket sessions (`socket.data.user`), and queue items (`RoomQueueItemModel`) capture identity snapshots at creation time.

Product direction for Sprint 3.7:
> **"Build one coherent karaoke identity system — not multiple disconnected user representations."**  
> **"Every singer deserves a recognizable identity that follows them from profile to stage, queue, and chat."**

---

## 2. Audited Baseline & Repository Architecture

- **Baseline Commit:** `fd3d728518939c0fa3e59eafe9093845b597c419`
- **Monorepo Layout:**
  - `packages/contracts/src/user.ts`: User schemas (`UserDtoSchema`, `CreateUserSchema`, `UpdateUserSchema`, `AuthTokensSchema`, `AuthSessionResponseSchema`).
  - `apps/api/src/modules/users/`: Domain service (`user.service.ts`), Mongoose model (`user.model.ts`), controller (`user.controller.ts`), and routes (`user.routes.ts`).
  - `apps/api/src/modules/auth/`: Session management, JWT issuing, authentication middleware (`auth.middleware.ts`).
  - `apps/web/src/stores/use-auth-store.ts` & `apps/web/src/hooks/use-auth.ts`: Client session and current user store.
  - `apps/web/src/app/(platform)/profile/page.tsx`: User profile UI.
  - `apps/web/src/components/shared/user-avatar.tsx`: Shared avatar presentation.

### Data Flow Diagram

```
+---------------------------------------------------------------------------------+
|                                 MongoDB (Users)                                 |
|  UserModel: { username, email, passwordHash, avatar, role, status, preferences } |
+---------------------------------------------------------------------------------+
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
+------------------------------------+   +------------------------------------+
|          Auth Middleware           |   |            User Service            |
|  - Validates JWT Bearer Token      |   |  - findById / findByUsername       |
|  - Selects 'status role username'  |   |  - getPreferences / updatePref     |
|  - Attaches req.user: { id,        |   |  - update(id, data) [UNROUTED]     |
|    username, role } (NO AVATAR!)   |   |                                    |
+------------------------------------+   +------------------------------------+
                   │                                           │
                   ▼                                           ▼
+------------------------------------+   +------------------------------------+
|         GET /api/auth/me           |   |       GET /api/users/:id           |
|  - Returns req.user { id,          |   |  - Returns user JSON               |
|    username, role }                |   |  - Strips email for third parties  |
+------------------------------------+   +------------------------------------+
                   │                                           │
                   └─────────────────────┬─────────────────────┘
                                         ▼
+---------------------------------------------------------------------------------+
|                                Frontend Client                                  |
|  - useAuthStore: stores user { id, username, role, avatar?: undefined }         |
|  - /profile: renders username + hardcoded mock bio/stats                        |
|  - Room components: rely on username or unpopulated displayName                |
+---------------------------------------------------------------------------------+
```

---

## 3. User Model & Database Fields Audit

**Source File:** `apps/api/src/modules/users/user.model.ts` (lines 4-75)  
**Status:** **CONFIRMED**

### 3.1 Field Breakdown

| Field | Type | Required | Default | Indexes | Purpose |
|---|---|---|---|---|---|
| `username` | String (3-30 chars) | Yes | None | Unique | Lowercase alphanumeric login & identity handle |
| `email` | String | Yes | None | Unique | Lowercase email address for auth and notifications |
| `passwordHash` | String | Yes | None | None | Bcrypt password hash (10 salt rounds) |
| `avatar` | String (URL) | No | `null` | None | External avatar URL |
| `role` | String enum | Yes | `'user'` | Index: true | `'admin' \| 'user' \| 'moderator'` |
| `status` | String enum | Yes | `'active'` | Index: true | `'active' \| 'suspended' \| 'offline' \| 'online'` |
| `preferences` | Sub-document | No | Default obj | None | Sprint 3.5 personal preferences |
| `createdAt` | Date | Auto | `now` | Timestamps | Account creation timestamp |
| `updatedAt` | Date | Auto | `now` | Timestamps | Last update timestamp |

### 3.2 Audit Findings on Model Fields

1. **No `displayName` field:** **CONFIRMED.** User model strictly enforces `username: { lowercase: true, minlength: 3, maxlength: 30 }`. Display casing or custom names with spaces/accents are impossible with the current model.
2. **No `bio` or profile metadata:** **CONFIRMED.** There is no `bio`, `tagline`, `location`, `socialLinks`, or `customStatus` field in MongoDB.
3. **No performance history or statistics fields:** **CONFIRMED.** There are no counters (`songsSungCount`, `loungesHostedCount`, `cheersReceivedCount`) in `UserModel`.
4. **Embedded Sub-Document for Preferences:** **CONFIRMED.** Sprint 3.5 preferences (`preferredGenres`, `preferredLanguages`, `participationStyle`, `lyricsFontSize`, `visualEffectsIntensity`, `showReactions`, `showGifts`) are embedded directly under `preferences` with safe fallbacks.
5. **No Separate Profile Collection:** **CONFIRMED.** All user data is contained in the `users` collection.
6. **Serialization Sanitization:** **CONFIRMED.** `toJSON` transform in `user.model.ts` lines 80-87 deletes `_id`, `__v`, and `passwordHash`, mapping `_id` to string `id`.

---

## 4. Authentication & User API Surface Audit

**Source Files:** `apps/api/src/modules/users/user.routes.ts`, `apps/api/src/modules/auth/auth.routes.ts`, `apps/api/src/modules/users/user.controller.ts`  
**Status:** **CONFIRMED**

### 4.1 Existing Endpoints Inventory

| Method | Route | Auth | Controller Handler | Validation Schema | Response DTO | Purpose |
|---|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `userController.register` | `CreateUserSchema` | `UserDto` | Registers user account |
| `POST` | `/api/auth/login` | Public | `authController.login` | `LoginSchema` | `AuthSessionResponseDto` | Authenticates and sets refresh cookie |
| `POST` | `/api/auth/refresh` | Public | `authController.refresh` | `RefreshTokenSchema` | Tokens | Rotates refresh token |
| `POST` | `/api/auth/logout` | Optional | `authController.logout` | None | `null` | Revokes refresh token & clears cookie |
| `GET` | `/api/auth/me` | Required | `authController.me` | None | `req.user` | Returns authenticated session identity |
| `POST` | `/api/users/register` | Public | `userController.register` | `CreateUserSchema` | `UserDto` | Alias registration endpoint |
| `GET` | `/api/users/me/preferences` | Required | `userController.getPreferences` | None | `UserPreferencesDto` | Retrieves Sprint 3.5 preferences |
| `PATCH` | `/api/users/me/preferences` | Required | `userController.updatePreferences` | `UpdateUserPreferencesSchema` | `UserPreferencesDto` | Updates Sprint 3.5 preferences |
| `GET` | `/api/users/:id` | Optional | `userController.getProfile` | None | `UserDto` (sanitized) | Retrieves public/private user profile |

### 4.2 Key Architectural Gaps in API Surface

1. **Missing `PATCH /api/users/me` (Profile Update):** **CONFIRMED.** There is no endpoint permitting a user to update their `avatar` or `username`. `UpdateUserDto` exists in contracts and `userService.update` exists in the backend service, but no route is mounted.
2. **`req.user` Missing Avatar in Auth Middleware:** **CONFIRMED.** `apps/api/src/middlewares/auth.middleware.ts` line 24 executes:
   ```typescript
   const user = await UserModel.findById(payload.sub).select('status role username').exec();
   ```
   `avatar` is excluded from the query projection! As a result, `GET /api/auth/me` never returns `avatar`, leaving `CurrentUserDto.avatar` undefined on client initialization.
3. **Privacy Leak in Public Profile Lookup:** **CONFIRMED.** `GET /api/users/:id` deletes `email` for third parties (`if (!req.user || req.user.id !== userId) delete userJson.email`), but it **does not strip client-only viewing preferences** (`lyricsFontSize`, `visualEffectsIntensity`, `showReactions`, `showGifts`). These internal viewing preferences are exposed publicly.

---

## 5. Contracts & Data Transfer Objects Audit

**Source File:** `packages/contracts/src/user.ts`  
**Status:** **CONFIRMED**

### 5.1 `UserDtoSchema`
```typescript
export const UserDtoSchema = z.object({
  id: z.string(),
  username: z.string().min(3).max(30),
  email: z.string().email(),
  avatar: z.string().url().optional().nullable(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  preferences: UserPreferencesDtoSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```
- Missing: `displayName`, `bio`.

### 5.2 Discrepancies Across Shared Contracts

| Contract / Schema | Defined In | Identity Fields Included | Observations |
|---|---|---|---|
| `UserDtoSchema` | `packages/contracts/src/user.ts` | `id, username, email, avatar, role, status, preferences` | No `displayName`, no `bio` |
| `HostDtoSchema` | `packages/contracts/src/room.ts` | `id, username, avatar` | No `displayName` |
| `RoomMembershipDtoSchema` | `packages/contracts/src/room.ts` | `user?: HostDto` | Uses `HostDto` (`username`, `avatar`) |
| `ChatMessageDtoSchema` | `packages/contracts/src/chat.ts` | `senderId, senderUsername, senderAvatar, senderRole` | Uses `senderUsername` |
| `StageReactionSenderSchema` | `packages/contracts/src/reaction.ts` | `id, username, avatar` | Uses `username` |
| `GiftParticipantDtoSchema` | `packages/contracts/src/gift.ts` | `id, username, displayName?, avatar?` | Anticipated `displayName` |
| `RoomQueueRequesterDtoSchema` | `packages/contracts/src/karaoke.ts` | `id, username, displayName?, avatar?` | Anticipated `displayName` |
| `VoiceParticipantMetadata` | `apps/api/src/modules/voice/voice.types.ts` | `userId, username, displayName, avatarUrl` | Anticipated `displayName` |

**Conclusion:** Several downstream realtime features anticipated `displayName`, but the core `UserDtoSchema` and `UserModel` never supported it, forcing all consumers to fall back to `username`.

---

## 6. Identity Display Surface Inventory

**Status:** **CONFIRMED**

| # | Surface | File Path | Identity Source | Fields Displayed | Current Behavior / Limitations |
|---|---|---|---|---|---|
| 1 | App Header (Nav) | `apps/web/src/components/layout/app-header.tsx:96, 133` | `useAuth().user` | `username` | Renders `<UserAvatar name={user?.username} />` with status ring. Does **not** pass `avatarUrl`. Only displays `username`. |
| 2 | Profile Page | `apps/web/src/app/(platform)/profile/page.tsx:43-50` | `useAuth().user` | `username` | Renders `<UserAvatar name={displayName} />` (hardcoded fallback 'Alex Singer'). Does **not** pass `avatarUrl`. Hardcoded mock bio & stats. |
| 3 | Room Cards | `apps/web/src/components/shared/room-card.tsx:112` | `room.host` | `username, avatar` | Renders host avatar and `Hosted by {hostUsername}`. |
| 4 | Room Preview Dialog | `apps/web/src/components/rooms/room-preview-dialog.tsx:145` | `room.host` | `username, avatar` | Renders host avatar, username, and verification badge. |
| 5 | Room Member List | `apps/web/src/components/shared/room-member-list.tsx:201-218` | `RoomMembershipDto.user` | `username, avatar` | Renders avatar with voice speaking ring and `username`. Shows `(You)` and `Host` badge. |
| 6 | Queue Items | `apps/web/src/features/karaoke/components/QueueItem.tsx:106-115` | `RoomQueueItemDto.requestedBy / singer` | `displayName \|\| username` | Renders `displayName || username`. Shows `You` if matching current user. |
| 7 | Singer Turn Indicator (Spotlight) | `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx:93, 313` | `currentSinger` | `displayName \|\| username, avatar` | Displays active performer avatar and name. Shows `You are on stage!` if singer is current user. |
| 8 | Room Chat Panel | `apps/web/src/components/chat/room-chat-panel.tsx:184` | `ChatMessageDto` | `senderUsername, senderRole` | Displays `senderUsername` and role pill (`HOST`). Does **not** display sender avatar. |
| 9 | Activity Timeline | `apps/web/src/components/chat/room-activity-timeline.tsx:88` | `RoomActivityDto.actor` | `username, avatar` | Displays actor avatar and username for room events (join/leave/queue). |
| 10 | Stage Reactions Overlay | `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx:129` | `StageReactionNewPayload.sender` | `username` | Floating emojis show sender username pill unless `isSelf`. |
| 11 | Virtual Gifts Celebration | `apps/web/src/features/karaoke/components/StageGiftOverlay.tsx:46` | `GiftNewPayload.sender / recipient` | `displayName \|\| username` | Banner proclaims `{sender} sent {gift} to {recipient}!`. |
| 12 | Voice Participants Grid | `apps/web/src/features/voice/components/voice-participants.tsx:100` | `LiveKit VoiceParticipant` | `displayName \|\| username` | Renders audio indicator and initials from `displayName || username`. |

---

## 7. Identity Consistency & Snapshot Behavior Audit

**Status:** **CONFIRMED**

### 7.1 Authoritative Identity vs Snapshots

Identity information in KTVOnline splits into two tiers:
1. **Authoritative (Live) Identity:** Stored in MongoDB `UserModel` (`username`, `avatar`, `preferences`). Retrieved on login and via `/api/users/:id`.
2. **Snapshot Identity:** Embedded at the moment of an interaction:
   - **Chat Messages:** Stored with `senderUsername` and `senderAvatar` in `RoomMessageModel` (`apps/api/src/modules/chat/chat.service.ts:160`). Historical messages never automatically update if the user changes their name.
   - **Queue Items:** Captured when song is queued (`RoomQueueItemModel`). However, `karaoke.service.ts` uses `.populate('requestedBy', 'username displayName avatar')`, so queue queries **do reflect live updates** upon population!
   - **Socket.IO Sessions:** `socket.data.user` is loaded on socket handshake in `socket.auth.ts:66`. If a user updates their profile mid-session, their active socket still emits the old snapshot until re-authentication.
   - **Stage Reactions & Gifts:** Ephemeral Socket.IO broadcasts that copy `socket.data.user`. They are never written to MongoDB.

### 7.2 Naming Inconsistency
- Some components (`room-member-list.tsx`, `room-chat-panel.tsx`, `room-card.tsx`) only check `.username`.
- Other components (`QueueItem.tsx`, `SingerTurnIndicator.tsx`, `StageGiftOverlay.tsx`, `use-voice-client.ts`) evaluate `.displayName || .username`.
- Result: Even if a user could have a `displayName`, half the application would continue rendering lowercase `username`.

### 7.3 Avatar Inconsistencies
- `UserAvatar` handles fallbacks cleanly with two-letter uppercase initials and a gradient background.
- But `app-header.tsx` and `profile/page.tsx` omit `avatarUrl` when rendering `UserAvatar`, meaning initials are **always displayed** even if the user has an avatar!
- `room-chat-panel.tsx` omits avatars entirely to maintain a compact text layout.

---

## 8. Privacy & Security Audit

**Status:** **CONFIRMED**

### 8.1 Confirmed Findings & Potential Vulnerabilities

1. **Email Exposure Protection:** **CONFIRMED SECURE.** `UserController.getProfile` (`apps/api/src/modules/users/user.controller.ts:24`) explicitly strips `email` when `req.user.id !== userId`. Email is never returned to third parties.
2. **Viewing Preferences Exposed in Public Profile:** **CONFIRMED ISSUE.** `GET /api/users/:id` returns the full user document (excluding passwordHash and email). This unintentionally exposes `preferences.lyricsFontSize`, `preferences.visualEffectsIntensity`, `showReactions`, and `showGifts` to any viewer. These are client-side UI configurations that should remain private.
3. **Privilege Escalation Guard:** **CONFIRMED SECURE.** `CreateUserSchema` and `UpdateUserSchema` do not accept `role` or `status` from standard client requests. Roles are defaulted server-side to `'user'`.
4. **Unconstrained Avatar URLs:** **POTENTIAL RISK.** `avatar` in `UpdateUserSchema` is validated only via `z.string().url()`. A malicious user could supply `javascript:...` (blocked by modern browsers for img src, but bad practice) or arbitrary tracking URLs. Mitigation: Validate protocols (`http:`, `https:`) and enforce maximum length (e.g. 500 chars).
5. **No Existing Privacy Settings:** **CONFIRMED.** There is no privacy toggle (e.g. `isProfilePublic`, `showMusicTaste`) in the current schema.

---

## 9. Performance History & Statistics Audit

**Status:** **CONFIRMED**

### 9.1 Evaluation of Profile Stats

The `/profile` page displays:
- "142 Songs Sung"
- "28 Lounges Hosted"
- "1,480 Cheers Received"
- "Top Genre: Pop / Rock"
- "Recent Lounge Sing-Alongs: Blinding Lights (96%), Gurenge (98%), Bohemian Rhapsody (92%)"

**Finding:**
- **Every single one of these values is hardcoded mock data** in `apps/web/src/app/(platform)/profile/page.tsx` lines 27-31 and 99-125.
- There is **no scoring engine or performance grade table** anywhere in the database.
- There is **no cheer/reaction counter** tracked per user in MongoDB (reactions are strictly ephemeral Socket.IO broadcasts).
- While `RoomModel.countDocuments({ ownerId: userId })` could accurately compute "Lounges Hosted", and `RoomQueueItemModel.countDocuments({ requestedBy: userId, status: 'completed' })` could estimate "Songs Sung", there is **no persisted history of scores, cheering tallies, or performance evaluations**.

**Recommendation for Sprint 3.7:**
- Do **not** invent a fake analytics scoring engine.
- Replace mock statistics with authentic, derivable metrics (e.g. "Lounges Hosted", "Member Since", "Favorite Genres", "Preferred Participation Style") or clearly identified participation badges.
- Defer vocal pitch scoring to a future dedicated performance evaluation sprint.

---

## 10. Reusable Modules & Components Inventory

**Status:** **CONFIRMED**

| Module / Component | Path | Status | Reusability in Sprint 3.7 |
|---|---|---|---|
| `UserAvatar` | `apps/web/src/components/shared/user-avatar.tsx` | Production ready | Primary avatar display component. Supports sizes (`sm`, `md`, `lg`, `xl`), initials fallback, and status rings. |
| `PersonalPreferencesCard` | `apps/web/src/components/profile/personal-preferences-card.tsx` | Complete (Sprint 3.5) | Fully functional preference management panel. Reusable as the "Karaoke Taste & Stage Preferences" section of the profile. |
| `useAuth` / `useAuthStore` | `apps/web/src/hooks/use-auth.ts`, `apps/web/src/stores/use-auth-store.ts` | Complete | Client auth state manager. Can be extended to store `displayName` and `avatar` properly. |
| `useCurrentUser` | `apps/web/src/hooks/queries/use-current-user.ts` | Complete | Query hook for authenticated user. |
| `userService.update` | `apps/api/src/modules/users/user.service.ts:43` | Complete in service | Needs only an exposed controller and route (`PATCH /api/users/me`) with schema validation. |
| `queryKeys.users` | `apps/web/src/hooks/queries/query-keys.ts:22` | Complete | Ready for `useUserProfile(userId)` and `useUpdateProfile()`. |
| `GENRE_METADATA` | `packages/contracts/src/preferences.ts:33` | Complete | Provides rich icons and labels for user's favorite genres on profile. |

---

## 11. Product Gap Analysis for Sprint 3.7

Based on actual source inspection:

### Gap A: Core Identity
- **Missing `displayName`:** Users need a human-friendly display name (allowing spaces, proper casing, and accents, 2-32 chars) separate from their unique lowercase `username`.
- **Missing `bio`:** Users need an optional short introduction / bio (max 160-200 chars).
- **Missing Profile Edit Experience:** Users currently have **no UI** to change their display name, bio, or avatar.
- **Missing Public Profile View:** There is no route or modal allowing users in a room to click on a participant/host and view their karaoke profile.

### Gap B: Avatar Experience
- Since there is no image upload pipeline or object storage in KTVOnline, Sprint 3.7 should provide:
  1. A curated collection of stylish karaoke/nightlife avatar presets (e.g. Neon Singer, Cyber DJ, Disco Diva, Vinyl Chill, Retro Mic, Rockstar).
  2. An optional custom image URL input with validation.
  3. Clean initials fallback when no avatar is set.

### Gap C: Karaoke Identity
- Seamlessly bridge Sprint 3.5 preferences into the profile:
  - Display the user's favorite music genres and languages as badges.
  - Display their participation style (`Singing Focus`, `Audience Fan`, `Balanced Lounge Lover`).
  - Keep client viewing preferences (`lyricsFontSize`, `visualEffectsIntensity`) strictly private.

### Gap D: Identity Across Rooms
- Update room surfaces (`room-member-list.tsx`, `room-chat-panel.tsx`, `room-card.tsx`, `SingerTurnIndicator.tsx`) to consistently display:
  `displayName || username`.
- Pass `avatarUrl` to `UserAvatar` in `app-header.tsx` and `profile/page.tsx`.

---

## 12. Technical Risks & Dependencies

| Risk | Likelihood | Impact | Evidence | Mitigation Strategy |
|---|---|---|---|---|
| **Breaking Backward Compatibility** | Low | High | `UserModel` and `UserDto` lack `displayName` and `bio`. | Make `displayName` and `bio` strictly **optional** with safe fallbacks (`displayName || username`). Existing user records continue functioning seamlessly. |
| **Auth Middleware Identity Truncation** | High | Medium | `auth.middleware.ts:24` selects only `status role username`. | Update query projection in `auth.middleware.ts` to include `avatar displayName bio` so `GET /api/auth/me` supplies complete session identity. |
| **Stale Socket Session Identity** | Medium | Low | `socket.data.user` cached at handshake. | Profile changes update MongoDB immediately. Add client query invalidation (`queryKeys.auth.currentUser()`). Full session reload refreshes socket handshake. |
| **Public Exposure of Private UI Settings** | Medium | Medium | `user.controller.ts:22` returns full user JSON to third parties. | Sanitize public user profile responses to return only `{ id, username, displayName, avatar, bio, createdAt, karaokeTaste: { genres, languages, style } }`. Exclude internal UI viewing preferences. |
| **Unvalidated Avatar URLs** | Low | Low | `z.string().url()` allows arbitrary schemes. | Restrict URL schemes to `http:` and `https:`, with a reasonable string length limit (max 500 chars). |

---

## 13. Recommended Sprint 3.7 Implementation Scope

### Must Have (Core Deliverables)
1. **Contract Extensions (`packages/contracts`):**
   - Add `displayName` (optional string, 2-32 chars) and `bio` (optional string, max 160 chars) to `UserDtoSchema`.
   - Add `UpdateProfileSchema` (`displayName`, `bio`, `avatar`).
   - Create `PublicUserProfileDtoSchema` separating public karaoke identity from private account fields.
2. **Backend API (`apps/api`):**
   - Extend `UserModel` with `displayName` (trimmed, default null) and `bio` (trimmed, default null).
   - Update `auth.middleware.ts` to include `displayName` and `avatar` in `req.user`.
   - Implement `PATCH /api/users/me` (authenticated, validated via `UpdateProfileSchema`).
   - Sanitize `GET /api/users/:id` to return public profile fields only.
3. **Frontend Profile Redesign (`apps/web`):**
   - Build an interactive "Edit Profile" modal/card on `/profile` allowing users to edit `displayName`, `bio`, and select an avatar (curated presets or custom URL).
   - Connect `useUpdateProfile` mutation with instant TanStack Query cache invalidation (`queryKeys.auth.currentUser()`, `queryKeys.users.all`).
   - Fix `app-header.tsx` and `profile/page.tsx` to pass `avatarUrl` to `UserAvatar`.
4. **Cross-Room Consistency:**
   - Standardize display name resolution (`user.displayName || user.username`) across member list, chat, room cards, and singer spotlight.

### Should Have
- **Public Profile Modal / Drawer:** A lightweight popover or sheet accessible by clicking a user's avatar in `room-member-list.tsx` or `QueueItem.tsx`, showing their bio, favorite genres, and host role without navigating away from the karaoke lounge.
- **Curated Avatar Selector:** A grid of 8-10 preset SVG/PNG nightlife avatar options so users don't need to host external image URLs.

### Deferred / Explicitly Out of Scope
- File upload pipeline (S3, Cloudinary, Multer, binary uploads).
- Karaoke pitch scoring, song grading, or vocal accuracy statistics (requires audio analysis engine).
- Social follower / friend graph systems.
- Complex multi-tiered privacy permissions.

---

## 14. Proposed Implementation Order

```
Phase 1: Contracts & Validation
└── Extend user schemas with displayName, bio, and UpdateProfileSchema in @ktv/contracts.

Phase 2: Backend Persistence & Endpoints
├── Update UserModel and user.types.ts with displayName and bio.
├── Update auth.middleware.ts to include displayName and avatar in req.user.
├── Implement PATCH /api/users/me in user.controller.ts & user.routes.ts.
└── Sanitize GET /api/users/:id to protect private viewing preferences.

Phase 3: Frontend API & State Integration
├── Add updateProfile method to userApi in apps/web.
├── Implement useUpdateProfile mutation hook with query invalidation.
└── Update useAuthStore and useCurrentUser to handle displayName and avatar.

Phase 4: Profile Page Experience Redesign
├── Replace hardcoded mock stats with authentic account and karaoke identity data.
├── Implement ProfileEditCard / Dialog with display name, bio, and avatar picker.
└── Fix avatarUrl binding in app-header.tsx and profile/page.tsx.

Phase 5: In-Room Identity Consistency & Public Profile Preview
├── Ensure room member list, chat, queue, and singer spotlight consistently render displayName.
└── Implement lightweight UserProfileModal for viewing participant profiles inside rooms.

Phase 6: Static Verification & Documentation
└── Execute pnpm typecheck and pnpm lint; produce SPRINT_3_7_IMPLEMENTATION_REPORT.md.
```

---

## 15. Final Audit Verdict

**AUDIT COMPLETE**

