# KTVOnline — Sprint 3.1: Stage & Singer Experience Audit

**Audit Date**: 2026-11-11  
**Sprint**: 3.1  
**Scope**: Stage & Singer Experience, Singer Spotlight, Singer Handoff, Audience Engagement, Queue Journey  
**Policy**: Code-only verification policy; static checks (`pnpm typecheck`, `pnpm lint`); zero destructive database actions; zero test suite modifications.

---

## 1. Executive Summary

Sprint 3.0 established the room layout with a responsive desktop 3-zone architecture and mobile drawer navigation. Sprint 3.1 elevates this foundation into an authentic performance stage centered on the people performing:
> *"Every song is a performance. Every singer gets their moment."*

This audit examines the existing codebase across four domains:
1. **Karaoke Domain**: Models, queue lifecycle, playback state, and worker transitions.
2. **Realtime Domain**: Socket.IO events, state synchronization, monotonic versioning.
3. **Frontend Stage**: `KaraokePlayer`, `SingerTurnIndicator`, `RoomSongQueue`, `QueueItem`, and room page composition.
4. **Voice Domain**: LiveKit participants, authoritative speech detection (`isSpeaking`), and room presence.

---

## 2. Existing Architecture Analysis

### 2.1 Source of Truth for Current Singer
- **In MongoDB**:
  - `RoomQueueItemModel`: Contains `roomId`, `songId`, `requestedBy` (`User` reference), `status` (`'playing'`), `position` (`0`), `startedAt`.
  - `RoomPlaybackStateModel`: Holds `currentQueueItemId` referencing the active queue item, along with `status`, `positionMs`, `anchorStartedAt`, `playbackExpiresAt`, and `playbackVersion`.
  - `RoomModel`: Legacy fields `currentSongTitle` and `currentSingerName`. In `karaoke.service.ts` line 379, `currentSingerName` was previously assigned a generic placeholder (`membership.role === 'host' ? 'Host' : 'Singer'`).
- **In `@ktv/contracts`**:
  - `RoomQueueItemDtoSchema`: Contains `requestedBy: RoomQueueRequesterDtoSchema` (`id`, `username`, `displayName`, `avatar`). Previously, it lacked an explicit `singer` field.
- **In Frontend (`useKaraoke`)**:
  - `currentItem`: Extracted from `playback.currentItem`.
  - `currentSingerId`: Previously read strictly from `currentItem?.requestedBy?.id`.
  - `currentSingerName`: Read from `currentItem?.requestedBy?.displayName || currentItem?.requestedBy?.username`.

### 2.2 Source of Truth for Next Singer
- **In MongoDB**:
  - `RoomQueueItemModel.findOne({ roomId, status: 'queued' }).sort({ position: 1, addedAt: 1 })`.
- **In Frontend (`useKaraoke`)**:
  - `nextUpItem`: Derived as `queue.items.find(item => item.status === 'queued') || null`.
  - `isNextUpSinger`: Checked via `currentUserId && nextUpItem?.requestedBy?.id === currentUserId`.

### 2.3 Queue Item Sufficiency for Singer Turns
- **Finding**: Queue items contain `requestedBy`, which defines who added the song to the queue. In virtual karaoke lounges, the song requester is almost always the performer, but users may also queue a duet or designate another participant as the singer.
- **Architectural Decision**: Introduce an optional `singer` field (`RoomQueueRequesterDtoSchema.nullable().optional()`) to `RoomQueueItemDto` and an optional `singerId` in `AddQueueItemDto`. When omitted or null, `singer` defaults seamlessly to `requestedBy`. This allows a 100% backward-compatible, clean distinction between:
  1. **Song Requester**: The account that queued the song (`item.requestedBy`).
  2. **Assigned Singer**: The assigned performer (`item.singer || item.requestedBy`).
  3. **Current Performer**: The assigned singer of `playback.currentItem`.
  4. **Next Performer**: The assigned singer of `nextUpItem`.

### 2.4 Playback Completion and Queue Advancement
- **Natural Completion**: Driven by `NaturalCompletionScheduler` (in-memory precision timer using `setTimeout` with node timer unref) alongside `NaturalCompletionWorker` (distributed polling fallback every 2000ms using MongoDB lease tokens).
- **Advancement Logic (`advanceToNextTrack`)**:
  1. Validates worker lease and expected `playbackVersion`/`currentQueueItemId`.
  2. Atomically transitions current item from `'playing'` to `'completed'` (or `'skipped'`).
  3. Evaluates candidates in queue ordered by `position: 1, addedAt: 1`.
  4. Validates active room membership (`RoomMembershipModel.status === 'active'`) for candidate requester/singer.
  5. Validates audio availability (`candidateSong.audioAvailability === 'audio_available'`).
  6. Atomically claims candidate to `'playing'` with position 0.
  7. Updates `RoomPlaybackStateModel` with new timestamps and increments `playbackVersion` and `queueVersion`.
  8. Rebalances remaining queue positions (1, 2, 3...) via bulk write.
  9. Broadcasts `karaoke:playback:updated` and `karaoke:queue:updated` to the room via Socket.IO.

