# KTVOnline — Sprint 5.7, Phase 2: Friend Activity Dashboard Implementation Report

## 1. Executive Summary

Sprint 5.7 Phase 2 successfully implements the **Friend Activity Dashboard**, transforming `/friends` from a static friendship management page into a realtime social hangout hub. Users can immediately discover what their friends are doing on KTVOnline, answer critical social questions (*Who is singing right now? Who is in a lounge? Who is available online? Which public lounges can I join?*), and manage pending room invitations.

All implementations strictly adhere to the monorepo architecture, privacy boundaries, and the Code-Only Engineering Policy (no test runners, no production builds, no database migrations, database name `test` preserved).

---

## 2. Baseline & Repository Integrity

- **Phase 1 Baseline Commit:** `7f12209` (Sprint 5.7 Phase 1 implementation)
- **Phase 1 Audit Commit:** `61eec7d` (Sprint 5.7.1.1 Independent Security Audit)
- **Branch:** `main`
- **Database:** `test` (zero mutations, zero migrations)
- **Strict Terminology Prohibition:** Zero occurrences of `"Watch Live"` across the entire codebase (verified with repository-wide search). All CTAs standardized to **"Join Lounge"** or **"Singing Now"**.

---

## 3. Architecture & Implemented Components

### 3.1. Hook: `useFriendActivity` & Realtime Synchronization
**File:** `apps/web/src/features/friends/hooks/use-friend-activity.ts`

- Consumes `useFriends()` snapshot and partitions friends into four deterministic buckets:
  1. `singingNow`: `friend.presence?.status === 'singing'`
  2. `inLounges`: `friend.presence?.status === 'in_lounge'`
  3. `availableOnline`: `friend.presence?.status === 'online'`
  4. `offline`: `!friend.presence?.status || friend.presence?.status === 'offline'`
- Computes aggregate metrics: `totalFriends`, `singingCount`, `inLoungeCount`, `onlineCount`, `offlineCount`, and `hasActiveFriends`.
- **Realtime Ordering & Reconnect Recovery:**
  - In `useFriends()`, inspects `payload.updatedAt` to ignore out-of-order socket updates with older timestamps.
  - Subscribes to the Socket.IO `connect` event to automatically trigger TanStack Query cache invalidation and re-fetch the authoritative presence snapshot after network drops or reconnects.

### 3.2. Hook: `usePendingInvitations` & `useDismissInvitation`
**File:** `apps/web/src/features/friends/hooks/use-friend-activity.ts`
**API Client:** `apps/web/src/features/friends/api/friends-api.ts`

- `getPendingInvitations()`: Queries `GET /api/friends/invitations/pending` to retrieve offline-delivered, authenticated pending invitations for the current user.
- `dismissInvitation(id)`: Invokes `POST /api/friends/invitations/:id/dismiss` with recipient-scoped revocation.
- Realtime socket listener on `friend:invitation:received` and reconnect listener on `connect` to guarantee immediate UI updates without polling latency.

### 3.3. Section 7: Compact Pending Invitations Inbox
**File:** `apps/web/src/features/friends/components/pending-invitations-inbox.tsx`

- Automatically appears above activity swimlanes when the user has pending invitations.
- Displays inviter avatar, inviter name, lounge title, room capacity, private lock indicator (if private), and a zero-dependency human-readable countdown (`Expires in 47h`, `Expires in 15m`).
- **Primary CTA:** "Join Lounge" linking directly to `/rooms/${invitation.roomId}?invitationId=${invitation.id}` for secure recipient-authenticated entry.
- **Dismiss CTA:** Immediate one-click dismissal with loading spinner feedback.

### 3.4. Friend Activity Card Component
**File:** `apps/web/src/features/friends/components/friend-activity-card.tsx`

