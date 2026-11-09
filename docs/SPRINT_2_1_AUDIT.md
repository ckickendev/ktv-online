# KTV Online — Sprint 2.1 Social Room Interaction Architecture Audit

**Author:** Antigravity Architect & Senior Engineering Team  
**Date:** November 9, 2026  
**Status:** COMPLETE — ARCHITECTURE GATE REVIEW  
**Scope:** Realtime Text Chat, Emoji Reactions, Room Activity Feed, Host Moderation & Abuse Prevention  
**Policy:** Code-Only Implementation (No Test Execution)

---

## 1. Executive Summary

Sprint 2.1 expands KTV Online's realtime capabilities from the connection and presence foundation established in Sprint 2.0 to an interactive social layer. Rooms transition from passive viewing environments into vibrant social karaoke lounges where members can exchange text messages, react with emojis, observe room activity timelines, and hosts can moderate communications and membership safely.

In accordance with the **Sprint 2.1 Code-Only Directive**:
- **Code-Only Implementation:** No test runners (`pnpm test`, Vitest, Jest) will be executed, and no new test files will be created. Static verification via `pnpm typecheck` and `pnpm lint` is permitted.
- **Zero Media/Audio/Karaoke Contamination:** WebRTC, LiveKit, voice chat, microphone controls, audio streaming, karaoke playback, song queues, and lyrics synchronization remain strictly deferred.
- **Reuse Existing Foundations:** The Socket.IO server, `socketAuthMiddleware`, `RoomPresenceManager`, and Express HTTP server bootstrap from Sprint 2.0 form the foundation for all social events.
- **Strict Invariant Guarantee:** Room participant counts (`Room.currentParticipantsCount === active RoomMembership count`) remain strictly governed by domain services, not socket connections.

This audit evaluates the system, details the architectural decisions for all 10 mandatory audit areas, and defines the blueprint for implementation.

---

## 2. Codebase Baseline & Relevant Artifacts Inspected

### 2.1 Backend Modules Inspected (`apps/api`)
- [realtime/socket.server.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/socket.server.ts): Socket.IO server bootstrap, CORS origin enforcement, buffer ceilings (1MB max, 32KB per payload), and channel utilities (`broadcastRoomClosed`, `disconnectUserSockets`).
- [realtime/room.events.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room.events.ts): Existing room presence lifecycle handlers (`room:join`, `room:leave`, `room:presence:request`, `disconnect`).
- [realtime/presence.manager.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/presence.manager.ts): In-memory presence tracker (`roomId -> userId -> Set<socketId>`) managing multi-tab connections and first-connect/last-disconnect semantics.
- [realtime/socket.auth.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/socket.auth.ts): Handshake JWT verification via `verifyAccessToken` and active user validation via `UserModel`.
- [modules/rooms/room.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.model.ts): Mongoose room document schema.
- [modules/rooms/membership.model.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/membership.model.ts): Persistent membership model with partial unique index ensuring one active membership per user per room.
- [modules/rooms/room.service.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts): Room domain service managing `create`, `findById`, `joinRoom`, `leaveRoom`, `closeRoom`, and `getActiveMembers`.

### 2.2 Shared Contracts Inspected (`packages/contracts`)
- [realtime.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/realtime.ts): Shared TypeScript schemas and event names (`SOCKET_EVENTS`, `PresenceMemberDtoSchema`, `SocketAckResponseSchema`).
- [room.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/room.ts): Room DTOs and queries.

### 2.3 Frontend Modules Inspected (`apps/web`)
- [lib/socket/socket-client.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/lib/socket/socket-client.ts): Singleton `SocketClientManager` bound to `tokenStore`.
- [hooks/use-room-socket.ts](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/hooks/use-room-socket.ts): React hook managing room presence subscriptions and reconnection.
- [app/(platform)/rooms/[roomId]/page.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/%28platform%29/rooms/%5BroomId%5D/page.tsx): Main karaoke room interface featuring simulated chat and member roster.
- [components/shared/room-member-list.tsx](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/components/shared/room-member-list.tsx): Member roster component with live presence indicators.

