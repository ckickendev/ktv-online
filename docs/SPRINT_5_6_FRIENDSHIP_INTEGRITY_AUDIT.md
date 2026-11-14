# Sprint 5.6 Source Audit: Friendship Data Integrity & Concurrency

**Audit Target:** Relational Safety, ACID Invariants, Concurrency, and State Transitions  
**Sprint Baseline Commit:** `b3f89e30c78ba908d80c2c5b9dd8a0f47d87dd96`  
**Files Inspected:**
- `apps/api/src/modules/friends/friendship.model.ts`
- `apps/api/src/modules/friends/friendship.service.ts`
- `apps/api/src/modules/friends/friendship.controller.ts`
- `packages/contracts/src/friendship.ts`
**Audit Date:** November 2026  
**Auditor:** Antigravity Source Security & Architecture Auditor  

---

## 1. Executive Summary

This audit assesses the data integrity and concurrency guarantees of KTVOnline's bidirectional friendship model. The audit confirms that the canonical `pairKey` strategy successfully prevents duplicate active relationships between any two users. However, the audit identified **two significant concurrency defects** in state transitions: an unhandled `MongoServerError (code 11000)` during simultaneous reciprocal requests, and non-atomic read-modify-write patterns in request acceptance/cancellation.

---

## 2. Model Structure & Uniqueness Invariants

### 2.1. Canonical Pair Key (`pairKey`)
- **Location:** `apps/api/src/modules/friends/friendship.model.ts#L16-L20`
- **Source Verification:**
  ```typescript
  export function computePairKey(userA: string | Types.ObjectId, userB: string | Types.ObjectId): string {
    const strA = userA.toString();
    const strB = userB.toString();
    return strA < strB ? `${strA}:${strB}` : `${strB}:${strA}`;
  }
  ```
- **Index Definition:**
  ```typescript
  pairKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  }
  ```
- **Finding:** Verified. The string comparison is deterministic across MongoDB `ObjectId.toString()` representations (24 hex characters). The unique index guarantees that no more than one document can ever exist for the unordered pair $\{A, B\}$.

### 2.2. Self-Request Prevention
- **Location:** `apps/api/src/modules/friends/friendship.service.ts#L49-L51`
- **Source Verification:**
  ```typescript
  if (userId === targetUserId) {
    return { success: false, error: 'CANNOT_FRIEND_SELF' };
  }
  ```
- **Finding:** Verified. Attempting to friend oneself is intercepted prior to database querying and returns HTTP 400.

### 2.3. User State Validation (Suspension & Existence)
- **Location:** `apps/api/src/modules/friends/friendship.service.ts#L53-L61`
- **Source Verification:**
  ```typescript
  const targetUser = await UserModel.findById(targetUserId).select('status username displayName avatar bio').exec();
  if (!targetUser || targetUser.status === 'suspended') {
    return { success: false, error: 'TARGET_USER_NOT_FOUND' };
  }
  ```
- **Finding:** Verified. Target users who do not exist or have `status === 'suspended'` cannot be sent friend requests.

---

## 3. Discovered Concurrency & Atomicity Defects

