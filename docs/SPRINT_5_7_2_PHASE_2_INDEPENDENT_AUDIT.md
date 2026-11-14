# KTVOnline — Sprint 5.7.2: Phase 2 Independent Source Audit Report

## 1. Executive Summary

This report delivers the read-only independent source audit of **Sprint 5.7, Phase 2: Friend Activity Dashboard**.

The audit evaluates the implementation introduced in commit `eb47cad` against baseline commit `61eec7d` on branch `main`.

The audit verified data normalization, realtime presence ordering, reconnect recovery, pending invitation inbox management, dual-credential lounge joining, private lounge privacy boundaries, terminology compliance, and canonical technical debt preservation (`HIST-01` through `HIST-07`).

---

## 2. Repository State & Commit Ancestry

- **Target Branch:** `main`
- **Current HEAD:** `eb47cad93686f554df33f4158f88c1615c8e569b`
- **Working Tree:** Clean (`nothing to commit, working tree clean`)
- **Parent Commit:** `61eec7d` (`docs(audit): complete Sprint 5.7.1.1 independent security and integrity audit for Phase 1`)
- **Preceding Baseline:** `7f12209` (`feat(sprint-5.7): implement Phase 1 shared contracts and social invitation foundation`)
- **Database Target:** `test` (zero mutations, zero migrations executed)

### Commit Log Verification:
```
eb47cad feat(friends): implement Sprint 5.7 Phase 2 Friend Activity Dashboard
61eec7d docs(audit): complete Sprint 5.7.1.1 independent security and integrity audit for Phase 1
7f12209 feat(sprint-5.7): implement Phase 1 shared contracts and social invitation foundation
3e13764 docs(sprint-5.7.1): establish pre-implementation architecture clarifications and update planning report
8ac7ab2 fix(web): resolve contracts package entry and configure webpack extensionAlias
```

---

## 3. Files and Flows Inspected

### 3.1. Frontend Sources (Web Client)
- `apps/web/src/features/friends/hooks/use-friend-activity.ts`
- `apps/web/src/features/friends/hooks/use-friends.ts`
- `apps/web/src/features/friends/api/friends-api.ts`
- `apps/web/src/features/friends/components/friend-activity-section.tsx`
- `apps/web/src/features/friends/components/friend-activity-card.tsx`
- `apps/web/src/features/friends/components/pending-invitations-inbox.tsx`
- `apps/web/src/features/friends/components/friend-card.tsx`
- `apps/web/src/features/friends/components/invitation-notification-listener.tsx`
- `apps/web/src/features/friends/components/presence-status-badge.tsx`
- `apps/web/src/app/(platform)/friends/page.tsx`
- `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`
- `apps/web/src/hooks/queries/use-room.ts`
- `apps/web/src/hooks/queries/query-keys.ts`
- `apps/web/src/lib/api/endpoints/rooms.ts`
- `apps/web/src/lib/socket/socket-client.ts`

### 3.2. Backend & Contract Sources
- `packages/contracts/src/friendship.ts`
- `packages/contracts/src/realtime.ts`
- `packages/contracts/src/room.ts`
- `apps/api/src/realtime/friend.events.ts`
- `apps/api/src/realtime/global-presence.manager.ts`
- `apps/api/src/modules/rooms/invitation.service.ts`
- `apps/api/src/modules/rooms/room.service.ts`
- `apps/api/src/modules/rooms/room.controller.ts`
- `apps/api/src/modules/friends/friendship.controller.ts`
- `apps/api/src/modules/friends/friendship.service.ts`

---

## 4. Confirmed Correct Behaviors

### 4.1. Strict Mutual Exclusion in Activity Categorization
In `apps/web/src/features/friends/hooks/use-friend-activity.ts` (lines 48–73):
- A deterministic `switch (status)` partition guarantees that each friend is mapped to **exactly one** bucket (`singingNow`, `inLounges`, `availableOnline`, or `offline`).
- Performer status (`'singing'`) breaks before `'in_lounge'`, ensuring singing users are not double-counted as general lounge participants.
- Missing, undefined, or unmapped presence objects safely fall through to `case 'offline': default:`.
- Partition counts (`singingCount + inLoungeCount + onlineCount + offlineCount`) precisely equal `totalFriends`.

### 4.2. Authoritative Server-Side Privacy Masking
In `apps/api/src/realtime/global-presence.manager.ts` (lines 248–265):
- For private lounges (`isPrivate: true`) where the viewer is outside the room:
  - `roomId` is emitted as `null`.
  - `roomTitle` is hardcoded to `'Private Lounge'`.
  - `isPrivateLounge` is emitted as `true`.
  - `songTitle` is emitted as `null`.
