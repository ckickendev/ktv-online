# Sprint 5.7 Phase 4 Implementation Report
## Social Karaoke Polish & Discovery Bundle

- **Target Branch:** `main`
- **Planning & Discovery Baseline:** `880fc76` (`docs/SPRINT_5_7_PHASE_4_PRODUCT_DISCOVERY.md`)
- **Database Scope:** `test` (zero migrations, zero writes, zero new collections)
- **Status:** **PHASE 4 COMPLETE — STATIC VERIFICATION PASSED**

---

## 1. Executive Summary

Sprint 5.7 Phase 4 implements the **Social Karaoke Polish & Discovery Bundle**, seamlessly tying together Friend Activity, Room Discovery, Global Offline-to-Online Invitations, and the active Karaoke Lounge into a unified social experience.

In strict adherence to the code-only policy and architectural constraints:
1. **Feature 4.1 (`FriendsLiveBar`):** Embedded on `/rooms` directly above discovery filters. Dynamically spotlights active friends singing or in lounges with glowing presence badges and a direct `"Join Lounge"` action. It collapses cleanly when no friends are active.
2. **Feature 4.2 (Global Offline-to-Online Invitation Parity):** Fixed the React key undefined collision bug in `InvitationNotificationListener`. Implemented initial pending invitation reconciliation (`friendsApi.getPendingInvitations()`) on authentication mount across all platform routes. Provided clean server-side dismissal (`POST /api/friends/invitations/:id/dismiss`) and route-based one-click lounge entry (`/rooms/:roomId?invitationId=:id`).
3. **Feature 4.3 (In-Lounge Host Batch Invitations):** Extended `useSocialSessionStarter` and `StartSocialSessionDialog` with `fixedRoomId` and `fixedRoomName` parameters. Hosts inside `/rooms/[roomId]` can click "Invite Friends to Lounge" (from the room header or participant panel) to launch the full multi-friend Social Session Starter locked to their current lounge with 100% code reuse.

---

## 2. Inventory of Changes

### A. New Components
- **`apps/web/src/features/friends/components/friends-live-bar.tsx`**:
  - Horizontal live friend strip consuming `useFriendActivity`.
  - Partitions friends into `Singing Now` (stage glow aura, song title if public) and `In a Lounge` (room title badge).
  - Provides a direct `"Join Lounge"` CTA for public rooms and a private lounge badge for private rooms.
  - Automatically collapses when no friends are currently performing or in lounges.

### B. Modified Files
- **`apps/web/src/features/friends/index.ts`**:
  - Exported `FriendsLiveBar`.
- **`apps/web/src/app/(platform)/rooms/page.tsx`**:
  - Integrated `<FriendsLiveBar />` directly above the room search bar and category filters.
- **`apps/web/src/features/friends/components/invitation-notification-listener.tsx`**:
  - Fixed React key collision bug by assigning `stableKey = invitation.invitationId || invitation.invitationToken || `${invitation.roomId}-${invitation.sentAt}``.
  - Added initial pending invitation reconciliation on auth mount using `hasReconciledRef` to prevent refetch loops on route changes.
  - Added server-side dismissal via `friendsApi.dismissInvitation(id)` with TanStack query cache invalidation.
  - Added account switch / logout cleanup (`setInvitations([])`, clearing refs).
- **`apps/web/src/features/friends/hooks/use-social-session-starter.ts`**:
  - Updated `open(initialFriendId?: string, fixedRoomId?: string)` to support existing locked lounge mode when `fixedRoomId` is supplied (`loungeMode = 'existing'`, `selectedRoomId = fixedRoomId`, `activeRoomId = fixedRoomId`).
- **`apps/web/src/features/friends/components/start-social-session-dialog.tsx`**:
  - Added `fixedRoomId?: string` and `fixedRoomName?: string` to dialog props.
  - When `fixedRoomId` is present:
    - Sets header title to `"Invite Friends to Lounge"` and description to `"Select friends to invite directly into your current lounge."`.
    - Hides the mode switcher toggle (`"Create New Lounge"` vs `"Use Existing Lounge"`).
    - Renders a locked current lounge banner: `"Inviting to Lounge: <fixedRoomName>"`.
    - Renders `"Back to Lounge"` action button on completion that safely closes the dialog without page navigation or reloads.
- **`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`**:
  - Imported `StartSocialSessionDialog` and `useFriends` from `@/features/friends`.
  - Added `isHostSocialStarterOpen` state and wired header button (`data-testid="invite-friends-header-button"`) and share button for room hosts.
  - Added prominent `"Invite Friends to Lounge"` CTA button in both desktop and mobile participant tabs (`RoomMemberList`) for room hosts.
  - Mounted `<StartSocialSessionDialog fixedRoomId={room.id} fixedRoomName={room.name} />` conditionally for hosts.

---

## 3. Strict Architectural Compliance

### Zero Infrastructure & Backend Mutations
- Zero new backend models, schemas, or migrations.
- Zero database index changes or mutations.
- Database remains strictly `test`.
- Zero Redis dependencies introduced (preserves single-node in-memory architecture).

### Terminology Ban
- Audited codebase for prohibited `"Watch Live"` terminology.
- Found **0** occurrences across all monorepo packages.

### Historical Debt Register Preservation
Sprint 5.7 Phase 4 strictly preserves the canonical historical debt register (`HIST-01` through `HIST-07`):
- `HIST-01`: Stale/abandoned room session closure policy.
- `HIST-02`: Participant attendance intervals.
- `HIST-03`: Bounded participant data completeness.
- `HIST-04`: Performance terminal-state race conditions.
- `HIST-05`: Account deletion and history retention.
- `HIST-06`: Privacy authorization and cache behavior.
- `HIST-07`: Session and vocal duration accuracy.

---

## 4. Static Verification Evidence

### 1. Monorepo TypeScript Verification (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 867ms
apps/api typecheck$ tsc --noEmit
apps/web typecheck$ tsc --noEmit
└─ Done in 1.4s
└─ Done in 2.5s
```
**Result:** PASSED with 0 errors across `@ktv/contracts`, `@ktv/api`, and `@ktv/web`.

### 2. Monorepo ESLint Verification (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 762ms
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 2s
```
**Result:** PASSED with 0 errors and 0 warnings.

### 3. Prohibited Terminology Audit
```bash
$ grep -rn -i "Watch Live" apps/ packages/
# (exit code 1, zero matches found)
```
**Result:** PASSED.

---

## 5. Final Verdict

`PHASE 4 COMPLETE — STATIC VERIFICATION PASSED`
