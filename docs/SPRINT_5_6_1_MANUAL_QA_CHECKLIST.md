# Sprint 5.6.1: Manual QA Verification Checklist

## 1. Overview
This checklist defines exact step-by-step test cases for operators to execute in staging or local environments to verify the social integrity and invitation security remediations implemented in Sprint 5.6.1.

---

## 2. Test Cases

### TC-INV-01: Direct Friend Invitation Isolation (Multi-Friend Invites)
- **Objective:** Verify that inviting Friend B does not revoke an earlier invitation issued to Friend A.
- **Preconditions:** User Host has created a private room `R1`. Host has two accepted friends: Friend A and Friend B.
- **Steps:**
  1. Host opens "Invite Friends" dialog in `R1` and clicks "Invite" next to Friend A.
  2. Note token `T_A` generated for Friend A.
  3. Host clicks "Invite" next to Friend B.
  4. Note token `T_B` generated for Friend B.
  5. Friend A attempts to redeem token `T_A` via `/invite/${T_A}`.
- **Expected Result:**
  - Token `T_A` remains valid and active (`revokedAt: null`).
  - Friend A successfully previews and joins room `R1`.
  - Token `T_B` also remains valid for Friend B.

---

### TC-INV-02: Non-Host Private Lounge Invitation Rejection
- **Objective:** Verify that non-host participants cannot generate invitation tokens for private rooms.
- **Preconditions:** User Host created private room `R1`. User Member is an active participant in `R1` (not host). Member has accepted friend User C.
- **Steps:**
  1. Member sends `POST /api/friends/invite-lounge` with payload `{ roomId: "R1", friendUserId: "User C" }`.
- **Expected Result:**
  - Server responds with HTTP 403 Forbidden.
  - Error code is `FORBIDDEN_NOT_HOST`.
  - Error message: `"Only the room host can invite users to a private lounge"`.
  - No invitation token is issued.

---

### TC-INV-03: Recipient Token Enforcement (No Bearer Forwarding)
- **Objective:** Verify that a recipient-bound token issued to Friend A cannot be redeemed by Uninvited User X.
- **Preconditions:** Host issued friend invitation `T_A` to Friend A for private room `R1`.
- **Steps:**
  1. User X (not Friend A) copies `T_A` and attempts `POST /api/rooms/${R1}/join` with `{ inviteToken: T_A }`.
- **Expected Result:**
  - Join attempt is rejected with error `INVITATION_RECIPIENT_MISMATCH`.
  - User X is not granted membership in `R1`.

---

### TC-INV-04: Reciprocal Friend Request Concurrency
- **Objective:** Verify that simultaneous mutual friend requests do not produce MongoDB `E11000` errors.
- **Preconditions:** User A and User B are not friends and have no pending requests.
- **Steps:**
  1. Concurrently execute:
     - User A: `POST /api/friends/request` -> `{ targetUserId: "User B" }`
     - User B: `POST /api/friends/request` -> `{ targetUserId: "User A" }`
- **Expected Result:**
  - Neither request returns HTTP 500 or unhandled `E11000`.
  - First insert creates pending request.
  - Second insert catches collision, auto-transitions document to `accepted`, and returns status `accepted`.
  - Both users are immediately friends.

---

### TC-INV-05: Realtime Presence Broadcast on Connection & Disconnection
- **Objective:** Verify friends receive immediate presence updates on connect and disconnect.
- **Preconditions:** User A and User B are accepted friends. User B is viewing the Friends panel.
- **Steps:**
  1. User A logs in and establishes socket connection.
  2. Observe User B's UI.
  3. User A closes browser tab.
  4. Wait 12 seconds (exceeding 10s grace period).
- **Expected Result:**
  - On step 2: User A's status immediately switches to `online` on User B's screen without page refresh.
  - On step 3: User A's status remains online during the 10-second grace period (no flicker).
  - On step 4: After 10s grace expires, User A's status updates to `offline`.

---

### TC-INV-06: Room Presence Masking for Private Lounges
- **Objective:** Verify outsiders never receive private lounge names or song titles in presence broadcasts.
- **Preconditions:** User A and User B are friends. User A enters a private room named "Top Secret Lounge" and sings "Bohemian Rhapsody".
- **Steps:**
  1. Inspect the `friend:presence:updated` socket event payload received by User B.
- **Expected Result:**
  - `status`: `'singing'`
  - `roomId`: `null`
  - `roomTitle`: `'Private Lounge'` (masked)
  - `songTitle`: `null` (masked)
  - `isPrivateLounge`: `true`

---

### TC-INV-07: Realtime Direct Invitation Toast Notification
- **Objective:** Verify incoming lounge invitation creates a non-intrusive toast in the recipient's UI.
- **Preconditions:** User Host and Friend A are accepted friends. Friend A is logged in on `/rooms`.
- **Steps:**
  1. Host sends lounge invitation to Friend A.
  2. Observe Friend A's screen.
  3. Friend A clicks "Accept & Join".
- **Expected Result:**
  - Floating toast appears in bottom-right corner displaying Host's avatar, room title, and badge.
  - Clicking "Accept & Join" redirects Friend A to `/invite/${token}` and joins the lounge.
