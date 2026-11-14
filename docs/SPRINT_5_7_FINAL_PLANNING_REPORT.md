# KTVOnline — Sprint 5.7: Final Product & Technical Planning Report
## Friend Activity & Social Karaoke Sessions

**Sprint Theme:** Turn Friendships into Shared Karaoke Experiences.  
**Product Positioning:** KTVOnline — *Your Virtual Hangout. Your Karaoke Night.*  
**Mode:** Product Discovery & Technical Planning Only (Pre-Implementation Baseline).  
**Baseline Commit:** `1cf0537`  
**Target Database:** `test` (Preserved)  

---

## 1. Executive Summary

Following the formal closure of Sprint 5.6 Social Integrity in Sprint 5.6.1.3, Sprint 5.7 bridges KTVOnline's social connections and live performance stages.

Rather than introducing disjointed social feeds, audio uploads, or separate database session entities, Sprint 5.7 reuses and connects existing, verified capabilities:
- **`GlobalPresenceManager` & Realtime Friend Events** (evaluating live singing and lounge presence with zero data leakage).
- **Option B Recipient-Bound Invitations** (issuing dedicated, isolated tokens for multi-friend invites).
- **`RoomModel` & `KaraokeService`** (authoritative capacity, turn-taking queues, and synchronized live singing).
- **`KaraokeSessionModel`** (recording shared session memories and recaps).

This planning report establishes the complete product scope, architecture map, API contracts, UX wireframes, phased roadmap, and Definition of Done for Sprint 5.7.

---

## 2. Recommended Product Scope

Sprint 5.7 delivers 4 core capabilities:

1. **Friend Activity Dashboard on `/friends`:**
   - Realtime swimlanes grouping friends into:
     - **Singing Live Now:** Friends performing in discoverable lounges with song title, lounge badge, and direct "Watch Live" CTA.
     - **In Lounges:** Friends hanging out in public lounges (with "Join Lounge" CTA) or masked private lounges ("Private Lounge").
     - **Available Online:** Online friends ready to be invited to a session.
     - **Offline:** Inactive friends.

2. **"Start Session with Friends" Multi-Friend Launcher:**
   - Multi-select checklist of accepted friends.
   - Streamlined room setup (Lounge Title, Atmosphere Vibe, Private/Public mode).
   - Single-click action creates the room, issues recipient-isolated invites in parallel, and routes the host into the lounge.

3. **"Friends Live" Companion Strip on `/rooms`:**
   - Unobtrusive, horizontally scrollable pill strip above room categories showing public rooms where friends are singing or participating.
   - Clicking a pill previews the lounge via `RoomPreviewDialog`.

4. **Batch Multi-Friend Invitation API:**
   - `POST /api/friends/invite-lounge-batch/:roomId` supporting up to 20 friends per batch.
   - Dispatches dedicated recipient-bound invitations in parallel using `Promise.allSettled`.

---

## 3. End-to-End User Journeys

### Journey 1: Serendipitous Join ("Watch My Friend Sing")
```text
1. User opens /friends or /rooms.
2. User sees friend "Elena" badged with: 🎵 Singing "Cruel Summer" in "Tokyo Neon Stage".
3. User clicks "Watch Live" (or "Join Lounge").
4. Client navigates to /rooms/R1.
5. User enters room as a member/viewer.
6. User cheers Elena using live stage reactions (cheer counter, confetti).
```

### Journey 2: Spontaneous Social Session ("Friday Night Karaoke")
```text
1. User (Host) opens /friends and clicks "Start Session with Friends".
2. Launcher modal opens with friends ordered by presence.
3. Host selects Friend A, Friend B, and Friend C (3 selected).
4. Host selects Atmosphere: "Midnight Cyberpunk" and Visibility: "Private Lounge".
5. Host clicks "Create & Invite Friends".
6. Server creates Room R2 and issues 3 recipient-bound tokens.
7. Host is redirected into /rooms/R2.
8. Friends A, B, and C receive floating toast notifications: "[Host] invited you to sing in [Room Name]".
9. Friends click "Accept & Join" and land in R2 together.
10. Group takes turns queueing songs, singing, and enjoying the session.
11. Host closes room; participants view session recap highlighting songs and attendees.
```

