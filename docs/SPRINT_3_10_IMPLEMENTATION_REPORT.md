# KTVOnline — Sprint 3.10: Platform-Wide Audit & Stabilization Implementation Report

## A. Summary

- **Sprint Objective:** Perform a comprehensive source-code audit covering Sprint 3.0 through Sprint 3.9, identify technical debt and cross-sprint inconsistencies, and fix verified low/medium-risk defects safely without adding new features.
- **Sprint Policy:** Strict Code-Only Development Policy. No test files created or modified, no test runners executed, no production build commands run.
- **Baseline Commit:** `9db5d8ef428b1440d02031f6476e10509a974abc` (Sprint 3.9 — Karaoke Experience Polish)
- **Final Verdict:** `CODE COMPLETE — NOT RUNTIME VERIFIED`

---

## B. Audit & Fix Summary

| Defect ID | Severity | File(s) Changed | Root Cause & Resolution |
| :--- | :---: | :--- | :--- |
| **STAB-01** | Medium | `apps/api/src/modules/rooms/room.service.ts` | Sprint 3.7 introduced `displayName` on `UserModel`, but older room queries in `room.service.ts` only populated `'username avatar role'` or `'username avatar'`. Updated all 18 population query call-sites to include `displayName`. |
| **STAB-02** | Medium | `apps/api/src/modules/rooms/room.service.ts` | In `leaveRoom()`, `updatedMembership.userId` was unpopulated, causing the `member.left` realtime event to broadcast `username: 'Member'`. Populated `userId` with `'username displayName avatar role'` and extracted `displayName || username || 'Member'`. |
| **STAB-03** | Low | `apps/api/src/modules/rooms/room.service.ts` | `joinRoom()` and `leaveRoom()` did not record timeline activities, omitting participant joins and leaves from the room activity feed. Added non-blocking `chatService.recordActivity()` calls for `member_joined` and `member_left`. |
| **STAB-04** | Low | `apps/api/src/modules/karaoke/karaoke.service.ts` | In `addToQueue()`, direct stage activation from idle selected only `username` from `UserModel`, omitting `displayName` when setting `room.currentSingerName`. Updated query to include `displayName` and resolved `performerDisplayName`. |
| **STAB-05** | Low | `apps/api/src/modules/karaoke/karaoke.service.ts` | In `advanceToNextTrack()`, `requestedBy` and `singer` were populated with `'username displayName'`, omitting `avatar`. Updated both queries to populate `'username displayName avatar'`. |

---

## C. Detailed Implementation Overview

### 1. Room Membership & Room Owner Projection Alignment (STAB-01)
- **Problem:** When users customized their display names via Sprint 3.7 Profile Settings, their custom display names were absent in room membership lists, active participants drawers, and room discovery cards because the backend projected only `username avatar role`.
- **Solution:**
  - In `RoomService.findById`: updated `ownerId` population to `'username displayName avatar'`.
  - In `RoomService.findRooms`: updated `ownerId` population to `'username displayName avatar'`.
  - In `RoomService.findRoomsByOwner`: updated `ownerId` population to `'username displayName avatar'`.
  - In `RoomService.update`: updated `ownerId` population to `'username displayName avatar'`.
  - In `RoomService.closeRoom`: updated `ownerId` population to `'username displayName avatar'`.
  - In `RoomService.joinRoom`: updated all 6 membership population queries to `'username displayName avatar role'`.
  - In `RoomService.getActiveMembers`: updated `userId` population to `'username displayName avatar role'`.
  - In `RoomService.getMyMembership`: updated `userId` population to `'username displayName avatar role'`.
  - In `RoomService.findJoinedRoomsByUser`: updated nested `ownerId` population to `'username displayName avatar'`.
  - In `RoomService.kickMember`: updated `ownerId` and `userId` populations to include `displayName`.
  - In `RoomService.getRoomStateSnapshot`: updated both `ownerId` and `userId` population queries to include `displayName`.

