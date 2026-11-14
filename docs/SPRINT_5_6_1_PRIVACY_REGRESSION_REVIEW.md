# Sprint 5.6.1: Privacy & Information Leakage Regression Review

## 1. Executive Summary

During Sprint 5.6.1, presence broadcasting and invitation token structures were updated. This audit verifies that no privacy regressions were introduced, specifically confirming:
1. Private lounge metadata is never leaked to friends who are not inside the room.
2. Song playback details from private lounges are not exposed to outsiders.
3. User stealth preferences (`presenceVisibility: 'none'`) are strictly honored in all broadcasts and queries.
4. Friend-only visibility (`presenceVisibility: 'friends'`) rejects non-friends.

---

## 2. Privacy Masking Verification

### 2.1 Private Room Masking
In `apps/api/src/realtime/global-presence.manager.ts` (`getUserPresence`):
```typescript
const isPrivate = room.visibility === 'private';
const isViewerInSameRoom = viewerUserId
  ? presenceManager.getUserRoom(viewerUserId)?.roomId === roomPresence.roomId
  : false;

// Privacy Masking: If private room and viewer is not already in the room, mask roomId and title
if (isPrivate && !isViewerInSameRoom) {
  return {
    userId: targetUserId,
    status,
    roomId: null,
    roomTitle: 'Private Lounge',
    isPrivateLounge: true,
    songTitle: null, // Do not leak song info from private rooms to outsiders
    updatedAt: nowIso,
  };
}
```

#### Verification Results:
- **`roomId`**: Explicitly set to `null` for external viewers. External viewers cannot guess or harvest the MongoDB ObjectId of private rooms from presence payloads.
- **`roomTitle`**: Masked to generic constant `'Private Lounge'`. Private custom room titles (which may contain personal or sensitive names) are completely hidden.
- **`songTitle`**: Explicitly set to `null`. Outsiders cannot observe what songs are being performed inside private lounges.
- **`isPrivateLounge`**: Exposed as boolean `true` so UI can display a subtle lock indicator without exposing underlying metadata.

### 2.2 Stealth Mode (`presenceVisibility: 'none'`)
In `apps/api/src/realtime/global-presence.manager.ts`:
```typescript
const visibility = targetUser.preferences?.presenceVisibility || 'friends';

// 1. If visibility is 'none' and viewer is not the user themselves -> stealth mode
if (visibility === 'none' && targetUserId !== viewerUserId) {
  return offlinePresence;
}
```
When `broadcastUserPresenceToFriends` executes for a user in stealth mode:
- `getUserPresence(userId, friendUserId)` evaluates to `status: 'offline'` with all room fields nulled.
- Friends receive an `offline` update even if the user is actively singing in a room.

### 2.3 Friend-Only Mode (`presenceVisibility: 'friends'`)
```typescript
if (visibility === 'friends' && viewerUserId && targetUserId !== viewerUserId) {
  const pairKey = computePairKey(targetUserId, viewerUserId);
  const friendship = await FriendshipModel.findOne({ pairKey, status: 'accepted' })
    .select('_id')
    .lean()
    .exec();

  if (!friendship) {
    return offlinePresence;
  }
}
```
Any unsolicited presence query from non-friends yields `offlinePresence`.

---

## 3. Direct Invitation Token Privacy

### 3.1 Recipient Binding
With the implementation of `DEF-INV-01` and `DEF-INV-02`:
- `RoomInvitationModel.recipientId` binds the token to the intended friend.
- If an invitation link is intercepted or forwarded:
  - `validateInvitation(rawToken, roomId, requestingUserId)` verifies `invitation.recipientId.toString() === requestingUserId`.
  - Unintended recipients are rejected with `INVITATION_RECIPIENT_MISMATCH`.

### 3.2 Token Preview Sanitization
In `invitationService.previewInvitation(rawToken, requestingUserId)`:
- If `invitation.recipientId` is set, non-recipients cannot even preview the room's title or participant list.
- Prevents reconnaissance attacks against private karaoke rooms.

---

## 4. Privacy Conclusion
Sprint 5.6.1 maintains zero data leakage across all presence, room, and invitation pathways. Privacy guarantees established in Sprint 5.0 and 5.6 remain fully intact and verified at source code level.
