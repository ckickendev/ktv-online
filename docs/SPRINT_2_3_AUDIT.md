# Sprint 2.3 — Voice Infrastructure Foundation Audit

## 1. Executive Summary

This audit evaluates the KTVOnline repository in preparation for **Sprint 2.3 — Voice Infrastructure Foundation**.
The objective is to enable authenticated room members to establish real-time voice communication via **LiveKit** while preserving all existing domain invariants, authorization boundaries, and database consistency guarantees established in Sprints 0–2.2.1.

In accordance with the mandatory code-only policy, this audit verifies existing backend authentication, room membership lifecycle, room closure, kick moderation, socket session invalidation, frontend architecture, and environmental configuration before any functional implementation begins.

---

## 2. Package Structure & Dependency Baseline

The repository is structured as a pnpm monorepo:

| Package | Role | Key Dependencies & Versions |
| :--- | :--- | :--- |
| `packages/contracts` | Shared schemas & DTOs | `zod@^3.24.2`, `tsup@^8.4.0`, `typescript@^5.8.2` |
| `apps/api` | Node.js / Express backend | `express@^4.21.2`, `mongoose@^8.10.1`, `socket.io@^4.8.4`, `jsonwebtoken@^9.0.2`, `livekit-server-sdk@^2.19.2`, `pino@^9.6.0` |
| `apps/web` | Next.js App Router | `next@^15.2.0`, `react@^19.0.0`, `react-dom@^19.0.0`, `livekit-client@^2.23.0`, `@livekit/components-react@^2.8.2`, `zustand@^5.0.3`, `@tanstack/react-query@^5.66.7`, `tailwindcss@^4.0.9` |

### Key Observations:
- **Node.js**: Version 22 (ESM modules with `"type": "module"` in `package.json`).
- **React**: Version 19.0.0 with Next.js 15 App Router. LiveKit components are fully compatible (`peerDependencies: react >= 18`).
- **LiveKit Server SDK**: `livekit-server-sdk` v2.19.2 provides `AccessToken`, `RoomServiceClient`, and `WebhookReceiver`.
- **LiveKit Client SDK**: `livekit-client` v2.23.0 and `@livekit/components-react` v2.8.2 provide WebRTC room management, audio track publishing/subscribing, device enumeration, speaking detection, and audio rendering.

---

## 3. Core Architecture Audit Questions

### 3.1 How a User Becomes an Authorized Room Member
1. **Endpoint**: `POST /api/v1/rooms/:id/join`.
2. **Authentication**: Enforced via `requireAuth` middleware, which parses and cryptographically verifies the JWT Bearer access token (`req.user = { id, email, username, role, familyId }`).
3. **Account Status Verification**: Verifies `user.status === 'active'`. Suspended or inactive users receive HTTP 403.
4. **Room Existence & Status**: Verifies `RoomModel.findById(roomId)` exists and `room.status === 'open'`. Closed rooms reject joins (`ROOM_CLOSED`).
5. **Private Access Control**: If `room.isPrivate === true`, validates supplied `accessCode` against `room.accessCode` (or verifies host identity).
6. **Active Kick Moderation Check**: Inspects `RoomMembershipModel.findOne({ roomId, userId })`. If membership status is `left` and `kickedAt != null`, returns HTTP 403 `FORBIDDEN_KICKED`.
7. **Atomic Capacity Reservation**: Executes atomic CAS `$inc: { currentParticipantsCount: 1 }` with `{ currentParticipantsCount: { $lt: room.capacity }, status: 'open' }`.
8. **Membership Persistence**: Upserts `RoomMembershipModel` with `status: 'active'`, `joinedAt: new Date()`, `kickedAt: null`, `kickedBy: null`.
9. **Version Advancement & Publication**: Advances `room.stateVersion: 1` atomically and publishes `room.member.joined` via Socket.IO.

### 3.2 How Room Membership Can Be Revoked
1. **Voluntary Member Leave**:
   - `POST /api/v1/rooms/:id/leave`.
   - Transitions `RoomMembershipModel` to `status: 'left'`, `leftAt: new Date()`.
   - Decrements `RoomModel.currentParticipantsCount: -1`.
   - Increments `stateVersion: 1` and publishes `room.member.left`.