---

## 4. Architectural Decisions & Source Reuse

1. **Zero New Database Models or Migrations:**
   - `RoomModel` represents the live lounge.
   - `RoomInvitationModel` holds isolated recipient-bound tokens.
   - `KaraokeSessionModel` records the historical session and recap.
2. **Zero New Socket.IO Event Names:**
   - Reuses `friend:presence:updated` (which already carries `status`, `roomId`, `roomTitle`, `isPrivateLounge`, `songTitle`).
   - Reuses `friend:invitation:received` (which carries `invitationToken`, `roomTitle`, `isPrivate`, `inviter`).
3. **Strict Privacy Masking Intact:**
   - No separate activity table; activity is dynamically evaluated by `globalPresenceManager.getUserPresence`.
   - Private rooms mask title and song details for outsiders. Stealth mode returns offline.
4. **Authoritative Host Authorization:**
   - Direct friend invitations remain host-only across all room types (`AUD-INV-02` policy).

---

## 5. API & Realtime Contract Proposals

### 5.1 Contract Additions in `packages/contracts/src/friendship.ts`
```typescript
export const BatchLoungeInviteSchema = z.object({
  friendUserIds: z.array(z.string().min(1)).min(1).max(20),
});
export type BatchLoungeInviteDto = z.infer<typeof BatchLoungeInviteSchema>;

export const BatchLoungeInviteResultSchema = z.object({
  success: z.boolean(),
  totalRequested: z.number(),
  totalInvited: z.number(),
  results: z.array(
    z.object({
      friendUserId: z.string(),
      status: z.enum(['invited', 'failed']),
      error: z.string().optional(),
    })
  ),
});
export type BatchLoungeInviteResultDto = z.infer<typeof BatchLoungeInviteResultSchema>;
```

### 5.2 Endpoint: `POST /api/friends/invite-lounge-batch/:roomId`
- Authenticated via `requireAuth`.
- Enforces `room.ownerId.toString() === req.user.id`.
- Validates friendship for each target ID.
- Executes `invitationService.createFriendInvitation` and emits `friend:invitation:received`.

---

## 6. Phased Implementation Scope

- **Phase 1: Shared Contracts & Batch Invitation API** (Contracts update, backend service, controller, and routes).
- **Phase 2: Friend Activity UI & Selector Hook** (`useFriendActivity` hook and `FriendActivitySection` dashboard).
- **Phase 3: Multi-Friend Session Starter** (`StartSocialSessionDialog` launcher component and header CTA).
- **Phase 4: Rooms Live Bar & Contextual Polish** (`FriendsLiveBar` carousel on `/rooms` and multi-friend select in room invite modal).
- **Phase 5: Verification & Governance Audit** (Full typecheck, lint, and strict code-only compliance audit).

---

## 7. Definition of Done (DoD)

1. Host can multi-select up to 20 friends and create a social karaoke lounge in a single user action.
2. Invited friends receive instant realtime toasts with dedicated recipient-bound tokens.
3. Friends can preview and join the private lounge without token collisions.
4. Active friend activity (singing, in lounge, available, offline) updates in real time on `/friends` without page refresh.
5. Private room titles, room IDs, and song titles are strictly masked to non-occupants.
6. Public room activity offers a direct one-click "Join Lounge" / "Watch Live" flow.
7. Zero database migrations executed; MongoDB database name remains `test`.
8. Zero test file mutations or test runners executed.
9. `pnpm typecheck` and `pnpm lint` pass with 0 errors across all monorepo packages.

---

## 8. Deferred Features (Sprint 5.8+ Candidates)
- Permanent user-to-user direct messaging.
- Persistent group circles / singing clubs.
- Public social feed of stranger activity.
- Recorded audio snippet sharing.

---

## 9. Final Recommendation

The product discovery and technical planning for Sprint 5.7 is **COMPLETE**.  
The design maximizes reuse of verified Sprint 5.6 and 5.6.1.x infrastructure, requires zero database migrations, introduces zero high-frequency socket leaks, and strictly respects all privacy controls.

**Status:** Ready for User Review and Approval.  
*(Implementation will begin upon explicit scope approval from the user).*
