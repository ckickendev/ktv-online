# KTVOnline — User Identity Architecture

## 1. Overview & Product Vision

In KTVOnline, identity is the foundation of the shared virtual karaoke lounge experience:
> **"One user, one recognizable identity, everywhere."**

Every user must have a coherent, personal, and editable stage presence across all surfaces:
- Their personal profile page (`/profile`).
- Room discovery cards and preview modals.
- In-room membership rosters.
- The live karaoke stage and singer spotlight.
- The shared song queue.
- Live room chat and activity timelines.
- Real-time social reactions and virtual gift announcements.

---

## 2. Data Model & Storage

### 2.1 Persistence Layer (`apps/api`)
User identity fields reside directly within `UserModel` (`users` collection in MongoDB):

| Field | Type | Restrictions | Description |
|---|---|---|---|
| `username` | `String` | Required, unique, 3-30 chars, alphanumeric | Unique platform handle (e.g., `@vocalist_queen`) |
| `displayName` | `String` | Optional/Nullable, 2-32 chars | Custom stage / display name (e.g., `Queen of Rock`) |
| `bio` | `String` | Optional/Nullable, max 160 chars | Stage introduction, musical style, vocal trivia |
| `avatar` | `String` | Optional/Nullable, URL max 500 chars | Curated preset URL or custom image URL |
| `role` | `String` | Enum: `'user' \| 'admin' \| 'moderator'` | Platform authority role |
| `status` | `String` | Enum: `'active' \| 'suspended' \| 'offline' \| 'online'` | Account status |

### 2.2 Backward Compatibility & Identity Resolution
To preserve 100% backward compatibility for all existing accounts without `displayName`:
```ts
const effectiveName = user.displayName || user.username;
```
- If `displayName` is null, empty, or undefined, all UI and API surfaces seamlessly fall back to `username`.
- If `avatar` is null or undefined, the `<UserAvatar />` component deterministically computes a 2-letter uppercase initials monogram with an atmospheric gradient ring.

---

## 3. Shared Contracts (`packages/contracts`)

### 3.1 Schemas & DTOs
- **`UpdateProfileSchema`**:
  ```ts
  export const UpdateProfileSchema = z.object({
    displayName: z.string().trim().min(2).max(32).optional().nullable(),
    bio: z.string().trim().max(160).optional().nullable(),
    avatar: z.string().trim().url().max(500).optional().nullable(),
  });
  ```
- **`PublicUserProfileDtoSchema`**:
  Exposes public identity while strictly excluding private fields (`email`, `passwordHash`, `preferences.lyricsFontSize`, `preferences.visualEffectsIntensity`):
  ```ts
  export const PublicUserProfileDtoSchema = z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    role: UserRoleSchema,
    createdAt: z.string().datetime(),
    favoriteGenres: z.array(z.string()).optional(),
    favoriteLanguages: z.array(z.string()).optional(),
    participationStyle: z.string().optional(),
  });
  ```
- **`HostDtoSchema`**:
  Extended to include `displayName: z.string().nullable().optional()`.
- **`StageReactionSenderSchema` & `GiftSenderSchema`**:
  Extended to broadcast `displayName: z.string().nullable().optional()`.

---

## 4. API & Realtime Architecture

### 4.1 Endpoints
1. `PATCH /api/users/me`:
   - Requires JWT authentication (`requireAuth`).
   - Validates body against `UpdateProfileSchema`.
   - Updates `displayName`, `bio`, and `avatar`.
   - Returns updated `UserDto`.
2. `GET /api/users/:id`:
   - If querying own profile (`req.user?.id === userId`), returns full `UserDto`.
   - If querying another user's profile, returns sanitized `PublicUserProfileDto`.
3. `GET /api/auth/me`:
   - Returns `CurrentUserDto` with `displayName`, `bio`, and `avatar`.

### 4.2 Auth Middleware Projection
`auth.middleware.ts` projects `'status role username displayName avatar bio'` from the database to attach directly to `req.user`.

### 4.3 Realtime Identity Propagation
- **Socket Authentication (`socket.auth.ts`)**: Projects `displayName` and `avatar` onto `socket.data.user`.
- **LiveKit Voice Tokens (`voice.service.ts`)**: Passes `displayName` and `avatar` into participant identity metadata.
- **Room Membership (`membership.model.ts`)**: Populates `displayName` and `avatar` on membership roster queries.
- **Queue & Playback (`room-queue-item.model.ts` & `karaoke.service.ts`)**: Populates `displayName` on `requestedBy` and `singer`.
- **Chat Messages (`chat.service.ts`)**: Stores `senderUsername: user.displayName || user.username` and `senderAvatar: user.avatar`.
- **Virtual Gifts (`gift.events.ts`)**: Broadcasts `sender.displayName: user.displayName || user.username`.
- **Stage Cheers (`stage-reaction.events.ts`)**: Broadcasts `sender.displayName: user.displayName || user.username`.

---

## 5. Frontend Presentation & User Experience

### 5.1 Profile Studio (`/profile`)
- Displays `stageName` (`user.displayName || user.username`), `@username`, and actual `memberSince` date.
- Renders authentic singer `bio` or prompt to set one.
- Displays live statistics:
  - Lounges Hosted (`useMyRooms`).
  - Top Music Taste (`useUserPreferences`).
  - Participation Style (`useUserPreferences`).
  - Stage Status.
- Connects to `ProfileEditDialog`.

### 5.2 Profile Edit Dialog (`ProfileEditDialog`)
- **Stage Name**: 2-32 character input with real-time length counter.
- **Singer Bio**: 0-160 character textarea with live counter.
- **Curated Avatar Presets**: 8 nightlife & karaoke styled presets (Neon Singer, Cyber DJ, Disco Diva, Rockstar, Vinyl Chill, Anime Idol, Retro Synth, Vocal Legend).
- **Custom Image URL**: Direct URL input with instant preview.
- **Reset to Initials**: One-click action to clear avatar and return to monogram fallback.
- **Live Preview Card**: Real-time rendering of stage name, handle, bio, and avatar.

### 5.3 Public Profile Modal (`UserProfileModal`)
- Modal accessible by clicking on any member in the in-room roster (`RoomMemberList`).
- Fetches and displays public singer identity via `usePublicUserProfile(userId)`.
- Presents stage name, username, member role, join date, singer bio, participation style, and favorite music genres.

### 5.4 In-Room Roster & Discovery Consistency
- `RoomMemberList`: Displays member stage names with `@username` secondary text, interactive profile view triggers, and speaking/singing indicators.
- `RoomCard` & `RoomPreviewDialog`: Formats host as `{host.displayName || host.username}` with avatar.
- `AppHeader`: Displays user's stage name and avatar with live link to Studio.