---

## 3. Detailed Audit Findings & Core Questions

### Question 1: Existing Event Architecture

The existing realtime architecture in `apps/api/src/realtime` uses Socket.IO channel isolation:
- Each room maps to an internal server channel: `room:${roomId}`.
- Handshake middleware verifies identity and attaches `socket.data.user = { id, username, role, avatar }`.
- Clients join the channel upon emitting `room:join` and leaving upon `room:leave` or `disconnect`.
- Server-to-client events currently include:
  - `room:presence:snapshot`
  - `room:member:joined`
  - `room:member:left`
  - `room:closed`

**Extending for Social Interactions:**
Social interactions map cleanly into the same room channel:
- When a message is sent via `chat:message:send`, the server validates the payload, checks active room membership, persists the message in MongoDB, and broadcasts `chat:message:new` to `room:${roomId}`.
- Reaction events (`chat:reaction:add`, `chat:reaction:remove`) broadcast `chat:reaction:updated` to `room:${roomId}`.
- Message deletions broadcast `chat:message:deleted` to `room:${roomId}`.
- Room activity events broadcast `room:activity:new` to `room:${roomId}`.

---

### Question 2: Chat Persistence Strategy

**Requirements:**
- High throughput, low latency write on new message delivery.
- Stable, cursor-based pagination for history fetching (scrolling backwards in time).
- Soft-deletion support to retain audit logs while hiding deleted content from general members.
- Atomic reaction tracking without high-overhead join queries.

**Decision:**
Implement a dedicated `RoomMessage` Mongoose model in `apps/api/src/modules/chat/message.model.ts`:
- Compound index: `{ roomId: 1, createdAt: -1, _id: -1 }`. This supports fast cursor pagination:
  `RoomMessageModel.find({ roomId, createdAt: { $lt: cursorDate } }).sort({ createdAt: -1, _id: -1 }).limit(limit)`
- Soft deletion: Fields `deletedAt: Date | null`, `deletedBy: ObjectId | null`.
  - When deleted, the REST API and socket broadcasts sanitize the message content to:
    `"[This message was deleted by the host]"` while preserving `senderUsername` and timestamp so the timeline remains stable.
- Embedded reactions: To avoid expensive multi-document joins on every message fetch, reactions are stored embedded in the message document:
  `reactions: Array<{ emoji: string, userId: ObjectId, username: string, createdAt: Date }>`
  Because reactions are restricted to 8 predefined emojis and 1 active reaction per emoji per user, the embedded array is tiny (under 1KB even with dozens of reactions).

---

### Question 3: Chat Authorization Rules

To prevent spam, unauthorized eavesdropping, and spoofing:
1. **Message Sending (`chat:message:send`):**
   - Socket identity is resolved exclusively from verified handshake credentials (`socket.data.user`).
   - The room must exist and must not be `closed`.
   - The room must have `isChatEnabled !== false` (or if disabled, sender must be room host).
   - The user must have an active membership in the room (`RoomMembershipModel.findOne({ roomId, userId, status: 'active' })`).
   - Viewers without an active room membership cannot send messages.
2. **Message History Retrieval (`GET /api/v1/rooms/:roomId/messages`):**
   - If the room is public: any authenticated user or room viewer can retrieve message history.
   - If the room is private: only the host or active members can retrieve message history.
3. **System Messages:**
   - Client-submitted `messageType === 'system'` is strictly rejected. System messages can only be generated internally by trusted backend domain services.

---

### Question 4: Reaction Event Design

**Predefined Emoji Allowlist:**
`['❤️', '😂', '🔥', '👏', '🎉', '😍', '👍', '😮']` (8 emojis). Any other character or string is rejected via Zod schema.

