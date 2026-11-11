# KTVOnline — Sprint 3.4 Architecture Audit: Virtual Gifts & Appreciation

**Baseline Commit:** `9ab81f9`  
**Date:** 2026-11-11  
**Sprint:** 3.4 — Virtual Gifts & Appreciation  

---

## 1. Executive Summary

Sprint 3.3 successfully implemented lightweight real-time social reactions (`👏`, `🔥`, `❤️`, `🎉`, `🎤`), establishing an ephemeral, server-authoritative broadcast channel via Socket.IO with sub-50ms latency and user-based token bucket rate limiting.

Sprint 3.4 builds directly on top of this foundation to introduce **Virtual Gifts & Appreciation**. Unlike instantaneous emoji cheers, virtual gifts create **memorable, shared moments of appreciation directed from audience members to the active stage performer**.

In accordance with product principles:
- **Gift Experience First, Monetization Later:** All gifts are 100% free and ephemeral. No currency, wallets, balances, transactions, or payment gateways exist.
- **Zero Database Persistence:** Gifts are ephemeral live broadcast events; zero records are created in MongoDB.
- **Strict Isolation:** Gift rendering must not impact 10 Hz lyrics timing, WebRTC voice communication, or playback state versioning.

---

## 2. Existing Repository State & Findings

### 2.1 Performer Attribution & Singer Identity (Sprint 3.1)
- **Files:** `apps/api/src/modules/karaoke/karaoke.service.ts`, `packages/contracts/src/karaoke.ts`, `apps/web/src/features/karaoke/hooks/use-karaoke.ts`
- **Findings:**
  - Authoritative playback state is tracked in `PlaybackStateDto`, which contains `currentItem: RoomQueueItemDto | null`.
  - `RoomQueueItemDto` has two user references:
    - `requestedBy: RoomQueueRequesterDto` (the participant who queued the song).
    - `singer?: RoomQueueRequesterDto | null` (the assigned singer, defaulting to requester).
  - Authoritative current performer is resolved as:
    `const currentSinger = currentItem?.singer || currentItem?.requestedBy || null;`
  - Playback status includes `'loading' | 'playing' | 'paused' | 'ended' | 'error'`.
  - **Reusable Capability:** The server can deterministically inspect `playback.currentItem` and `playback.status` to resolve the current performer without needing client-supplied singer IDs. If `playback.currentItem` is null or `playback.status` is not `'playing'` / `'paused'`, there is no active stage performer eligible to receive gifts.

### 2.2 Atmosphere Presets & Visual Identity (Sprint 3.2)
- **Files:** `apps/web/src/features/rooms/atmosphere/`, `apps/web/src/features/karaoke/components/KaraokePlayer.tsx`
- **Findings:**
  - 5 atmosphere presets are active: `tokyo_neon`, `cyberpunk_lounge`, `cozy_acoustic`, `disco_fever`, and `midnight_jazz`.
  - Preset styling tokens (`ambientGlow`, `stageBackdrop`, `stageBorder`, `badgeClass`, `accentGradient`) are passed down to `KaraokePlayer`.
  - **Requirement for Sprint 3.4:** Stage gift overlays must harmonize with the active preset glow and stage borders without clipping or color conflicts.

### 2.3 Realtime Socket.IO Broadcast Architecture (Sprint 3.3)
- **Files:** `apps/api/src/realtime/socket.server.ts`, `apps/api/src/realtime/stage-reaction.events.ts`, `apps/api/src/realtime/stage-reaction.limiter.ts`
- **Findings:**
  - Authentication middleware (`socketAuthMiddleware`) binds authenticated user `{ id, username, role, avatar }` to `socket.data.user`.
  - Room broadcast channel format: `room:${roomId}` via `getRoomChannel(roomId)`.
  - Active room membership authorization check:
    `RoomMembershipModel.exists({ roomId, userId, status: 'active', kickedAt: null })`.
  - In-memory Token Bucket rate limiter provides multi-tab immune rate limiting keyed by `userId`.
  - **Reusable Capability:** Sprint 3.4 will mirror this pattern with a dedicated gift limiter (`giftLimiter`) and gift event handler (`registerGiftEvents`), completely avoiding duplicate WebSocket connections or separate channels.

### 2.4 Existing Animation Utilities & Accessibility
- **Files:** `apps/web/src/app/globals.css`, `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx`
- **Findings:**
  - CSS keyframes for `@keyframes floatFade` and `@keyframes pulseFade` exist.
  - Media query `@media (prefers-reduced-motion: reduce)` smoothly overrides movement with stationary opacity fading.
  - Touch targets on audience toolbar buttons are sized to $\ge 44 \times 44$px on mobile.
  - Screen reader announcements use polite live regions (`aria-live="polite"`).

