# Sprint 5.6 Presence & Privacy Architecture Review

**Sprint:** 5.6  
**Document:** Presence Tracking & Privacy Boundary Analysis  
**Milestone:** Social Presence & Friendship Experience  
**Date:** November 2026  

---

## 1. Executive Summary

Social presence features allow karaoke buddies to see when their friends are online, discover which lounges they are enjoying, and celebrate when they take the virtual stage. However, real-time presence introduces severe privacy and security risks if not carefully guarded:
1. **Unwanted Tracking & Harassment:** Users must control who is permitted to monitor their active hours.
2. **Private Lounge Discovery Leakage:** Private rooms (Sprint 5.0) are designed for confidential friend gatherings. If a user's presence reveals the private room's title, ID, or current song, non-invited users could discover, eavesdrop, or infer private activities.
3. **Information Over-Exposure:** Viewers must not receive details about rooms they do not have authorization to enter.

This document reviews the privacy architecture implemented in Sprint 5.6.

---

## 2. Dynamic Presence State Hierarchy

Presence is computed on-the-fly rather than statically written to MongoDB on every socket heartbeat. The state is evaluated through `GlobalPresenceManager.getUserPresence(targetUserId, viewerUserId)`.

```mermaid
flowchart TD
    S0["Start Presence Check"] --> S1{"User Sockets Connected?"}
    S1 -->|No| R0["Status: OFFLINE"]
    S1 -->|Yes| S2{"Target Privacy Setting?"}
    S2 -->|'none'| R0
    S2 -->|'friends'| S3{"Is Viewer a Confirmed Friend?"}
    S3 -->|No| R0
    S3 -->|Yes| S4{"Is Target in an Active Room?"}
    S2 -->|'everyone'| S4
    S4 -->|No| R1["Status: ONLINE"]
    S4 -->|Yes| S5{"Is Room Private?"}
    S5 -->|Yes| S6{"Is Viewer in the Same Room?"}
    S6 -->|No| R2["Status: IN_LOUNGE\n(Masked: roomId=null, title='Private Lounge')"]
    S6 -->|Yes| S7{"Is Target Currently Singing?"}
    S5 -->|No (Public Room)| S7
    S7 -->|Yes| R3["Status: SINGING\n(Includes: songTitle, roomId, roomTitle)"]
    S7 -->|No| R4["Status: IN_LOUNGE\n(Includes: roomId, roomTitle)"]
```

---

## 3. Privacy Boundaries & Policies

### 3.1. User Privacy Preference (`presenceVisibility`)
Every user profile includes a `presenceVisibility` preference with three distinct tiers:
- `'everyone'`: Any authenticated platform user can see the user's online/lounge status.
- `'friends'` (**Default**): Only confirmed mutual friends can see whether the user is online or participating in a lounge. To non-friends, the user always appears `offline`.
- `'none'` (**Stealth Mode**): The user appears `offline` to everyone on the platform, including mutual friends.

### 3.2. Private Lounge Masking Implementation

When a user is in a private room (`room.visibility === 'private'`), the system applies rigorous data filtering in `GlobalPresenceManager`:

```typescript
// Privacy Masking: If private room and viewer is not already in the room, mask roomId and title
if (isPrivate && !isViewerInSameRoom) {
  return {
    userId: targetUserId,
    status, // 'in_lounge' or 'singing'
    roomId: null, // MASKED: Room ID never leaked
    roomTitle: 'Private Lounge', // MASKED: Friendly placeholder
    isPrivateLounge: true,
    songTitle: null, // MASKED: Song details hidden
    updatedAt: nowIso,
  };
}
```

### 3.3. Threat Model & Mitigations

| Threat Vector | Potential Impact | Sprint 5.6 Mitigation |
|---|---|---|
| **Room ID Harvesting** | An unauthorized friend grabs the private `roomId` from a presence packet and navigates directly to `/rooms/:id`. | `roomId` is returned as `null` in presence DTOs for private rooms. The client renders no navigational links. |
| **Room Name Snooping** | Private room names (which might contain personal information like *"Sarah's Birthday Party - VIP"*) are leaked. | Masked to the generic string `"Private Lounge"`. |
| **Playback Eavesdropping** | Outsiders infer who is singing what inside a private party. | `songTitle` is set to `null` for private rooms unless the viewer is already inside that room. |
| **Stalking / Activity Monitoring** | A non-friend monitors when a user is active online. | Default privacy setting is `'friends'`, returning `offline` to anyone without accepted friendship. |

---

## 4. Architectural Verdict

The presence engine operates under a **Privacy-by-Default** principle. No sensitive room identifiers or real-time activities escape private boundaries, guaranteeing total compliance with KTVOnline's social privacy guidelines.
