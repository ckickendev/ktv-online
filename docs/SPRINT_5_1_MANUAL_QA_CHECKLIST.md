# KTVOnline — Sprint 5.1: Manual QA Checklist

## 1. Scope & Verification Instructions

This checklist provides comprehensive manual test cases to verify the First-Time User Experience (FTUE), onboarding persistence, contextual guidance, and empty states implemented in Sprint 5.1.

> **Status:** STATIC CODE COMPLETE — PENDING RUNTIME OPERATOR EXECUTION.  
> **Target Database:** `test`  
> **Environment:** Local Development / Staging

---

## 2. Test Cases

### TC-FTUE-01: Landing Page Hero & Navigation
- **Preconditions:** Unauthenticated browser session (incognito mode).
- **Steps:**
  1. Navigate to `/`.
  2. Verify top pill displays: *"Live Social Karaoke Lounges • Real-time WebRTC Voice & Synchronized Lyrics"*.
  3. Verify primary hero CTA displays: *"Explore Karaoke Lounges"* and links to `/rooms`.
  4. Verify secondary hero CTA displays: *"Host a Private Lounge"* with lock icon and links to `/rooms/create`.
  5. Click *"Explore Karaoke Lounges"*.
- **Expected Result:**
  - User smoothly transitions to `/rooms`.
  - No developer jargon or obsolete sprint tags are visible.

---

### TC-FTUE-02: Guest Room Discovery & Welcome Quick-Start
- **Preconditions:** Unauthenticated guest opening `/rooms` for the first time.
- **Steps:**
  1. Open `/rooms` in an incognito window.
  2. Verify `<WelcomeQuickStart />` card appears above the search bar.
  3. Verify the card contains two clear paths: *"Explore Public Lounges"* and *"Create a Private Lounge"*.
  4. Click *"Explore Lounges Below"*.
  5. Verify the window smoothly scrolls down to `#discovery-search-bar`.
  6. Click the `X` button on the top-right of the welcome card.
  7. Verify the card fades out and disappears.
  8. Refresh the browser page (`F5`).
- **Expected Result:**
  - Welcome card does NOT reappear upon refresh (persisted to `localStorage` under `ktv_ftue_welcome_dismissed_guest`).
  - Clicking the "Guide" button in the lobby header reopens the welcome card immediately.

---

### TC-FTUE-03: Authenticated User Onboarding Persistence
- **Preconditions:** Newly registered user or user with `hasCompletedOnboarding: false`.
- **Steps:**
  1. Register a new account at `/register` or login at `/login`.
  2. Navigate to `/rooms`.
  3. Verify the Welcome card is visible.
  4. Click the dismiss `X` button.
  5. Inspect network tab to confirm `PUT /users/preferences` was called with `{ hasCompletedOnboarding: true }` and returned HTTP 200.
  6. Log out and log back in from another browser or window.
  7. Navigate to `/rooms`.
- **Expected Result:**
  - The welcome banner is permanently hidden for this user account.
  - Clicking the "Guide" header button toggles the banner back on for quick reference.

---

### TC-FTUE-04: Contextual Empty States in Discovery Lobby
- **Case 4A: Zero Lounges on Platform**
  - **Setup:** Database has 0 active rooms in `test` database.
  - **Action:** Open `/rooms` with no active filters.
  - **Expected Result:** Empty state displays *"No Lounges Open Right Now"* with button *"Host Your Lounge"*. Clicking the button opens `/rooms/create`.
- **Case 4B: Filter by "Singing Now" when rooms are idle**
  - **Setup:** Rooms exist in database, but none are in status `singing`.
  - **Action:** Select Status filter -> "Singing Now".
  - **Expected Result:** Empty state displays *"No Active Performances Right Now"* with button *"Show Open Lounges"*. Clicking the button resets status to all lounges.
- **Case 4C: Search Miss**
  - **Setup:** Normal catalog.
  - **Action:** Type `xyznonexistentquery` in search input.
  - **Expected Result:** Empty state displays *"No Lounges Match Your Search"* with button *"Reset Filters"*. Clicking the button clears search input.

---

### TC-FTUE-05: In-Room Guidance Dialog & Dismiss Persistence
- **Preconditions:** Enter any active room at `/rooms/[roomId]` as a first-time user (`hasDismissedRoomGuide: false`).
- **Steps:**
  1. Join or enter a room.
  2. Verify the 5-step `<RoomGuideDialog />` opens automatically upon entry.
  3. Read through the 5 steps: Live Stage & Voice, Queueing Songs, Singer Spotlight, Reactions & Cheers, and Host Controls.
  4. Click *"Got It, Let's Sing!"*.
  5. Verify the dialog closes.
  6. Refresh the room page.
  7. Verify the dialog does not reappear.
  8. Click the `HelpCircle` icon button in the top room header bar.
  9. Verify the Room Guide Dialog opens again.
  10. Click *"Don't show this again"*.
- **Expected Result:**
  - Network tab verifies `PUT /users/preferences` was sent with `{ hasDismissedRoomGuide: true }`.
  - Dialog never auto-opens in future sessions, but can always be invoked via the header button.

---

### TC-FTUE-06: Empty Song Queue Action
- **Preconditions:** User is inside a room with an empty queue (`queue.length === 0`).
- **Steps:**
  1. Observe the Song Queue panel on the right sidebar.
  2. Verify empty state message: *"The Queue is Empty"*.
  3. Verify the *"Search & Add Song"* button is clearly visible inside the empty state container.
  4. Click *"Search & Add Song"*.
- **Expected Result:**
  - The song search modal opens immediately.
  - User can search for a track and add it to the queue in one seamless flow.

---

### TC-FTUE-07: Private Lounge Creation to Friend Invite Journey
- **Preconditions:** Authenticated user.
- **Steps:**
  1. From landing page or lobby, click *"Host a Private Lounge"* / *"Host Your Lounge"*.
  2. Select "Private" lounge type and choose an atmosphere preset.
  3. Click *"Create Lounge"*.
  4. Verify redirect to the new room.
  5. Click the *"Invite"* button in the room header.
  6. Verify the invite dialog displays the direct link and one-click copy button.
  7. Copy link and open it in a secondary browser (as friend).
  8. Verify the invite preview shows room title, host avatar, atmosphere, and "Join Lounge" CTA.
- **Expected Result:**
  - Friend joins private room securely without requiring room search in public discovery.

---

## 3. QA Sign-Off Matrix

| Test Case | Description | Automated / Manual | Tester | Status |
| :--- | :--- | :--- | :--- | :--- |
| TC-FTUE-01 | Landing Page Hero & Navigation | Manual | Operator | Pending Staging Verification |
| TC-FTUE-02 | Guest Room Discovery & Quick-Start | Manual | Operator | Pending Staging Verification |
| TC-FTUE-03 | Authenticated Onboarding Persistence | Manual | Operator | Pending Staging Verification |
| TC-FTUE-04 | Contextual Empty States (Lobby) | Manual | Operator | Pending Staging Verification |
| TC-FTUE-05 | In-Room Guidance & Reopen | Manual | Operator | Pending Staging Verification |
| TC-FTUE-06 | Empty Song Queue Quick Add | Manual | Operator | Pending Staging Verification |
| TC-FTUE-07 | Private Lounge & Invite Flow | Manual | Operator | Pending Staging Verification |
