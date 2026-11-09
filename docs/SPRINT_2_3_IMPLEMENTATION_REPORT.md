# Sprint 2.3 — Voice Infrastructure Foundation Implementation Report

## 1. Executive Summary

- **Sprint**: 2.3 — Voice Infrastructure Foundation.
- **Goal**: Enable authenticated room members of KTVOnline to establish real-time voice communication through **LiveKit**, with microphone mute/unmute, speaking indicators, audio subscription, and lifecycle integration, without violating existing database occupancy invariants or coupling with Socket.IO.
- **Mandatory Final Verdict**: **`CODE COMPLETE — NOT RUNTIME VERIFIED`**

---

## 2. Audit Findings & Architecture Decisions

1. **Isolation of Ephemeral vs. Persistent State**:
   - `Room.currentParticipantsCount` strictly reflects persistent `RoomMembership` active records.
   - LiveKit voice participation is completely ephemeral and does **not** mutate persistent occupancy counters.
2. **Deterministic Room Identity Mapping**:
   - LiveKit rooms are mapped as `ktv_room_${roomId}` derived exclusively by the server. Clients cannot provide or tamper with room names.
3. **Session-Unique Participant Identity**:
   - To prevent identity collisions when a user joins the same lounge in multiple tabs, participant identities are formatted as `${userId}_${tabId}`.
   - Trusted user metadata (`userId`, `username`, `displayName`, `avatarUrl`) is signed directly into the LiveKit JWT token payload.
4. **Least-Privilege Token Grants**:
   - Tokens grant only `roomJoin: true`, `room: ktv_room_${roomId}`, `canPublish: true`, and `canSubscribe: true`.
   - Data channels, room admin, and egress capabilities are disabled.
5. **Token Renewal & Lifecycle Hooks**:
   - Initial token TTL is 5 minutes.
   - Connected clients schedule renewal at 80% of TTL (approx. 4 minutes), repeating full database membership and kick status checks.

---

## 3. Files Created & Modified

