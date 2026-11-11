# KTVOnline — Sprint 3.3 Architecture Audit: Social Reactions & Audience Interaction

**Baseline Commit:** `3de86b1`  
**Date:** 2026-11-11  
**Sprint:** 3.3 — Social Reactions & Audience Interaction  

---

## 1. Executive Summary

Sprint 3.1 introduced the "Stage & Singer Experience", including visual indicators for who is performing, who is up next, and Stage Cheer buttons (`👏`, `🔥`, `❤️`, `🎉`, `🎤`). However, an architectural audit of the codebase reveals that **cheer reactions in Sprint 3.1 are purely local to the sender's browser**. They are never transmitted over Socket.IO to other participants in the room.

Sprint 3.3 elevates these isolated button clicks into a **shared, real-time social audience interaction system** across all room participants without introducing heavy database persistence, breaking existing contracts, or degrading 10 Hz karaoke lyrics timing and WebRTC audio.

---

## 2. Existing Repository State & Findings

### 2.1 Stage Cheer Implementation (`SingerTurnIndicator.tsx`)
- **Location:** `apps/web/src/features/karaoke/components/SingerTurnIndicator.tsx`
- **Current State:**
  - Defines `CHEER_EMOJIS = ['👏', '🔥', '❤️', '🎉', '🎤']`.
  - State: `const [particles, setParticles] = useState<FloatingParticle[]>([]);`
  - Function: `handleCheer(emoji)` generates a random horizontal percentage (`30% - 70%`) and appends a local object `{ id: Date.now() + Math.random(), emoji, x }`.
  - Timeout: Drops particle from state after `2000ms`.
  - **Limitation:** Does not emit any network requests or Socket.IO events. Other room participants never see these cheers.
  - **Accessibility & Touch Targets:** Cheer pill buttons currently measure approximately 28x28px (`p-1 text-sm`), falling short of the recommended 44x44px touch target on mobile devices.

### 2.2 Chat Message Reactions vs Stage Audience Reactions
- **Location:** `packages/contracts/src/chat.ts`, `apps/api/src/modules/chat/chat.service.ts`, `apps/api/src/realtime/chat.events.ts`
- **Current Chat Reaction Architecture:**
  - Events: `chat:reaction:add` and `chat:reaction:remove`.
  - Linked to a persistent `messageId` and stored in MongoDB `ChatMessageModel`.
  - Uses `SUPPORTED_REACTION_EMOJIS = ['❤️', '😂', '🔥', '👏', '🎉', '😍', '👍', '😮']` (Notice: `'🎤'` is not present).
  - Heavy database write on each reaction.
- **Architectural Divergence:**
  - Stage cheers are **ephemeral room-wide broadcast events**.
  - Persisting stage cheers to MongoDB would create unacceptable write amplification during lively performances (e.g., 20 users cheering simultaneously).
  - Stage cheers must bypass MongoDB completely, broadcasting directly to room channels via Socket.IO with sub-50ms latency.

### 2.3 Socket.IO Infrastructure & Event Routing
- **Location:** `apps/api/src/realtime/socket.server.ts`, `apps/api/src/realtime/room.events.ts`
- **Capabilities:**
  - Handshake authentication middleware (`socketAuthMiddleware`) validates JWTs and populates `socket.data.user` with `{ id, username, role, avatar }`.
  - Room channels follow the deterministic convention `room:${roomId}` via `getRoomChannel(roomId)`.
  - Sockets join the room channel upon emitting `room:join`.
- **Gaps:**
  - No client-to-server or server-to-client event definitions for stage reactions in `@ktv/contracts/src/realtime.ts`.
  - No event handler for receiving and broadcasting stage cheers.

### 2.4 Rate Limiting & Abuse Prevention
- **Current State:**
  - Chat messages and reactions in `apps/api/src/realtime/chat.events.ts` have schema validation via Zod, but lack strict burst rate limiting at the socket event layer.
  - A malicious or over-eager user could spam thousands of events per second, causing client-side DOM thrashing for all participants.
- **Requirements for Sprint 3.3:**
  - In-memory per-user token bucket / sliding window limiter: Max 5 reactions per 3 seconds per user.
  - Rate limiting must key on `userId` (not `socket.id`) so that opening multiple tabs does not multiply cheer capacity.
  - Rejected reactions must fail silently or acknowledge error to the sender without broadcasting error spam to the rest of the room.

### 2.5 Performance & Isolation Safeguards
- **Karaoke Playback & Lyrics:**
  - Karaoke player lyrics render at ~10 Hz (100ms interval) driven by `requestAnimationFrame` / interval clock sync.
  - Floating stage particles must live in an isolated DOM container with `pointer-events-none` and hardware-accelerated CSS transforms (`transform: translateY(...)`, `opacity`), avoiding parent layout recalculations.
- **Reduced Motion:**
  - Users with `prefers-reduced-motion: reduce` must receive subtle opacity fades or stationary badges instead of floating animations.

---

## 3. Sprint 3.3 Architectural Plan

```
+-----------------------------------------------------------------------------------+
|                                  Client Browser                                    |
|                                                                                   |
|  [SingerTurnIndicator]                                                            |
|    |                                                                              |
|    | Click 👏 / 🔥 / ❤️ / 🎉 / 🎤                                                |
|    v                                                                              |
|  [useStageReactions Hook]                                                         |
|    |                                                                              |
|    |-- Bounded Local Optimistic Render (Max 20 particles)                         |
|    |-- Socket.IO emit: `stage:reaction:send` { roomId, emoji }                    |
+----+------------------------------------------------------------------------------+
     |
     v
+-----------------------------------------------------------------------------------+
|                                 Node.js API Server                                |
|                                                                                   |
|  [registerStageReactionEvents]                                                    |
|    |                                                                              |
|    | 1. Authenticate user from socket session (`socket.data.user.id`)            |
|    | 2. Verify active room membership in MongoDB / session cache                  |
|    | 3. Check User Token Bucket (Max 5 cheers / 3 sec per userId)                 |
|    | 4. Generate Server Event ID & Authoritative Timestamp                        |
|    | 5. Broadcast to `room:${roomId}`: `stage:reaction:new`                       |
|    |    (Zero MongoDB Persistence)                                                |
+----+------------------------------------------------------------------------------+
     |
     v
+-----------------------------------------------------------------------------------+
|                        All Room Participants (Audience)                           |
|                                                                                   |
|  [useStageReactions Hook]                                                         |
|    |-- Deduplicate with bounded FIFO Set (last 50 IDs)                            |
|    |-- Spawn floating particle with random jitter X%                              |
|    |-- Auto-purge after 2000ms                                                    |
|    |-- Respect `prefers-reduced-motion`                                           |
+-----------------------------------------------------------------------------------+
```

---

## 4. Verification Strategy

Following the mandatory **Code-Only Policy**:
- No test files created or modified.
- No test runners (`vitest`, `playwright`) executed.
- Static verification only via:
  - `pnpm typecheck`
  - `pnpm lint`
- Runtime verification scenarios deferred and documented in runbook format.