2. **Host Moderation Kick**:
   - `POST /api/v1/rooms/:id/members/:userId/kick`.
   - Verifies caller is room host (`room.hostId.equals(hostUserId)`).
   - Atomically transitions active `RoomMembershipModel` to `status: 'left'`, records `kickedAt: new Date()`, `kickedBy: hostUserId`.
   - Decrements `RoomModel.currentParticipantsCount: -1`.
   - Increments `stateVersion: 1` and publishes `room.member.kicked`.
   - Invokes `evictKickedMember(roomId, targetUserId, reason)`: emits `member:kicked` to target user's sockets, removes them from the Socket.IO channel, and clears room presence.

### 3.3 How Room Closure is Implemented
1. **Endpoint**: `POST /api/v1/rooms/:id/close`.
2. **Authorization**: Caller must be room host (`room.hostId.equals(hostUserId)`).
3. **Atomic State Mutation**: Updates `RoomModel` to `status: 'closed'`, sets `closedAt: new Date()`, increments `stateVersion: 1`.
4. **Membership Cleanup**: Updates all active memberships to `status: 'left'`, `leftAt: new Date()`.
5. **Realtime Broadcast**: Invokes `broadcastRoomClosed(roomId, reason)`:
   - Emits `room:closed` to the Socket.IO room channel.
   - Clears in-memory presence via `presenceManager.clearRoom(roomId)`.
   - Forces all connected sockets to leave the Socket.IO channel.

### 3.4 How Established Sessions Are Invalidated
1. **Session Family Model**: `SessionModel` tracks `userId`, `familyId`, `refreshTokenHash`, `revokedAt`, and `expiresAt`.
2. **JWT Payload**: Access tokens embed `familyId` along with user identity.
3. **Handshake & Revocation**:
   - `socketAuthMiddleware` parses and validates JWT, storing `familyId` in `socket.data.user`.
   - Explicit logout (`POST /api/v1/auth/logout`): Marks session family as revoked in MongoDB and calls `disconnectSessionSockets(familyId)`.
   - Refresh Token Reuse Detection (`auth.service.ts`): If a reused refresh token is presented, the entire session family is revoked and `disconnectSessionSockets(revokedSession.familyId)` is invoked immediately.
   - `disconnectSessionSockets(familyId)` finds all active sockets with matching `familyId`, emits `SESSION_REVOKED`, and disconnects them with `s.disconnect(true)`.

### 3.5 Where LiveKit Token Generation Should Live
- Token generation must reside exclusively on the server in a new dedicated module:
  `apps/api/src/modules/voice/`
  - `voice.service.ts`: Orchestrates authorization, room verification, and LiveKit token issuance.
  - `voice-token.service.ts`: Wraps `livekit-server-sdk` `AccessToken` construction, grant specification, and cryptographic signing.
  - `voice.controller.ts`: Handles HTTP request/response for token generation and renewal.
  - `voice.routes.ts`: Mounts `POST /api/v1/rooms/:roomId/voice/token` guarded by `requireAuth`.
  - `voice.types.ts`: Internal voice types and interfaces.
- **Security Boundary**: The frontend never receives LiveKit API keys or signing secrets. It only receives short-lived, cryptographically signed JWT access tokens with restricted permissions.

