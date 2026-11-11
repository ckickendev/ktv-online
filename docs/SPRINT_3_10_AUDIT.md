# KTVOnline — Sprint 3.10: Platform-Wide Audit & Stabilization Report

**Audit Date:** November 2026  
**Baseline Commit:** `9db5d8ef428b1440d02031f6476e10509a974abc` (Sprint 3.9 — Karaoke Experience Polish)  
**Scope:** Comprehensive platform-wide audit spanning all features implemented from Sprint 3.0 through Sprint 3.9.

---

## 1. Executive Summary

Sprint 3.10 serves as the architectural checkpoint and stabilization milestone before entering Milestone 4.0. Over Sprints 3.0 through 3.9, KTVOnline grew from a functional karaoke prototype into a rich social karaoke lounge platform featuring:
- Complete lounge redesign with dual responsive desktop/mobile layouts (Sprint 3.0)
- Full-screen singer stage with synchronized lyrics and audio wave visualizer (Sprint 3.1)
- Dynamic room atmosphere presets with reactive lighting (Sprint 3.2)
- Real-time ephemeral social reactions and audience cheers (Sprint 3.3)
- Real-time virtual appreciation gifts with zero-monetization policy (Sprint 3.4)
- Personalized user preferences and tailored room recommendations (Sprint 3.5)
- Intuitive room discovery, rich previews, and join experience (Sprint 3.6)
- Cohesive user identity, custom display names, bios, and public profiles (Sprint 3.7)
- Comprehensive host and room moderation controls with kick, mute, and transfer (Sprint 3.8)
- End-to-end player state clarity, ending cues, and mobile UX polish (Sprint 3.9)

This audit reviewed the source code across contracts (`packages/contracts`), backend services (`apps/api`), and frontend presentation (`apps/web`) to uncover cross-sprint inconsistencies, projection mismatches, missed domain activity events, and technical debt.

---

## 2. Comprehensive Subsystem Audit

### 2.1 Subsystem 1: Room Membership, Projections & Identity Integration
**Files Audited:**
- `apps/api/src/modules/rooms/room.service.ts`
- `apps/api/src/modules/rooms/membership.model.ts`
- `apps/api/src/modules/rooms/room.model.ts`
- `apps/api/src/modules/chat/chat.service.ts`

**Key Findings:**
1. **Cross-Sprint Projection Inconsistency (`displayName` omission):**
   - *Detail:* In Sprint 3.7, `displayName` was introduced to `UserModel` to support custom karaoke display names alongside immutable unique usernames. While Sprint 3.8 correctly included `displayName` in moderation population queries (e.g. `kickMember`, `muteMember`), older methods in `room.service.ts` (`findById`, `findRooms`, `findRoomsByOwner`, `update`, `closeRoom`, `joinRoom`, `getActiveMembers`, `getMyMembership`, `findJoinedRoomsByUser`, and `getRoomStateSnapshot`) were still using `'username avatar role'` or `'username avatar'`.
   - *Impact:* Active members and room owners returned in membership lists, room cards, and state snapshots had `displayName: undefined`, forcing frontend components to fall back to usernames or generic placeholders.
   - *Status:* **Resolved in Sprint 3.10.** All 18 projection call-sites updated to `'username displayName avatar role'` or `'username displayName avatar'`.

2. **Unpopulated `username` in `leaveRoom` Socket Event:**
   - *Detail:* In `leaveRoom()`, `RoomMembershipModel.findOneAndUpdate` was executed without `.populate('userId')`. The code then read `(updatedMembership.userId as any)?.username || 'Member'`, which always evaluated to `'Member'` because `userId` was an unpopulated `ObjectId`.
   - *Impact:* The `member.left` real-time socket event always broadcast `username: 'Member'` to all participants in the room.
   - *Status:* **Resolved in Sprint 3.10.** Query populated with `'userId', 'username displayName avatar role'`, and resolved using `displayName || username || 'Member'`.

3. **Missing Room Activity Logging on Join and Leave:**
   - *Detail:* While `kickMember`, `muteMember`, `transferHost`, and `updateSettings` recorded domain events to `chatService.recordActivity()`, `joinRoom()` and `leaveRoom()` did not log activities despite `member_joined` and `member_left` being defined in `RoomActivityTypeSchema`.
   - *Impact:* The room chat activity timeline omitted participant joins and departures, making the lounge event history incomplete.
   - *Status:* **Resolved in Sprint 3.10.** Added non-blocking `chatService.recordActivity()` calls in both `joinRoom()` and `leaveRoom()`.

---

### 2.2 Subsystem 2: Karaoke Queue & Playback Lifecycle
**Files Audited:**
- `apps/api/src/modules/karaoke/karaoke.service.ts`
- `apps/api/src/modules/karaoke/queue-item.model.ts`
- `apps/api/src/modules/karaoke/playback-state.model.ts`
- `apps/api/src/modules/karaoke/playback-scheduler.ts`

**Key Findings:**
1. **Queue Immediate Activation Performer Name:**
   - *Detail:* In `addToQueue()`, when a track was activated immediately to the stage from idle, `UserModel.findById` queried only `username`, omitting `displayName`.
   - *Impact:* The initial `room.currentSingerName` on the room document reflected the username instead of the performer's custom display name.
   - *Status:* **Resolved in Sprint 3.10.** Added `displayName` and `avatar` to `UserModel.findById` and computed `performerDisplayName = singerUser?.displayName || singerUser?.username || ...`.

