# KTV Online — Sprint 2.1.1 Chat & Moderation Hardening Architecture Audit

**Author:** Antigravity Architect & Senior Engineering Team  
**Date:** November 9, 2026  
**Status:** COMPLETE — ARCHITECTURE GATE REVIEW  
**Scope:** Message Idempotency, Compound Pagination, Kick Atomicity, Socket Eviction, Reaction Concurrency, Rate Limiting, TTL Retention  
**Policy:** Code-Only Implementation (No Test Execution)

---

## 1. Executive Summary

Sprint 2.1 introduced realtime social capabilities to KTV Online rooms: persistent text chat, emoji reactions, activity timelines, and host moderation. This hardening sprint (Sprint 2.1.1) performs a rigorous audit of edge cases, race conditions, multi-tab inconsistencies, and idempotency guarantees across the chat and moderation subsystem.

In strict adherence to the **Sprint 2.1.1 Mandatory Code-Only Policy**:
- **Code-Only Implementation:** No test runners (`pnpm test`, Vitest, Jest, Playwright, Cypress) will be executed.
- **No Test Modifications:** No existing test files are modified, and no new test files are created.
- **Static Verification:** Limited to `pnpm typecheck` and `pnpm lint`.
- **Verdict Constraint:** The final sprint outcome must be explicitly marked `CODE COMPLETE — NOT RUNTIME VERIFIED`.
- **Zero Scope Creep:** Strictly no WebRTC, LiveKit, voice chat, microphone permissions, karaoke playback, song queues, lyrics synchronization, gifts, or Redis migrations.

---

## 2. Audit Findings (A1 – A8)

### A1. Message Idempotency

#### Findings & Risk Analysis
- **Persistence Pipeline:** When a client sends a message via Socket.IO `chat:message:send` or REST, `ChatService.sendMessage` handles validation, rate limiting, and persistence via `RoomMessageModel.create`.
- **Current Database Indexes:**
  - `RoomMessageSchema` has an index on `{ roomId: 1, createdAt: -1, _id: -1 }` and a TTL index on `{ createdAt: 1 }`.
  - **DEFECT:** There is **no unique compound index** on `(roomId, senderId, clientMessageId)`.
- **Concurrency & Retry Failure Mode:**
  - If a client experiences a transient network drop immediately after the server persists a message but before the client receives the socket ACK, the client retries with the same `clientMessageId`.
  - Because no database constraint exists, concurrent or retried requests create **duplicate message records** in MongoDB.
  - Furthermore, `chat.events.ts` broadcasts `chat:message:new` unconditionally for every call to `sendMessage`, flooding room occupants with duplicate messages.
- **Remediation Plan:**
  1. Add a **partial unique compound index** to `RoomMessageSchema`:
     ```typescript
     RoomMessageSchema.index(
       { roomId: 1, senderId: 1, clientMessageId: 1 },
       {
         unique: true,
         partialFilterExpression: { clientMessageId: { $type: 'string' } },
       }
     );
     ```
     *Rationale for Partial Index:* System messages and legacy messages may have `clientMessageId === null` or omitted. A partial filter expression guarantees uniqueness only when `clientMessageId` is a string, preventing null-collision conflicts while enforcing strict uniqueness for user messages.
  2. In `ChatService.sendMessage`: Wrap insertion in error handling. If MongoDB throws error code `11000` (duplicate key), catch the error, query the existing persisted message by `{ roomId, senderId, clientMessageId }`, and return `{ message: existing.toJSON(), isDuplicate: true }`.
  3. In `chat.events.ts`: Check `result.isDuplicate`. If `true`, emit the ACK to the retrying client with the authoritative message, but **suppress the room broadcast (`chat:message:new`)**.

---

### A2. Message Pagination Hardening

#### Findings & Risk Analysis
- **Cursor Construction:** In `ChatService.getMessages`, the cursor `before` was parsed either as an ISO Date (`new Date(before)`) or as an ObjectId (`Types.ObjectId(before)`). The response returned `nextCursor = lastItem.createdAt.toISOString()`.
- **DEFECT:**
  - If two or more messages share the exact same millisecond timestamp (`createdAt`), querying with `{ createdAt: { $lt: parsedDate } }` skips all remaining messages sharing that millisecond timestamp when the page boundary falls among them.
  - While sorting is compound `{ createdAt: -1, _id: -1 }`, the pagination query filter only compared the single field `createdAt`.
  - An invalid cursor string causes unpredictable querying behavior rather than graceful validation.
