# KTVOnline — Sprint 5.0: Implementation Report

## 1. Executive Purpose & Scope

Sprint 5.0 delivers the **Private Karaoke Lounges & Social Invitations** architecture for KTVOnline, advancing the core product promise:
> *"Your Virtual Hangout. Your Karaoke Night."*

This implementation enables authenticated users to create private karaoke lounges, generate secure invitation links, preview lounge metadata safely without leaking sensitive information, and join private stages under strict server-side validation and atomic capacity rules.

In strict compliance with the Code-Only Development Policy:
- No test files were created or modified.
- No automated test runners were executed.
- No production builds were run.
- MongoDB database name was preserved strictly as `test`.
- No new infrastructure (e.g. Redis) was introduced.
- Existing Outbox and LiveKit architectures were preserved intact.

---

## 2. Architecture & Implementation Summary

### 2.1 Shared Contracts (`packages/contracts`)
- Created `packages/contracts/src/invitation.ts`:
  - `InvitationStatusSchema`: `['active', 'expired', 'revoked']`
  - `InvitationPreviewStatusSchema`: `['valid', 'expired', 'revoked', 'room_closed', 'room_full', 'invalid']`
  - `CreateInvitationSchema`: Zod validation for expiration window (1–168 hours, default 48 hours).
  - `CreateInvitationResponseSchema`: DTO returning raw token once, expiration time, and room reference.
  - `RoomInvitationDtoSchema`: Host-facing DTO showing invitation status, expiration, and timestamps without leaking raw tokens or hashes.
  - `InvitationPreviewDtoSchema`: Guest-facing preview DTO delivering safe room metadata and invitation validity.
  - `JoinRoomWithInviteSchema`: Body schema accepting optional `inviteToken`.
- Re-exported all schemas in `packages/contracts/src/index.ts`.

---

### 2.2 Backend (`apps/api`)
1. **Persistence & Schema (`invitation.model.ts`):**
   - Mongoose collection `roominvitations` storing `roomId`, `tokenHash`, `createdBy`, `expiresAt`, `revokedAt`, and `status`.
   - Unique index on `tokenHash: 1`.
   - Compound index on `{ roomId: 1, status: 1 }`.
   - `toJSON` transform ensures `tokenHash` is purged from all serializations.
2. **Cryptographic Token Engine (`invitation.service.ts`):**
   - Raw tokens generated via `crypto.randomBytes(24).toString('base64url')` (192 bits of cryptographic entropy).
   - Stored in database exclusively as SHA-256 hex digest (`crypto.createHash('sha256').update(token).digest('hex')`).
   - Host-only authorization: only the current `room.ownerId` can generate or revoke invitations.
   - Idempotent revocation: generating a new invitation atomically revokes any previous active invitation for that lounge.
3. **Invitation Preview Service (`invitation.service.ts`):**
   - Resolves token hash and validates expiration, revocation, and room status.
   - Returns safe room metadata (name, description, category, roomType, visibility, capacity, participant count, status, atmosphere, host).
   - Evaluates caller state if authenticated (identifies whether caller is host, existing active member, or kicked).
   - Previews do not create database membership or mutate participant counts.
4. **Enhanced Room Join Integration (`room.service.ts`):**
   - Extended `joinRoom(roomId, userId, inviteToken?)` with rigorous evaluation order:
     1. Verify room exists and is not closed (`ROOM_NOT_FOUND` / `ROOM_CLOSED`).
     2. Verify if user is already an active member; if so, return existing membership idempotently without consuming capacity.
     3. Verify moderation status; kicked members are rejected with `FORBIDDEN_KICKED` even if holding an invite token.
     4. Verify room lock; locked rooms reject non-owners (`ROOM_LOCKED`).
     5. If room is private and caller is not owner, require and validate `inviteToken`. Invalid/expired/revoked tokens are rejected with HTTP 403 / 410.
     6. Atomic capacity reservation via `findOneAndUpdate({ _id, status: { $ne: 'closed' }, $expr: { $lt: ['$currentParticipantsCount', '$capacity'] } })`.
     7. Create/reactivate membership record with rollback on failure.
5. **Controllers & Endpoints:**
   - `POST /api/v1/rooms/:id/invitations`: Host creates/rotates invitation (returns raw token).
   - `GET /api/v1/rooms/:id/invitations`: Host checks active invitation status.
   - `POST /api/v1/rooms/:id/invitations/revoke`: Host revokes invitation.
   - `DELETE /api/v1/rooms/:id/invitations`: Host revokes invitation.
   - `GET /api/v1/invitations/:token`: Public/rate-limited invitation preview.
   - `POST /api/v1/invitations/:token/join`: Join room via invitation token.
   - `POST /api/v1/rooms/:id/join`: Standard room join extended to accept `{ inviteToken?: string }`.