### 3.1. DEFECT-FR-01: Non-Atomic Reciprocal Request Race Condition (HTTP 500 on Code 11000)
- **Location:** `apps/api/src/modules/friends/friendship.service.ts#L64-L136`
- **Evidence:**
  In `friendship.service.ts`:
  ```typescript
  const existing = await FriendshipModel.findOne({ pairKey }).exec();
  if (existing) {
    // ... handles mutual request auto-acceptance if existing is already in DB ...
  }

  // Create new pending friendship
  const newFriendship = await FriendshipModel.create({
    requesterId: new Types.ObjectId(userId),
    addresseeId: new Types.ObjectId(targetUserId),
    pairKey,
    status: 'pending',
  });
  ```
  **Race Scenario:**
  1. User $A$ and User $B$ simultaneously send friend requests to each other within the same execution window ($\Delta t < 20\text{ms}$).
  2. Both Node.js threads execute `findOne({ pairKey })`. Both queries return `null` because neither document has been committed yet.
  3. Thread $A$ executes `FriendshipModel.create(...)` and succeeds, inserting `{ pairKey: "A:B", status: "pending" }`.
  4. Thread $B$ executes `FriendshipModel.create(...)`.
  5. MongoDB encounters the unique index violation on `pairKey` and throws `MongoServerError: E11000 duplicate key error collection: test.friendships index: pairKey_1`.
  6. Because `sendRequest` contains **no `try/catch` block** or error handler for code `11000`, the exception escapes to Express's global `errorHandler` (`error.middleware.ts#L11-L30`), returning HTTP 500 `"Internal Server Error"` to User $B$.
- **Required Fix:** Wrap creation in a `try/catch` block. If error code is `11000`, query the document again and invoke the mutual auto-acceptance logic instead of crashing with HTTP 500.

### 3.2. DEFECT-FR-02: Non-Atomic State Transitions in `acceptRequest` and `cancelRequest`
- **Locations:**
  - `apps/api/src/modules/friends/friendship.service.ts#L168-L186`
  - `apps/api/src/modules/friends/friendship.service.ts#L260-L274`
- **Evidence:**
  `acceptRequest` uses a traditional read-modify-save pattern:
  ```typescript
  const friendship = await FriendshipModel.findById(requestId)...;
  // ... checks ...
  friendship.status = 'accepted';
  await friendship.save();
  ```
  `cancelRequest` uses:
  ```typescript
  const friendship = await FriendshipModel.findById(requestId).exec();
  // ... checks ...
  await FriendshipModel.findByIdAndDelete(requestId).exec();
  ```
  **Race Scenario:**
  - Addressee clicks **Accept** at the exact moment Requester clicks **Cancel Request**.
  - `acceptRequest` reads document (`status: 'pending'`).
  - `cancelRequest` executes `findByIdAndDelete(requestId)` and removes the document from MongoDB.
  - `acceptRequest` executes `await friendship.save()`. In Mongoose, calling `.save()` on an instantiated document that was deleted from the collection can resurrect the document or trigger a VersionError depending on Mongoose version.
- **Required Fix:** Use atomic conditional mutations:
  ```typescript
  const updated = await FriendshipModel.findOneAndUpdate(
    { _id: requestId, addresseeId: userId, status: 'pending' },
    { $set: { status: 'accepted' } },
    { new: true }
  );
  if (!updated) return { success: false, error: 'REQUEST_NOT_PENDING_OR_AUTHORIZED' };
  ```

---

## 4. Authorization & Security Verification

| Operation | Requester Authorized | Addressee Authorized | Third Party Authorized | Verification Status |
|---|---|---|---|---|
| `sendRequest` | Yes (initiator) | N/A | No | **Verified** |
| `acceptRequest` | **Rejected (403)** | **Authorized** | **Rejected (403)** | **Verified** (`friendship.addresseeId._id.toString() !== userId`) |
| `declineRequest`| **Rejected (403)** | **Authorized** | **Rejected (403)** | **Verified** (`friendship.addresseeId.toString() !== userId`) |
| `cancelRequest` | **Authorized** | **Rejected (403)** | **Rejected (403)** | **Verified** (`friendship.requesterId.toString() !== userId`) |
| `removeFriend`  | **Authorized** | **Authorized** | **Rejected (404)** | **Verified** (`pairKey` check limits deletion to members) |

---

## 5. Audit Conclusion

The friendship relational schema and authorization checks are robust. The authorization barriers strictly prevent third-party tampering. However, the service layer exhibits concurrency flaws under high-frequency mutual requests (DEF-FR-01) and concurrent cancel/accept operations (DEF-FR-02) that must be remediated with atomic operations and duplicate key error catching.
