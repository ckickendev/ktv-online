# Sprint 5.6.1.2: Source Remediation Audit

## 1. Executive Summary

- **Sprint Milestone:** Sprint 5.6.1.2: Invitation Identity Enforcement & Database Error Integrity
- **Baseline Commit:** `2ba32d7` (Sprint 5.6.1.1 audit baseline)
- **Database:** `test` (MongoDB database name preserved)
- **Remediation Scope:**
  1. `AUD-INV-01`: Fail-closed recipient identity verification for recipient-bound invitations in `previewInvitation`, `validateInvitation`, and `resolveInvitationRoomId`.
  2. `AUD-FR-01`: Precise classification of MongoDB unique index duplicate-key errors (`code === 11000` / `codeName === 'DuplicateKey'`) in `sendRequest`.
  3. `AUD-INV-02`: Documented host-only product authorization policy for direct friend invitations across both public and private rooms.

---

## 2. Line-by-Line Remediation Verification

### 2.1 Remediation of AUD-INV-01: Recipient Identity Enforcement
**Files Modified:**
- `apps/api/src/modules/rooms/invitation.service.ts`
- `apps/api/src/modules/rooms/invitation.controller.ts`
- `apps/api/src/modules/rooms/room.controller.ts`

**Source Changes:**
1. In `invitation.service.ts#previewInvitation`:
   ```typescript
   // Recipient-bound check: if invitation is dedicated to a friend, verify identity (AUD-INV-01)
   if (invitation.recipientId) {
     if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
       return {
         success: true,
         data: {
           invitation: { status: 'invalid' },
         },
       };
     }
   }
   ```
   *Behavior:*
   - Unauthenticated caller (`!requestingUserId`): Returns generic `{ invitation: { status: 'invalid' } }` without room or host metadata.
   - Wrong authenticated user (`invitation.recipientId.toString() !== requestingUserId`): Returns generic `{ invitation: { status: 'invalid' } }` without metadata.
   - Matching recipient: Proceeds to preview normally.
   - Non-recipient-bound invitations (`recipientId: null`): Bypasses recipient check; public preview functions uninterrupted.

2. In `invitation.service.ts#validateInvitation`:
   ```typescript
   // Recipient-bound validation: if token is bound to a specific friend, verify caller identity (AUD-INV-01)
   if (invitation.recipientId) {
     if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
       return { valid: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
     }
   }
   ```
   *Behavior:*
   - Missing caller identity (`!requestingUserId`): Fails closed, returning `INVITATION_RECIPIENT_MISMATCH`.
   - Mismatched identity: Returns `INVITATION_RECIPIENT_MISMATCH`.
   - Matching recipient: Returns `{ valid: true }`.

3. In `invitation.service.ts#resolveInvitationRoomId`:
   ```typescript
   // Recipient-bound identity check (AUD-INV-01)
   if (invitation.recipientId) {
     if (!requestingUserId || invitation.recipientId.toString() !== requestingUserId) {
       return { success: false, error: 'INVITATION_RECIPIENT_MISMATCH' };
     }
   }
   ```
   *Behavior:*
   - Prevents resolving room ID when the token belongs to another user.

4. In `invitation.controller.ts#joinViaInvitation`:
   - Passes `req.user.id` to `resolveInvitationRoomId(token, req.user.id)`.
   - Mapped `case 'INVITATION_RECIPIENT_MISMATCH': sendError(res, 'This invitation was issued to another user', 403); return;`.

5. In `room.controller.ts#joinRoom`:
   - Mapped `case 'INVITATION_RECIPIENT_MISMATCH': sendError(res, 'This invitation was issued to another user', 403); return;`.

---

### 2.2 Remediation of AUD-FR-01: Duplicate-Key Error Classification
**File Modified:**
- `apps/api/src/modules/friends/friendship.service.ts`

**Source Changes:**
In `sendRequest` (lines 156-161):
```typescript
    } catch (err: unknown) {
      // Precise unique-index collision detection for canonical pairKey (AUD-FR-01)
      const isDuplicate =
        (err as { code?: number })?.code === 11000 ||
        (err as { codeName?: string })?.codeName === 'DuplicateKey';
```
*Behavior:*
- The overly broad `(err as { name?: string })?.name === 'MongoServerError'` predicate has been removed.
- Only exact duplicate key errors on the unique `pairKey_1` index (`code === 11000` or `codeName === 'DuplicateKey'`) trigger reciprocal collision resolution.
- Transient network errors, socket timeouts, server selection errors, and unrelated database exceptions propagate directly without triggering redundant find queries.

---

## 3. Product Policy Documentation: AUD-INV-02
In `apps/api/src/modules/friends/friendship.service.ts` (lines 642-645):
```typescript
// Authoritative host check: only the room owner can dispatch direct friend invitations
if (room.ownerId.toString() !== userId) {
  return { success: false, error: 'FORBIDDEN_NOT_HOST' };
}
```
**Product Policy Confirmation:**
- In KTVOnline, only the room host (owner) is authorized to generate and dispatch direct friend invitations.
- This rule applies consistently across both public and private rooms.
- Ordinary members and viewers cannot dispatch official room invitations to friends.
- This is an intentional product design decision to prevent room spam and ensure room hosts maintain full control over audience growth.

---

## 4. Verification Results

1. `pnpm typecheck`: Passed with 0 errors across `@ktv/contracts`, `apps/api`, and `apps/web`.
2. `pnpm lint`: Passed with 0 errors and 0 warnings across all monorepo packages.
3. Strict code-only development policy preserved (zero test modifications, zero test runner executions, zero database writes).
