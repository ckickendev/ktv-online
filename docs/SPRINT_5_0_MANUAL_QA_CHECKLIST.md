# KTVOnline — Sprint 5.0: Manual QA Checklist

## 1. Overview & Execution Rules

This manual QA checklist provides step-by-step verification procedures for **Private Karaoke Lounges & Social Invitations** delivered in Sprint 5.0.

### Operator Instructions
- **Target Environments:** Local staging or pre-production cluster.
- **Prerequisites:** Backend API (`apps/api`) and Web Client (`apps/web`) running.
- **Execution Policy:** In accordance with the Code-Only Development Policy, **no scenario is pre-marked as passed**. All actual results, initials, and checkboxes must be filled in interactively by the QA operator.

---

## 2. Test Execution Suite

---

### Area 1: Room Visibility & Public Discovery

#### QA-INV-01: Create Private Room & Verify Default Visibility
- **QA ID:** `QA-INV-01`
- **Preconditions:** Authenticated User A (Host).
- **Steps:**
  1. Navigate to `/rooms/create`.
  2. Enter room title "Secret VIP Lounge".
  3. Verify visibility defaults to "Public Lounge".
  4. Select "Private Lounge" radio card.
  5. Submit creation form.
- **Expected Result:**
  - Room document is created with `visibility: 'private'`.
  - Browser redirects to `/rooms/[roomId]`.
  - Room header displays "Private" lock badge.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-02: Public Room Discovery Exclusion
- **QA ID:** `QA-INV-02`
- **Preconditions:** "Secret VIP Lounge" created with `visibility: 'private'`.
- **Steps:**
  1. Open a new incognito window or authenticate as User B.
  2. Navigate to `/rooms` (Explore Lounges feed).
  3. Search for "Secret VIP Lounge" in the search box.
- **Expected Result:**
  - The private room does NOT appear anywhere in the explore feed or search results.
  - Public rooms continue to appear normally.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

### Area 2: Host Invitation Management

#### QA-INV-03: Host Creates Invitation Link
- **QA ID:** `QA-INV-03`
- **Preconditions:** User A in private room as Host.
- **Steps:**
  1. User A clicks the **Invite** button in the header.
  2. In the "Invite Friends" dialog, select duration "48 Hours".
  3. Click **Create Invitation Link**.
  4. Click the **Copy** button.
- **Expected Result:**
  - Backend creates a hashed token record in `roominvitations`.
  - Dialog displays the generated URL (`/invite/[token]`).
  - Copy button changes to "Copied!" with a green checkmark.
  - Raw token is copied to clipboard.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-04: Non-Host Permission Boundary
- **QA ID:** `QA-INV-04`
- **Preconditions:** User B joined as a regular Member in a private room.
- **Steps:**
  1. User B opens the room header and clicks the Share button.
  2. Inspect the dialog content.
  3. Attempt to issue a direct `POST /api/v1/rooms/:id/invitations` using User B's token.
- **Expected Result:**
  - Dialog displays an informational banner: *"Only the room host can create and manage secure invitation links."*
  - No generation controls are visible to User B.
  - Direct API request is rejected with HTTP 403 `FORBIDDEN_NOT_HOST`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

### Area 3: Guest Preview & Join Flow

#### QA-INV-05: Unauthenticated Guest Preview Experience
- **QA ID:** `QA-INV-05`
- **Preconditions:** Host generated an active invite URL.
- **Steps:**
  1. In a fresh incognito browser (unauthenticated), paste the `/invite/[token]` URL.
  2. Observe the rendered landing page.
- **Expected Result:**
  - Page renders without requiring login.
  - Room title, music genre, atmosphere theme, and host card are visible.
  - Member rosters and voice credentials are NOT exposed.
  - CTA button displays "Log In to Enter Lounge" pointing to `/login?redirect=/invite/[token]`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-06: Authenticated Guest Secure Join
- **QA ID:** `QA-INV-06`
- **Preconditions:** User B authenticated; holds active `/invite/[token]` link.
- **Steps:**
  1. User B opens `/invite/[token]`.
  2. Verify preview details match the private room.
  3. Click **Join Karaoke Lounge**.
- **Expected Result:**
  - Spinner displays "Joining Lounge...".
  - Backend re-validates token, verifies capacity, and creates active `RoomMembership`.
  - Browser redirects to `/rooms/[roomId]`.
  - User B appears in the participant roster and joins the live room session.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-07: Idempotent Rejoin by Existing Member
- **QA ID:** `QA-INV-07`
- **Preconditions:** User B already an active member of the private room.
- **Steps:**
  1. User B re-opens the original `/invite/[token]` URL.