**Atomic Operation Semantics:**
- Add Reaction (`chat:reaction:add`):
  - Check user active membership.
  - Atomically update using `$addToSet` or conditional `$push` to prevent duplicate reactions of the same emoji by the same user.
- Remove Reaction (`chat:reaction:remove`):
  - Check user active membership.
  - Atomically remove using `$pull: { reactions: { emoji, userId: userObjectId } }`.
- Broadcast:
  - Compute summarized reaction counts: `Array<{ emoji: string, count: number, userIds: string[] }>`.
  - Emit `chat:reaction:updated` to `room:${roomId}`.

---

### Question 5: Activity Feed Architecture

**Separation of Ephemeral Presence vs. Persistent Room Activities:**
- **Ephemeral Presence:** Socket connects/disconnects, tab switches, online member counts. Managed in memory by `RoomPresenceManager` and broadcast via `room:member:joined`, `room:member:left`.
- **Persistent Room Activity:** High-value domain events:
  - `room_created`: Host created room.
  - `member_joined`: User officially joined the room via `POST /api/v1/rooms/:roomId/join`.
  - `member_left`: User officially departed via `POST /api/v1/rooms/:roomId/leave`.
  - `member_kicked`: Host removed a member via `POST /api/v1/rooms/:roomId/members/:userId/kick`.
  - `room_settings_updated`: Host changed room settings.
  - `room_closed`: Host closed the room.

**Persistence:**
Implement `RoomActivityModel` with compound index `{ roomId: 1, createdAt: -1 }` and a 7-day TTL index (`expireAfterSeconds: 604800`) to guarantee bounded storage without manual cleanup jobs.
REST endpoint `GET /api/v1/rooms/:roomId/activities` provides recent activity timeline.
Realtime event `room:activity:new` broadcasts new activities as they occur.

---

### Question 6: Host Moderation Permissions

1. **Delete Message:**
   - Host can soft-delete any message in their room (`ownerId.toString() === requestingUser.id`).
   - Regular members cannot delete messages sent by other users.
   - Deleted messages are flagged with `deletedAt: new Date()` and `deletedBy: hostObjectId`.
   - Server emits `chat:message:deleted` to `room:${roomId}`.
2. **Kick Member:**
   - Host can kick any regular member who holds an active membership.
   - Host cannot kick themselves.
   - Target's `RoomMembership` is atomically transitioned from `active` to `left`, with metadata `kickedAt: new Date()`, `kickedBy: hostObjectId`.
   - Decrement `Room.currentParticipantsCount` by 1.
   - Server emits `room:member:kicked` to target socket(s).
   - Server forces target socket(s) to leave `room:${roomId}` channel and clears their presence.
   - Server broadcasts `room:activity:new` (`member_kicked`) and `room:member:left` to remaining occupants.
3. **Chat Toggle (Room Chat Enabled/Disabled):**
   - Host can toggle `isChatEnabled` (boolean) in `RoomModel`.
   - When `false`, regular members are blocked from sending messages (`CHAT_DISABLED`).

---

### Question 7: Message Retention Strategy

To prevent unbounded growth while keeping the implementation clean and standard:
1. Messages are indexed by `{ roomId: 1, createdAt: -1, _id: -1 }`.
2. Messages older than 30 days can be automatically expired via MongoDB TTL index on `createdAt` (`expireAfterSeconds: 2592000` = 30 days), ensuring database retention is strictly bounded without maintenance cron jobs.
3. Cursor pagination returns a maximum of 50 messages per page.

---

### Question 8: Frontend Integration Strategy

In `apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`:
1. **Centralized Hook `useRoomChat(roomId)`:**
   - Manages message history using TanStack Query (`queryKeys.chat.messages(roomId)`).
   - Subscribes to Socket.IO events (`chat:message:new`, `chat:message:deleted`, `chat:reaction:updated`).
   - Supports optimistic updates with temporary client IDs (`temp-${uuid}`) and replaces them upon server acknowledgement.
   - Provides `sendMessage`, `deleteMessage`, `addReaction`, `removeReaction`.
