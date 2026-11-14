# Sprint 5.6 Source Audit: Lounge Invitation Security & Integration

**Audit Target:** Direct Friend Room Invitations, Token Lifecycle, and Access Control  
**Sprint Baseline Commit:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`  
**Files Inspected:**
- `apps/api/src/modules/friends/friendship.service.ts`
- `apps/api/src/modules/rooms/invitation.service.ts`
- `apps/api/src/modules/rooms/invitation.model.ts`
- `apps/api/src/realtime/friend.events.ts`
- `apps/web/src/components/rooms/invite-friends-dialog.tsx`
- `apps/web/src/features/friends/hooks/use-friends.ts`
**Audit Date:** November 2026  
**Auditor:** Antigravity Source Security & Architecture Auditor  

---

## 1. Executive Summary

This audit assesses the direct room invitation workflow introduced in Sprint 5.6 and its integration with Sprint 5.0's token-based invitation system. The audit confirmed that invitation tokens are transmitted securely over authenticated user channels. However, the audit revealed **three critical source-level defects**:
1. Inviting multiple friends sequentially **revokes the tokens of all previously invited friends**.
2. **Missing caller authorization:** Any authenticated user can trigger an invitation for any room and forge the owner's token creation rights.
3. The client application contains **no listener for `friend:invitation:received`**, causing real-time invite notifications to be completely ignored.

---

## 2. Discovered Source-Level Defects

### 2.1. DEFECT-INV-01: Serial Invitation Invalidation (Single-Token Invalidation Flaw)
- **Locations:**
  - `apps/api/src/modules/friends/friendship.service.ts#L560-L565`
  - `apps/api/src/modules/rooms/invitation.service.ts#L59-L63`
- **Evidence:**
  In `friendship.service.ts#L561`:
  ```typescript
  // Generate or refresh active invitation token
  const createRes = await invitationService.createInvitation(roomId, room.ownerId.toString(), 48);
  if (!createRes.success || !createRes.data) {
    return { success: false, error: 'INVITATION_GENERATION_FAILED' };
  }
  const inviteToken = createRes.data.token;
  ```
  Now inspect `invitationService.createInvitation` (`apps/api/src/modules/rooms/invitation.service.ts#L59-L63`):
  ```typescript
  // Revoke any previous active invitations for this room
  await RoomInvitationModel.updateMany(
    { roomId: roomObjectId, status: 'active', revokedAt: null },
    { $set: { status: 'revoked', revokedAt: new Date() } }
  ).exec();
  ```
  **Consequence:**
  - The host opens `InviteFriendsDialog` and clicks **Invite** next to Friend $A$. The service generates Token 1 and revokes any prior tokens.
  - Three seconds later, the host clicks **Invite** next to Friend $B$. The service generates Token 2 and **revokes Token 1**.
  - When Friend $A$ attempts to preview or join the lounge with Token 1, `validateInvitation` checks `invitation.revokedAt` and rejects Friend $A$ with `INVITATION_REVOKED`.
  - In any session where a host invites $N$ friends, **only the $N$-th friend receives a usable invitation token**. The other $N-1$ friends are locked out.
- **Required Fix:** Re-use an unexpired active invitation token if one already exists for the room instead of calling `createInvitation` (which unconditionally revokes existing active tokens), or support multi-token issuance per room.

---

### 2.2. DEFECT-INV-02: Missing Caller Authorization & Owner Credential Forgery
- **Location:** `apps/api/src/modules/friends/friendship.service.ts#L535-L565`
- **Evidence:**
  In `friendship.service.ts`:
  ```typescript
  async sendLoungeInviteToFriend(
    userId: string,
    roomId: string,
    friendUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    // 1. Verifies friendship between userId and friendUserId
    const pairKey = computePairKey(userId, friendUserId);
    const friendship = await FriendshipModel.findOne({ pairKey, status: 'accepted' }).exec();
    if (!friendship) return { success: false, error: 'NOT_FRIENDS' };

    // 2. Verifies room exists and is not closed
    const room = await RoomModel.findById(roomId).exec();
    if (!room || room.status === 'closed') return { success: false, error: 'ROOM_UNAVAILABLE' };

    // 3. Forges room owner's identity to bypass host check!
    const createRes = await invitationService.createInvitation(roomId, room.ownerId.toString(), 48);
  ```
  **Vulnerability Analysis:**
  - The function verifies that `userId` is friends with `friendUserId`.
  - It **never checks** whether `userId` is the host of `roomId`, a member of `roomId`, or has ever visited `roomId`!
  - `invitationService.createInvitation` has a host-only check (`if (room.ownerId.toString() !== hostUserId) return FORBIDDEN_NOT_HOST;`).
  - To bypass that check, `friendship.service.ts#L561` passes `room.ownerId.toString()` instead of `userId`!
  - **Exploit Scenario:** Any authenticated user can target any private room ID on the platform, call `POST /api/v1/friends/rooms/:roomId/invite` with one of their friends, generate an invitation to someone else's private room, and concurrently invalidate the legitimate room host's existing active invitation!
- **Required Fix:** Validate that `room.ownerId.toString() === userId` (or verify that the caller is an active member with invitation dispatch privileges) before generating or sending invitations.

---

### 2.3. DEFECT-INV-03: Real-time Invitation Event Dropped on Client
- **Locations:**
  - `apps/api/src/realtime/friend.events.ts#L48-L56`
  - `apps/web/src/features/friends/`
- **Evidence:**
  The server emits:
  ```typescript
  io.to(getUserChannel(friendUserId)).emit(SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED, payload);
  ```
  A search of the entire `apps/web` codebase shows that `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED` is **never registered as a listener** in any hook, component, or store.
  - When the host sends an invite, the packet arrives at the browser socket.
  - The browser socket has no handler registered for `'friend:invitation:received'`.
  - The packet is silently discarded.
  - No toast, modal, notification badge, or alert is ever rendered to the recipient.
- **Required Fix:** Implement a global invitation notification listener (e.g. `useInvitationNotifications`) that listens for `SOCKET_EVENTS.SERVER.FRIEND_INVITATION_RECEIVED` and renders an interactive join banner/dialog.

---

## 3. Security Invariants Verification Matrix

| Security Dimension | Specification | Actual Source Behavior | Status |
|---|---|---|---|
| **Recipient Scoping** | Only recipient friend receives token | Emits to `user:${friendUserId}` channel | **Verified** |
| **Room Access on Receipt** | Invitation receipt must not grant automatic room access | Recipient still must call `/invitations/:token/accept` | **Verified** |
| **Kicked User Restrictions**| Kicked users cannot join via invitation | `RoomMembershipModel` checks `kickedAt` | **Verified** |
| **Room Lock & Capacity** | Full/locked rooms reject token redemption | Checked during preview and join flow | **Verified** |
| **Token Multi-Issuance** | Inviting friend $B$ must not break friend $A$'s invite | Inviting friend $B$ revokes friend $A$'s invite | **Defect (DEF-INV-01)** |
| **Caller Authorization** | Only room host can issue room invitations | Any user can issue invites to any room | **Defect (DEF-INV-02)** |
| **UI Notification Delivery**| Friend receives in-app alert when invited | Packet silently discarded on client | **Defect (DEF-INV-03)** |

---

## 4. Audit Conclusion

The invitation subsystem incorporates strong cryptographic token hashing in MongoDB, but the high-level orchestration in `friendship.service.ts` contains severe logic flaws: serial token revoking, missing host authorization, and client-side drop of the invitation event.
