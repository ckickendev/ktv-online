# KTV Online — Realtime Chat Architecture

**Document:** Social Interaction & Chat Architecture  
**Sprint:** Sprint 2.1  
**Status:** CODE COMPLETE — NOT RUNTIME VERIFIED  
**Audience:** Backend Engineers, Frontend Engineers, Infrastructure Architects

---

## 1. Overview

The KTV Online Chat Architecture provides sub-second text communication and emoji reactions for live karaoke rooms. It combines Socket.IO for low-latency broadcast with MongoDB persistence for auditability, history retrieval, and reconnection recovery.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Member (Alice)
    participant Client as Frontend (apps/web)
    participant Socket as Socket.IO (apps/api)
    participant Service as ChatService
    participant DB as MongoDB (RoomMessage)
    actor Bob as Member (Bob)

    Alice->>Client: Types message & presses Enter
    Client->>Client: Generates clientMessageId & adds optimistic bubble
    Client->>Socket: emit("chat:message:send", { roomId, content, clientMessageId })
    Socket->>Service: sendMessage(roomId, user, content, clientMessageId)
    Service->>Service: Verify room open, chat enabled, active membership, rate limits
    Service->>DB: RoomMessageModel.create(...)
    DB-->>Service: Persisted Document (id, createdAt)
    Service-->>Socket: Return ChatMessageDto
    Socket->>Client: ack({ success: true, data: message })
    Client->>Client: Replaces optimistic bubble with persisted message
    Socket-->>Bob: broadcast("chat:message:new", { roomId, message })
    Bob->>Bob: Renders Alice's message in chat panel
```

---

## 2. Data Models & Schemas

### 2.1 `RoomMessage` Mongoose Schema (`apps/api/src/modules/chat/message.model.ts`)

```typescript
{
  roomId: { type: ObjectId, ref: 'Room', required: true, index: true },
  senderId: { type: ObjectId, ref: 'User', default: null, index: true },
  senderUsername: { type: String, required: true, trim: true },
  senderAvatar: { type: String, default: null },
  senderRole: { type: String, enum: ['host', 'member', 'viewer', 'system'], default: 'member' },
  content: { type: String, required: true, trim: true, maxlength: 1000 },
  messageType: { type: String, enum: ['text', 'system'], default: 'text' },
  clientMessageId: { type: String, default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: ObjectId, ref: 'User', default: null },
  reactions: [
    {
      emoji: { type: String, enum: SUPPORTED_REACTION_EMOJIS, required: true },
      userId: { type: ObjectId, ref: 'User', required: true },
      username: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

### 2.2 Indexes and Retention

1. **Compound Index for Cursor Pagination:**
   `{ roomId: 1, createdAt: -1, _id: -1 }`
   Allows fast retrieval of the most recent $N$ messages without sorting large collections.
2. **TTL Automatic Retention Index:**
   `{ createdAt: 1 }, { expireAfterSeconds: 2592000 }` (30 days)
   Automatically removes room messages older than 30 days without requiring background cron tasks.

---

## 3. Emoji Reactions Architecture

Reactions are embedded directly within each message document rather than stored in a separate collection.

### 3.1 Predefined Allowlist

Only 8 curated emojis are accepted:
`['❤️', '😂', '🔥', '👏', '🎉', '😍', '👍', '😮']`

Any other emoji or character string is rejected at the API and Socket boundary via Zod schema validation (`ReactionEmojiSchema`).

### 3.2 Atomic Add and Remove Semantics

- **Add Reaction (`chat:reaction:add`):**
  1. Pulls existing reaction with the same emoji and user ID:
     `{ $pull: { reactions: { emoji, userId: userObjectId } } }`
  2. Pushes new reaction:
     `{ $push: { reactions: { emoji, userId, username, createdAt } } }`
  3. Ensures at most 1 active reaction of a given emoji type per user.
- **Remove Reaction (`chat:reaction:remove`):**
  1. Pulls reaction:
     `{ $pull: { reactions: { emoji, userId: userObjectId } } }`
- **Broadcast (`chat:reaction:updated`):**
  Calculates summarized reaction counts:
  ```json
  [
    { "emoji": "🔥", "count": 3, "userIds": ["user_1", "user_2", "user_3"] },
    { "emoji": "👏", "count": 1, "userIds": ["user_4"] }
  ]
  ```
  Emits `chat:reaction:updated` to the room channel `room:${roomId}`.

---

## 4. History Retrieval & Cursor Pagination

### Endpoint: `GET /api/v1/rooms/:roomId/messages`

- **Query Parameters:**
  - `limit`: number (1-100, default: 50)
  - `before`: string (ISO 8601 timestamp or ObjectId cursor)
- **Authorization:**
  - Public rooms: Open to authenticated users and viewers.
  - Private rooms: Restricted to room host or active members.
- **Soft Deletion Presentation:**
  Messages with `deletedAt !== null` are returned with:
  ```json
  {
    "id": "673000000000000000000099",
    "isDeleted": true,
    "content": "[This message was deleted by the host]",
    "senderUsername": "alex_singer",
    "createdAt": "2026-11-09T22:00:00.000Z"
  }
  ```
  This preserves conversation continuity and timeline position while preventing exposure of purged text.

---

## 5. Security & Abuse Prevention

1. **Token Bucket Rate Limiting:**
   - **Messages:** Max 5 messages per 3-second window per user.
   - **Reactions:** Max 10 reactions per 5-second window per user.
   - Exceeding the bucket triggers a `RATE_LIMITED` socket error without crashing or disconnecting the socket.
2. **Text Normalization:**
   - Trimmed automatically.
   - Bounded length: 1 to 1000 characters.
   - Rendered using standard React JSX text nodes (zero `dangerouslySetInnerHTML`).
3. **Sender Spoofing Prevention:**
   - Sender identity (`userId`, `username`, `avatar`, `role`) is extracted directly from the verified socket handshake session (`socket.data.user`).
   - Client-supplied sender metadata is disregarded.
