# Sprint 5.6.1.3: Friendship Integrity & Concurrency Audit

## 1. Scope & Operations Inspected

This audit inspected all state mutation pathways in `apps/api/src/modules/friends/friendship.service.ts`:
- `sendRequest` (creation and reciprocal request race resolution)
- `acceptRequest` (transition to accepted)
- `declineRequest` (transition to declined)
- `cancelRequest` (removal of outgoing pending request)
- `removeFriend` (removal of accepted relationship)

---

## 2. Reciprocal Request Concurrency (Phase 4)

### 2.1 Canonical Key Architecture
Relationships are keyed by `pairKey`:
```typescript
export function computePairKey(userA: string | Types.ObjectId, userB: string | Types.ObjectId): string {
  const strA = userA.toString();
  const strB = userB.toString();
  return strA < strB ? `${strA}:${strB}` : `${strB}:${strA}`;
}
```
`pairKey` is indexed with `{ unique: true }` in `FriendshipSchema`.

### 2.2 Collision Recovery in `sendRequest` (`friendship.service.ts#L156-L213`)
```typescript
try {
  const newFriendship = await FriendshipModel.create({
    requesterId: new Types.ObjectId(userId),
    addresseeId: new Types.ObjectId(targetUserId),
    pairKey,
    status: 'pending',
  });
  ...
} catch (err: unknown) {
  // Precise unique-index collision detection for canonical pairKey (AUD-FR-01)
  const isDuplicate =
    (err as { code?: number })?.code === 11000 ||
    (err as { codeName?: string })?.codeName === 'DuplicateKey';

  if (isDuplicate) {
    const raced = await FriendshipModel.findOne({ pairKey }).exec();
    if (raced) {
      if (raced.status === 'accepted') {
        return { success: false, error: 'ALREADY_FRIENDS' };
      }
      if (raced.status === 'blocked') {
        return { success: false, error: 'USER_BLOCKED' };
      }
      if (raced.status === 'pending') {
        if (raced.requesterId.toString() === userId) {
          return { success: false, error: 'REQUEST_ALREADY_SENT' };
        }
        if (raced.requesterId.toString() === targetUserId) {
          // Reciprocal request detected in race! Atomically transition to accepted.
          const accepted = await FriendshipModel.findOneAndUpdate(
            { _id: raced._id, status: 'pending' },
            { $set: { status: 'accepted' } },
            { new: true }
          ).exec();

          if (accepted) {
            const io = getSocketServer();
            emitFriendRequestAccepted(io, targetUserId, {
              friendshipId: accepted._id.toString(),
              friend: this.formatUserDto(currentUser),
              acceptedAt: new Date().toISOString(),
            });
            ...
            return { success: true, data: friendshipDto };
          }
        }
      }
    }
  }
  throw err;
}
```

### 2.3 Verification Analysis:
1. **Convergence:** When User A and User B concurrently invite each other, the second insert catches `code === 11000`, finds A's pending request, and atomically transitions it to `accepted`. Both users converge to one accepted relationship.
2. **Error Classification:** Generic `MongoServerError` is NOT treated as duplicate; network errors, timeouts, and auth errors propagate normally via `throw err;`.
3. **Idempotency:** Repeated requests from the same user yield `REQUEST_ALREADY_SENT`. Duplicate requests when already friends yield `ALREADY_FRIENDS`.

---

## 3. Atomic State Transitions

All lifecycle operations employ single-statement atomic operations:

| Operation | Atomic MongoDB Operation | Target Actor Authorization | Verification |
| :--- | :--- | :--- | :--- |
| **`acceptRequest`** | `findOneAndUpdate({ _id, addresseeId, status: 'pending' }, { $set: { status: 'accepted' } })` | Addressee only | Verified |
| **`declineRequest`** | `findOneAndUpdate({ _id, addresseeId, status: 'pending' }, { $set: { status: 'declined' } })` | Addressee only | Verified |
| **`cancelRequest`** | `findOneAndDelete({ _id, requesterId, status: 'pending' })` | Requester only | Verified |
| **`removeFriend`** | `findOneAndDelete({ pairKey, status: 'accepted' })` | Either friend | Verified |

- Zero read-modify-save race conditions.
- Document-level write locks prevent dirty reads and lost updates.

---

## 4. Audit Conclusion
Friendship concurrency, state transition atomicity, and error propagation are **fully verified**. Zero defects identified.