### 2.5 Singer Leaving During Playback
- **Event Flow**:
  - When a user departs or is kicked, `handleMemberDeparted(roomId, userId)` is executed.
  - Active queued tracks requested by the departing user are marked `'removed'`.
  - Queue positions are rebalanced, and `queueVersion` is incremented.
  - If the departing user was the active singer on stage (`currentItem.requestedBy.toString() === userId`), `advanceToNextTrack` is triggered immediately with `reason: 'singer_departed'`.

### 2.6 Voice Domain Alignment (LiveKit)
- LiveKit provides real-time voice activity via `participant.isSpeaking`.
- **Constraint Compliance**:
  - Voice activity must ONLY be indicated when `isSpeaking === true`.
  - An unmuted microphone is NOT voice activity.
  - LiveKit voice state is completely decoupled from backing track audio; backing track audio is synchronized via `HTMLAudioElement` and server-authoritative clock anchors.

---

## 3. Component Extensibility & Architecture Plan

| Existing Component | Current State | Sprint 3.1 Extension |
| :--- | :--- | :--- |
| `packages/contracts/src/karaoke.ts` | Queue item has `requestedBy` | Add optional `singer?: RoomQueueRequesterDto` and `singerId?: string` in `AddQueueItemDto` |
| `apps/api/src/modules/karaoke/room-queue-item.model.ts` | Stores `requestedBy` | Add optional `singer` ObjectId referencing `User`, populated in JSON transform |
| `apps/api/src/modules/karaoke/karaoke.service.ts` | Generic singer name in `room.currentSingerName` | Store actual performer display name; populate `singer`; fallback to `requestedBy` |
| `apps/web/src/features/karaoke/hooks/use-karaoke.ts` | Derives `currentSingerName` from `requestedBy` | Expose `currentSinger`, `currentRequester`, `nextSinger`, `nextRequester`, `performerStatus` |
| `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx` | Basic alert banner | Upgrade to full Singer Spotlight & Turn banner with voice speaking waves and stage reactions |
| `apps/web/src/features/karaoke/components/KaraokePlayer.tsx` | Embedded top banner | Integrates Singer Spotlight directly above lyrics stage without causing layout shifts during 10 Hz ticks |
| `apps/web/src/features/karaoke/components/QueueItem.tsx` | Shows "Requested by X" | Distinguishes between Requester and Assigned Singer when different; shows singer status pill |
| `apps/web/src/features/karaoke/components/RoomSongQueue.tsx` | Lists songs | Highlights current singer turn, next up countdown, and empty queue call-to-action |
| `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx` | Passes basic voice & karaoke props | Connects voice speaking indicators (`isSpeaking`) directly to Stage Spotlight and Reaction events |

---

## 4. Architectural Gaps & Solutions

1. **Singer Identity Storage**:
   - *Gap*: The backend previously did not support assigning a singer distinct from the requester, and wrote `'Singer'`/`'Host'` as room metadata.
   - *Solution*: Store `singer` reference in `RoomQueueItemModel`, default to `requestedBy` when omitted, and write the actual `displayName` into `room.currentSingerName`.
2. **Performer Voice Activity on Stage**:
   - *Gap*: The stage did not visually indicate whether the singer on stage was actively singing into their microphone.
   - *Solution*: Wire LiveKit's `isSpeaking` attribute for the current performer into the `SingerSpotlight` / `SingerTurnIndicator`.
3. **Stage Reactions**:
   - *Gap*: Audiences need a lightweight way to cheer for singers on stage without cluttering persistence.
   - *Solution*: Reuse the existing Socket.IO chat reaction stream (`chat:reaction:add`) to render lightweight floating animated emoji particles over the stage.
4. **Queue Position Awareness**:
   - *Gap*: When adding a song, users didn't get clear feedback on what position they will occupy.
   - *Solution*: Update song catalog search to show current queue length and estimated queue slot.

---

## 5. Risk Assessment & Mitigations

- **Risk**: 10 Hz lyric clock ticks causing Singer Spotlight component re-renders.
  - *Mitigation*: Separate high-frequency lyric progress state from performer identity state using memoized sub-components and CSS transitions.
- **Risk**: Stale playback versions during singer handoff.
  - *Mitigation*: Version fencing in `advanceToNextTrack` and monotonic version tracking in `useKaraoke` prevent duplicate transitions.
- **Risk**: Breaking contract changes.
  - *Mitigation*: `singer` and `singerId` are strictly optional; all fallback chains default to existing `requestedBy` fields.