---

## 3. Implementation Gaps & Plan for Sprint 3.4

1. **Contracts (`@ktv/contracts`)**:
   - Lack gift definitions and gift event contracts.
   - Solution: Create `packages/contracts/src/gift.ts` with fixed catalog `GIFT_CATALOG` (8 curated gifts), `GiftIdSchema`, `SendGiftPayloadSchema`, and `GiftNewPayloadSchema`.
   - Register `SOCKET_EVENTS.CLIENT.GIFT_SEND = 'gift:send'` and `SOCKET_EVENTS.SERVER.GIFT_NEW = 'gift:new'`.

2. **Backend Processing & Verification (`apps/api`)**:
   - Need server-side performer resolution from `karaokeService.getPlaybackSnapshot(roomId)`.
   - Need server-side gift rate limiter (3 gifts burst, 1 every 1.5 seconds per user) and 30s idempotency cache for `clientGiftId`.
   - Need event handler `registerGiftEvents` in `apps/api/src/realtime/gift.events.ts`.

3. **Frontend UI & Visual Experience (`apps/web`)**:
   - Need `useVirtualGifts` hook to manage gift state, deduplication (50 IDs), and active gift queue (max 5 simultaneous).
   - Need `GiftSelectorDialog` (desktop popover / mobile responsive bottom sheet) showing performer info and gift cards.
   - Need `StageGiftOverlay` rendering celebratory gift banners and distinct particle animations (rose, star, mic, heart, crown, fireworks, music note, trophy).
   - Add a Gift button (🎁) to `SingerTurnIndicator` toolbar to open the selector.

---

## 4. Architectural Boundaries & Domain Invariants

```
+------------------------------------------------------------------------------------+
|                                Client Browser                                      |
|                                                                                    |
|  [SingerTurnIndicator Toolbar] ---> Clicks 🎁 Gift Button                         |
|    |                                                                               |
|  [GiftSelectorDialog]                                                              |
|    | Displays Performer Name & Avatar (Authoritative from playback.currentItem)     |
|    | Displays 8 Free Gifts (Rose, Star, Mic, Heart, Crown, Fireworks, Notes, Trophy)|
|    | User selects Gift -> Clicks "Send Gift"                                       |
|    v                                                                               |
|  [useVirtualGifts Hook]                                                            |
|    |-- Client idempotency key generated (`cg_<timestamp>_<rand>`)                 |
|    |-- Socket emit: `gift:send` { roomId, giftId, clientGiftId }                   |
+----+-------------------------------------------------------------------------------+
     |
     v
+------------------------------------------------------------------------------------+
|                                 Node.js API Server                                 |
|                                                                                    |
|  [registerGiftEvents]                                                              |
|    | 1. Authenticate user from socket handshake (`socket.data.user.id`)            |
|    | 2. Verify active room membership in MongoDB (`kickedAt == null`)              |
|    | 3. Check Idempotency Cache (reject duplicate `clientGiftId`)                  |
|    | 4. Check User Rate Limiter (TokenBucket: max 3 burst / 1 per 1.5s)             |
|    | 5. Resolve Authoritative Performer from `karaokeService.getPlaybackSnapshot`   |
|    |    -> Reject if no active performer or status != 'playing'/'paused'           |
|    | 6. Validate gift ID against static `GIFT_CATALOG`                             |
|    | 7. Generate server UUID (`gift_<uuid>`) and authoritative timestamp           |
|    | 8. Broadcast `gift:new` to `room:${roomId}` channel (Zero DB writes)          |
+----+-------------------------------------------------------------------------------+
     |
     v
+------------------------------------------------------------------------------------+
|                        All Room Participants (Audience)                            |
|                                                                                    |
|  [StageGiftOverlay]                                                                |
|    |-- Deduplicate with bounded FIFO Set (last 50 IDs)                             |
|    |-- Display expressive stage celebration banner: [Sender] -> [Gift] -> [Singer] |
|    |-- Render distinct gift visual animation (4000ms TTL, max 5 concurrent)       |
|    |-- Support `prefers-reduced-motion` & preserve active room atmosphere          |
+------------------------------------------------------------------------------------+
```

---

## 5. Verification Strategy

Following the mandatory **Code-Only Policy**:
- No test files created or modified.
- No test runners (`vitest`, `playwright`, etc.) executed.
- Static verification only via:
  - `pnpm typecheck`
  - `pnpm lint`
- Runtime verification scenarios documented as deferred in the implementation report.