2. **Chat Panel Component (`apps/web/src/components/chat/room-chat-panel.tsx`):**
   - Scrollable message viewport with smart auto-scroll (only auto-scrolls down if user is already at the bottom).
   - Unread message badge indicator when scrolled up.
   - Message bubble with timestamp, sender avatar, role badge (Host / Member / System), and deleted message styling.
   - Emoji reaction picker and active reaction buttons.
   - Host trash icon for message deletion with confirmation dialog.
3. **Room Activity Timeline:**
   - Integrated as a toggleable view in the room sidebar or tabs (`Chat` vs `Activities`).
4. **Host Moderation Dialogs:**
   - Kick button on `RoomMemberList` items with confirmation dialog.
   - Chat enabled/disabled toggle switch in room controls.

---

### Question 9: Security and Abuse Risks

| Threat | Mitigation |
| :--- | :--- |
| **Message Flooding / Spam** | In-memory token bucket rate limiter: max 5 messages per 3 seconds per user; max 10 reactions per 5 seconds. Exceeding triggers `RATE_LIMITED` socket error. |
| **XSS & Executable Content** | Strict plain-text serialization, Zod trimming (`.min(1).max(1000)`), React HTML escaping (zero `dangerouslySetInnerHTML`). |
| **Identity Spoofing** | Sender identity extracted exclusively from verified JWT payload `socket.data.user`. Client-supplied user information is ignored. |
| **Unauthorized Private Eavesdropping** | Sockets cannot join channel or query messages without host or active membership validation. |
| **Host Privilege Escalation** | Moderation commands verify room ownership against MongoDB `RoomModel.findById` before executing deletions or kicks. |
| **Payload Bloat / DoS** | Socket server enforces 32KB payload buffer; messages capped at 1000 characters; emoji allowlist restricts payloads to 8 known characters. |

---

### Question 10: Database Changes Required and Justification

1. **`RoomMessage` Collection (New Model):**
   - *Justification:* Persistent storage for room chat history and embedded emoji reactions.
   - *Fields:* `roomId`, `senderId`, `senderUsername`, `senderAvatar`, `senderRole`, `content`, `messageType`, `clientMessageId`, `deletedAt`, `deletedBy`, `reactions`, `createdAt`, `updatedAt`.
   - *Indexes:*
     - Compound: `{ roomId: 1, createdAt: -1, _id: -1 }` (cursor pagination).
     - TTL index: `{ createdAt: 1 }` with `expireAfterSeconds: 2592000` (30 days automatic retention).
2. **`RoomActivity` Collection (New Model):**
   - *Justification:* Persistent social activity timeline (joins, leaves, kicks, settings changes).
   - *Fields:* `roomId`, `type`, `actorId`, `actorUsername`, `targetId`, `targetUsername`, `metadata`, `createdAt`.
   - *Indexes:*
     - Compound: `{ roomId: 1, createdAt: -1 }`.
     - TTL index: `{ createdAt: 1 }` with `expireAfterSeconds: 604800` (7 days automatic retention).
3. **`RoomModel` Addition (1 Field):**
   - *Field:* `isChatEnabled: { type: Boolean, default: true }`.
   - *Justification:* Allows host moderation to disable/enable room chat without schema refactoring.
4. **`RoomMembershipModel` Addition (2 Optional Fields):**
   - *Fields:* `kickedAt: { type: Date, default: null }`, `kickedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }`.
   - *Justification:* Audit trail for host moderation kicks while preserving existing `status: 'left'` lifecycle semantics.

---

## 4. Architecture Approval

The proposed design reuses the verified Socket.IO infrastructure from Sprint 2.0, preserves domain invariants, adheres to code-only constraints, and introduces robust data structures for social room interactions.

Proceeding to implementation.