### 3.6 How LiveKit Webhooks Should Integrate with the API
- **Endpoint**: `POST /api/v1/webhooks/livekit` (or `POST /api/v1/voice/webhook`).
- **Signature Verification**: LiveKit webhooks include an `Authorization` header containing a signed JWT. The official `WebhookReceiver` from `livekit-server-sdk` verifies the raw request body against `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
- **Raw Body Handling**: Express JSON middleware in `app.ts` must preserve the raw payload buffer (e.g., via `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })`) so `WebhookReceiver.receive(req.rawBody, req.headers.authorization)` can verify signatures accurately without string encoding corruption.
- **Idempotency & Lifecycle Events**:
  - `participant_joined`: Logs event with correlation ID. Does **NOT** mutate persistent `RoomMembership` or `Room.currentParticipantsCount`.
  - `participant_left`: Cleans up local ephemeral voice presence records if maintained.
  - `room_finished`: Emits internal cleanup logs; does not reopen or rewrite KTVOnline room state.

### 3.7 How Voice State Should Be Represented in the Frontend
- **Dedicated Feature Module**: `apps/web/src/features/voice/`:
  - `api/voice-api.ts`: Typed API client for requesting and renewing voice tokens.
  - `hooks/use-voice-client.ts`: Manages connection lifecycle to LiveKit `Room`, state machine transitions, track publication, local mute, device enumeration, speaking detection, and event listener cleanup.
  - `components/voice-controls.tsx`: Bottom bar containing Join Voice, Leave Voice, Mic Mute/Unmute, Device Selector, and Connection State Indicator.
  - `components/voice-participants.tsx`: Displays active voice participants with real-time speaking indicators (`useIsSpeaking`) and mic muted badges.
  - `components/voice-audio-renderer.tsx`: Renders remote audio tracks safely without duplicate element attachment.
- **State Machine**:
  - `idle`: Not connected to voice; ready to join.
  - `requesting_permission`: Browser microphone permission prompt active.
  - `connecting`: Exchanging token and negotiating WebRTC connection with LiveKit.
  - `connected`: Active voice participant; audio published and subscribed.
  - `reconnecting`: LiveKit client handling temporary ICE/network interruption.
  - `disconnected`: Gracefully disconnected by user or server.
  - `failed`: Connection error, device error, or network failure.
  - `unauthorized`: Token rejected, user kicked, room closed, or membership revoked.

### 3.8 Which Existing Modules Can Be Reused
1. `middlewares/auth.middleware.ts` (`requireAuth`): Reused to authenticate callers requesting voice tokens.
2. `modules/rooms/room.model.ts` (`RoomModel`): Reused to verify room status, capacity, and host identity.
3. `modules/rooms/membership.model.ts` (`RoomMembershipModel`): Reused to verify caller has active room membership and is not kicked.
4. `modules/rooms/room.service.ts`: Reused for room status and member verification.
5. `realtime/socket.server.ts`: Hooked during `broadcastRoomClosed`, `evictKickedMember`, and `disconnectSessionSockets` to terminate associated LiveKit rooms and disconnect voice participants.
6. `packages/contracts`: Extended with `VoiceTokenRequestSchema`, `VoiceTokenResponseSchema`, `VoiceConnectionState`, and `VoiceParticipantDto`.

---

## 4. Architecture Decisions & Constraints

### 4.1 LiveKit Room Identity Mapping
- KTVOnline room IDs are MongoDB `ObjectId` strings (e.g. `65f01...`).
- The LiveKit room name is deterministically derived as:
  `ktv_room_${roomId}`
- **Security**: The client is never allowed to supply or override the LiveKit room name. The server derives it directly from the validated `:roomId` parameter.

### 4.2 Participant Identity & Multiple Tabs
- If a user opens the same room in multiple browser tabs, both tabs could attempt to join voice.
- LiveKit rejects duplicate participant identities or kicks the older connection.
- **Resolution**:
  - `participantIdentity`: Generated by the server as `${userId}_${crypto.randomUUID().slice(0, 8)}`.
  - `participantMetadata`: Server embeds a trusted JSON payload:
    ```json
    {
      "userId": "65f...",
      "username": "MiaSingz",
      "displayName": "Mia Singer",
      "avatarUrl": "https://...",
      "tabId": "rand-xxx"
    }
    ```
  - The client cannot tamper with this metadata because it is signed into the LiveKit JWT token.
  - The UI groups participants by `userId` or presents them with clear tab distinguishing context, preventing phantom user duplication.

### 4.3 Voice Grants & Token TTL
- Initial token TTL: 5 minutes (`ttl: '5m'`).
- Grants:
  - `roomJoin: true`
  - `room: ktv_room_${roomId}`
  - `canPublish: true` (audio tracks only)
  - `canSubscribe: true`
  - `canPublishData: false` (all data channels handled via Socket.IO)
  - `roomAdmin: false`, `roomRecord: false`
- **Token Renewal**: Connected clients schedule token refresh at 4 minutes (80% of TTL). Renewal hits `POST /api/v1/rooms/:roomId/voice/token`, repeating all membership and kick authorization checks.

### 4.4 Invariant Preservation & Ephemeral Separation
1. `Room.currentParticipantsCount` strictly counts persistent active `RoomMembership` documents. Voice join/leave NEVER modifies this counter.
2. Joining a KTVOnline room never automatically joins voice or requests microphone permissions. Voice is strictly opt-in.
3. Leaving voice does NOT leave the KTVOnline room.
4. Kicked users have their LiveKit participant immediately removed via `RoomServiceClient.removeParticipant`.
5. Closed rooms have their LiveKit room immediately deleted via `RoomServiceClient.deleteRoom`.

---

## 5. Audit Conclusion

All required primitives, lifecycle hooks, authentication layers, and UI components exist and are properly architectured to support LiveKit voice infrastructure. The implementation will proceed according to the designated phases without violating any existing invariants.
