# KTVOnline — Sprint 5.2: Manual QA Checklist

## 1. Scope & Verification Instructions

This checklist outlines the manual test scenarios for verifying the **Karaoke Song Discovery & Catalog Experience** implemented in Sprint 5.2.

> **Status:** STATIC CODE COMPLETE — PENDING RUNTIME OPERATOR EXECUTION.  
> **Target Database:** `test`  
> **Environment:** Staging / Local Development

---

## 2. Test Cases

### TC-DISC-01: In-Room Discovery Trigger & Layout
- **Preconditions:** Active room session at `/rooms/[roomId]`.
- **Steps:**
  1. Click "Add Song to Queue" in the queue panel or the inline button in an empty queue.
  2. Verify the `SongSearchDialog` modal opens smoothly over the room interface.
  3. Verify the background room audio and ongoing singer performance are **not** interrupted.
  4. Verify the header displays: *"Karaoke Song Catalog"* with guidance banner.
  5. Verify the prospective queue position (`Next position: #X / 50`) is displayed.
  6. Press `Escape` or click the `X` button.
- **Expected Result:**
  - Dialog opens and closes without causing room audio reloads, WebRTC disconnections, or layout shifts.

---

### TC-DISC-02: Debounced Search & Accurate Metadata Retrieval
- **Preconditions:** `SongSearchDialog` is open.
- **Steps:**
  1. Type `"auld"` into the search bar.
  2. Observe network tab: request is debounced by 300ms.
  3. Verify the result displays:
     - Title: *Auld Lang Syne*
     - Artist: *Robert Burns (Traditional Folk)*
     - Genre: *folk*, Language: *EN*, Duration: *00:50*
     - Badges: *Karaoke Ready* (green), *Timed Lyrics* (cyan).
  4. Type `"Taylor Swift"`.
  5. Verify *Cruel Summer* appears with *Metadata Only* badge (amber).
  6. Click the search input clear `X` button.
- **Expected Result:**
  - Search input clears instantly; full catalog re-renders.

---

### TC-DISC-03: Multi-Dimensional Filter Navigation
- **Preconditions:** `SongSearchDialog` is open.
- **Steps:**
  1. Click the **"Playable Backing Tracks"** availability tab.
  2. Verify only the 4 authorized tracks (*Auld Lang Syne*, *Amazing Grace*, *Scarborough Fair*, *Neon City Synthwave*) are displayed.
  3. Click the **"Commercial Metadata"** availability tab.
  4. Verify only the 12 commercial metadata entries are displayed.
  5. Switch back to **"All Tracks"**.
  6. Click the **"Rock"** genre chip.
  7. Verify *Bohemian Rhapsody* and *Hotel California* appear.
  8. Click the **"Japanese"** (`JA`) language chip.
  9. Verify *Stay With Me*, *Gurenge*, and *Unravel* appear.
- **Expected Result:**
  - Filter combinations filter the list accurately according to actual database values.

---

### TC-DISC-04: Audio Preview Player for Playable Tracks
- **Preconditions:** `SongSearchDialog` is open with playable tracks visible.
- **Steps:**
  1. Click the **"Preview"** button on *Amazing Grace*.
  2. Verify button toggles to *"Stop (15s)"* and synthesized audio plays at a comfortable volume.
  3. Verify the active room playback (if playing) continues independently without crashing.
  4. While *Amazing Grace* is playing, click **"Preview"** on *Scarborough Fair*.
  5. Verify *Amazing Grace* stops immediately and *Scarborough Fair* begins.
  6. Allow *Scarborough Fair* to play for 15 seconds.
  7. Verify preview stops automatically after 15 seconds.
  8. Start a preview and close the search dialog (`X` or `Escape`).
  9. Verify preview audio halts immediately upon closing.
- **Expected Result:**
  - Audio preview operates safely without memory leaks or bleeding into room audio.

---