- **Remediation Plan:**
  1. Standardize on a deterministic compound cursor formatted as:
     `${createdAt.toISOString()}_${_id.toString()}`
  2. Implement compound range query filter:
     ```typescript
     query.$or = [
       { createdAt: { $lt: cursorDate } },
       { createdAt: cursorDate, _id: { $lt: new Types.ObjectId(cursorId) } }
     ];
     ```
  3. Support backward compatibility: If `before` lacks the underscore delimiter, gracefully fall back to date-only or ObjectId-only comparison. If parsing fails completely, throw `INVALID_CURSOR` handled as a 400 Bad Request.
  4. Enforce room authorization: Private rooms require authenticated host or active membership (`RoomMembershipModel.exists({ roomId, userId, status: 'active' })`).

---

### A3. Kick Lifecycle Hardening

#### Findings & Risk Analysis
- **Trace of Current Implementation:**
  - `RoomService.kickMember(roomId, hostUserId, targetUserId, reason)`:
    - Validates room exists and is not `closed`.
    - Validates caller is room owner.
    - Transitions target membership:
      `RoomMembershipModel.findOneAndUpdate({ roomId, userId: targetObjectId, status: 'active' }, { $set: { status: 'left', leftAt: new Date(), kickedAt: new Date(), kickedBy: hostObjectId } })`.
    - Decrements `Room.currentParticipantsCount` by 1.
    - Records activity feed entry `member_kicked`.
    - Invokes `evictKickedMember`.
- **DEFECTS & Gaps:**
  1. **Host Immunity:** The current logic prevents kicking self (`hostUserId === targetUserId`), but does **not verify that the target's role is not `'host'`**. If a room has multiple co-hosts in the future or corrupted data, a host could be kicked. A host must never kick another host (`CANNOT_KICK_HOST`).
  2. **Race with Leave/Disconnect:** If a member leaves or is disconnected concurrently, `findOneAndUpdate({ status: 'active' })` safely returns `null`, preventing double-decrement. However, `room.controller.ts` should explicitly handle `CANNOT_KICK_HOST`.
  3. **Concurrency Protection:** The atomic transition on `status: 'active'` already ensures idempotency—if duplicate kick requests arrive, only the first request matches `{ status: 'active' }` and decrements `currentParticipantsCount`. The second returns `NOT_A_MEMBER` and does not mutate occupancy.
- **Remediation Plan:**
  - Update `kickMember` to require `{ roomId: roomObjectId, userId: targetObjectId, status: 'active', role: { $ne: 'host' } }`.
  - If the target user is a host, reject with `CANNOT_KICK_HOST`.
  - Ensure `currentParticipantsCount` decrement, activity feed logging, and socket eviction only execute if the atomic transition succeeded.

---

### A4. Socket Eviction and Reconnect Protection

#### Findings & Risk Analysis
- **Multi-Tab Eviction:** `evictKickedMember` fetches all sockets across the server via `ioInstance.fetchSockets()` and forces any socket matching `s.data?.user?.id === userId` to emit `room:member:kicked` and leave the room channel `room:${roomId}`.
- **DEFECTS & Gaps:**
  1. **Public Room Viewer Reconnect:** In `room.events.ts` (`room:join`), if a room is public, non-members are granted `viewer` role and allowed to subscribe to presence and room events. If a kicked member re-subscribes, they could rejoin as a viewer and listen to ongoing room chat!
  2. **Socket Handler Re-Authorization:** While `chatService.sendMessage` and `chatService.addReaction` check active membership, `chatService.removeReaction` **had no membership check at all**. A kicked member or unauthorized socket could continue removing reactions.
- **Remediation Plan:**
  - In `room.events.ts` (`room:join`): Check if the user has a membership with `status: 'left'` and `kickedAt != null`. If the user was kicked from this room, reject `room:join` with `FORBIDDEN_KICKED`.
  - In `chat.service.ts` (`removeReaction`): Add an active membership verification guard (`RoomMembershipModel.exists({ roomId, userId, status: 'active' })`) ensuring kicked members cannot remove reactions.
  - Re-verify authorization in all socket message and reaction handlers.

---

### A5. Reaction Concurrency

#### Findings & Risk Analysis
- **Existing Implementation:**
  ```typescript
  // Step 1: pull
  await RoomMessageModel.updateOne({ _id }, { $pull: { reactions: { emoji, userId } } });
  // Step 2: push
  await RoomMessageModel.findByIdAndUpdate({ _id }, { $push: { reactions: { emoji, userId, ... } } });
  ```
- **DEFECT:** This non-atomic two-step mutation permits a race condition under rapid concurrent clicks or multi-tab usage. Two simultaneous `addReaction` calls can both execute `$pull` before either executes `$push`, resulting in duplicate reaction entries in the embedded array.
- **Remediation Plan:**
  - Replace the non-atomic sequence with a single atomic conditional update:
    ```typescript
    const updateResult = await RoomMessageModel.updateOne(
      {
        _id: messageObjectId,
        roomId: roomObjectId,
        deletedAt: null,
        reactions: {
          $not: {
            $elemMatch: { emoji, userId: userObjectId },
          },
        },
      },
      {
        $push: {
          reactions: {
            emoji,
            userId: userObjectId,
            username: user.username,
            createdAt: new Date(),
          },
        },
      }
    );
    ```
  - If another concurrent request already added that emoji reaction, the `$not: { $elemMatch }` condition fails to match, atomically preventing duplicates.
  - After updating, fetch the authoritative message document, transform reactions to summary counts (`ChatReactionSummaryDto[]`), and broadcast the authoritative result.
  - For `removeReaction`, execute a single atomic `$pull`:
    `RoomMessageModel.findOneAndUpdate({ _id, roomId }, { $pull: { reactions: { emoji, userId } } }, { new: true })`.

