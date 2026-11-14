# KTVOnline — Sprint 5.7: Final Product & Technical Planning Report
## Friend Activity & Social Karaoke Sessions

**Sprint Theme:** Turn Friendships into Shared Karaoke Experiences.  
**Product Positioning:** KTVOnline — *Your Virtual Hangout. Your Karaoke Night.*  
**Mode:** Product Discovery & Pre-Implementation Technical Planning.  
**Clarification Baseline:** Sprint 5.7.1 Pre-Implementation Architecture Clarifications (`docs/SPRINT_5_7_1_PRE_IMPLEMENTATION_CLARIFICATIONS.md`)  
**Baseline Commits:** `1cf0537` (Sprint 5.6.1.3), `ed74b67` (Sprint 5.7 Planning Baseline), `8ac7ab2` (Contracts Resolution Fix)  
**Target Database:** `test` (Preserved)  

---

## 1. Executive Summary

Following the formal closure of Sprint 5.6 Social Integrity in Sprint 5.6.1.3 and the resolution of five architecture gaps in Sprint 5.7.1, this planning report establishes the definitive technical and product blueprint for **Sprint 5.7: Friend Activity & Social Karaoke Sessions**.

Rather than introducing disjointed social feeds, audio recordings, or separate database session entities, Sprint 5.7 unifies KTVOnline's social presence and live performance stages by reusing existing, verified monorepo capabilities:
- **`GlobalPresenceManager` & Realtime Friend Events:** Dynamically evaluating live singing and lounge presence with zero data leakage using the existing `friend:presence_updated` Socket.IO event.
- **Recipient-Bound Invitations & Offline Inbox:** Issuing dedicated, isolated tokens for multi-friend invites, complemented by an authenticated pending invitations inbox (`GET /api/friends/invitations/pending`) and dual-credential room join (`inviteToken` or `invitationId`).
- **Batch Invitation Integrity Pipeline:** Providing an optimized, batched pipeline for `POST /api/friends/invite-lounge-batch/:roomId` (up to 20 recipients) that eliminates N+1 queries and concurrency races without naive `Promise.allSettled` overhead.
- **Authoritative Stage & Playback:** Leveraging `RoomModel` and `KaraokeService` for turn-taking, capacity enforcement, and synchronized singing.
- **Accurate Session Memories:** Deriving session recaps strictly from completed `KaraokeSessionModel` records, preserving canonical technical debt **HIST-01** (abandoned room sweep).

---

## 2. Recommended Product Scope

Sprint 5.7 delivers 4 core capabilities:

1. **Friend Activity Dashboard on `/friends`:**
   - Realtime swimlanes grouping accepted friends into:
     - **Singing Now:** Friends performing live in discoverable lounges with song title, lounge badge, and direct **"Join Lounge"** CTA.
     - **In a Lounge:** Friends hanging out in public lounges (with **"Join Lounge"** CTA) or masked private lounges ("Private Lounge").
     - **Available Online:** Online friends ready to be invited to a session.
     - **Offline:** Inactive friends.

2. **"Start Session with Friends" Multi-Friend Launcher:**
   - Multi-select checklist of accepted friends with presence badges.
   - Streamlined room setup (Lounge Title, Atmosphere Vibe, Private/Public mode).
   - Single-click action creates the room, issues recipient-isolated invitations in batch, and routes the host directly into the lounge.

3. **"Friends Live" Companion Strip on `/rooms`:**
   - Unobtrusive, horizontally scrollable pill strip above room categories showing discoverable lounges where friends are singing or participating.
   - Clicking a pill previews the lounge via `RoomPreviewDialog` with a **"Join Lounge"** action.

4. **Batch Multi-Friend Invitation & Offline Inbox System:**
   - `POST /api/friends/invite-lounge-batch/:roomId` supporting up to 20 friends per batch with partial failure semantics.
   - `GET /api/friends/invitations/pending` enabling offline recipients to retrieve invitations upon login without storing raw tokens in plaintext.
   - `POST /api/friends/invitations/:id/dismiss` allowing recipients to dismiss invitations.
   - Dual-credential support in `joinRoom` accepting either `inviteToken` or `invitationId`.

---

## 3. End-to-End User Journeys

### Journey 1: Serendipitous Join ("Join My Friend's Lounge")
```text
1. User opens /friends or /rooms.
2. User sees friend "Elena" badged with: 🎵 Singing Now — "Cruel Summer" in "Tokyo Neon Stage".
3. User clicks "Join Lounge".
4. Client navigates to /rooms/R1.
5. User enters room as a member/audience participant.
6. User cheers Elena using live stage reactions (cheer counter, confetti).
```

