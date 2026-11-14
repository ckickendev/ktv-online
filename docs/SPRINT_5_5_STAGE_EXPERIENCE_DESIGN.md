# Sprint 5.5: Live Karaoke Performance Experience — Stage Experience Design

**Document:** `SPRINT_5_5_STAGE_EXPERIENCE_DESIGN.md`  
**Status:** Approved for Implementation  
**Focus:** Live Karaoke Stage, Singer Spotlight, Visual States & Audience Interaction  

---

## 1. Design Principles & Theatrical Vision

> *"Your Virtual Hangout. Your Karaoke Night."*

The primary design goal for Sprint 5.5 is to turn a basic audio-playback page into an authentic **Virtual Karaoke Lounge Stage**. When a user sings, they are not just playing an audio file—they are the center of attention in a virtual karaoke room surrounded by friends.

### Guiding Principles:
1. **Unmistakable Performer Spotlight**: At a glance, everyone in the room knows who is singing, what song is playing, and who is next in line.
2. **Context-Aware Visual Atmosphere**: The stage shifts its lighting and energy dynamically based on performance states (`preparing`, `on air`, `ending soon`, `transitioning`).
3. **Social Audience Warmth**: Audience members can applaud, cheer, and send gifts without disrupting the performer or cluttering the lyrics.
4. **Legible, Distraction-Free Lyrics**: Lyrics remain the primary focal point for the singer and audience sing-alongs, with crystal-clear contrast and smooth tracking.
5. **Ergonomic Mobile Usability**: The stage naturally scales to mobile viewports with minimum 44px touch targets and zero layout jumping.

---

## 2. Stage Visual States & Atmospheric Transitions

```
┌─────────────────────────────────────────────────────────────┐
│                       STAGE STATES                          │
├───────────────┬─────────────────────────────────────────────┤
│ 1. STANDBY    │ Empty stage with gentle ambient vinyl glow. │
│               │ Clear CTA: "Browse Song Catalog to Sing"    │
├───────────────┼─────────────────────────────────────────────┤
│ 2. PREPARING  │ Backing track loading; singer taking stage. │
│               │ Violet pulse with "Singer Taking Stage..."  │
├───────────────┼─────────────────────────────────────────────┤
│ 3. ON AIR     │ Active performance. Radiant spotlight beam. │
│ (SINGING)     │ Live voice dot + real-time lyrics playback. │
├───────────────┼─────────────────────────────────────────────┤
│ 4. PAUSED     │ Stage ambiently dimmed with amber banner.   │
├───────────────┼─────────────────────────────────────────────┤
│ 5. ENDING     │ Final 15-20 seconds. Amber pulse signaling  │
│    SOON       │ performance climax / final chorus.          │
├───────────────┼─────────────────────────────────────────────┤
│ 6. HANDOFF /  │ Song concluded. Immediate transition banner │
│    TRANSITION │ showing "Up Next: [Song] - [Next Singer]"   │
└───────────────┴─────────────────────────────────────────────┘
```

### Atmospheric Lighting Engine
Leveraging `useRoomAtmosphere`, the stage incorporates radial gradient cones:
- **Neon Cyberpunk**: Violet/Cyan energetic spotlight.
- **Midnight Jazz**: Deep amber/indigo intimate warm glow.
- **Sunset Acoustic**: Rose/amber gentle stage wash.
- **Starlight Pop**: Vibrant fuchsia/blue celestial halo.
- Respects `visualEffectsIntensity` and `prefersReducedMotion` to ensure battery-friendly performance on mobile devices.

---

## 3. Current Singer Spotlight Component Architecture

The Singer Spotlight anchors the performer to the stage with high visual priority:
1. **Performer Avatar**: 48px avatar with an animated neon aura that pulses when LiveKit voice is active.
2. **Identity & Role**: Singer's display name, `@username`, and a role badge (`Lead Performer` or `Guest Singer` when assigned by queue requester).
3. **Live Mic Indicator**: Green live radio dot when microphone is transmitting, or red muted indicator when muted.
4. **Song Attribution**: Prominent track title, artist, and genre.
5. **Audience Cheer Tally**: Live counter showing total cheers received during the song (e.g. `🔥 18 cheers`).
6. **Viewer-Specific Guidance**:
   - If Viewer = Singer: *"You are in the Spotlight! Sing with the backing track."*
   - If Viewer = Next Singer: *"Get Ready! You are up next on stage."*
   - If Viewer = Audience: *"Cheer for the performer on stage!"*

---

## 4. Handoff & Stage Transition Experience

When a track finishes playing:
1. The stage immediately enters the `transitioning` state.
2. A sleek transition card appears:
   - *"Song Concluded &bull; Stage Transition"*
   - *"Up Next: [Next Song Title] by [Next Song Artist] &bull; [Next Singer Name]"*
3. A subtle progress bar indicates that the authoritative backend is advancing the queue.
4. When the backend advances `currentItem`, the stage smoothly switches to the new song and resets the lyrics position to `00:00`.
5. If the queue is empty, the stage gracefully returns to `standby` with an invitation to browse songs.

---

## 5. Audience Cheer & Reaction Suite

- Audience reaction bar embedded directly beside the spotlight with 5 expressive emoji triggers:
  - 👏 Applause
  - 🔥 Fire / Amazing
  - ❤️ Love
  - 🎉 Party / Celebrate
  - 🎤 Mic / Sing Along
- Floating reaction particles float gently upwards across the stage and fade out after 2000ms.
- Cumulative cheer counter increments optimistically and synchronizes with room activity.
- Screen reader live region (`aria-live="polite"`) announces cheers for accessibility.
