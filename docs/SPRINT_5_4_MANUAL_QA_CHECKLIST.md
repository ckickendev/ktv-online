# Sprint 5.4: Singer Studio & Live Vocal Experience — Manual QA Checklist

**Scope:** Post-Implementation Runtime QA Verification  
**Test Matrix:** Chrome Desktop, Safari Desktop, Mobile Safari, Mobile Chrome  
**Status:** READY FOR OPERATOR RUNTIME EXECUTION  

---

## 1. Test Environment Preconditions

- [ ] Node.js 22 and pnpm installed.
- [ ] MongoDB running locally with database `test`.
- [ ] Backend API running: `pnpm --filter api dev` on `http://localhost:4000`.
- [ ] Web application running: `pnpm --filter web dev` on `http://localhost:3000`.
- [ ] LiveKit server running and configured via environment variables.
- [ ] Two distinct browser profiles or test accounts (Host User A and Guest Singer User B).
- [ ] At least one physical or virtual microphone connected to the test machine.

---

## 2. Manual Test Scenarios

### Scenario 1: Standalone Pre-Room Microphone Test (Profile Page)
- **Objective:** Verify that singers can configure and test their microphone before entering any karaoke lounge.
- **Steps:**
  1. Log in as User A and navigate to `/profile`.
  2. Locate the "Audio & Voice Studio" card.
  3. Click "Open Studio" or "Configure & Test Microphone".
  4. In the opened `MicrophoneStudioDialog`, click "Test Microphone".
  5. If prompted by the browser, grant microphone access.
  6. Speak and sing at varying volumes into your microphone.
- **Expected Results:**
  - [ ] Permission badge changes from "Prompt" to "Permission Granted".
  - [ ] 24-segment VU meter animates smoothly in real time reflecting actual vocal amplitude.
  - [ ] Status badge transitions appropriately: "Quiet Input" when whispering -> "Optimal Vocal Level" when singing normally -> "Peaking / Clipping" when shouting.
  - [ ] No audio is echoed through speakers (zero feedback loop).
  - [ ] Click "Stop Test" or "Done"; browser recording indicator (e.g. orange dot on macOS) turns off immediately.

### Scenario 2: Microphone Device Switching
- **Objective:** Verify seamless input switching between multiple connected microphones.
- **Steps:**
  1. Connect two distinct audio inputs (e.g. Built-in Mic and USB Headset / Webcam mic).
  2. Open Singer Studio from `/profile` or inside a room.
  3. Verify both microphones appear in the "Select Microphone" dropdown.
  4. Start the microphone test on Microphone 1; tap Microphone 1 to see levels.
  5. Select Microphone 2 from the dropdown.
  6. Tap Microphone 2.
- **Expected Results:**
  - [ ] Selection updates without errors.
  - [ ] Input meter immediately reflects audio from Microphone 2.
  - [ ] Preference is saved in browser localStorage (`ktv_preferred_mic_id`).

### Scenario 3: Device Disconnection / Unplugged Handling
- **Objective:** Verify graceful fallback when the active microphone is physically disconnected.
- **Steps:**
  1. Select a USB or Bluetooth microphone in Singer Studio.
  2. While testing (or while connected in a room), unplug the microphone.
- **Expected Results:**
  - [ ] Browser `devicechange` event is detected.
  - [ ] Device dropdown automatically refreshes and falls back to the default available microphone.
  - [ ] An informative notification is displayed: *"Active microphone was disconnected. Switched to available microphone."*
  - [ ] No uncaught JavaScript exceptions or frozen UI states.

### Scenario 4: Permission Denied State
- **Objective:** Verify clear error messaging when microphone permission is denied.
- **Steps:**
  1. In browser site settings, set Microphone permission to "Block" for `http://localhost:3000`.
  2. Reload page and open Singer Studio.
  3. Click "Test Microphone".
- **Expected Results:**
  - [ ] Permission badge displays "Permission Denied" in red.
  - [ ] Actionable error banner appears: *"Microphone permission was denied. Please allow microphone permissions in your browser address bar."*
  - [ ] Meter displays "No Vocal Signal" / standby without crashing.

### Scenario 5: In-Room Live Voice Experience & Server Mute Protection
- **Objective:** Verify that room moderation (server mute) cannot be bypassed by switching devices or running tests.
- **Steps:**
  1. User A (Host) and User B (Singer) join the same room.
  2. User B joins voice; User B verifies mic is active.
  3. User A opens Room Members and clicks "Mute Member" for User B.
  4. Inspect User B's interface.
  5. While muted by Host, User B opens Singer Studio and switches the microphone device.
  6. User B attempts to click the mute toggle button in the room header or mobile dock.
- **Expected Results:**
  - [ ] User B's voice status immediately updates to `Muted by Mod` (rose badge).
  - [ ] Mute toggle button is disabled for User B with tooltip: *"Your microphone has been muted by room moderation."*
  - [ ] Inside Singer Studio, a prominent red banner indicates: *"Room Moderation Active: Your microphone is currently muted by room hosts. Local testing operates privately..."*
  - [ ] Switching devices inside the studio updates the local device preference, but DOES NOT unmute User B or broadcast voice to User A.
  - [ ] User A confirms User B remains completely silent on the room stage.

### Scenario 6: Mobile Responsiveness & 44px Touch Targets
- **Objective:** Verify usability on mobile devices (iOS Safari and Android Chrome).
- **Steps:**
  1. Open a room on a mobile device or Chrome DevTools Mobile Viewport (iPhone 14 / Pixel 7).
  2. Test the persistent bottom navigation dock.
  3. Click the voice button to join/mute.
  4. Click the Studio / Settings button to open `MicrophoneStudioDialog`.
  5. Switch tabs (Mic Input, Vocal Processing, Output & Equalizer).
- **Expected Results:**
  - [ ] All interactive buttons meet the minimum 44px touch target requirement.
  - [ ] The dialog fits cleanly within the viewport with safe-area padding at the bottom.
  - [ ] Scrolling inside the dialog is smooth without page body jumping.
  - [ ] VU meter renders responsively without overflowing the screen width.

### Scenario 7: Multiple Tabs & Route Navigation Cleanup
- **Objective:** Verify that navigating away or closing tabs releases audio hardware resources.
- **Steps:**
  1. Open Singer Studio and click "Test Microphone".
  2. Verify browser recording indicator is ON.
  3. In the same tab, navigate from `/profile` to `/rooms`.
- **Expected Results:**
  - [ ] Test automatically terminates upon route change.
  - [ ] Browser recording indicator immediately extinguishes.
  - [ ] No background `AudioContext` warnings in console.
