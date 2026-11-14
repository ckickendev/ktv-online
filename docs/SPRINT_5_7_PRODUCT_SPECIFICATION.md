# KTVOnline — Sprint 5.7: Product Specification
## Friend Activity & Social Karaoke Sessions

**Sprint Theme:** Turn Friendships into Shared Karaoke Experiences.  
**Product Positioning:** KTVOnline — *Your Virtual Hangout. Your Karaoke Night.*  
**Mode:** Product Discovery & Technical Planning Only (Pre-Implementation Baseline).  
**Baseline Commit:** `1cf0537` (origin of Sprint 5.7 planning).  

---

## 1. Executive Summary & Problem Statement

In Sprint 5.6, KTVOnline established foundational social capabilities: user discovery, mutual friendships, realtime presence tracking, and direct room invitations. However, friendships currently exist in a siloed list (`/friends`), while karaoke sessions happen in rooms (`/rooms/[roomId]`).

Users currently experience friction when attempting to answer natural social questions:
1. *What are my friends singing right now, and can I hop in?*
2. *How can I quickly grab 3 friends who are online and start a private karaoke hangout together?*
3. *How do friends transition smoothly from chatting to queuing songs and enjoying session recaps?*

Sprint 5.7 connects these pillars into a cohesive, low-friction social journey:
**Discover Friend Activity -> Assemble Circle -> Sing Together in Lounge -> Relive Shared Memories.**

---

## 2. Product Pillars & User Stories

### Pillar A — Friend Activity Overview
*Empower users to see what their friends are doing in real time without violating privacy.*

- **US-A1 (Activity Discovery):** As a user on `/friends` or `/rooms`, I want to see a live activity feed of my friends (e.g. "Singing *Bohemian Rhapsody* in Tokyo Neon", "In Lounge *Weekend Jam*", "Online (Idle)", or "Offline") so I can find where the party is.
- **US-A2 (One-Click Hop-In):** As a user, when I see a friend in an open public lounge, I want a direct "Join Friend" button that brings me straight into their lounge.
- **US-A3 (Stealth & Private Room Protection):** As a user singing in a private lounge or with stealth settings enabled, I want my activity masked to generic "Private Lounge" or "Offline" so uninvited friends cannot observe my private activities or room names.

---

### Pillar B — Social Karaoke Sessions ("Start Karaoke with Friends")
*Make assembling a group karaoke night as easy as starting a group call.*

- **US-B1 (Multi-Friend Session Starter):** As a room host or user on `/friends`, I want a "Start Lounge with Friends" modal where I can multi-select online friends and invite them all with a single click.
- **US-B2 (Instant Lounge Creation):** As a host starting a session, I want to pick a room name, atmosphere vibe, and privacy mode (private by default), automatically creating the lounge and sending dedicated invitations to my selected friends.
- **US-B3 (Seamless Group Entry):** As an invited friend, when I receive the invite toast, clicking "Accept & Join" takes me immediately to the lounge where my friends are waiting.

---

### Pillar C — Contextual Social Actions Inside Karaoke
*Keep social presence active inside the performance stage.*

- **US-C1 (In-Room Friend Status):** When inside a lounge, the "Invite Friends" dialog shows which of my friends are currently online or available, allowing me to invite more friends to join the active room.
- **US-C2 (Shared Turn-Taking):** Participants in the lounge can see who queued each song and cheer on their friends when they take the stage.

---

### Pillar D — Social Session Memories
*Connect the live experience to shared history.*

- **US-D1 (Post-Session Friendship Context):** When a lounge session completes, the recap highlights participating friends, songs performed, and top cheerers, linking directly to the existing Karaoke History system (`/profile`).

---

## 3. Product Discovery Analysis & Core Decisions

| Decision Area | Trade-offs Considered | Recommended Minimal Architecture | Justification |
| :--- | :--- | :--- | :--- |
| **1. Screen Placement** | New `/activity` route vs tab in `/friends` vs widget in `/rooms` | **Prominent Tab & Hero in `/friends` + Companion Bar in `/rooms`** | Avoids navigation bloat; keeps `/friends` as the single social destination while surfacing serendipity in `/rooms`. |
| **2. Social Session Entity** | Separate `SocialSessionModel` vs reuse `RoomModel` + `KaraokeSessionModel` | **Reuse `RoomModel` and `KaraokeSessionModel` (Zero new session entities)** | Rooms and sessions already model hosts, participants, queues, and playback. Introducing a duplicate entity introduces synchronization debt. |
| **3. Invitation Multi-Select** | Single invite vs bounded multi-select batch endpoint | **Bounded Multi-Select Batch Endpoint (`POST /api/friends/invite-lounge-batch`)** | Eliminates N serial HTTP requests from the frontend while reusing Option B recipient-bound tokens under the hood. |
| **4. Offline / Busy Friends** | Restrict to online only vs allow offline invites | **Allow multi-select across all friends with clear presence badges** | Online friends get instant socket toasts; offline friends see invites upon next login if token is within expiry (48h). |
| **5. Friend in Another Room** | Prevent invite vs allow invite with "Busy" badge | **Allow invite with "In Another Lounge" indicator + "Join Them" CTA** | Gives user the choice to either join their friend's public lounge or invite them to their own lounge. |
| **6. Realtime Events** | New `friend:activity:feed` event vs existing `friend:presence:updated` | **Reuse existing `friend:presence:updated`** | Existing payload already contains `status`, `roomId`, `roomTitle`, `isPrivateLounge`, and `songTitle`. Zero new socket events needed. |

---

## 4. Non-Goals
1. No direct messaging / text chat outside active rooms (KTVOnline is a hangout platform, not Slack/Discord).
2. No public social feed / algorithmic timeline of strangers.
3. No voice recording or persistent vocal audio storage.
4. No virtual currency or paid gifting.
5. No standalone "Session" database collection that duplicates `RoomModel`.