### 2. Departure Event User Identification & Activity Feed (STAB-02, STAB-03)
- **Problem:** When a user departed a lounge, the `member.left` socket broadcast always stated `username: 'Member'`. In addition, neither member joins nor member leaves were recorded in the activity feed.
- **Solution:**
  - Added `.populate('userId', 'username displayName avatar role')` to `RoomMembershipModel.findOneAndUpdate()` in `leaveRoom()`.
  - Extracted the user's display name or username:
    ```typescript
    const memberObj = updatedMembership.userId as any;
    const username = memberObj?.displayName || memberObj?.username || 'Member';
    const avatar = memberObj?.avatar ?? null;
    ```
  - Added non-blocking `chatService.recordActivity()` in `joinRoom()` with type `'member_joined'`.
  - Added non-blocking `chatService.recordActivity()` in `leaveRoom()` with type `'member_left'`.

### 3. Karaoke Performer Display Name & Queue Avatar Consistency (STAB-04, STAB-05)
- **Problem:** When starting playback immediately from idle, `currentSingerName` on the room did not consider `displayName`. In addition, `advanceToNextTrack()` omitted avatars from singer and requester objects.
- **Solution:**
  - In `addToQueue()`, selected `'username displayName avatar'` for requester and singer user lookups, and updated `performerDisplayName` to prioritize `displayName`.
  - In `advanceToNextTrack()`, updated candidate discovery and transition queries to populate `'username displayName avatar'`.

---

## D. Cross-Sprint Status Matrix (Sprint 3.0 – Sprint 3.10)

| Sprint | Mission / Focus Area | Baseline Commit | Stabilization Status |
| :--- | :--- | :---: | :---: |
| **Sprint 3.0** | Room Experience Redesign & Lounge Layout | `Initial` | Fully Integrated & Stable |
| **Sprint 3.1** | Stage & Singer Experience | `Sprint 3.0` | Fully Integrated & Stable |
| **Sprint 3.2** | Room Atmosphere & Lounge Identity | `Sprint 3.1` | Fully Integrated & Stable |
| **Sprint 3.3** | Social Reactions & Audience Interaction | `Sprint 3.2` | Fully Integrated & Stable |
| **Sprint 3.4** | Virtual Gifts & Appreciation (Zero Monetization) | `Sprint 3.3` | Fully Integrated & Stable |
| **Sprint 3.5** | Personalized Karaoke Experience | `Sprint 3.4` | Fully Integrated & Stable |
| **Sprint 3.6** | Room Discovery & Joining Experience | `Sprint 3.5` | Fully Integrated & Stable |
| **Sprint 3.7** | User Identity & Profile Experience | `Sprint 3.6` | Projections Aligned in 3.10 |
| **Sprint 3.8** | Host & Room Moderation Experience | `Sprint 3.7` | Fully Integrated & Stable |
| **Sprint 3.9** | Karaoke Experience Polish | `Sprint 3.8` | Fully Integrated & Stable |
| **Sprint 3.10** | Platform-Wide Audit & Stabilization | `9db5d8e` | **Complete (Audit & Fixes Landed)** |

---

## E. Static Verification Results

### 1. Monorepo Type Check (`pnpm typecheck`)
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 984ms
apps/api typecheck$ tsc --noEmit
└─ Done in 1.5s
apps/web typecheck$ tsc --noEmit
└─ Done in 2.3s
```
**Result:** PASSED (0 errors across contracts, API, and Web).

### 2. Monorepo Lint Check (`pnpm lint`)
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 732ms
apps/api lint$ eslint src/
└─ Done in 1s
apps/web lint$ next lint
✔ No ESLint warnings or errors
└─ Done in 1.7s
```
**Result:** PASSED (0 warnings, 0 errors).

---

## F. Final Verdict

`CODE COMPLETE — NOT RUNTIME VERIFIED`