2. **Missing `avatar` in `advanceToNextTrack` Population:**
   - *Detail:* When advancing to the next queued song in `advanceToNextTrack()`, `populate('requestedBy', 'username displayName')` and `populate('singer', 'username displayName')` omitted `avatar`.
   - *Impact:* Performer avatar was missing from the resulting `claimedItem` snapshot returned upon track advance, differing from other queue fetch methods (`getQueue()`, `reorderQueue()`) which include `avatar`.
   - *Status:* **Resolved in Sprint 3.10.** Updated both query sites in `advanceToNextTrack()` to `.populate('requestedBy', 'username displayName avatar')` and `.populate('singer', 'username displayName avatar')`.

3. **Concurrency and Song Expiration Guarding:**
   - *Detail:* Evaluated `playback-scheduler.ts` precision timers and CAS transitions. State version fencing (`playbackVersion`, `queueVersion`) and atomic Mongo transitions (`findOneAndUpdate({ status: 'queued' })`) correctly prevent race conditions and duplicate track plays under multi-client loads.
   - *Status:* **Healthy.** No changes required.

---

### 2.3 Subsystem 3: Social Interactions, Reactions & Gifting
**Files Audited:**
- `apps/api/src/realtime/stage-reaction.events.ts`
- `apps/api/src/realtime/gift.events.ts`
- `apps/web/src/features/reactions/components/FloatingReactionsOverlay.tsx`
- `apps/web/src/features/gifts/components/GiftAnimationOverlay.tsx`

**Key Findings:**
1. **Ephemeral Message Reliability & Throttling:**
   - In-memory sliding window rate-limiting for reactions (max 5 reactions per 2 seconds per user) and gifts (max 3 gifts per 5 seconds per user) correctly protects the Socket.IO cluster from message flooding.
   - Non-persistent architecture keeps MongoDB write load at zero during high-frequency audience interaction.
   - Frontend overlays cap simultaneous floating nodes at 30 to preserve 60 FPS animation performance on mobile devices.
   - *Status:* **Healthy.** No architectural changes required.

---

### 2.4 Subsystem 4: User Identity, Profiles & Preferences
**Files Audited:**
- `apps/api/src/modules/users/user.service.ts`
- `apps/api/src/modules/users/user.controller.ts`
- `apps/api/src/modules/users/user.model.ts`
- `apps/web/src/features/profile/components/ProfileEditDialog.tsx`
- `apps/web/src/features/profile/components/PublicProfileModal.tsx`

**Key Findings:**
1. **Profile Contract Integrity:**
   - Display name length limits (2 to 40 characters), bio limits (up to 200 characters), and social link validation conform to contracts.
   - Preferences schema (`preferredLanguages`, `favoriteGenres`, `atmospherePreference`, `lyricsMode`, `vocalVolumeDefault`) correctly synchronizes between local storage and user document.
   - *Status:* **Healthy.**

---

### 2.5 Subsystem 5: Room Moderation & Host Controls
**Files Audited:**
- `apps/api/src/modules/rooms/room.service.ts` (moderation methods)
- `apps/web/src/features/moderation/components/ModeratorActionsDialog.tsx`
- `apps/web/src/features/voice/components/voice-controls.tsx`

**Key Findings:**
1. **LiveKit Voice Synchronization:**
   - `voiceService.evictLiveKitParticipant` cleanly revokes WebRTC voice tokens upon member kick or voluntary departure.
   - Sprint 3.9 voice control integration accurately prevents server-muted users from toggling their local microphone.
   - *Status:* **Healthy.**

---

## 3. Defect Categorization & Resolution Status

| Defect ID | Subsystem | Severity | Description | Resolution in Sprint 3.10 |
| :--- | :--- | :---: | :--- | :--- |
| **STAB-01** | Rooms / Projections | Medium | Missing `displayName` in room membership and room owner population calls. | **Resolved** — All 18 query call-sites in `room.service.ts` now populate `displayName`. |
| **STAB-02** | Rooms / Realtime | Medium | `leaveRoom()` returned unpopulated `userId`, broadcasting `username: 'Member'`. | **Resolved** — Populated `userId` and used `displayName || username`. |
| **STAB-03** | Rooms / Chat | Low | Missing `member_joined` and `member_left` activity logs in room timeline. | **Resolved** — Added non-blocking `chatService.recordActivity()` calls. |
| **STAB-04** | Karaoke / Stage | Low | Immediate stage activation from idle ignored `displayName` for `currentSingerName`. | **Resolved** — Selected `displayName` and resolved performer name. |
| **STAB-05** | Karaoke / Queue | Low | `advanceToNextTrack()` omitted `avatar` in singer and requester populations. | **Resolved** — Populated `avatar` across both query sites. |

---

## 4. Technical Debt & Deferred Work for Milestone 4.0

The following non-blocking improvements are documented for Milestone 4.0:
1. **Redis Adapter for Socket.IO:** Currently using memory adapter suitable for single-instance or sticky-session deployments; horizontal scale-out across multiple container instances will require `@socket.io/redis-adapter`.
2. **Audio Track Pitch Shifting / Web Audio DSP:** Client-side pitch shift and key adjustment capabilities deferred to audio enhancements track.
3. **Room History Archival / Activity Pruning:** Add automated TTL index or scheduled cron pruning for room chat messages and domain activities older than 30 days.

---

## 5. Audit Conclusion

The KTVOnline platform codebase across Sprints 3.0 to 3.9 is structurally sound, highly modular, and well-separated into contracts, domain services, and feature-driven UI components. All identified cross-sprint inconsistencies and projection omissions have been resolved in Sprint 3.10 without breaking backward compatibility. The platform is stabilized and prepared for Milestone 4.0.