---

### A6. Rate Limiting

#### Findings & Risk Analysis
- **Keying:** `UserRateLimiter` is keyed by `user.id` (extracted from authenticated JWT `socket.data.user`).
- **Multi-Tab Sharing:** Because buckets are stored by user ID (`buckets.get(userId)`), multiple tabs and sockets belonging to the same user share the exact same rate-limiting bucket. A user cannot bypass limits by opening multiple tabs.
- **Cleanup & Memory Leak Prevention:**
  - `cleanup()` removes buckets idle for more than 60 seconds (`now - lastRefill > 60000`).
  - Ran every 5 minutes (`setInterval(..., 300000)`).
  - Memory consumption is bounded: an idle user consumes 0 bytes after 5 minutes.
- **Single-Instance Architectural Limitation:**
  - The in-memory sliding bucket is local to the Node.js process. In a horizontally scaled multi-instance deployment with multiple API replicas, a distributed store (e.g. Redis) would be required to coordinate rate limits globally.
  - Per the architectural constraints of this sprint, no Redis dependency is introduced. The single-instance limitation is documented.

---

### A7. Retention Policy Audit

#### Findings & Risk Analysis
- **Indexes:**
  - `RoomMessageModel`: `{ createdAt: 1 }, { expireAfterSeconds: 2592000 }` (30 days).
  - `RoomActivityModel`: `{ createdAt: 1 }, { expireAfterSeconds: 604800 }` (7 days).
- **Asynchronous Deletion Behavior:**
  - MongoDB's background TTL thread runs once every 60 seconds. Documents are not deleted synchronously the exact second they expire.
  - Soft-deleted messages (`deletedAt != null`) are also reclaimed by the 30-day index, which is acceptable since audit logs do not require permanent hot storage in this stage.
  - Retention values are verified to be defect-free and are preserved without modification.

---

### A8. Sprint 2.0 Residual Concerns

#### Findings & Risk Analysis
- **Session Revocation:**
  - Handshake authentication uses `socketAuthMiddleware` to verify the JWT and validate that `user.status === 'active'`.
  - For already-connected sockets whose sessions are revoked, `disconnectUserSockets(userId)` is available in `socket.server.ts`.
  - Furthermore, on every sensitive chat operation, domain checks verify active membership in MongoDB.
- **Reconnection & Stale Events:**
  - Upon reconnection, `room:join` revalidates room status, visibility, and membership.
  - Frontend `use-room-chat.ts` reconciles optimistic state using `clientMessageId` and deduplicates incoming messages by `id` and `clientMessageId`.

---

## 3. Summary of Planned Hardening Actions

| Component | Target File | Hardening Action |
| :--- | :--- | :--- |
| **B1. Idempotency** | `message.model.ts` | Partial unique compound index on `(roomId, senderId, clientMessageId)` |
| **B1. Idempotency** | `chat.service.ts` | Catch duplicate key `11000`, query existing message, return `isDuplicate: true` |
| **B1. Idempotency** | `chat.events.ts` | ACK sender on duplicate, suppress `chat:message:new` broadcast |
| **B2. Pagination** | `chat.service.ts` | Stable compound cursor `${createdAt}_${_id}`, `$or` range query, cursor validation |
| **B3. Kick Lifecycle** | `room.service.ts` | Disallow kicking host (`CANNOT_KICK_HOST`), atomic transition, single decrement |
| **B3. Kick Lifecycle** | `room.controller.ts` | Add `CANNOT_KICK_HOST` response handling (400) |
| **B4. Socket Eviction** | `room.events.ts` | Check `kickedAt != null` on `room:join`, reject kicked users with `FORBIDDEN_KICKED` |
| **B4. Socket Eviction** | `chat.service.ts` | Add active membership check to `removeReaction` |
| **B5. Reactions** | `chat.service.ts` | Atomic conditional `$push` with `$not: { $elemMatch }` to prevent duplicates |
| **B6. Rate Limiting** | `chat.service.ts` | Retain user-keyed buckets, verify cleanup interval and multi-tab sharing |
| **Contracts** | `packages/contracts` | Export `CANNOT_KICK_HOST`, `FORBIDDEN_KICKED`, compound cursor types |

Proceeding to Phase B implementation.
