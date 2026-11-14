# Sprint 5.6.1.2: Manual QA Verification Checklist

## 1. Overview
This checklist defines the 12 critical regression and remediation verification scenarios required by Sprint 5.6.1.2. Execute these steps on a staging or local environment with operator oversight.

---

## 2. Test Cases

### TC-01: Public Bearer Invitation Preview
- **Objective:** Verify public bearer invitations remain viewable by any user.
- **Steps:**
  1. Room host creates a public room `R1` and generates a shareable invitation link `T_PUB`.
  2. Send `GET /api/rooms/invitations/preview/T_PUB` without an `Authorization` header.
- **Expected Result:**
  - HTTP 200 OK.
  - Returns `invitation.status === 'valid'`, room title, category, and host profile details.

---

### TC-02: Recipient-Bound Invitation Preview (Authenticated Correct Recipient)
- **Objective:** Verify designated friend can preview their dedicated invitation.
- **Steps:**
  1. Host invites Friend A to private room `R2` generating token `T_FRIEND_A`.
  2. Authenticate as Friend A and send `GET /api/rooms/invitations/preview/T_FRIEND_A`.
- **Expected Result:**
  - HTTP 200 OK.
  - Returns `invitation.status === 'valid'` with room metadata and `userState.isAuthenticated === true`.

---

### TC-03: Unauthenticated Recipient-Bound Preview (AUD-INV-01 Verification)
- **Objective:** Verify unauthenticated users cannot view private room metadata using friend-specific tokens.
- **Steps:**
  1. Take token `T_FRIEND_A` from TC-02.
  2. Send `GET /api/rooms/invitations/preview/T_FRIEND_A` with NO `Authorization` header.
- **Expected Result:**
  - HTTP 200 OK.
  - Payload: `{ "invitation": { "status": "invalid" } }`.
  - Room name, category, description, and host details are completely omitted.

---

### TC-04: Wrong-Account Recipient-Bound Preview (AUD-INV-01 Verification)
- **Objective:** Verify an authenticated user who is NOT the designated recipient cannot view private room metadata.
- **Steps:**
  1. Take token `T_FRIEND_A` from TC-02.
  2. Authenticate as User C (different user) and send `GET /api/rooms/invitations/preview/T_FRIEND_A`.
- **Expected Result:**
  - HTTP 200 OK.
  - Payload: `{ "invitation": { "status": "invalid" } }`.
  - Room metadata is completely omitted.

---

### TC-05: Correct Recipient Preview
- **Objective:** Verify the true recipient sees full preview and action prompts.
- **Steps:**
  1. Log in as Friend A in browser.
  2. Navigate to `/invite/T_FRIEND_A`.
- **Expected Result:**
  - Page renders lounge preview, room name, host details, and "Accept & Join" button.

---

### TC-06: Recipient-Bound Redemption Without Identity
- **Objective:** Verify unauthenticated join attempts are rejected.
- **Steps:**
  1. Send `POST /api/rooms/invitations/T_FRIEND_A/join` with NO auth header.
- **Expected Result:**
  - HTTP 401 Unauthorized (`Authentication required to join lounge`).

---

### TC-07: Recipient-Bound Redemption Using Wrong Account
- **Objective:** Verify non-recipients cannot redeem a friend's private invitation.
- **Steps:**
  1. Authenticate as User C.
  2. Send `POST /api/rooms/invitations/T_FRIEND_A/join`.
- **Expected Result:**
  - HTTP 403 Forbidden.
  - Error: `'This invitation was issued to another user'`.
  - User C is not added to the room.

---

### TC-08: Correct Recipient Redemption
- **Objective:** Verify designated recipient successfully joins via token.
- **Steps:**
  1. Authenticate as Friend A.
  2. Send `POST /api/rooms/invitations/T_FRIEND_A/join`.
- **Expected Result:**
  - HTTP 200/201 Success.
  - Friend A is added as an active room member.

---

### TC-09: Invitation Expiry and Revocation
- **Objective:** Verify expired or revoked tokens are consistently rejected.
- **Steps:**
  1. Host revokes active room invitation via `POST /api/rooms/:id/invitations/revoke`.
  2. Attempt preview and join with the revoked token.
- **Expected Result:**
  - Preview returns `invitation.status === 'revoked'`.
  - Join returns HTTP 410 Gone (`Invitation link has been revoked by host`).

---

### TC-10: Multiple Independent Friend Invitations
- **Objective:** Verify inviting Friend B does not revoke Friend A's token.
- **Steps:**
  1. Host invites Friend A (token `T_A`).
  2. Host invites Friend B (token `T_B`).
  3. Friend A previews and redeems `T_A`.
- **Expected Result:**
  - `T_A` remains valid and Friend A successfully joins.
  - `T_B` remains valid for Friend B.

---

### TC-11: Reciprocal Friendship Request Duplicate-Key Recovery
- **Objective:** Verify concurrent mutual friend requests auto-converge to accepted.
- **Steps:**
  1. User A and User B concurrently send friend requests to each other.
- **Expected Result:**
  - Zero HTTP 500 errors.
  - First request creates pending; second request catches code 11000 and auto-accepts.
  - Both users become accepted friends.

---

### TC-12: Propagation of Unrelated MongoDB Errors (AUD-FR-01 Verification)
- **Objective:** Verify database errors other than duplicate key propagate as expected.
- **Steps:**
  1. Cause an unexpected query error (e.g. simulate database disconnect).
  2. Attempt `POST /api/friends/request`.
- **Expected Result:**
  - Request fails with HTTP 500 (or database connection error) and does NOT execute find queries in catch block.