### Journey 2: Spontaneous Social Session ("Friday Night Karaoke")
```text
1. User (Host) opens /friends and clicks "Start Session with Friends".
2. Launcher modal opens with friends ordered by presence (Singing Now > In a Lounge > Available Online > Offline).
3. Host selects Friend A, Friend B, and Friend C (3 selected).
4. Host selects Atmosphere: "Midnight Cyberpunk" and Visibility: "Private Lounge".
5. Host clicks "Create & Invite Friends".
6. Server creates Room R2 and executes batch invitation pipeline for Friends A, B, and C.
7. Host is redirected into /rooms/R2.
8. Online friends receive floating toast notifications: "[Host] invited you to sing in [Room Name]".
9. Offline friends who log in later see the invitation in their notification inbox.
10. Friends click "Join Lounge" and land in R2 together.
11. Group takes turns queueing songs, singing, and enjoying the hangout.
12. Host explicitly closes room; participants view session recap highlighting songs and attendees.
```

---

## 4. Architectural Decisions & Source Reuse

1. **Zero New Database Models or Migrations:**
   - `RoomModel` represents the live lounge.
   - `RoomInvitationModel` holds isolated recipient-bound tokens and pending invitations.
   - `KaraokeSessionModel` records the historical session and recap.
   - Preserves MongoDB database target `test`.

2. **Zero New Socket.IO Event Names:**
   - Reuses `friend:presence_updated` (`SOCKET_EVENTS.SERVER.FRIEND_PRESENCE_UPDATED`), which already carries `status`, `roomId`, `roomTitle`, `isPrivateLounge`, and `songTitle`.
   - Reuses `friend:invitation_received` (`SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED`), which carries `invitationToken`, `invitationId`, `roomTitle`, `isPrivate`, and `inviter`.

3. **Strict Privacy Masking Intact:**
   - No separate activity table; activity is dynamically evaluated by `globalPresenceManager.getUserPresence(friendId, viewerUserId)`.
   - Private rooms mask title and song details for outsiders (`roomTitle: "Private Lounge"`, `songTitle: null`, `roomId: null`).
   - Stealth mode (`presenceVisibility: 'none'`) strictly returns `status: 'offline'`.

4. **Authoritative Host Authorization:**
   - Direct and batch friend invitations remain strictly host-only across all room types (`AUD-INV-02` policy).
   - Only active host members present in the room may dispatch invitations.

5. **Batch Pipeline Over Naive `Promise.allSettled`:**
   - As clarified in Sprint 5.7.1, a naive `Promise.allSettled` loop over the single invite method produces 120+ database queries for 20 friends.
   - Sprint 5.7 implements an optimized batch pipeline performing pre-validation, batch friendship lookup, batch membership lookup, and controlled creation.

6. **Preservation of Canonical Debt HIST-01:**
   - Abandoned room sweeps remain an unautomated operational debt (**HIST-01**).
   - Session recaps are restricted strictly to explicitly completed rooms (`status === 'completed'`), preventing infinite or distorted duration metrics.

---

## 5. API & Realtime Contracts

### 5.1 Contract Additions in `packages/contracts/src/friendship.ts`

```typescript
export const BatchLoungeInviteSchema = z.object({
  recipientIds: z.array(z.string().min(1).max(50)).min(1).max(20),
});
export type BatchLoungeInviteDto = z.infer<typeof BatchLoungeInviteSchema>;

export const BatchLoungeInviteResultItemSchema = z.object({
  recipientId: z.string(),
  status: z.enum(['sent', 'failed']),
  invitationId: z.string().optional(),
  error: z.enum(['NOT_FRIENDS', 'ALREADY_IN_ROOM', 'CANNOT_INVITE_SELF', 'CREATION_FAILED']).optional(),
});
export type BatchLoungeInviteResultItemDto = z.infer<typeof BatchLoungeInviteResultItemSchema>;

export const BatchLoungeInviteResultSchema = z.object({
  success: z.boolean(),
  summary: z.object({
    total: z.number(),
    sent: z.number(),
    failed: z.number(),
  }),
  results: z.array(BatchLoungeInviteResultItemSchema),
  roomCurrentlyFull: z.boolean().optional(),
});
export type BatchLoungeInviteResultDto = z.infer<typeof BatchLoungeInviteResultSchema>;

export const PendingInvitationItemSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  room: z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    visibility: z.string(),
    capacity: z.number(),
    currentParticipantsCount: z.number(),
    status: z.string(),
    atmospherePreset: z.string().optional(),
    host: z.object({
      id: z.string(),
      username: z.string(),
      displayName: z.string().nullable().optional(),
      avatar: z.string().nullable().optional(),
    }).optional(),
  }),
  inviter: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
  }),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type PendingInvitationItemDto = z.infer<typeof PendingInvitationItemSchema>;
```

### 5.2 Contract Additions in `packages/contracts/src/invitation.ts`

