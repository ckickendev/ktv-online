# Sprint 5.6.1.2: Friendship Concurrency & Database Error Handling Review

## 1. Overview

This document reviews the duplicate-key error classification remediation in `apps/api/src/modules/friends/friendship.service.ts` implemented during Sprint 5.6.1.2 to resolve defect `AUD-FR-01`.

---

## 2. Database Schema & Constraint Analysis

In `apps/api/src/modules/friends/friendship.model.ts`:
```typescript
export function computePairKey(userA: string | Types.ObjectId, userB: string | Types.ObjectId): string {
  const strA = userA.toString();
  const strB = userB.toString();
  return strA < strB ? `${strA}:${strB}` : `${strB}:${strA}`;
}

const FriendshipSchema = new Schema<IFriendshipDocument>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    addresseeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pairKey: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'blocked'], default: 'pending', index: true },
    ...
  }
);
```

### Unique Index Characteristics
- Field: `pairKey`
- Index Name: `pairKey_1`
- Unique: `true`
- Purpose: Enforce that at most one relationship document exists between any two users in KTVOnline.

---

## 3. Concurrency Collision & Error Predicate Analysis

### 3.1 Pre-Remediation Behavior (`AUD-FR-01`)
```typescript
// Previous implementation:
const isDuplicate =
  (err as { code?: number })?.code === 11000 ||
  (err as { name?: string })?.name === 'MongoServerError';
```
**Defect Analysis:**
All errors emitted by the official Node.js MongoDB driver have `name === 'MongoServerError'`, including:
- Connection pool timeouts (code: undefined / timeout)
- Server selection errors
- Document validation errors (code: 121)
- Write concern failures
- Network interruptions

When any of these unrelated errors occurred during `FriendshipModel.create`, `isDuplicate` evaluated to `true`, causing the server to execute a spurious `FriendshipModel.findOne({ pairKey })` call instead of immediately failing or bubbling the real database error.

### 3.2 Remediated Implementation
In `apps/api/src/modules/friends/friendship.service.ts#sendRequest`:
```typescript
// Remediated implementation:
const isDuplicate =
  (err as { code?: number })?.code === 11000 ||
  (err as { codeName?: string })?.codeName === 'DuplicateKey';
```
**Correctness Guarantees:**
1. **Precise Classification:** Only true duplicate-key collisions matching MongoDB code `11000` or `codeName === 'DuplicateKey'` enter the collision recovery block.
2. **Normal Error Propagation:** Any other database error bypasses the block and is thrown immediately (`throw err;`), ensuring unhandled infrastructure problems are logged accurately and surfaced through global error middleware.
3. **Collision Recovery Logic:**
   - When a true duplicate-key collision occurs on `pairKey_1`:
     - Reads the canonical pair document (`FriendshipModel.findOne({ pairKey })`).
     - If the existing document is `pending` and originates from the target user (`raced.requesterId.toString() === targetUserId`), mutual desire to connect is confirmed.
     - Atomically transitions status to `accepted` via `findOneAndUpdate({ _id: raced._id, status: 'pending' }, { $set: { status: 'accepted' } })`.
     - Emits `friend:request:accepted` realtime notification and returns an accepted `FriendshipDto`.
     - If already accepted, returns structured error `ALREADY_FRIENDS`.
     - If blocked, returns structured error `USER_BLOCKED`.
     - If duplicate from same user, returns structured error `REQUEST_ALREADY_SENT`.