- Designed for responsiveness, accessibility, and high visual appeal in dark mode.
- **Privacy Enforcement:**
  - If `presence.isPrivateLounge`: Room title is masked to `"Private Lounge"`, lock icon rendered, and "Join Lounge" CTA is completely omitted for non-occupants.
  - If public lounge (`!presence.isPrivateLounge && presence.roomId`): Prominently renders "Join Lounge" linking to `/rooms/${presence.roomId}`.
- **Singing Section Highlighting:** Performer cards feature a rich violet-to-fuchsia gradient border, glowing mic indicator, and live song title badge (`Singing: {songTitle}`).
- **Friendship Actions Preserved:** Unfriend action is accessible via a confirm toggle to ensure user management capabilities are preserved.

### 3.5. Friend Activity Section & Dashboard Layout
**File:** `apps/web/src/features/friends/components/friend-activity-section.tsx`
**Page:** `apps/web/src/app/(platform)/friends/page.tsx`

- **Section A — Header & Aggregates:**
  - Heading: "Friend Activity" with live pulse indicator.
  - Subtitle: *"See who's around and join the next karaoke night."*
  - Aggregate pills: `Singing Now ({singingCount})`, `In a Lounge ({inLoungeCount})`, `Available Online ({onlineCount})`.
- **Section B — Singing Now:** Visual swimlane for active karaoke performers.
- **Section C — In a Lounge:** Swimlane for friends participating or listening in lounges.
- **Section D — Available Online:** Swimlane for online friends available to hang out.
- **Section E — Offline Friends:** Collapsible accordion toggle (`Show Offline Friends ({offlineCount})`) keeping the primary view uncluttered while preserving access.
- **Zero States:**
  - Zero total friends: Friendly onboarding prompt to "Find People".
  - Friends exist, but none currently active: Uplifting empty state encouraging user to start a lounge or invite friends when they come online.

### 3.6. Dual-Credential Room Join Integration
**Files:**
- `apps/web/src/lib/api/endpoints/rooms.ts`
- `apps/web/src/hooks/queries/use-room.ts`
- `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`
- `apps/web/src/features/friends/components/invitation-notification-listener.tsx`

- Updated `roomApi.joinRoom` to support `{ inviteToken?: string; invitationId?: string }` alongside legacy string tokens.
- Updated `useJoinRoom` mutation to accept `{ roomId, inviteToken, invitationId }`.
- In `rooms/[roomId]/page.tsx`, reads `useSearchParams` for `invitationId` or `inviteToken` and automatically forwards them to `joinMutation.mutateAsync`.
- In `invitation-notification-listener.tsx`, navigates to `/rooms/${roomId}?invitationId=${invitationId}` when accepting real-time toasts.

---

## 4. Verification & Static Analysis Results

### 4.1. TypeScript Verification (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 996ms
apps/api typecheck$ tsc --noEmit
└─ Done in 1.9s
apps/web typecheck$ tsc --noEmit
└─ Done in 3s
```
**Result: PASSED (0 errors across contracts, API, and web)**

### 4.2. ESLint Verification (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
apps/api lint$ eslint src/
apps/web lint$ next lint
✔ No ESLint warnings or errors
```
**Result: PASSED (0 warnings, 0 errors)**

### 4.3. Prohibited Terminology Audit
```bash
$ grep -rn "Watch Live" apps/ packages/
# Exit code 1 (zero occurrences)
```
**Result: PASSED (100% compliant with strict prohibition)**

### 4.4. Dev Server Route Verification
```bash
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/friends
200
```
**Result: PASSED (HTTP 200 OK)**

---

## 5. Scope Governance & Next Phase

- Phase 2 scope was strictly limited to the Friend Activity Dashboard on `/friends`.
- Social Session Starter (Phase 3) and Friends Live Bar (Phase 4) were intentionally excluded from this phase.
- Ready to proceed to **Sprint 5.7, Phase 3: Multi-Friend Session Starter Dialog**.

---

## 6. Final Verdict

**PHASE 2 COMPLETE — STATIC VERIFICATION PASSED**
