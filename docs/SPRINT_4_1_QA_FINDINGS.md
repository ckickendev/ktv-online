# KTVOnline — Sprint 4.1: Static QA & Production Stability Findings

## 1. Overview & Evaluation Scope

Sprint 4.1 evaluated the multi-subsystem reliability, cross-client race conditions, and error recovery behaviors of KTVOnline across 14 focused scenarios (QA-01 through QA-14) covering:
1. Room Lifecycle & Multi-Client Presence (QA-01 to QA-04)
2. LiveKit Voice & Moderation Enforcement (QA-05 to QA-08)
3. Playback, Queue & Singer Synchronization (QA-09 to QA-11)
4. Room State Versioning, Permissions & Audience Interaction (QA-12 to QA-14)

---

## 2. Detailed Findings Register

### Finding INT-08: Muted Participant Listen-Only Voice Eviction
- **Finding ID:** `INT-08`
- **Severity:** **P2 (Significant UX & Reliability Issue)**
- **Affected Subsystem:** Voice WebRTC (`apps/web/src/features/voice/hooks/use-voice-client.ts`)
- **Source Location:** Lines 558–565, 646–655, 685–693
- **Root Cause:** 
  When a room participant is muted by moderation, their LiveKit token or server permission is configured with `canPublish: false`. When the muted participant connects to voice via `joinVoice()` or reconnects via `attemptReconnect()`, the client hook unconditionally called `room.localParticipant.setMicrophoneEnabled(true, ...)`. In the LiveKit client SDK, attempting to publish a microphone track on a participant whose permissions prohibit publishing (`canPublish: false`) throws a 403 `PublishTrackError`. The catch block caught this error, categorized it as an unrecoverable authorization failure, and called `await leaveVoice()`, forcibly disconnecting the user from the voice room entirely.
