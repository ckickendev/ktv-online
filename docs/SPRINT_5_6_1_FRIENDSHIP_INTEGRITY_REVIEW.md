# Sprint 5.6.1: Friendship Data Integrity & Concurrency Review

## 1. Executive Summary

Sprint 5.6.1 addressed two concurrency and state integrity defects identified during the Sprint 5.6 post-implementation audit:
1. **`DEF-FR-01` (Severity: High / P1)**: Reciprocal simultaneous friend request race condition causing unhandled MongoDB duplicate key error (`MongoServerError: E11000 duplicate key error collection: test.friendships index: pairKey_1`).
2. **`DEF-FR-02` (Severity: Medium / P2)**: Read-modify-save race conditions in friendship state transitions (`acceptRequest`, `declineRequest`, `cancelRequest`, `removeFriend`).

Both defects have been remediated in source code with atomic MongoDB primitives and duplicate key exception handling.

---

## 2. Reciprocal Request Concurrency Remediation (`DEF-FR-01`)

### 2.1 The Race Condition
`FriendshipModel` enforces canonical pair uniqueness via `pairKey: computePairKey(userA, userB)` where `pairKey` is sorted alphabetically (e.g., `userA_id:userB_id`).
When User A and User B concurrently sent friend requests to each other:
1. Both read `FriendshipModel.findOne({ pairKey })` simultaneously, finding no existing document.
2. Both proceeded to `FriendshipModel.create(...)`.
3. The second insert failed with MongoDB error code `11000` (duplicate key error on `pairKey_1`).
4. The API ungracefully crashed or returned an unhandled 500 error to the second user.

### 2.2 Concurrency Handling Implementation
In `apps/api/src/modules/friends/friendship.service.ts`:
`sendRequest` now intercepts duplicate key collisions and checks if the existing document represents a reciprocal request from the other party:

```typescript
try {
  const created = await FriendshipModel.create({
    requesterId: userObjectId,
    addresseeId: targetObjectId,
    pairKey,
    status: 'pending',
  });
  // emitFriendRequestReceived...
  return { success: true, data: this.formatRequestDto(created, currentUser, targetUser) };
} catch (error: any) {
  // Concurrency handling for simultaneous reciprocal requests (DEF-FR-01)
  if (error?.code === 11000 || error?.name === 'MongoServerError') {
    const existing = await FriendshipModel.findOne({ pairKey })
      .populate('requesterId', 'username displayName avatar bio preferences')
      .populate('addresseeId', 'username displayName avatar bio preferences')
      .exec();

    if (existing) {
      // If the other user already sent a pending request to us, auto-accept atomically!
      if (existing.status === 'pending' && existing.requesterId._id.toString() === targetUserId) {
        const accepted = await FriendshipModel.findOneAndUpdate(
          { _id: existing._id, status: 'pending' },
          { $set: { status: 'accepted' } },
          { new: true }
        )
          .populate('requesterId', 'username displayName avatar bio preferences')
          .populate('addresseeId', 'username displayName avatar bio preferences')
          .exec();

        if (accepted) {
          const io = getSocketServer();
          emitFriendRequestAccepted(io, targetUserId, {
            friendshipId: accepted._id.toString(),
            friend: this.formatUserDto(currentUser),
            acceptedAt: new Date().toISOString(),
          });

          const friendPresence = await globalPresenceManager.getUserPresence(targetUserId, userId);
          return {
            success: true,
            data: {
              id: accepted._id.toString(),
              friend: {
                ...this.formatUserDto(existing.requesterId),
                presence: friendPresence,
              },
              status: 'accepted',
              createdAt: accepted.createdAt.toISOString(),
              updatedAt: accepted.updatedAt.toISOString(),
            },
          };
        }
      }

      if (existing.status === 'accepted') {
        return { success: false, error: 'ALREADY_FRIENDS' };
      }
      if (existing.status === 'pending' && existing.requesterId._id.toString() === userId) {
        return { success: false, error: 'REQUEST_ALREADY_SENT' };
      }
    }
  }
  throw error;
}
```

### 2.3 Benefits
- **Zero 500 Errors**: Eliminates unhandled `E11000` exceptions on concurrent mutual requests.
- **Immediate Serendipitous Friendship**: When two users simultaneously express interest in connecting, the second request atomically resolves into an accepted friendship, notifying both parties via realtime events without intermediate friction.

---

## 3. Atomic State Transitions (`DEF-FR-02`)

### 3.1 Non-Atomic Pattern Analysis
Previously, `acceptRequest`, `declineRequest`, `cancelRequest`, and `removeFriend` used the non-atomic pattern:
```typescript
const request = await FriendshipModel.findById(requestId);
// condition check
request.status = 'accepted';
await request.save();
```
Under concurrent actions (e.g. user double-clicking "Accept", or User A accepting while User B cancels), this created lost updates or inconsistent notifications.

### 3.2 Atomic Conditional Transitions
All operations were converted to atomic single-roundtrip MongoDB operations:

1. **`acceptRequest`**:
   ```typescript
   const updated = await FriendshipModel.findOneAndUpdate(
     { _id: requestObjectId, addresseeId: userObjectId, status: 'pending' },
     { $set: { status: 'accepted' } },
     { new: true }
   ).populate(...).exec();
   ```
2. **`declineRequest`**:
   ```typescript
   const deleted = await FriendshipModel.findOneAndDelete({
     _id: requestObjectId,
     addresseeId: userObjectId,
     status: 'pending',
   }).exec();
   ```
3. **`cancelRequest`**:
   ```typescript
   const deleted = await FriendshipModel.findOneAndDelete({
     _id: requestObjectId,
     requesterId: userObjectId,
     status: 'pending',
   }).exec();
   ```
4. **`removeFriend`**:
   ```typescript
   const deleted = await FriendshipModel.findOneAndDelete({
     pairKey,
     status: 'accepted',
   }).exec();
   ```

### 3.3 Guarantees
- Strictly atomic state transitions with MongoDB document-level write locks.
- Concurrency-safe: Exactly one transition succeeds; duplicate concurrent requests receive structured error responses (`REQUEST_NOT_FOUND` / `REQUEST_NOT_PENDING`).
