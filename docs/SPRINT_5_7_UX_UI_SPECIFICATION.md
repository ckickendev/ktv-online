# KTVOnline — Sprint 5.7: UX/UI Specification
## Friend Activity & Social Karaoke Sessions

**Visual Theme:** Cyberpunk Lounge / Dark Tokyo Stage  
**Colors:** Deep Indigo (`#090b12`, `#0a0d17`), Violet Neon (`#7c3aed`), Fuchsia Pulse (`#d946ef`), Emerald Live (`#10b981`), Amber Warning (`#f59e0b`).  
**Typography:** Inter / System Sans, high-contrast text (`slate-100` / `slate-400`).  

---

## 1. Surface 1: `/friends` — Friend Activity & Social Lounge Hub

### 1.1 Layout Structure
- **Header:** Title "Social Lounge & Friends", live stats pill (X Online • Y Friends), and prominent action button: **"Start Session with Friends"** (gradient violet-fuchsia button with Sparkles icon).
- **Navigation Tabs:**
  1. `Live Activity` (New default tab or integrated hero overview)
  2. `My Friends` (Full alphabetical list with presence & unfriend option)
  3. `Requests` (Incoming & outgoing requests badge count)
  4. `Find People` (Platform search)
- **Activity Section (Hero Area):**
  - Grouped into 3 intuitive activity swimlanes:
    1. **"Singing Live Now" (Top Priority):** Friends currently performing in public lounges. Features glowing animated aura, song title, room name, and direct "Watch Live" or "Hop In" button.
    2. **"In Lounges":** Friends currently in public lounges or masked private lounges ("Hanging out in Private Lounge").
    3. **"Available Online":** Friends online and ready to be invited to a session.

### 1.2 User Actions
- **"Hop In / Join Lounge":** Navigates directly to `/rooms/${roomId}` for public lounges.
- **"Start Lounge with Friends":** Opens the multi-friend session launcher modal.
- **"Invite to Sing":** Contextual action next to an available online friend.

### 1.3 State Specifications
- **Loading State:** Skeleton friend cards with subtle shimmering violet borders.
- **Empty State (No Friends Online):** Clean illustration card: *"No friends singing right now. Start a lounge and invite them to sing!"* with a direct CTA button.
- **Empty State (Zero Friends):** Card inviting user to search and add people.
- **Error State:** Non-blocking inline banner with "Retry" action.
- **Mobile Behavior:** Swimlanes stack vertically into a single cohesive scroll with horizontal chip filter (All, Singing, In Lounge, Available). Tap targets are minimum 44x44px.
- **Accessibility:** Semantic ARIA labels for status badges (`aria-label="Friend is currently singing"`), full keyboard navigation for action buttons, WCAG AA contrast on all badges.
- **Privacy Enforcement:** If friend is in a private room, room title renders as `"Private Lounge"` with lock icon; song title and room ID are completely omitted from the DOM.

---

## 2. Surface 2: `/rooms` — "Friends Live" Discovery Bar

### 2.1 Layout Structure
- Mounted above the main category filter on `/rooms`.
- An unobtrusive, horizontal scrolling carousel strip: **"Friends Hanging Out (N)"**.
- Each pill displays friend avatar, name, and room name badge.

### 2.2 User Actions
- Clicking a friend's pill opens the existing `RoomPreviewDialog` for that room, showing the room details, atmosphere, and participant list before joining.
- If friend is in a private room, the pill is not shown on `/rooms` (maintains zero reconnaissance leakage).

### 2.3 State Specifications
- **Hidden When Zero Friends Live:** If no friends are currently in public rooms, the bar collapses completely to zero height, preserving clean room discovery.
- **Mobile Behavior:** Smooth horizontal swipe gestures with CSS scroll snapping.

---

## 3. Surface 3: Multi-Friend Session Starter Modal ("Start Karaoke with Friends")

### 3.1 Dialog Workflow
1. **Trigger:** Clicked from `/friends` header ("Start Session with Friends") or quick-start card.
2. **Step 1: Select Friends:**
   - Displays a checklist of accepted friends, ordered by status: Online/Available first, then In Lounge, then Offline.
   - Search/filter input to filter friend list by name.
   - Multi-select checkboxes with counter: `"Selected (3)"`.
3. **Step 2: Room Settings (Streamlined):**
   - Lounge Name (defaults to `"[User]'s Karaoke Night"`).
   - Visibility: Toggle between `Private (Friends Only)` (default) or `Public`.
   - Atmosphere Vibe preset selector (Tokyo Neon, Cyberpunk Midnight, Cozy Acoustic, etc.).
4. **Step 3: Launch:**
   - Single CTA button: **"Create & Invite Friends (N)"**.
   - Submits `POST /api/rooms` to create room.
   - Submits `POST /api/friends/invite-lounge-batch/:roomId` with selected friend IDs.
   - Redirects host immediately into `/rooms/${newRoomId}`.

### 3.2 Error & Boundary Handling
- If room creation fails: inline error message; user remains in modal.
- If one friend invitation fails: uses `Promise.allSettled` on backend so successful invites still deliver.
- Modal has clear "Cancel" / `X` dismiss button.

---

## 4. Surface 4: Realtime Invitation Notification Toast

### 4.1 UI Layout (Built in Sprint 5.6.1 & Verified in 5.6.1.3)
- Fixed bottom-right floating container (`fixed bottom-5 right-5 z-50 max-w-sm`).
- Glassmorphic card (`#131627/95` background with violet border and soft shadow).
- Host avatar with online status badge, host display name, and text: *"Invited you to sing"*.
- Room title preview with `Private Lounge` (amber lock) or `Public Lounge` (emerald users) badge.
- Two action buttons:
  - **Dismiss:** Closes toast immediately without redeeming.
  - **Accept & Join:** Navigates to `/invite/${token}`, previewing and joining the room.

---

## 5. Surface 5: Post-Session Social Recap (`/profile` & Room Exit)

### 5.1 UX Integration
- When a room closes or user leaves, a session summary card highlights:
  - Lounge Name and Duration.
  - Participating friends with avatars.
  - Songs performed during the session.
  - Top cheerer / audience reactions.
- Links to `/profile?tab=history` where full personal history lives.
