# KTVOnline — Sprint 5.7: Risks & Open Decisions

## 1. Technical Risks & Mitigations

### Risk 1: Batch Invitation Amplification & Rate Limiting
- **Risk:** If a malicious or buggy client sends thousands of friend IDs in a batch invite, it could cause high database write load (creating hundreds of tokens) and Socket.IO emission bursts.
- **Mitigation:**
  1. Enforce strict Zod bounds on `BatchLoungeInviteSchema`: `friendUserIds: z.array(z.string()).min(1).max(20)`. No batch may exceed 20 friends.
  2. Bounded execution with `Promise.allSettled`.
  3. Apply existing invitation rate limiters to `POST /api/friends/invite-lounge-batch/:roomId`.

---

### Risk 2: Privacy Leakage in Friend Activity Feed
- **Risk:** A poorly designed activity feed might display the name or song of a friend who is inside a private lounge, or reveal a friend who has stealth mode enabled.
- **Mitigation:**
  1. Do NOT create a separate database activity table or feed query.
  2. The activity feed is strictly fed by `globalPresenceManager.getUserPresence(targetUserId, viewerUserId)`.
  3. All existing privacy masking rules (stealth mode, friends-only, private room masking) apply automatically.
  4. If `room.visibility === 'private'` and viewer is not in the room, `roomTitle` is masked to `'Private Lounge'`, `roomId: null`, and `songTitle: null`.

---

### Risk 3: Network Interruption During Multi-Step Session Launch
- **Risk:** When "Start Session with Friends" runs, it first creates the room, then calls batch invite, then redirects. If batch invite fails or client drops connection between room creation and redirect, an empty room might be left behind.
- **Mitigation:**
  1. Room creation is already complete and idempotent.
  2. If batch invite has partial failures, `Promise.allSettled` reports individual statuses so host sees which invites succeeded.
  3. The host is redirected to their room regardless, where the existing in-room "Invite Friends" dialog remains available as a fallback.

---

### Risk 4: Host Disconnection During Live Social Session
- **Risk:** In group sessions with friends, if the host's laptop closes or internet drops, friends might be stranded or room might close abruptly.
- **Mitigation:**
  1. The 10-second generation-fenced disconnect grace period in `RoomPresenceManager` prevents immediate closure on browser refreshes.
  2. The room remains active while other participants are singing.
  3. The host can transfer host privileges to any active participant using `transferHostDialog` (`/api/rooms/:id/transfer-host`).

---

## 2. Open Product Decisions & Recommended Stances

### Decision 1: Should offline friends be eligible for batch invites?
- **Option A (Online Only):** Disable checkboxes for offline friends in the session launcher.
- **Option B (Recommended — All Friends with Status Badges):** Allow selecting any friend, but order online/available friends at the top with prominent green/violet indicators.
- **Reasoning:** Friends often coordinate across apps (e.g. "hey, check KTVOnline, I sent an invite!"). If they log in 5 minutes later, their invite is active in their notifications toast.

---

### Decision 2: Should ordinary room members be able to invite their friends to a public lounge?
- **Current Audited Policy:** Only the room host can dispatch direct friend invitations (`AUD-INV-02`).
- **Product Stance:**
  - In Sprint 5.7, we maintain the host-only direct invite policy to ensure release stability and avoid scope expansion.
  - Ordinary members in public rooms can copy the shareable public link or tell friends to search the lounge title on `/rooms`.

---

### Decision 3: Where should the session recap be accessible after a session ends?
- **Option A:** Dedicated `/sessions/:id` route.
- **Option B (Recommended):** Integrated in `/profile?tab=history` + an inline modal/toast when leaving a room.
- **Reasoning:** Sprint 5.3 already implemented a full session history and recap experience in `apps/api/src/modules/history` and `apps/web/src/features/history`. Reusing this saves building redundant pages.
