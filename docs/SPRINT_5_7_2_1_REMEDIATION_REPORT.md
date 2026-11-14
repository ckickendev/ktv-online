# KTVOnline — Sprint 5.7.2.1: Phase 2 Audit Remediation Report

## 1. Executive Summary

This remediation sprint resolves all three source-level findings identified during the **Sprint 5.7.2 Independent Source Audit** for the Friend Activity Dashboard.

All modifications are strictly scoped to the frontend client application without expanding scope, modifying tests, executing production builds, or mutating the database. The MongoDB database name remains `test`.

---

## 2. Baseline & Repository Integrity

- **Audit Baseline Commit:** `eb47cad` (Sprint 5.7 Phase 2 implementation)
- **Audit Documentation Baseline:** `1b1f775` (Sprint 5.7.2 Independent Source Audit)
- **Target Branch:** `main`
- **Database:** `test` (zero migrations, zero writes)
- **Backend Invitation Security:** Unchanged. All authoritative server-side checks (recipient validation, mutual exclusivity, capacity, authorization) remain intact.

---

## 3. Remediation Details by Finding

### 3.1. AUD-ACT-01 — High: Friend Presence Cache Updater Query Key Scope & Defensive Handling

- **Files Changed:**
  - `apps/web/src/hooks/queries/query-keys.ts`
  - `apps/web/src/features/friends/hooks/use-friends.ts`
- **Root Cause:**
  `handlePresenceUpdated` in `useFriends` targeted `{ queryKey: queryKeys.friends.all }` (`['friends']`). In TanStack Query, prefix matching triggered this paginated updater on every query starting with `['friends']`, including incoming requests (`queryKeys.friends.incoming`), outgoing requests, and pending invitations. Because `incoming` requests hold `FriendRequestDto` items where `item.friend` is `undefined`, evaluating `item.friend.id === payload.userId` threw an unhandled synchronous `TypeError: Cannot read properties of undefined (reading 'id')` whenever a presence event arrived while `/friends` query caches were active.
- **Remediation Implemented:**
  1. Defined `queryKeys.friends.lists()` in `query-keys.ts` (`['friends', 'list'] as const`) to match all friend list queries without matching `incoming`, `outgoing`, `search`, or `pendingInvitations`.
  2. Updated `useFriends` to target `{ queryKey: queryKeys.friends.lists() }` exclusively.
  3. Added array verification `Array.isArray(oldData.items)`.
  4. Added defensive item-level property verification:
     ```typescript
     if (!item || !item.friend || typeof item.friend !== 'object' || !item.friend.id) {
       return item;
     }
     ```
  5. Preserved timestamp ordering comparisons (`new Date(payload.updatedAt).getTime() < new Date(item.friend.presence.updatedAt).getTime()`).
  6. Preserved reconnect snapshot invalidation and listener cleanup.

---

### 3.2. AUD-ACT-02 — Medium: Enforce Client Credential Precedence on Room Join

- **File Changed:**
  - `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`
- **Root Cause:**
  `handleJoin` extracted both `invitationId` and `inviteToken` from `useSearchParams()` and forwarded both in the join payload (`{ roomId, invitationId, inviteToken }`). When both parameters were present in the URL (e.g. from copy-pasting or URL tampering), the backend controller correctly failed closed with 400 Bad Request (`Cannot provide both inviteToken and invitationId`), surfacing a generic join failure to the user.
- **Remediation Implemented:**
  Enforced deterministic client-side credential precedence:
  ```typescript
  const rawInvitationId = searchParams?.get('invitationId')?.trim();
  const rawInviteToken = searchParams?.get('inviteToken')?.trim();

  // Enforce client credential precedence: invitationId takes precedence as sole credential
  const invitationId = rawInvitationId ? rawInvitationId : undefined;
  const inviteToken = invitationId ? undefined : (rawInviteToken ? rawInviteToken : undefined);

  await joinMutation.mutateAsync({ roomId, invitationId, inviteToken });
  ```
  - If a valid `invitationId` is present, it is dispatched as the sole credential.
  - If `invitationId` is absent and `inviteToken` is present, `inviteToken` is dispatched as the sole credential.
  - Both credentials are never dispatched in the same request.
  - Normal non-invitation joins and server-side mutual exclusivity checks remain intact.

---

### 3.3. AUD-ACT-03 — Low: Safe Invitation Expiration Formatting

- **File Changed:**
  - `apps/web/src/features/friends/components/pending-invitations-inbox.tsx`
- **Root Cause:**
  `formatExpiresIn` did not validate timestamp parsing results. If an unparseable or missing date string was passed, `new Date(expiresAt).getTime()` evaluated to `NaN`, causing comparison branches to fail and returning `"Expires in NaNd"`.
- **Remediation Implemented:**
  Added null/empty checks and a `Number.isNaN(timestamp)` guard:
  ```typescript
  function formatExpiresIn(expiresAt: string | null | undefined): string {
    if (!expiresAt) return 'Expired';
    const timestamp = new Date(expiresAt).getTime();
    if (Number.isNaN(timestamp)) return 'Expired';
    const diffMs = timestamp - Date.now();
    if (diffMs <= 0) return 'Expired';
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return 'Expires in < 1m';
    if (diffMinutes < 60) return `Expires in ${diffMinutes}m`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Expires in ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Expires in ${diffDays}d`;
  }
  ```
  Guarantees that invalid or malformed timestamps safely render `"Expired"` with zero chance of rendering `NaN`.

---

## 4. Confirmation of Backend Security Posture

- Backend invitation authorization in `apps/api/src/modules/rooms/invitation.service.ts` was **not modified**.
- Server-side mutual exclusivity check in `apps/api/src/modules/rooms/room.controller.ts` and `room.service.ts` remains active and enforces fail-closed rejection.
- Server-side privacy masking in `apps/api/src/realtime/global-presence.manager.ts` remains active.
- Recipient identity validation in `validateRecipientInvitationById` remains unchanged.

---

## 5. Static Verification Results

### 5.1. TypeScript Verification (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 1.1s
apps/api typecheck$ tsc --noEmit
└─ Done in 3.1s
apps/web typecheck$ tsc --noEmit
└─ Done in 3.8s
```
**Status: PASSED (0 errors across contracts, API, and web)**

### 5.2. ESLint Verification (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
```
**Status: PASSED (0 warnings, 0 errors)**

---

## 6. Audit Finding Status Update

| Finding | Severity | Audit Status | Post-Remediation Status |
| :--- | :--- | :--- | :--- |
| **AUD-ACT-01** | High | Confirmed Defect | **RESOLVED** (Scoped to `queryKeys.friends.lists()`, items defensively validated) |
| **AUD-ACT-02** | Medium | Architectural Limitation | **RESOLVED** (Client-side credential precedence strictly enforced) |
| **AUD-ACT-03** | Low | Recommendation | **RESOLVED** (`Number.isNaN` and empty guards added, zero NaN rendering) |

---

## 7. Remaining Risks & Runtime Limitations

- In accordance with the Code-Only Development Policy, no browser test runners or production builds were executed.
- Canonical technical debt items `HIST-01` through `HIST-07` remain documented and open.

---

## 8. Final Verdict

**REMEDIATION COMPLETE — STATIC VERIFICATION PASSED**