```typescript
export const JoinRoomWithInviteSchema = z.object({
  inviteToken: z.string().trim().min(1).max(256).optional(),
  invitationId: z.string().trim().min(1).max(100).optional(),
});
export type JoinRoomWithInviteDto = z.infer<typeof JoinRoomWithInviteSchema>;
```

### 5.3 REST Endpoints Summary

| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/friends/invite-lounge-batch/:roomId` | Host Only | Dispatches recipient-bound invites to up to 20 friends in a single optimized request. |
| `GET` | `/api/friends/invitations/pending` | Authenticated | Retrieves pending, active recipient-bound invitations for the caller. |
| `POST` | `/api/friends/invitations/:id/dismiss` | Recipient Only | Dismisses/revokes a pending invitation for the caller. |
| `POST` | `/api/rooms/:id/join` | Authenticated | Supports dual credentials: `{ inviteToken?: string; invitationId?: string }`. |

---

## 6. Phased Implementation Roadmap

- **Phase 1: Shared Contracts, Pending Invitations Inbox & Batch Invite API**
  - Update `@ktv/contracts` with `BatchLoungeInviteSchema`, `PendingInvitationItemSchema`, and dual-credential `JoinRoomWithInviteSchema`.
  - Implement `GET /api/friends/invitations/pending` and `POST /api/friends/invitations/:id/dismiss` in `invitation.service.ts` and `friendship.controller.ts`.
  - Implement dual-credential validation in `room.service.ts` (`joinRoom`).
  - Implement optimized batch pipeline `POST /api/friends/invite-lounge-batch/:roomId`.

- **Phase 2: Friend Activity UI & Realtime Synchronization**
  - Implement `useFriendActivity` hook with TanStack Query and Socket.IO `friend:presence_updated` listener.
  - Implement `FriendActivitySection` on `/friends` with swimlanes: **Singing Now**, **In a Lounge**, **Available Online**, **Offline**.
  - Standardize all CTA buttons to **"Join Lounge"** (zero occurrences of "Watch Live").

- **Phase 3: Multi-Friend Session Starter Dialog**
  - Implement `StartSocialSessionDialog` component on `/friends`.
  - Multi-select checklist of accepted friends ordered by live presence.
  - Room parameter inputs (Name, Category, Atmosphere, Visibility).
  - Submits room creation and triggers batch invitation dispatch in one cohesive flow.

- **Phase 4: Rooms Live Bar & Contextual Polish**
  - Implement `FriendsLiveBar` horizontal carousel strip on `/rooms`.
  - Integrate pending invitations toast/banner into `InvitationNotificationListener` for offline-to-online parity.
  - Ensure multi-tab synchronization and reconnect invalidation.

- **Phase 5: Verification & Governance Audit**
  - Static typecheck verification across monorepo (`pnpm typecheck`).
  - ESLint verification across monorepo (`pnpm lint`).
  - Read-only source audit confirming zero new database migrations, zero plaintext token storage, and strict technical debt preservation (HIST-01).

---

## 7. Updated Definition of Done (DoD)

1. Host can multi-select up to 20 friends and create a social karaoke lounge in a single user action.
2. Invited friends receive instant realtime toasts with dedicated recipient-bound tokens when online.
3. Offline friends who log in later can view and accept invitations via `GET /api/friends/invitations/pending` without plaintext token leakage.
4. `joinRoom` supports private lounge entry via either `inviteToken` or `invitationId`.
5. Active friend activity (Singing Now, In a Lounge, Available Online, Offline) updates in real time on `/friends` without page refresh.
6. Private room titles, room IDs, and song titles remain strictly masked to non-occupants.
7. Public room activity offers a direct one-click **"Join Lounge"** flow (zero "Watch Live" terminology).
8. Session recaps are strictly restricted to completed sessions (`status === 'completed'`); host-disconnected rooms show an away notice without generating invalid recaps.
9. Zero database migrations executed; MongoDB database name remains `test`.
10. Zero test file mutations or test runners executed.
11. `pnpm typecheck` and `pnpm lint` pass with 0 errors across all monorepo packages.

---

## 8. Deferred Features (Sprint 5.8+ Candidates)
- Permanent user-to-user direct messaging.
- Persistent group circles / singing clubs.
- Public social feed of stranger activity.
- Recorded audio snippet sharing.
- Automated TTL background worker for abandoned room session cleanup (**HIST-01**).

---

## 9. Final Pre-Implementation Verdict

**Verdict:**
### **READY FOR PHASE 1 WITH DOCUMENTED LIMITATIONS**

**Summary of Limitations:**
1. Single-node in-memory presence tracking is retained (Redis is deliberately omitted under HIST-03).
2. Abandoned room sweeps remain unautomated (retained under HIST-01); session recaps are strictly restricted to explicitly completed sessions.
3. Offline invitation delivery is handled via the authenticated `GET /api/friends/invitations/pending` inbox and dual-credential room join, fully avoiding plaintext raw token persistence.