- **Expected Result:**
  - Preview card displays *"You are in this Lounge — Enter Stage"*.
  - Clicking the CTA immediately navigates to `/rooms/[roomId]`.
  - Room participant count does NOT double-increment.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

### Area 4: Expiration, Revocation & Replacement

#### QA-INV-08: Host Revokes Invitation Link
- **QA ID:** `QA-INV-08`
- **Preconditions:** Active invite link in circulation.
- **Steps:**
  1. User A (Host) opens the Invite dialog.
  2. Click **Revoke Link**.
  3. In a separate browser, User C attempts to open the revoked `/invite/[token]` URL.
- **Expected Result:**
  - Backend marks `status: 'revoked'` and `revokedAt: new Date()`.
  - User C sees the "Invitation Revoked" card with a link back to public lounges.
  - Attempting to join via API returns HTTP 410 `INVITATION_REVOKED`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

#### QA-INV-09: Host Replaces / Rotates Invitation Link
- **QA ID:** `QA-INV-09`
- **Preconditions:** Active Link 1 exists.
- **Steps:**
  1. User A (Host) opens the Invite dialog.
  2. Click **Generate New Link (Replaces Previous)**.
  3. Verify Link 2 is generated.
  4. Guest attempts to use Link 1.
  5. Guest attempts to use Link 2.
- **Expected Result:**
  - Link 1 is revoked and rejected.
  - Link 2 works cleanly and allows joining.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

### Area 5: Boundary & Moderation Enforcement

#### QA-INV-10: Capacity Enforcement on Invitation Join
- **QA ID:** `QA-INV-10`
- **Preconditions:** Private room created with `capacity: 2`. Host and Member 1 already occupy the room ($2/2$).
- **Steps:**
  1. Member 2 opens `/invite/[token]`.
  2. Observe preview state and CTA.
- **Expected Result:**
  - Preview displays attendance: `2 / 2 Singers`.
  - CTA button is disabled displaying *"Lounge Is Full (2/2)"*.
  - Attempting direct API join returns HTTP 409 `ROOM_FULL`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-11: Kicked Member Cannot Rejoin via Invite
- **QA ID:** `QA-INV-11`
- **Preconditions:** User B is kicked from the room by Host User A.
- **Steps:**
  1. User B opens an active `/invite/[token]` link.
- **Expected Result:**
  - Page renders the "Access Restricted" error card: *"You were previously removed from this lounge by the host and cannot rejoin."*
  - Attempting direct API join returns HTTP 403 `FORBIDDEN_KICKED`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-12: Closed Room Rejection
- **QA ID:** `QA-INV-12`
- **Preconditions:** Host closes the room via Host Controls.
- **Steps:**
  1. Guest opens the active `/invite/[token]` link.
- **Expected Result:**
  - Preview card displays "Lounge Closed".
  - Direct join API returns HTTP 400 `ROOM_CLOSED`.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-13: Rate Limiting on Preview Endpoint
- **QA ID:** `QA-INV-13`
- **Preconditions:** Running API server.
- **Steps:**
  1. Script sends 65 rapid requests to `/api/v1/invitations/invalid-token-test`.
- **Expected Result:**
  - First 60 requests return preview result or 400.
  - Requests 61–65 return HTTP 429 *"Too many invitation preview requests, please try again later"*.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

#### QA-INV-14: Mobile Responsive Layout & Touch Targets
- **QA ID:** `QA-INV-14`
- **Preconditions:** Mobile viewport (375px–430px width).
- **Steps:**
  1. Open `/invite/[token]` on a mobile device emulator.
  2. Verify all buttons (Join, Copy, Explore) have height $\ge 44\text{px}$.
  3. Verify no horizontal scrollbar occurs.
  4. Open Invite Friends dialog inside `/rooms/[roomId]` on mobile.
- **Expected Result:**
  - Dialog and landing page render cleanly within screen bounds.
  - Touch targets are easily tappable with no overlapping elements.
- **Actual Result:** `[                                                            ]`
- **Pass / Fail / Blocked:** `[ ] Pass   [ ] Fail   [ ] Blocked`
- **Notes:** `[                                                            ]`

---

## 3. QA Sign-Off Block

| Role | Name | Signature | Date | Verdict (Approved / Rejected) |
| :--- | :--- | :--- | :--- | :---: |
| **QA Lead** | `____________________` | `____________________` | `________` | `[ ] APPROVED   [ ] REJECTED` |
| **Engineering Lead** | `____________________` | `____________________` | `________` | `[ ] APPROVED   [ ] REJECTED` |