- Non-occupant clients receive zero metadata regarding the song or private room identity.
- Client-side cards in `friend-activity-card.tsx` conditionally suppress "Join Lounge" links when `presence.isPrivateLounge` is `true`.

### 4.3. Dual-Credential Room Join Idempotency & Security
In `apps/api/src/modules/rooms/room.controller.ts` (lines 127–130) and `room.service.ts` (lines 367–369):
- The API strictly enforces mutual exclusivity: submitting both `inviteToken` and `invitationId` produces an immediate 400 Bad Request (`Cannot provide both inviteToken and invitationId`).
- `roomService.joinRoom` executes an atomic active membership check (`status: 'active'`). Rejoining or refreshing the page returns `alreadyJoined: true` without consuming capacity or creating duplicate membership records.
- Recipient identity is verified server-side against `invitation.recipientId`.

### 4.4. Pending Invitation Scoping & Dismissal Idempotency
In `apps/api/src/modules/rooms/invitation.service.ts` (lines 497–568, 574–620):
- `getPendingInvitationsForRecipient` is strictly scoped to `recipientId: recipientObjectId`, `status: 'active'`, and `expiresAt: { $gt: now }`.
- Neither raw tokens nor SHA-256 token hashes are exposed over API DTOs or realtime payloads.
- `dismissInvitationByRecipient` enforces `recipientId` authorization and executes an atomic conditional update (`findOneAndUpdate`), providing safe idempotency.

### 4.5. Complete Elimination of Obsolete "Watch Live" Terminology
- Static search across all `apps/` and `packages/` verified **0 occurrences** of `"Watch Live"`.
- Action buttons across performer and lounge cards uniformly render **"Join Lounge"**.
- Historical occurrences in `docs/` are confined to historical QA records and sprint specifications.

---

## 5. Audit Findings & Defect Register

### 5.1. Finding AUD-ACT-01: Overly Broad Query Cache Invalidation Filter in `useFriends`
- **Severity:** High
- **Classification:** Confirmed Defect
- **File Reference:** `apps/web/src/features/friends/hooks/use-friends.ts#L32-L41`
- **Description:**
  In `useFriends`, the realtime `friend:presence:updated` listener attempts to perform an in-place optimistic update:
  ```typescript
  const handlePresenceUpdated = (payload: FriendPresenceUpdatedPayload) => {
    queryClient.setQueriesData<PaginatedFriendsResponse>(
      { queryKey: queryKeys.friends.all },
      (oldData) => {
        if (!oldData?.items) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item) => {
            if (item.friend.id === payload.userId) { // <--- RUNTIME ERROR HERE
  ```
  `queryKeys.friends.all` is defined as `['friends']` in `query-keys.ts`. React Query's `setQueriesData` matches **all** queries starting with `['friends']`, which includes:
  1. `queryKeys.friends.list(...)` (`['friends', 'list', ...]`), where items are `FriendshipDto` (`item.friend` exists).
  2. `queryKeys.friends.incoming(...)` (`['friends', 'incoming', ...]`), where items are `FriendRequestDto` (`item.requester` and `item.addressee` exist, but `item.friend` is `undefined`).
  3. `queryKeys.friends.outgoing(...)` (`['friends', 'outgoing', ...]`), where items are `FriendRequestDto` (`item.friend` is `undefined`).
  4. `queryKeys.friends.pendingInvitations()` (`['friends', 'pending-invitations']`), where items are `PendingInvitationItemDto` (`item.friend` is `undefined`).

  Because `FriendsPage` (`apps/web/src/app/(platform)/friends/page.tsx:18`) invokes both `useFriends()` and `useIncomingRequests()` on mount, both `['friends', 'list', {}]` and `['friends', 'incoming', {}]` are populated in cache.
  When a realtime `friend:presence:updated` event arrives, the updater runs against the `incoming` requests query. Evaluating `item.friend.id` throws an unhandled synchronous `TypeError: Cannot read properties of undefined (reading 'id')`, disrupting the socket listener and query cache state.
- **Recommended Remediation:**
  Option A (Recommended): Scope the query target specifically to the friends list query:
  ```typescript
  queryClient.setQueriesData<PaginatedFriendsResponse>(
    { queryKey: queryKeys.friends.list() },
    (oldData) => { ... }
  );
  ```
  Option B: Guard item property access defensively:
  ```typescript
  items: oldData.items.map((item: any) => {
    if (item && 'friend' in item && item.friend?.id === payload.userId) {
      ...
    }
    return item;
  })
  ```

---

