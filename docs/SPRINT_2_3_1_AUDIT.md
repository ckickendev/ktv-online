# Sprint 2.3.1 — Voice Security & Lifecycle Hardening Audit

## 1. Executive Summary

This audit assesses the LiveKit voice infrastructure implemented in Sprint 2.3 for **KTVOnline**.
The objective of Sprint 2.3.1 is to harden voice authorization, participant lifecycle, session revocation, token renewal, webhook processing, and provider failure handling.

In accordance with the mandatory code-only policy, this audit examines the actual installed SDK versions, backend services, frontend hooks, and database models to identify concrete failure scenarios, security gaps, and consistency risks before applying focused remedies.

---

## 2. SDK Version & Capability Verification

### 2.1 Backend: `livekit-server-sdk`
- **Installed Version**: `2.19.2` (in `apps/api/package.json`).
- **Verified Capabilities**:
  - `AccessToken.addGrant`: Supports `canPublishSources: [TrackSource.MICROPHONE]` to enforce audio-only publication at the server/protocol level.
  - `TrackSource`: Enum with `UNKNOWN = 0`, `CAMERA = 1`, `MICROPHONE = 2`, `SCREEN_SHARE = 3`, `SCREEN_SHARE_AUDIO = 4`.
  - `RoomServiceClient`: Supports `removeParticipant(roomName, identity)`, `deleteRoom(roomName)`, and `listParticipants(roomName)`.
  - `WebhookReceiver`: Supports `receive(body: string, authHeader: string)`.

### 2.2 Frontend: `livekit-client`
- **Installed Version**: `2.23.0` (in `apps/web/package.json`).
- **Verified Capabilities**:
  - `Room.connect(url, token, options)`: Establishes WebRTC signaling and stores token in `engine.token`.
  - `Room.localParticipant.setMicrophoneEnabled(boolean)`: Toggles local audio track publishing.
  - `Room.switchActiveDevice('audioinput', deviceId)`: Switches input device.
  - `RoomEvent`: Supported lifecycle events (`Connected`, `Reconnecting`, `Reconnected`, `Disconnected`, `ParticipantConnected`, `ParticipantDisconnected`, `ActiveSpeakersChanged`, `TrackMuted`, `TrackUnmuted`, `TrackSubscribed`, `TrackUnsubscribed`).
  - **Token Refresh Behavior**: LiveKit maintains the active connection as long as signaling is stable. If a signal disconnect occurs after token expiration, reconnecting requires an updated token on `engine.token` to avoid rejection.

---

## 3. Audited Failure Modes & Remediation Inventory

### Issue 1: Lack of Server-Side Source Restrictions on Video/Screen Publication
- **Existing Implementation**: [`voice-token.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-token.service.ts) grants:
  ```ts
  token.addGrant({
    roomJoin: true,
    room: options.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });
  ```
- **Affected File**: [`apps/api/src/modules/voice/voice-token.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-token.service.ts).
- **Failure Scenario**: While the official KTVOnline frontend only requests microphone access, an authenticated user using a custom client or modified SDK could publish camera video, screen share video, or screen share audio because `canPublish: true` permits all media tracks by default.
- **Security & Consistency Impact**: Unintended video/screen-share streaming consumes excessive bandwidth, violates KTVOnline's audio-only lounge design, and introduces unmoderated video exposure risks.
- **Proposed Remediation**: Enforce `canPublishSources: [TrackSource.MICROPHONE]` in `token.addGrant`.
- **Enforcement Level**: **Guaranteed by LiveKit server**.

---

### Issue 2: Session-Family Revocation Not Tied to LiveKit Voice Sessions
- **Existing Implementation**:
  - [`auth.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts) revokes the session family (`SessionModel.revokedAt`) and invokes `disconnectSessionSockets(familyId)` during logout or refresh token reuse detection.
  - [`voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts) does not record `familyId` in participant metadata and has no session-family eviction method.
  - [`generateVoiceToken`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts) only checks `UserModel.findById(user.id)`, without checking `SessionModel` revocation status.
- **Affected Files**:
  - [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts)
  - [`apps/api/src/modules/auth/auth.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/auth/auth.service.ts)
- **Failure Scenario**:
  1. A user logs out or experiences session revocation due to refresh token replay.
  2. Their Socket.IO connection is disconnected, but their active WebRTC voice session in LiveKit continues transmitting and receiving audio until the 5-minute token expires.
  3. Furthermore, within the token window, token renewal using the revoked session's access token is not rejected by `generateVoiceToken`.
- **Security Impact**: Revoked sessions maintain unauthorized eavesdropping and voice transmission capabilities.
- **Proposed Remediation**:
  1. Verify in `generateVoiceToken` that `SessionModel.findOne({ familyId: user.familyId, revokedAt: null })` is valid.
  2. Embed `familyId` in the signed `VoiceParticipantMetadata`.
  3. Introduce a server-side `VoiceSessionRegistry` mapping `familyId` to active voice participants.
  4. Implement `voiceService.evictLiveKitSessionFamily(familyId)` and invoke it in `auth.service.ts` on logout and token replay detection.
  5. Only evict participants tied to the revoked `familyId`, leaving other concurrent session families of the same user unaffected.
- **Enforcement Level**: **Application-level logic + LiveKit `removeParticipant`**.

---

### Issue 3: LiveKit Provider Eviction Failures are Unrecoverable
- **Existing Implementation**: In [`room.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts) (`kickMember`, `leaveRoom`) and [`room.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.controller.ts) (`closeRoom`), provider eviction is wrapped in a plain `try/catch` block that logs a warning and discards errors without retry:
  ```ts
  try {
    await voiceService.evictLiveKitParticipant(roomId, targetUserId);
  } catch {
    // Non-blocking
  }
  ```
- **Affected Files**:
  - [`apps/api/src/modules/rooms/room.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts)
  - [`apps/api/src/modules/rooms/room.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.controller.ts)
  - [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts)
- **Failure Scenario**: A host kicks a disruptive user. The database transaction transitions membership to `left` and decrements room count. However, a transient network error occurs while calling LiveKit Cloud API. The error is swallowed, and the kicked participant remains connected and transmitting audio in the LiveKit room until their token expires.
- **Security & Consistency Impact**: Moderation kick and room closure fail to take immediate effect during transient LiveKit API blips.
- **Proposed Remediation**:
  1. Maintain persistent database transition priority (never rollback membership due to LiveKit API failure).
  2. Implement a durable, recoverable eviction task queue (`VoiceEvictionTaskModel`) with bounded retries (exponential backoff up to 5 attempts) and sweep worker.
  3. If immediate eviction fails, record a pending task in `VoiceEvictionTaskModel` for automatic retry.
- **Enforcement Level**: **Application-level durable retry**.

---

### Issue 4: Webhook Deduplication and Ordering Vulnerabilities
- **Existing Implementation**: [`voice-webhook.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts) verifies signatures, but:
  - Does not deduplicate incoming events (retries from LiveKit are processed multiple times).
  - Does not check event timestamps (`event.createdAt`). A delayed `participant_joined` event arriving after a `participant_left` event would process out of sequence.
  - Does not reject events for already-closed rooms.
