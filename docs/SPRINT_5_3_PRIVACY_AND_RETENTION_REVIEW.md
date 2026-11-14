# KTVOnline — Sprint 5.3: Privacy & Data Retention Review

## 1. Core Privacy Principles

Karaoke memories are personal experiences. To protect user privacy and social safety, Sprint 5.3 enforces **Privacy-by-Default**:

1. **Private Room Isolation:**
   - Any karaoke session originating from a private room (`visibility: 'private'`) is strictly restricted.
   - Non-participants who attempt to fetch the session recap via `GET /api/v1/history/sessions/:sessionId` are rejected with HTTP 403 Forbidden (`FORBIDDEN_PRIVATE_SESSION`).
   - Private room titles, host names, and participant lists are never surfaced in public feeds.
2. **Personal History Visibility:**
   - A user's personal song history (`GET /api/v1/history/my-songs`) and personal session attendance (`GET /api/v1/history/my-sessions`) are accessible only by the authenticated account owner.
   - Public profile endpoints expose performance history only if the user explicitly enables `isHistoryPublic: true` in their user preferences.
   - By default, `isHistoryPublic = false` and `isSessionsPublic = false`.
3. **Listener Protection:**
   - Room previewers (users viewing `/rooms` preview modal without joining) are never recorded as session participants.
   - Room listeners (members who joined but did not sing) are recorded as listeners (`songsPerformedCount: 0`) and never mislabeled as singers.

---

## 2. Retention & Data Lifecycle Policy

### 2.1 Distinction Between Telemetry & Product Memories
- **Activity Feed Telemetry (`RoomActivityModel`):**
  - Serves transient room chat and realtime system alerts.
  - Applies a 7-day TTL index (`expireAfterSeconds: 604800`).
- **Session Memories & Karaoke History (`KaraokeSessionModel`, `KaraokePerformanceModel`):**
  - Represents durable user-facing product records.
  - **No automated TTL index is applied.** Records persist indefinitely to support long-term user statistics, profile achievements, and memories.

### 2.2 Account Deletion & Right to be Forgotten
When an account is deleted:
1. Historical performances where the deleted user was the singer should have `singerId` unlinked or replaced with an anonymous placeholder (`[Deleted Singer]`), while preserving the integrity of the room host's session recap.
2. The user's private history records are purged from direct queries.

---

## 3. Threat Modeling & Access Control Matrix

| Endpoint | Target Resource | Authorization Rule | Unauthorized Response |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/history/my-songs` | Caller's singing history | Authenticated owner only (`req.user.id`) | HTTP 401 Unauthorized |
| `GET /api/v1/history/my-sessions` | Caller's attended sessions | Authenticated owner only (`req.user.id`) | HTTP 401 Unauthorized |
| `GET /api/v1/history/my-stats` | Caller's aggregated stats | Authenticated owner only (`req.user.id`) | HTTP 401 Unauthorized |
| `GET /api/v1/history/sessions/:id` (Public Lounge) | Session Recap | Any authenticated or guest user | Allowed (Public recap) |
| `GET /api/v1/history/sessions/:id` (Private Lounge)| Session Recap | Caller must be in `session.participants` list | HTTP 403 Forbidden |
| `GET /api/v1/users/:id/history` | Public profile history | Allowed only if target user has `isHistoryPublic: true` | Empty list or HTTP 403 |