### 5.2. Finding AUD-ACT-02: Simultaneous Dual-Credential Forwarding in Room Join
- **Severity:** Medium
- **Classification:** Architectural Limitation / Defensive Improvement
- **File Reference:** `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx#L238-L240`
- **Description:**
  In `handleJoin`:
  ```typescript
  const invitationId = searchParams?.get('invitationId') || undefined;
  const inviteToken = searchParams?.get('inviteToken') || undefined;
  await joinMutation.mutateAsync({ roomId, invitationId, inviteToken });
  ```
  If both query parameters are present in the URL (e.g. from copy-pasting or URL tampering), the client sends `{ roomId, invitationId, inviteToken }`.
  The backend correctly rejects this request with 400 Bad Request (`Cannot provide both inviteToken and invitationId`), failing closed. However, the client page does not sanitize or prioritize credentials prior to dispatch, resulting in an unhelpful join error message.
- **Recommended Remediation:**
  Prioritize authenticated `invitationId` over `inviteToken` when both parameters are present:
  ```typescript
  const invitationId = searchParams?.get('invitationId') || undefined;
  const inviteToken = invitationId ? undefined : (searchParams?.get('inviteToken') || undefined);
  ```

---

### 5.3. Finding AUD-ACT-03: Expiration Parsing Fallback for Malformed Timestamps
- **Severity:** Low
- **Classification:** Recommendation
- **File Reference:** `apps/web/src/features/friends/components/pending-invitations-inbox.tsx#L9-L19`
- **Description:**
  `formatExpiresIn` parses `expiresAt` via `new Date(expiresAt).getTime()`. If an invalid date string is encountered, `diffMs` evaluates to `NaN`. Because comparisons with `NaN` return `false`, the function reaches `return \`Expires in ${diffDays}d\`` and renders `'Expires in NaNd'`.
- **Recommended Remediation:**
  Add a `Number.isNaN(diffMs)` guard:
  ```typescript
  function formatExpiresIn(expiresAt: string): string {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (Number.isNaN(diffMs) || diffMs <= 0) return 'Expired';
    ...
  ```

---

### 5.4. Canonical Technical Debt Register (`HIST-01` through `HIST-07`)

All 7 canonical history debt items remain preserved and open without collision:

| ID | Title | Status | Audit Note |
| :--- | :--- | :--- | :--- |
| **HIST-01** | Stale / abandoned room session closure policy | Open | Single-instance in-memory room lifecycle; no automated background sweep. |
| **HIST-02** | Participant attendance intervals | Open | Session membership records track join/leave; multi-hour intervals deferred. |
| **HIST-03** | Bounded participant data completeness | Open | In-memory presence and single-instance rate limiter retained without Redis. |
| **HIST-04** | Performance terminal-state race conditions | Open | Handling rapid concurrent song skipping near end-of-track. |
| **HIST-05** | Account deletion and history retention | Open | GDPR/CCPA anonymization hooks deferred to user account sprint. |
| **HIST-06** | Privacy authorization and cache behavior | Open | Cache invalidation on history privacy toggle. |
| **HIST-07** | Session and vocal duration accuracy | Open | Telemetry precision vs network jitter calibration. |

---

## 6. Static Verification Commands and Exact Results

### 6.1. TypeScript Verification
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 1.1s
apps/api typecheck$ tsc --noEmit
└─ Done in 1.6s
apps/web typecheck$ tsc --noEmit
└─ Done in 2.8s
```
**Status: PASSED (0 errors)**

### 6.2. ESLint Verification
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 839ms
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 2s
```
**Status: PASSED (0 warnings, 0 errors)**

### 6.3. Terminology Verification
```bash
$ grep -rn "Watch Live" apps/ packages/
# Exit code 1 (no occurrences)
```
**Status: PASSED (0 occurrences in application source code)**

---

## 7. Runtime Verification Limitations

- In accordance with the Code-Only Development Policy, no production builds or automated browser test runners were executed.
- Network disconnection and multi-node socket failover were audited purely by static source inspection and call graph analysis.
- Database index execution on live collections was not performed; schema declarations were verified statically.

---

## 8. Phase 3 Readiness Recommendation

Sprint 5.7 Phase 3 (Multi-Friend Session Starter Dialog) relies directly on `useFriends()` and presence synchronization to populate the friend picker checklist.
Because **AUD-ACT-01** can cause an unhandled `TypeError` inside React Query whenever a presence update arrives while `/friends` query caches are active, **AUD-ACT-01 must be remediated** before Phase 3 implementation begins.

---

## 9. Final Audit Verdict

**AUDIT FAILED — SOURCE-LEVEL DEFECTS IDENTIFIED**

*(Remediation of AUD-ACT-01 and AUD-ACT-02 required prior to Phase 3 approval).*
