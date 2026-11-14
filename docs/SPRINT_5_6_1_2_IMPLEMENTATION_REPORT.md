# Sprint 5.6.1.2: Implementation Report

## 1. Overview

- **Milestone:** Sprint 5.6.1.2: Invitation Identity Enforcement & Database Error Integrity
- **Baseline Commit:** `2ba32d7`
- **Target Branch:** `main`
- **Database:** `test` (MongoDB database name preserved)
- **Status:** Complete & Verified via Static Checks

---

## 2. Source Code Modifications Register

### 2.1 Backend (`apps/api`)

1. **`src/modules/rooms/invitation.service.ts`**:
   - `previewInvitation`:
     - Updated recipient guard to fail closed if `!requestingUserId || invitation.recipientId.toString() !== requestingUserId`.
     - Returns `{ invitation: { status: 'invalid' } }` without room details for unauthenticated or mismatched users.
   - `validateInvitation`:
     - Updated recipient guard to fail closed if `!requestingUserId || invitation.recipientId.toString() !== requestingUserId`.
     - Returns `{ valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' }`.
   - `resolveInvitationRoomId`:
     - Added optional `requestingUserId?: string` parameter.
     - Added recipient identity check to reject mismatched callers with `'INVITATION_RECIPIENT_MISMATCH'`.

2. **`src/modules/rooms/invitation.controller.ts`**:
   - In `joinViaInvitation`:
     - Passed `req.user.id` to `resolveInvitationRoomId(token, req.user.id)`.
     - Added `case 'INVITATION_RECIPIENT_MISMATCH': sendError(res, 'This invitation was issued to another user', 403); return;` in both error switches.

3. **`src/modules/rooms/room.controller.ts`**:
   - In `joinRoom`:
     - Added `case 'INVITATION_RECIPIENT_MISMATCH': sendError(res, 'This invitation was issued to another user', 403); return;`.

4. **`src/modules/friends/friendship.service.ts`**:
   - In `sendRequest`:
     - Replaced broad `name === 'MongoServerError'` predicate with precise `code === 11000 || codeName === 'DuplicateKey'`.
     - Ensures unrelated database errors propagate directly without triggering redundant queries.

---

## 3. Build & Static Verification Results

1. **Monorepo Typecheck:**
   ```bash
   pnpm typecheck
   ```
   *Result:*
   ```text
   Scope: 3 of 4 workspace projects
   packages/contracts typecheck: Done in 1.1s
   apps/api typecheck: Done in 1.4s
   apps/web typecheck: Done in 2.8s
   ```
   **Passed with 0 errors.**

2. **Monorepo Linting:**
   ```bash
   pnpm lint
   ```
   *Result:*
   ```text
   packages/contracts lint: Done in 782ms
   apps/web lint: Done in 1.1s (✔ No ESLint warnings or errors)
   apps/api lint: Done in 2.1s
   ```
   **Passed with 0 errors and 0 warnings.**

---

## 4. Development Policy Adherence

- Strict Code-Only Policy followed.
- Zero test files created or modified.
- Zero test runners executed.
- Zero production builds executed.
- Zero live database mutations or migrations executed.
- MongoDB database name remains `test`.
- No Redis or distributed infrastructure introduced.