6. **Rate Limiting (`rate-limiter.middleware.ts`):**
   - Configured `invitationPreviewRateLimiter` limiting IPs to 60 preview queries per 15-minute window using `express-rate-limit`.

---

### 2.3 Frontend (`apps/web`)
1. **API Endpoints & TanStack Query Hooks:**
   - `apps/web/src/lib/api/endpoints/invitations.ts`: Typed API client methods for invitation operations.
   - `apps/web/src/hooks/queries/use-invitation.ts`: Hooks for `useActiveInvitation`, `useCreateInvitation`, `useRevokeInvitation`, `useInvitationPreview`, and `useJoinViaInvitation`.
   - Updated `query-keys.ts` with cache invalidation keys for invitations.
2. **Host Invitation Dialog (`InviteFriendsDialog`):**
   - Created `apps/web/src/components/rooms/invite-friends-dialog.tsx`:
     - Displays invitation status (Active, Expired, Revoked, or None).
     - Allows host to select expiration (24h, 48h, 7d).
     - One-click copy with clipboard API, visual checkmark feedback, and manual fallback.
     - Revoke and replace actions.
     - Explanatory state for non-host members in private and public rooms.
     - Mobile-optimized modal with safe areas and >=44px touch targets.
3. **Room Interface Integration (`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`):**
   - Connected header Share button and added an "Invite" button for hosts to open `InviteFriendsDialog`.
4. **Invitation Landing & Preview Page (`apps/web/src/app/invite/[token]/page.tsx`):**
   - Modern, responsive landing page styled with ambient glow and room atmosphere presets.
   - Clear room identity, genre badges, host card, and live singer capacity bar.
   - Exhaustive handling of all failure states:
     - Invalid token card with redirect to public discovery.
     - Expired token card with host re-issuance instructions.
     - Revoked token card.
     - Room closed and room full states.
     - Kicked user access restriction card.
     - Sign-in CTA for unauthenticated guests with redirect back to invite URL.
     - Seamless one-click join CTA for authenticated guests.

---

## 3. Changeset Inventory

| File Path | Component | Description of Modification |
| :--- | :--- | :--- |
| `packages/contracts/src/invitation.ts` | Shared Contracts | New Zod schemas and TypeScript DTOs for invitations |
| `packages/contracts/src/index.ts` | Shared Contracts | Re-exported invitation contracts |
| `packages/contracts/package.json` | Shared Contracts | Updated `types` and `exports` mapping to point to `src/index.ts` |
| `apps/api/src/modules/rooms/invitation.types.ts` | Backend API | Mongoose document interface `IRoomInvitationDocument` |
| `apps/api/src/modules/rooms/invitation.model.ts` | Backend API | Mongoose model with SHA-256 token hash indexing |
| `apps/api/src/modules/rooms/invitation.service.ts` | Backend API | Cryptographic token generation, preview, and validation service |
| `apps/api/src/modules/rooms/invitation.controller.ts` | Backend API | HTTP controllers for invitation preview, management, and joining |
| `apps/api/src/modules/rooms/invitation.routes.ts` | Backend API | Express router for `/api/v1/invitations` |
| `apps/api/src/modules/rooms/room.routes.ts` | Backend API | Added room invitation management routes and validated join body |
| `apps/api/src/modules/rooms/room.validation.ts` | Backend API | Exported `CreateInvitationSchema` and `JoinRoomWithInviteSchema` |
| `apps/api/src/modules/rooms/room.service.ts` | Backend API | Extended `joinRoom` with invitation token verification |
| `apps/api/src/modules/rooms/room.controller.ts` | Backend API | Parsed `inviteToken` and mapped invitation error responses |
| `apps/api/src/middlewares/rate-limiter.middleware.ts`| Backend API | Added `invitationPreviewRateLimiter` (60 req / 15 min) |
| `apps/api/src/routes/index.ts` | Backend API | Mounted `/invitations` router |
| `apps/web/src/lib/api/endpoints/invitations.ts` | Frontend Web | Client API methods for invitations |
| `apps/web/src/lib/api/endpoints/rooms.ts` | Frontend Web | Extended `joinRoom` to accept `inviteToken` |
| `apps/web/src/hooks/queries/query-keys.ts` | Frontend Web | Added query key cache definitions for invitations |
| `apps/web/src/hooks/queries/use-invitation.ts` | Frontend Web | TanStack Query hooks for invitation queries and mutations |
| `apps/web/src/components/rooms/invite-friends-dialog.tsx`| Frontend Web | Host invitation management dialog |
| `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` | Frontend Web | Hooked up invite actions and dialog in room lounge |
| `apps/web/src/app/invite/[token]/page.tsx` | Frontend Web | Dedicated invitation landing and preview page |

---

## 4. Static Validation Results

- **Command:** `pnpm typecheck`
  - Result: **0 errors** across `@ktv/contracts`, `apps/api`, and `apps/web`.
- **Command:** `pnpm lint`
  - Result: **0 errors, 0 warnings** across all packages.