### 3.1 Created Files
- [`packages/contracts/src/voice.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/voice.ts) — Shared Zod schemas and DTOs for voice tokens, participants, and connection states.
- [`apps/api/src/modules/voice/voice.types.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.types.ts) — Backend voice types and options.
- [`apps/api/src/modules/voice/voice-token.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-token.service.ts) — Service wrapping `livekit-server-sdk` `AccessToken` issuance with 5-minute TTL.
- [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts) — Voice authorization, room identity mapping, participant eviction, and room deletion via `RoomServiceClient`.
- [`apps/api/src/modules/voice/voice.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.controller.ts) — Controller for voice token generation (`POST /rooms/:roomId/voice/token`).
- [`apps/api/src/modules/voice/voice-webhook.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts) — Webhook receiver verifying signatures via `WebhookReceiver`.
- [`apps/api/src/modules/voice/voice.routes.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.routes.ts) — Router mounting voice token and webhook endpoints.
- [`apps/web/src/features/voice/types/voice.types.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/types/voice.types.ts) — Frontend voice client types.
- [`apps/web/src/features/voice/api/voice-api.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/api/voice-api.ts) — API client for voice token requests.
- [`apps/web/src/features/voice/hooks/use-voice-client.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts) — Custom React hook managing LiveKit `Room`, state machine, audio tracks, and cleanup.
- [`apps/web/src/features/voice/components/voice-controls.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/voice-controls.tsx) — Voice action bar (Join/Leave, Mute/Unmute, Device selector, Connection badge).
- [`apps/web/src/features/voice/components/voice-participants.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/voice-participants.tsx) — Realtime voice participant list with speaking indicator and mute status.
- [`apps/web/src/features/voice/index.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/index.ts) — Public exports for voice feature.
- [`docs/SPRINT_2_3_AUDIT.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_2_3_AUDIT.md) — Pre-implementation audit.
- [`docs/VOICE_ARCHITECTURE.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/VOICE_ARCHITECTURE.md) — Realtime voice architecture specification.
- [`docs/LIVEKIT_SETUP.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/LIVEKIT_SETUP.md) — Setup and deployment guide.

### 3.2 Modified Files
- [`packages/contracts/src/index.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/packages/contracts/src/index.ts) — Exported `./voice.js`.
- [`apps/api/src/config/env.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/config/env.ts) — Added validated LiveKit environment variables.
- [`apps/api/src/app.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/app.ts) — Added `rawBody` capture to `express.json` for webhook verification.
- [`apps/api/src/routes/index.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/routes/index.ts) — Mounted `voiceRoutes`.
- [`apps/api/src/modules/rooms/room.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts) — Added LiveKit participant eviction on `leaveRoom` and `kickMember`.
- [`apps/api/src/modules/rooms/room.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.controller.ts) — Added LiveKit room deletion on `closeRoom`.
- [`apps/web/src/lib/api/endpoints/rooms.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/lib/api/endpoints/rooms.ts) — Added `getVoiceToken` endpoint method.
- [`apps/web/src/app/(platform)/rooms/[roomId]/page.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/app/(platform)/rooms/[roomId]/page.tsx) — Integrated `useVoiceClient`, `VoiceControls`, `VoiceParticipants`, and voice header badge.

---

## 4. Backend Implementation Details

1. **Authentication & Authorization**:
   - Handled via `requireAuth`.
   - Validates user is active (not suspended).
   - Validates room exists and `status !== 'closed'`.
   - Validates user has active `RoomMembership`.
   - Validates user has not been kicked (`membership.kickedAt == null`).
2. **Token Generation Endpoint**:
   - `POST /api/v1/rooms/:roomId/voice/token`.
   - Returns `{ serverUrl, token, roomName, participantIdentity, expiresAt }`.
3. **Room Lifecycle Integration**:
   - On `closeRoom`: `voiceService.closeLiveKitRoom(roomId)` deletes the LiveKit room.
   - On `kickMember`: `voiceService.evictLiveKitParticipant(roomId, targetUserId)` severs the kicked member's WebRTC connection immediately.
   - On `leaveRoom`: `voiceService.evictLiveKitParticipant(roomId, userId)` cleans up active connections.
4. **Webhook Endpoint**:
   - `POST /api/v1/webhooks/livekit`.
   - Validates raw body and authorization header via `WebhookReceiver`.
   - Logs events (`participant_joined`, `participant_left`, `room_finished`) without altering persistent room occupancy.

---

## 5. Frontend Implementation Details

1. **Voice Hook (`useVoiceClient`)**:
   - Manages connection lifecycle with state machine: `idle`, `requesting_permission`, `connecting`, `connected`, `reconnecting`, `disconnected`, `failed`, `unauthorized`.
   - Handles local audio track creation, mute, and input device enumeration/switching.
   - Subscribes to remote audio tracks and safely manages HTMLAudioElements to prevent memory and DOM leaks.
   - Handles background token renewal at 80% TTL.
2. **Voice Controls (`VoiceControls`)**:
   - Join Voice / Leave Voice buttons with loading states.
   - Microphone toggle with speaking feedback and mute indicator.
   - Audio input device selector dropdown.
   - Connection status pill and error banner.
3. **Voice Participants (`VoiceParticipants`)**:
   - Displays real-time voice participants with avatars, display names, `(You)` local user tag, and mute icons.
   - Dynamic green glow/ring speaking indicator powered by LiveKit's Voice Activity Detection.
4. **Room Page Integration**:
   - Preserves room chat, member roster, song queue, and activities completely intact.
   - Unmount / leave / logout cleanly terminates voice connection and releases microphone tracks.

---

## 6. Static Verification Commands & Results

Allowed commands were run according to the mandatory code-only policy:

### 1. `pnpm typecheck`
```bash
$ pnpm --recursive run typecheck
Scope: 3 of 4 workspace projects
packages/contracts typecheck$ tsc --noEmit
└─ Done in 695ms
apps/api typecheck$ tsc --noEmit
└─ Done in 1.3s
apps/web typecheck$ tsc --noEmit
└─ Done in 1.9s
```
**Result**: PASSED (0 errors across all 3 packages).

### 2. `pnpm lint`
```bash
$ pnpm --recursive run lint
Scope: 3 of 4 workspace projects
packages/contracts lint$ eslint src/
└─ Done in 709ms
apps/api lint$ eslint src/
└─ Done in 810ms
apps/web lint$ next lint
└─ ✔ No ESLint warnings or errors (Done in 2.3s)
```
**Result**: PASSED (0 errors, 0 warnings across monorepo).

---

## 7. Deferred Runtime Verification Scenarios

The following scenarios are documented for runtime verification once live LiveKit credentials and media devices are available:

1. **Microphone Permission Flow**:
   - User clicks "Join Voice" in Chrome/Firefox.
   - Verify browser prompts for microphone permission.
   - Verify selecting "Deny" displays the user-friendly permission error banner without crashing.
   - Verify selecting "Allow" connects to voice and shows the green "Voice Live" status badge.
2. **Audio Transmission & VAD Speaking Indicators**:
   - Two users join the same room and both join voice.
   - User A speaks into microphone.
   - Verify User B hears User A's audio clearly without echo.
   - Verify User A's avatar displays the pulsing green speaking indicator on User B's screen.
3. **Mute/Unmute State**:
   - User A clicks "Mic Active" to mute.
   - Verify User B hears silence.
   - Verify User A's participant icon shows the red `MicOff` indicator on User B's screen.
4. **Host Kick Moderation**:
   - Host kicks User B from the room.
   - Verify User B's WebRTC connection is severed immediately by the backend.
   - Verify User B's voice state transitions to `unauthorized` and voice controls are locked.
5. **Multi-Tab Isolation**:
   - User A opens the same room in Tab 1 and Tab 2.
   - Tab 1 joins voice; Tab 2 joins voice.
   - Verify neither connection kicks the other and both tabs have unique participant identities.

---

## 8. Known Limitations & Unresolved Risks

1. **Browser Autoplay Policies**: Modern browsers may block background audio elements until user interaction occurs. Because joining voice requires an explicit button click, initial autoplay is unblocked; however, if a user joins before remote participants arrive, some browsers may require interaction to unmute remote streams.
2. **Ephemeral Presence**: LiveKit voice presence is not persisted in MongoDB. A process crash of LiveKit Cloud would require clients to reconnect using their normal retry logic.

---

### Mandatory Final Verdict
**`CODE COMPLETE — NOT RUNTIME VERIFIED`**