### TC-DISC-05: Queue Insertion of Playable Songs
- **Preconditions:** User is an active room member; queue has fewer than 50 songs.
- **Steps:**
  1. In the search dialog, locate *Neon City Synthwave*.
  2. Click **"Queue Song"**.
  3. Verify the button changes to *"Adding..."* then *"Queued"* with a green checkmark.
  4. Close the search dialog.
  5. Observe the room queue panel on the right sidebar.
  6. Verify *Neon City Synthwave* is added at the expected queue position.
  7. Verify the requester is displayed as the logged-in user.
- **Expected Result:**
  - Authoritative queue updates via Socket.IO; singer turn and queue order are preserved.

---

### TC-DISC-06: Commercial Metadata Tracks & Licensing Notice
- **Preconditions:** `SongSearchDialog` is open.
- **Steps:**
  1. Locate *Blinding Lights* or any commercial metadata track.
  2. Verify the primary button displays **"Not Playable"** (disabled) and secondary button displays **"Licensing Info"**.
  3. Click **"Licensing Info"** or click on the "Not Playable" button.
  4. Verify the **Commercial Catalog Notice** modal opens.
  5. Read notice explaining that direct karaoke playback requires commercial synchronization licenses (ASCAP/BMI/VCPMC).
  6. Click **"Understood"** or press `Escape`.
  7. Verify modal closes cleanly, returning to the search dialog.
- **Expected Result:**
  - Users are clearly educated on why commercial tracks cannot be queued; no unplayable queue items are created.

---

### TC-DISC-07: Search History Persistence
- **Preconditions:** User has conducted searches in the dialog.
- **Steps:**
  1. Clear the search input.
  2. Focus the search input.
  3. Verify the *"Recent:"* query chips appear above the filters.
  4. Click on one of the recent chips (e.g. *"Taylor Swift"*).
  5. Verify the search bar populates with *"Taylor Swift"* and executes the search.
  6. Clear the search bar again to reveal recent chips.
  7. Click *"Clear history"*.
  8. Verify recent search chips disappear and `localStorage` entry is removed.
- **Expected Result:**
  - Recent searches persist across dialog sessions and can be purged on demand.

---

### TC-DISC-08: Contextual Empty States
- **Case 8A: Search Keyword Miss**
  - Type `"xyznonexistenttrack123"` into search.
  - Verify empty state displays: *"No songs found for 'xyznonexistenttrack123'"* with *"Clear All Filters"* CTA.
  - Click CTA -> filters reset and catalog returns.
- **Case 8B: Filter Combination Miss**
  - Select availability: *"Playable Backing Tracks"* and genre: *"Rock"*.
  - Verify empty state displays: *"No songs matching the active filters"* with explanation that no playable tracks exist in Rock.
- **Expected Result:**
  - Actionable empty states guide the user back to discoverable tracks.

---

## 3. QA Sign-Off Matrix

| Test Case | Description | Verification Method | Operator | Status |
| :--- | :--- | :--- | :--- | :--- |
| TC-DISC-01 | In-Room Discovery Trigger & Layout | Manual Browser | Operator | Pending Staging Verification |
| TC-DISC-02 | Debounced Search & Accurate Metadata | Manual Browser | Operator | Pending Staging Verification |
| TC-DISC-03 | Multi-Dimensional Filter Navigation | Manual Browser | Operator | Pending Staging Verification |
| TC-DISC-04 | Audio Preview Player for Playable Tracks | Manual Browser / Audio | Operator | Pending Staging Verification |
| TC-DISC-05 | Queue Insertion of Playable Songs | Manual Browser / Socket | Operator | Pending Staging Verification |
| TC-DISC-06 | Commercial Metadata & Licensing Notice | Manual Browser | Operator | Pending Staging Verification |
| TC-DISC-07 | Search History Persistence | Manual Browser / Storage | Operator | Pending Staging Verification |
| TC-DISC-08 | Contextual Empty States & Recovery | Manual Browser | Operator | Pending Staging Verification |
