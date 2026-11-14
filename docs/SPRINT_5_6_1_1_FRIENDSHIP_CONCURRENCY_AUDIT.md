# Sprint 5.6.1.1: Friendship Concurrency & State Integrity Audit

## 1. Objective & Scope

Audit the concurrency resilience, duplicate key collision handling, and atomic state transitions in `apps/api/src/modules/friends/friendship.service.ts`.

---

## 2. Concurrency & State Integrity Verification

### 2.1 Simultaneous Reciprocal Friend Requests
**Status: VERIFIED.**
When User A and User B send friend requests to each other simultaneously:
- The pairKey is canonically ordered: `computePairKey(A, B) === computePairKey(B, A)`.
- The first insert succeeds, creating a pending request with `requesterId = A` and `addresseeId = B`.
- The second insert fails the unique index constraint `pairKey_1` and throws a duplicate key error (`code: 11000`).
- The catch block in `sendRequest` (lines 156-213) intercepts the collision, loads the canonical relationship via `FriendshipModel.findOne({ pairKey })`, discovers the reciprocal pending request from B (`raced.requesterId.toString() === targetUserId`), and atomically updates it to `status: 'accepted'`:
  ```typescript
  const accepted = await FriendshipModel.findOneAndUpdate(
    { _id: raced._id, status: 'pending' },
    { $set: { status: 'accepted' } },
    { new: true }
  ).exec();
  ```
- Emits `emitFriendRequestAccepted` to the other user and returns an accepted `FriendshipDto`.
- Concurrently arriving duplicate requests from the same user return `REQUEST_ALREADY_SENT`.
- Attempts to friend an existing friend return `ALREADY_FRIENDS`.

### 2.2 Atomic State Transitions
**Status: VERIFIED.**
All lifecycle mutators employ single-statement atomic MongoDB operations:
- `acceptRequest`:
  `FriendshipModel.findOneAndUpdate({ _id: requestObjectId, addresseeId: userObjectId, status: 'pending' }, { $set: { status: 'accepted' } })`
- `declineRequest`:
  `FriendshipModel.findOneAndUpdate({ _id: requestObjectId, addresseeId: userObjectId, status: 'pending' }, { $set: { status: 'declined' } })`
- `cancelRequest`:
  `FriendshipModel.findOneAndDelete({ _id: requestObjectId, requesterId: userObjectId, status: 'pending' })`
- `removeFriend`:
  `FriendshipModel.findOneAndDelete({ pairKey, status: 'accepted' })`

### 2.3 Authorization Checks on Requests
**Status: VERIFIED.**
- Only the addressee can accept or decline (`addresseeId: userObjectId` in filter).
- Only the requester can cancel (`requesterId: userObjectId` in filter).
- Unauthorized attempts fail the atomic filter and return `FORBIDDEN_NOT_ADDRESSEE` or `FORBIDDEN_NOT_REQUESTER`.

---

## 3. Findings

### Finding AUD-FR-01: Overly Broad Error Predicate in Reciprocal Request Catch Block
- **Finding ID:** `AUD-FR-01`
- **Severity:** Low (Code Hygiene & Robustness)
- **Source File:** `apps/api/src/modules/friends/friendship.service.ts#L157-L160`
- **Actual Source Behavior:**
  ```typescript
  const isDuplicate =
    (err as { code?: number })?.code === 11000 ||
    (err as { name?: string })?.name === 'MongoServerError';
  ```
- **Reproduction Scenario / Failure Condition:**
  If an unrelated MongoDB error occurs during `FriendshipModel.create` (such as a transient connection timeout, query parsing failure, or database shutdown), its `err.name` is `'MongoServerError'`. The code erroneously classifies this as a duplicate key collision and executes an unnecessary `FriendshipModel.findOne({ pairKey })` query before re-throwing `err`.
- **Security & Product Impact:**
  Minimal operational impact because if `findOne` returns null or also fails, line 212 correctly re-throws `err`. However, it deviates from the principle of strictly catching specific error codes (`code === 11000`).
- **Recommended Remediation:**
  Narrow the predicate to duplicate key errors only:
  ```typescript
  const isDuplicate =
    (err as { code?: number })?.code === 11000 ||
    (err as { codeName?: string })?.codeName === 'DuplicateKey';
  ```