- **Affected File**: [`apps/api/src/modules/voice/voice-webhook.controller.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice-webhook.controller.ts).
- **Failure Scenario**: Network jitter causes LiveKit to deliver duplicate webhooks or deliver `participant_joined` seconds after `participant_left`.
- **Security & Consistency Impact**: Ephemeral participant projections become desynchronized or display phantom participants.
- **Proposed Remediation**:
  1. Implement an in-memory bounded LRU deduplication cache for `event.id` (TTL: 10 minutes, max 5,000 entries).
  2. Track the latest event timestamp per `(roomName, participantIdentity)`. Discard stale events if `event.createdAt <= lastSeenTimestamp`.
  3. Validate that events for closed rooms do not create phantom voice records.
- **Enforcement Level**: **Application-level deduplication and sequence tracking**.

---

### Issue 5: Participant Identity & `tabId` Injection Vulnerability
- **Existing Implementation**: In [`voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts):
  ```ts
  const sessionSalt = tabId ? tabId.slice(0, 12) : crypto.randomUUID().slice(0, 8);
  const participantIdentity = `${user.id}_${sessionSalt}`;
  ```
- **Affected File**: [`apps/api/src/modules/voice/voice.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/voice/voice.service.ts).
- **Failure Scenario**: An attacker supplies a `tabId` containing underscores (e.g. `foo_bar`), delimiters, or special characters, interfering with identity splitting (`p.identity.split('_')[0]`) in participant lookup and metadata parsing.
- **Security Impact**: Identity parsing ambiguity could cause participant eviction routines to mismatch or fail.
- **Proposed Remediation**:
  1. Sanitize `tabId` using strict regex: `/^[a-zA-Z0-9-]{1,16}$/`.
  2. Fall back to secure `crypto.randomUUID().slice(0, 8)` if `tabId` is invalid or missing.
  3. Embed immutable `userId` directly in the cryptographically signed JWT metadata.
- **Enforcement Level**: **Application-level validation**.

---

### Issue 6: Token Renewal Race Conditions & Stale Room Callbacks
- **Existing Implementation**: In [`use-voice-client.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts):
  - Token renewal does not coalesce concurrent requests (if network reconnect triggers while the 4-minute timer fires, duplicate requests occur).
  - Renewal does not update `(room.engine as any).token`. If the signal disconnects after the original 5 minutes, LiveKit's internal reconnect uses the expired token and fails.
  - When switching rooms or reconnecting, old room instances may still emit callbacks if not completely detached and version-fenced.
  - `VoiceParticipants` component lists duplicate cards if a user opens the room in two tabs, rather than grouping by authenticated user.
- **Affected Files**:
  - [`apps/web/src/features/voice/hooks/use-voice-client.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/hooks/use-voice-client.ts)
  - [`apps/web/src/features/voice/components/voice-participants.tsx`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/web/src/features/voice/components/voice-participants.tsx)
- **Security & UX Impact**: Uncoalesced renewals create request storms; expired engine tokens cause reconnect failures; multi-tab users see duplicate self-identities.
- **Proposed Remediation**:
  1. Introduce an `isRenewingRef` lock to coalesce concurrent renewal requests.
  2. Update `room.engine.token` upon successful renewal so background signal reconnects use the fresh token.
  3. Introduce a `sessionGenerationRef` to discard callbacks from detached or obsolete `Room` instances.
  4. Group voice participants by `userId` in `VoiceParticipants` to present a clean single card per user with active tab indicators.
- **Enforcement Level**: **Frontend state machine & UI hardening**.

---

## 4. Audit Conclusion & Implementation Plan

All 6 identified areas have clear, evidence-based remediations that respect the existing architecture:
- **Phase B**: Session-family tracking & revocation eviction.
- **Phase C**: Audio-only grants with `TrackSource.MICROPHONE`.
- **Phase D**: Webhook deduplication and timestamp ordering.
- **Phase E**: Recoverable eviction queue with bounded retries.
- **Phase F**: Token renewal coalescing and engine token synchronization.
- **Phase G & H**: `tabId` sanitization and frontend multi-tab participant grouping.

Proceeding to implementation.
