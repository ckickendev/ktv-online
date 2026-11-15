# KTVOnline — Sprint 5.7 Phase 4: Product Discovery & Architecture Assessment

## 1. Executive Summary

Sprint 5.7 transforms KTVOnline from an app with isolated friendship relationships into a shared, live social karaoke destination.
- **Phase 1 (Completed & Audited):** Established the backend foundation for batch invitations, authenticated pending invitation inboxes, recipient-only dismissal, and dual-credential room joining (`7f12209`).
- **Phase 2 (Completed & Audited):** Transformed `/friends` into a live Friend Activity Dashboard with presence categorizations (`Singing Now`, `In a Lounge`, `Available Online`, `Offline`), real-time socket updates, and isolated query cache invalidation (`eb47cad`, `cbe4a43`).
- **Phase 3 (Completed & Audited):** Implemented the multi-friend Social Session Starter on `/friends` (`ec56644`), enabling hosts to select up to 20 friends, configure or select lounges, dispatch batch invitations with itemized retry safety, and transition into shared sessions. Final audit approval confirmed in Sprint 5.7.3 (`8d9aae9`, `7a4aa74`).
- **Phase 4 Objective:** Conduct a product and architectural discovery to identify high-impact, low-risk refinements to the live social karaoke experience, focusing on bridging the gap between room discovery and friend activity, establishing offline-to-online invitation parity, and smoothing session re-entry.

---

## 2. Repository Baseline & Current Architecture

### 2.1. Git Baseline
- **Target Branch:** `main`
- **Current HEAD:** `7a4aa74` (docs: update Phase 3 audit with canonical debt mapping and concurrent race analysis)
- **Audited Implementation Commit:** `ec56644` (feat(friends): refine Sprint 5.7 Phase 3 retry semantics and lounge membership guards)
- **Database Status:** Target database configuration remains `test`; zero migrations or database writes executed.

### 2.2. Architectural Baseline & Existing Capabilities
KTVOnline already provides a robust, single-node real-time foundation across contracts, services, and frontend hooks:

| Layer | Existing Capability | Current Usage |
| :--- | :--- | :--- |
| **Contracts (`@ktv/contracts`)** | `FriendshipDto`, `FriendPresenceDto`, `BatchLoungeInviteResultDto`, `PendingInvitationItemDto`, `RoomDto` | Type-safe shared contracts for presence, invitations, and rooms. |
| **Realtime Gateway** | `SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED`<br>`SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED` | Delivers targeted presence updates and floating invitation toasts to online users. |
| **Presence Infrastructure** | `GlobalPresenceManager` | Evaluates live status (`singing`, `in_lounge`, `online`, `offline`) with privacy masking for private rooms. |
| **Batch API** | `POST /api/friends/invite-lounge-batch/:roomId` | Dispatches recipient-bound invitations with 1 batch/5s rate limiting. |
| **Pending Inbox API** | `GET /api/friends/invitations/pending`<br>`POST /api/friends/invitations/:id/dismiss` | Authenticated inbox for offline invitation delivery and recipient-only dismissal. |
| **Frontend Queries & Hooks** | `useFriendActivity`, `useFriends`, `useRooms`, `useMyRooms`, `useSocialSessionStarter` | Partitioned activity buckets, presence cache updaters, and session orchestration. |

---

## 3. User Experience Gaps (Source-Backed)

Detailed source inspection of the application highlights four specific user experience friction points:

### Gap 1: Disconnect Between Room Discovery (`/rooms`) and Friend Activity
- **Source Inspection:** [`apps/web/src/app/(platform)/rooms/page.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/page.tsx#L91-L120)
- **Problem:** When users navigate to `/rooms` to find a karaoke session, the page presents standard public lounge discovery (search, categories, filters, pagination). There is **zero visibility of friend activity**. If a user's closest friend is currently singing on stage or hosting a lounge, the user has no way of knowing unless they navigate away to `/friends`.
- **Product Impact:** High bounce rate on `/rooms`; missed opportunities for spontaneous social karaoke hangouts.

### Gap 2: Offline-to-Online Invitation Parity & Notification Key Bug
- **Source Inspection:** [`apps/web/src/features/friends/components/invitation-notification-listener.tsx#L25-L41`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/friends/components/invitation-notification-listener.tsx#L25-L41) and [`#L76`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/friends/components/invitation-notification-listener.tsx#L76)
- **Problem:**
  1. *Undefined Key Bug:* Line 76 renders `<div key={invitation.invitationToken}>`. For Phase 1 & 3 batch invitations, `invitationToken` is omitted (only `invitationId` is present in `FriendInvitationReceivedPayload`). This results in `key={undefined}`, causing React key collisions when multiple batch invites arrive.
  2. *Offline Delivery Blind Spot:* If a user was offline when a batch invitation was dispatched, the invitation is safely stored in `RoomInvitationModel`. However, when that user logs in, `InvitationNotificationListener` receives no socket event. The pending invitation is visible **only if the user visits `/friends`** (`PendingInvitationsInbox`). Across the rest of the platform (`/rooms`, `/`, etc.), the user receives no prompt or notification that friends invited them to sing.
- **Product Impact:** Offline recipients frequently miss invitations before they expire or before the lounge closes.

### Gap 3: Missing In-Lounge Session Social Context
- **Source Inspection:** [`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/[roomId]/page.tsx)
- **Problem:** After a host creates a lounge and invites 5 friends via the Social Session Starter, the host is redirected to `/rooms/[roomId]`. Inside the room, the host sees only active participants who have already joined. The host has no in-lounge visibility into whether their invited friends have received the invite, are currently in transit, or encountered issues.
- **Product Impact:** Anxiety and uncertainty for the host ("Did my friends get the invite? Are they coming?").

### Gap 4: Return-to-Lounge Friction Upon Disconnect / Refresh
- **Source Inspection:** [`apps/web/src/app/(platform)/rooms/page.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/page.tsx) and [`apps/web/src/features/friends/components/friend-activity-section.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/friends/components/friend-activity-section.tsx)
- **Problem:** If a participant temporarily drops connection, accidentally closes their tab, or navigates to `/friends` to check who else is online, there is no persistent "Return to Your Active Lounge" prompt. The user must manually find the room card or re-click an invitation link.
- **Product Impact:** Fragmented session continuity.

---

## 4. Prioritized Feature Proposals

### Proposal 1: `FriendsLiveBar` Carousel Strip on `/rooms`
- **Description:** A horizontal, animated presence strip at the top of the `/rooms` discovery page. It renders compact, presence-badged friend avatars and cards for friends who are currently `Singing Now` (glowing aura + song title) or `In a Lounge` (cyan pulse + room title), with a direct one-click `"Join Lounge"` button for public rooms.
- **User Value:** High. Bridges the divide between public room exploration and social karaoke. Immediately answers: *"Are any of my friends singing right now?"*
- **Technical Complexity:** Low. Consumes existing `useFriendActivity()` hook; zero backend changes required.
- **Dependencies:** Reuses `groups.singingNow` and `groups.inLounges` from `useFriendActivity`.

### Proposal 2: Global Offline-to-Online Invitation Parity & Listener Polish
- **Description:**
  1. Fix the React key bug in `InvitationNotificationListener` (`key={invitation.invitationId || invitation.invitationToken}`).
  2. Implement an authenticated initial fetch of `GET /api/friends/invitations/pending` on application mount. If unexpired pending invitations exist for the recipient, surface a compact, dismissible floating banner/toast: *"Elena invited you to Tokyo Neon Stage"*, with instant `"Accept & Join"` and `"Dismiss"` actions.
- **User Value:** High. Guarantees true parity between online recipients (who receive Socket.IO toasts) and offline recipients (who receive initial-mount toasts upon login), ensuring invitations are never lost.
- **Technical Complexity:** Low. Reuses existing `friendsApi.getPendingInvitations()` and `friendsApi.dismissInvitation()`. Zero backend changes.
- **Dependencies:** `useAuthStore`, `friendsApi`.

### Proposal 3: In-Lounge Social Invite Drawer & Status Feedback
- **Description:** Within the active karaoke room page (`/rooms/[roomId]`), add a contextual "Invite Friends" button in the room header/participant panel for the room host. Opening it launches the `StartSocialSessionDialog` pre-bound to that existing room (`mode: 'existing'`, `selectedRoomId: roomId`). Additionally, display a small indicator showing pending invitations sent for this lounge.
- **User Value:** Medium. Allows hosts to invite friends directly from the room without having to leave the lounge and navigate to `/friends`.
- **Technical Complexity:** Low-to-Medium. Directly reuses `StartSocialSessionDialog` with `initialRoomId={roomId}` and `loungeMode="existing"`.
- **Dependencies:** `StartSocialSessionDialog`, `useSocialSessionStarter`.

### Proposal 4: Return-to-Active-Lounge Reconnect Banner
- **Description:** A lightweight floating strip rendered at the bottom-left or top of platform pages (`/rooms`, `/friends`) when the user is an active occupant of an ongoing room, offering a 1-click `"Return to [Room Name]"` shortcut.
- **User Value:** Medium. Drastically improves session continuity if the user navigates away or disconnects.
- **Technical Complexity:** Low. Checks `currentUser` active membership from React Query cache or room store.
- **Dependencies:** Room state store.

---

## 5. Value vs. Complexity Matrix

```
       HIGH USER VALUE
             │
   Proposal 2│   Proposal 1
 (Offline    │ (FriendsLiveBar
  Parity)    │  on /rooms)
             │
 ────────────┼───────────────
             │   Proposal 3
   Proposal 4│ (In-Lounge
  (Return-to-│  Host Drawer)
   Lounge)   │
             │
       LOW USER VALUE
LOW COMPLEXITY ─────► HIGH COMPLEXITY
```

---

## 6. Technical Debt & Architectural Constraints Alignment

1. **Canonical History Debt (HIST-01 to HIST-07):**
   - Phase 4 must **NOT** touch or claim to resolve `HIST-01` (abandoned room sweep) or `HIST-02` through `HIST-07`.
   - All session recaps remain derived strictly from completed rooms (`status === 'completed'`).
2. **Single-Node In-Memory Architecture:**
   - No Redis or distributed presence clusters.
   - All proposed features consume existing Socket.IO events (`friend:presence_updated`, `friend:invitation_received`) and in-memory caches.
3. **Database Immutability:**
   - Zero new Mongoose models.
   - Zero database migrations or schema alterations.
   - Target database configuration strictly remains `test`.
4. **Terminology Prohibition:**
   - Strict ban on obsolete `"Watch Live"` terminology. All CTAs continue to standardize on `"Join Lounge"`, `"Singing Now"`, or `"Invite"`.
5. **Concurrent Batch Invitation Race (Accepted Limitation):**
   - The concurrent batch invitation interleaving documented in Sprint 5.7.3 (`updateMany` + `create`) remains an accepted limitation. No database index changes are to be made in Phase 4.

---

## 7. Recommended Phase 4 Scope

To deliver the highest product value with maximum reliability and zero backend risks, the recommended Phase 4 scope is:

### **The Social Karaoke Polish & Discovery Bundle**
Comprising:
1. **Feature 4.1: `FriendsLiveBar` on `/rooms`:**
   - Horizontal live friend strip above room discovery filters.
   - Displays active singing/lounge friends with pulsing stage status badges.
   - One-click `"Join Lounge"` button for public lounges.
   - Empty state when no friends are active with quick link to invite friends.
2. **Feature 4.2: Global Offline-to-Online Invitation Parity & Listener Polish:**
   - Fix React key collision bug in `InvitationNotificationListener`.
   - Initial mount check of `GET /api/friends/invitations/pending` to surface pending invitations on login across all platform pages.
   - Seamless one-click join (`/rooms/:roomId?invitationId=:id`).
3. **Feature 4.3: In-Lounge "Invite Friends" Action for Hosts:**
   - Mount "Invite Friends" CTA in active room participant panel for room owner.
   - Opens `StartSocialSessionDialog` locked to `mode: 'existing'` with current `roomId`.

---

## 8. Explicitly Deferred Features (Sprint 5.8+ Candidates)

- **Automated TTL Abandoned Room Sweeper (HIST-01):** Deferred to operational tooling sprint.
- **Direct User-to-User Chat / Messaging:** Out of scope for karaoke room experience platform.
- **Persistent Singing Clubs / Circles:** Requires new database models; deferred.
- **Generic Stranger Social Activity Feed:** Rejected. Focus remains strictly on accepted friends and live karaoke.
- **Audio Snippet Sharing / Recordings:** Deferred to media pipeline sprint.
- **Unique Partial Compound Index for Invitations:** Deferred to database indexing maintenance window.

---

## 9. Proposed Implementation Phases & Acceptance Criteria

### Implementation Roadmap
- **Phase 4.1 (Listener Polish & Offline Parity):**
  - Fix key bug in `InvitationNotificationListener`.
  - Add initial pending invitation toast check on mount.
- **Phase 4.2 (`FriendsLiveBar` on `/rooms`):**
  - Implement `FriendsLiveBar` component consuming `useFriendActivity`.
  - Embed in `apps/web/src/app/(platform)/rooms/page.tsx` above filters.
- **Phase 4.3 (In-Lounge Host Invite Action):**
  - Add contextual invite trigger in `/rooms/[roomId]` participant panel.
- **Phase 4.4 (Static Verification & Audit):**
  - Run `pnpm typecheck` and `pnpm lint`.
  - Perform read-only independent audit.

### Phase 4 Acceptance Criteria
1. On `/rooms`, active friends in public lounges appear in a top `FriendsLiveBar` strip with live presence and a one-click `"Join Lounge"` button.
2. An offline recipient who logs in sees an instant toast/banner notification for pending lounge invitations regardless of which page they land on.
3. Dismissing a pending notification from the toast executes `POST /api/friends/invitations/:id/dismiss` cleanly.
4. Room hosts inside `/rooms/[roomId]` can click an "Invite Friends" button to open the Social Session Starter pre-configured for their current lounge.
5. Zero occurrences of `"Watch Live"` across the codebase.
6. Zero new database models, migrations, or indexes; database remains `test`.
7. `pnpm typecheck` and `pnpm lint` pass with 0 errors across all monorepo packages.