- **Expected Behavior:** 
  A participant muted by room moderation should remain connected to the LiveKit voice room as a listener (receiving other participants' audio streams) with their microphone disabled and local state marked `isMuted: true`.
- **Actual Behavior (Prior to Fix):** 
  Muted participants were completely evicted from the voice room upon connecting, refreshing, or reconnecting.
- **Remediation:** 
  In `use-voice-client.ts`, inspect `room.localParticipant.permissions?.canPublish !== false` before calling `setMicrophoneEnabled(true)`. If publishing is disallowed by moderation, gracefully mark `setIsMuted(true)` without publishing a microphone track. Additionally, guard `toggleMute()` to prevent unmuting attempts while server-muted.
- **Remediation Status:** **RESOLVED IN SPRINT 4.1**.

---

### Finding INT-06: Immediate Socket Disconnect Emission (Absence of 10s Grace Period Timer)
- **Finding ID:** `INT-06`
- **Severity:** **P2 (Reliability / UI Jitter)**
- **Affected Subsystem:** Realtime Presence ([`apps/api/src/realtime/room.events.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/room.events.ts), [`apps/api/src/realtime/presence.manager.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/presence.manager.ts))
- **Source Location:** `apps/api/src/realtime/room.events.ts` lines 326–345
- **Root Cause:** 
  Previous documentation (`docs/SPRINT_4_0_INTEGRATION_AUDIT.md`) described a "10-second disconnect grace period" before emitting member departure. Inspection of `room.events.ts` reveals that on socket `disconnect`, `presenceManager.removeSocket(socket.id)` is called immediately, and if `isLastDisconnection` is true, `MEMBER_LEFT` is broadcasted immediately without a timer.
- **Impact:** 
  If a single-tab user experiences a transient 1-second network blip or reloads the browser, other occupants in the room briefly see the user drop from the roster (`member:left`) and reappear moments later (`member:joined`). While database membership remains `active` (preventing seat loss), the presence UI jitters.
- **Remediation Recommendation:** 
  Document the discrepancy for Milestone 5.0. If grace period behavior is desired, introduce an asynchronous in-memory timer map (`disconnectTimers: Map<userId, NodeJS.Timeout>`) in `RoomPresenceManager` that cancels upon socket reconnect within 10 seconds.
- **Remediation Status:** **DOCUMENTED (Deferred to Milestone 5.0 to avoid introducing complex asynchronous timer race conditions without an active multi-client test harness)**.

---

### Finding INT-07: Unbounded Room Persistence on Host Disconnect
- **Finding ID:** `INT-07`
- **Severity:** **P3 (Architectural / Resource Governance)**
- **Affected Subsystem:** Room Lifecycle ([`apps/api/src/modules/rooms/room.service.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/modules/rooms/room.service.ts))
- **Source Location:** `apps/api/src/modules/rooms/room.service.ts` line 578
- **Root Cause:** 
  Hosts are strictly prohibited from leaving active rooms via `leaveRoom()` (`HOST_CANNOT_LEAVE`). If a host closes their laptop or permanently abandons the room without clicking "Close Room" or "Transfer Host", the room document remains in `status: 'active'` indefinitely.
- **Impact:** 
  Abandoned rooms can clutter discovery lists until a server admin manually intervenes.
- **Remediation Recommendation:** 
  Implement a scheduled background cleanup worker in Milestone 5.0 that transitions rooms to `status: 'closed'` if all participants have been offline for more than 30 consecutive minutes.
- **Remediation Status:** **DOCUMENTED (Architectural roadmap for Milestone 5.0)**.

---

### Finding INT-09: Single-Process Presence Memory Scope
- **Finding ID:** `INT-09`
- **Severity:** **P3 (Scalability Constraint)**
- **Affected Subsystem:** Realtime Socket Clustering ([`apps/api/src/realtime/presence.manager.ts`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/apps/api/src/realtime/presence.manager.ts))
- **Source Location:** `presenceManager.roomUsers` Map
- **Root Cause:** 
  `RoomPresenceManager` tracks active sockets using an in-memory `Map<string, Map<string, Set<string>>>`. This design is fully consistent for a single-instance API server, but does not synchronize presence across multiple Node.js worker processes or multi-instance containers.
- **Impact:** 
  Horizontally scaling the backend across multiple containers requires a shared state store (e.g. Redis Adapter).
- **Remediation Status:** **DOCUMENTED (Preserved invariant: single-instance first; Redis roadmap planned for Milestone 5.0)**.

---

## 3. Scenario-by-Scenario Scenario Matrix (QA-01 to QA-14)

| Scenario | Title | Subsystem Focus | Static Code Invariants Verified | Findings & Status |
| :--- | :--- | :--- | :--- | :---: |
| **QA-01** | Normal Room Lifecycle | Room & Membership | CAS capacity check; idempotent join; explicit close tears down LiveKit & sockets. | **VERIFIED** |
| **QA-02** | Multiple Tabs & Devices | Realtime Presence | Multi-socket `Set` per `userId`; closing tab 1 does NOT emit `member:left`. | **VERIFIED** |
| **QA-03** | Disconnect & Reconnect | Realtime Presence | Reconnection restores state snapshot; discrepancy noted on grace period debounce. | **INT-06 (P2)** |
| **QA-04** | Host Disconnect & Ownership | Room Governance | Host ownership authoritative in MongoDB; host departure requires explicit close. | **INT-07 (P3)** |
| **QA-05** | Voice Connection | LiveKit WebRTC | Sanitized participant metadata; JWT signed with `canPublish: !isMuted`. | **VERIFIED** |
| **QA-06** | Voice Reconnection | LiveKit WebRTC | Exponential backoff retry; fresh token requested from backend; re-checks permissions. | **VERIFIED** |
| **QA-07** | Moderation Mute | LiveKit Moderation | SFU track muting; fixed listen-only mode so muted users can still hear audio. | **INT-08 (RESOLVED)** |
| **QA-08** | Kick & Eviction | Room & Voice Moderation | Defense-in-depth: Socket disconnect, LiveKit eviction, queue cleanup, rejoin banned. | **VERIFIED** |
| **QA-09** | Playback Synchronization | Karaoke Engine | NTP clock sync median offset; `anchorStartedAt` authoritative; version-fenced seeks. | **VERIFIED** |
| **QA-10** | Track Completion | Karaoke Engine | `isTransitioning` visual stage handoff; 500ms worker polling; 15s lease expiry. | **VERIFIED** |
| **QA-11** | Queue Consistency | Karaoke Engine | Distinct `requestedBy` vs `singer`; non-member songs pruned; atomic CAS reorders. | **VERIFIED** |
| **QA-12** | Versioned Room State | Realtime Outbox | Monotonic `stateVersion` increment; client buffers out-of-order events; snapshot recovery. | **VERIFIED** |
| **QA-13** | Permissions Enforcement | API Security | Server-side role checks on every mutating action; moderators cannot kick host. | **VERIFIED** |
| **QA-14** | Ephemeral Audience Events | Chat & Interactions | Reactions and gifts have zero DB persistence; token bucket rate-limited; 30d chat TTL. | **VERIFIED** |
