# Sprint 5.6 Manual QA Checklist: Social Presence & Friendship Experience

**Sprint:** 5.6  
**Document:** Manual QA Verification Checklist & Staging Test Protocol  
**Milestone:** Social Presence & Friendship Experience  
**Date:** November 2026  
**Target Database:** `test` (MongoDB)  

---

## 1. Test Environment Setup & Preconditions

Before executing this manual QA protocol, prepare:
1. **Three active user accounts:**
   - Account A: `singer_alpha` (Host / Performer)
   - Account B: `singer_beta` (Friend / Audience)
   - Account C: `singer_gamma` (Non-friend observer)
2. **Browsers:** Two separate browser instances or incognito sessions running simultaneously to observe real-time Socket.IO synchronization.
3. **Environment:** API running at `http://localhost:5001`, Web running at `http://localhost:3000`.

---

## 2. Test Cases Matrix

### TC-5.6-01: User Search & Discovery
- [ ] **Step 1:** Log into Account A. Navigate to `/friends` and click the **Find People** tab.
- [ ] **Step 2:** Type `"beta"` in the search bar.
- [ ] **Verification:** User `singer_beta` appears in the search results with their avatar, displayName, and an **Add Friend** button.
- [ ] **Step 3:** Search for Account A's own username.
- [ ] **Verification:** Current user is excluded from search results.
- [ ] **Step 4:** Clear search bar.
- [ ] **Verification:** Empty state with *"Discover Karaoke Enthusiasts"* is displayed.

---

### TC-5.6-02: Friend Request Lifecycle (Send & Accept)
- [ ] **Step 1:** On Account A, click **Add Friend** for `singer_beta`.
- [ ] **Verification:** Button state updates to **Request Sent** with a clock icon.
- [ ] **Step 2:** Switch to Account B's browser window. Observe the **Requests** tab badge in `/friends`.
- [ ] **Verification:** Badge count increases to `1` without requiring a page refresh.
- [ ] **Step 3:** On Account B, click the **Requests** tab -> **Received**.
- [ ] **Verification:** Account A's request is visible with **Accept** and **Decline** buttons.
- [ ] **Step 4:** Click **Accept**.
- [ ] **Verification:** Request is removed from the incoming list. Account A appears in Account B's **My Friends** tab with an active presence indicator. Account B immediately appears in Account A's **My Friends** tab.

---

### TC-5.6-03: Mutual Friend Request Auto-Acceptance
- [ ] **Step 1:** Prepare fresh test pair (or cancel existing relationship).
- [ ] **Step 2:** Account A sends a friend request to Account C (`POST /api/v1/friends/request`).
- [ ] **Step 3:** Before Account C accepts, Account C sends a friend request to Account A (`POST /api/v1/friends/request`).
- [ ] **Verification:** Instead of throwing `REQUEST_ALREADY_SENT`, the system detects the reciprocal request and auto-transitions the friendship to `accepted`. Both users immediately receive the accepted state.

---

### TC-5.6-04: Request Decline & Re-request
- [ ] **Step 1:** Account A sends a friend request to Account B.
- [ ] **Step 2:** Account B navigates to `/friends` -> **Requests** and clicks **Decline**.
- [ ] **Verification:** Request vanishes from Account B's incoming list.
- [ ] **Step 3:** Later, Account A searches for Account B again in **Find People**.
- [ ] **Verification:** Account A can send a fresh friend request without database collision.

---

### TC-5.6-05: Outgoing Request Cancellation
- [ ] **Step 1:** Account A sends a friend request to Account B.
- [ ] **Step 2:** Account A navigates to `/friends` -> **Requests** -> **Sent**.
- [ ] **Step 3:** Click **Cancel Request**.
- [ ] **Verification:** Request is deleted. On Account B's screen, the incoming request count drops to `0`.

---

### TC-5.6-06: Unfriending
- [ ] **Step 1:** With Account A and Account B confirmed as friends, navigate to Account A's **My Friends** tab.
- [ ] **Step 2:** Click the unfriend icon next to Account B and confirm.
- [ ] **Verification:** Account B is removed from Account A's list and Account A is removed from Account B's list. Relationship status reverts to `none`.

---

### TC-5.6-07: Real-time Online Presence
- [ ] **Step 1:** With Account A and Account B as friends, have Account B close all browser tabs.
- [ ] **Verification:** On Account A's friends list, Account B's presence badge displays gray **Offline**.
- [ ] **Step 2:** Account B opens the web application and logs in.
- [ ] **Verification:** Account A's friends list updates in real time to show a green dot with **Online**.

---

### TC-5.6-08: In-Lounge Presence (Public Room)
- [ ] **Step 1:** Account A creates or joins a **Public** karaoke lounge named *"Weekend Jam"*.
- [ ] **Step 2:** Account B views Account A in the **My Friends** list.
- [ ] **Verification:** Account A's presence badge updates to cyan **In Lounge: Weekend Jam** and a **Join Lounge** button appears.
- [ ] **Step 3:** Account B clicks **Join Lounge**.
- [ ] **Verification:** Account B is navigated directly to `/rooms/:roomId`.

---

### TC-5.6-09: Live Singing Performer Spotlight Presence
- [ ] **Step 1:** While in the lounge, Account A adds a song to the queue and starts playback, becoming the active singer on stage.
- [ ] **Step 2:** Account B views Account A in the friends list.
- [ ] **Verification:** Account A's badge updates to an animated violet/fuchsia gradient: **Singing: [Song Title]** with a pulsing microphone icon.
- [ ] **Step 3:** An action button **Watch Live** is rendered.

---

### TC-5.6-10: Private Room Masking (Anti-Leak Verification)
- [ ] **Step 1:** Account A hosts a **Private Lounge** named *"Secret VIP Party"*.
- [ ] **Step 2:** Account B (friend of Account A) views Account A's presence from outside the room.
- [ ] **Verification:**
  - Status is displayed as **In Lounge**.
  - Room title is masked to **Private Lounge**.
  - The actual room title *"Secret VIP Party"* is **not** visible.
  - The room ID is **not** present in DOM or network payload (`roomId: null`).
  - No direct "Join Lounge" button is rendered.
- [ ] **Step 3:** Account C (not a friend of Account A) inspects Account A's presence.
- [ ] **Verification:** Status is returned as **Offline**.

---

### TC-5.6-11: Presence Privacy (Stealth Mode)
- [ ] **Step 1:** Account A navigates to user preferences / studio settings.
- [ ] **Step 2:** Set `presenceVisibility` to `'none'`.
- [ ] **Step 3:** Account A enters a room and sings.
- [ ] **Step 4:** Account B checks the friends list.
- [ ] **Verification:** Account A appears as **Offline**. No presence or lounge activity is visible.

---

### TC-5.6-12: Direct Room Invitation from Inside Lounge
- [ ] **Step 1:** Account A is the host of a private lounge.
- [ ] **Step 2:** Account A clicks **Invite Friends** in the room controls header.
- [ ] **Step 3:** In the dialog, switch to the **Direct Invite** tab.
- [ ] **Verification:** Account B is listed with their live presence badge (**Online**).
- [ ] **Step 4:** Click **Invite** next to Account B.
- [ ] **Verification:**
  - Button state transitions to **Sent** with a green checkmark.
  - On Account B's screen, a realtime invitation packet is received over Socket.IO (`friend:invitation:received`).
