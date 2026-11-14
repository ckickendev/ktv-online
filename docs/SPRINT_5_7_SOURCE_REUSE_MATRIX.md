# KTVOnline — Sprint 5.7: Source Reuse Matrix

## 1. Classification Overview

To preserve system reliability and avoid technical debt, Sprint 5.7 follows a strict reuse-first philosophy:
- **Reuse (R):** Zero modifications; consume as-is.
- **Extend (E):** Add backward-compatible methods or parameters to existing services.
- **New (N):** Build new targeted components or endpoints where no prior equivalent exists.

---

## 2. Capability Reuse Matrix

| Functional Area | Specific Capability | Classification | Target File & Function | Notes |
| :--- | :--- | :---: | :--- | :--- |
| **Friend Presence** | Dynamic Presence Evaluation | **Reuse (R)** | `apps/api/src/realtime/global-presence.manager.ts#getUserPresence` | Evaluates online, room membership, private room masking, and singing status. |
| **Friend Presence** | Proactive Presence Broadcasts | **Reuse (R)** | `apps/api/src/realtime/friend.events.ts#broadcastUserPresenceToFriends` | Broadcasts presence to accepted friends on all 7 lifecycle transitions. |
| **Friend Presence** | Realtime Presence Listener (Web) | **Reuse (R)** | `apps/web/src/features/friends/hooks/use-friends.ts#useFriends` | Subscribes to `friend:presence:updated` and updates TanStack cache. |
| **Friend Presence** | Presence Status Visual Badge | **Reuse (R)** | `apps/web/src/features/friends/components/presence-status-badge.tsx` | Visual indicator for online, in lounge, singing, and offline. |
| **Friend Activity** | Friend Activity Grouping & Filtering | **Extend (E)** | `apps/web/src/features/friends/hooks/use-friends.ts` | Add selector / helper hook `useFriendActivity()` that sorts friends into singing, in public lounge, available, and offline. |
| **Friend Activity** | Friend Activity Overview Section | **New (N)** | `apps/web/src/features/friends/components/friend-activity-section.tsx` | Clean hero dashboard on `/friends` displaying active friend cards with direct "Join Lounge" or "Start Session" CTAs. |
| **Friend Activity** | Room Discovery Friends Bar | **New (N)** | `apps/web/src/features/rooms/components/friends-live-bar.tsx` | Compact horizontal scrollable strip on `/rooms` displaying friends singing or hanging out in discoverable rooms. |
| **Lounge Creation** | Room Creation Logic | **Reuse (R)** | `apps/api/src/modules/rooms/room.service.ts#create` | Validates name, category, atmosphere, capacity, and initializes owner. |
| **Invitations** | Recipient-Bound Token Issuance | **Reuse (R)** | `apps/api/src/modules/rooms/invitation.service.ts#createFriendInvitation` | Generates recipient-isolated tokens without cross-friend revocation. |
| **Invitations** | Single Friend Lounge Invite | **Reuse (R)** | `apps/api/src/modules/friends/friendship.service.ts#sendLoungeInviteToFriend` | Checks host authorization and dispatches realtime invite. |
| **Invitations** | Multi-Friend Batch Invitation | **Extend (E)** | `apps/api/src/modules/friends/friendship.service.ts#sendBatchLoungeInvites` | Add service method accepting `friendUserIds: string[]` to issue recipient-bound invites in bounded parallel execution (`Promise.allSettled`). |
| **Invitations** | Batch Invite Route & Controller | **New (N)** | `apps/api/src/modules/friends/friendship.controller.ts#sendBatchLoungeInvites`<br>`friendship.routes.ts` | Expose `POST /api/friends/invite-lounge-batch/:roomId`. |
| **Invitations** | Client Toast Listener | **Reuse (R)** | `apps/web/src/features/friends/components/invitation-notification-listener.tsx` | Listens to `friend:invitation:received`, deduplicates, and provides "Accept & Join". |
| **Session Starter** | "Start Karaoke with Friends" Dialog | **New (N)** | `apps/web/src/features/friends/components/start-social-session-dialog.tsx` | Multi-select online friends, choose lounge name & vibe, create room, and auto-dispatch invites. |
| **In-Room Social** | In-Room Friend Invite Dialog | **Reuse (R)** | `apps/web/src/components/rooms/invite-friends-dialog.tsx` | Can be consumed directly or enhanced with multi-friend select. |
| **Shared Queue** | Queue State & Turn Taking | **Reuse (R)** | `apps/api/src/modules/karaoke/karaoke.service.ts`<br>`apps/web/src/components/chat/room-activity-timeline.tsx` | Tracks songs, performers, and requesters. |
| **Session History** | Karaoke Session Recording & Recap | **Reuse (R)** | `apps/api/src/modules/history/history.service.ts` | Records duration, attendees, performances, and top contributors. |

---

## 3. High-Leverage Reuse Summary
- **9 Core Capabilities Reused with 0 backend changes.**
- **2 Targeted Extensions:** `sendBatchLoungeInvites` in backend; `useFriendActivity` selector in frontend.
- **3 New Frontend UI Components:** `FriendActivitySection`, `FriendsLiveBar`, `StartSocialSessionDialog`.
- **0 New Database Models or Migrations Required.**
