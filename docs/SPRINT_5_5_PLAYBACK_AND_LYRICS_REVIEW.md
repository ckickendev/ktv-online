# Sprint 5.5: Live Karaoke Performance Experience — Playback & Lyrics Review

**Document:** `SPRINT_5_5_PLAYBACK_AND_LYRICS_REVIEW.md`  
**Focus:** Audio-Visual Synchronization, Lyrics Engine, and Clock Stability  
**Status:** Complete  

---

## 1. Playback & Clock Synchronization Architecture

In a real-time collaborative karaoke environment, every participant in a room must hear the backing track and see the lyrics highlight at the exact same moment.

### 1.1 Synchronization Reference & Drift Compensation
- **Server Clock Authority**: The backend `RoomPlaybackStateModel` holds the authoritative playback state:
  $$\text{positionMs} = \text{recordedPositionMs} + (t_{\text{now}} - t_{\text{updatedAt}})$$
- **NTP Time Offset Estimation**: The client calculates round-trip time (RTT) and one-way network delay:
  $$\Delta t = t_{\text{server}} - \left(t_{\text{recv}} - \frac{\text{RTT}}{2}\right)$$
- **Audio Element Drift Correction**:
  The client audio engine compares the HTMLAudioElement's `currentTime * 1000` with the calculated authoritative position:
  $$\text{Drift} = t_{\text{audio}} - t_{\text{authoritative}}$$
  - If $|\text{Drift}| < 150\text{ms}$: No jump; audio pitch/rate remains smooth.
  - If $150\text{ms} \le |\text{Drift}| < 1500\text{ms}$: Subtle micro-adjustment to playback rate ($0.98\times$ or $1.02\times$) to converge smoothly.
  - If $|\text{Drift}| \ge 1500\text{ms}$: Explicit seek to realign the audio position immediately without audio stutter.

---

## 2. Lyrics Rendering Engine & Fallback Matrix

The lyrics rendering engine in `LyricsStage.tsx` supports three distinct levels of lyric fidelity:

### 2.1 Level 1: Word-Level Synchronized Lyrics (Highest Fidelity)
- Timed lyrics provide an array of words for each line: `{ id, text, startMs, endMs }`.
- The active word calculates fractional progress:
  $$\text{progress} = \frac{t_{\text{current}} - t_{\text{start}}}{t_{\text{end}} - t_{\text{start}}} \times 100\%$$
- Rendering applies a CSS `clipPath: polygon(0 0, progress% 0, progress% 100%, 0 100%)` over a vibrant gradient text span (`from-violet-300 via-pink-300 to-cyan-300`).
- Previous words in the line remain illuminated in bold pink/white; upcoming words remain semi-transparent.

### 2.2 Level 2: Line-Level Synchronized Lyrics (Standard Fidelity)
- Used when songs have line timestamps (`startMs`, `endMs`) but no word-level breakdown.
- The active line calculates overall line progress across the line's duration:
  $$\text{lineProgress} = \frac{t_{\text{current}} - t_{\text{start}}}{\max(1000, t_{\text{end}} - t_{\text{start}})} \times 100\%$$
- A smooth horizontal gradient sweep moves across the entire line, guiding the singer's tempo naturally.

### 2.3 Level 3: Plain Text / Untimed Lyrics Reader (Graceful Fallback)
- For songs with lyrics text but no timestamp markers, the stage switches to an elegant **Lyrics Reader Fallback**:
  - Displays clean, readable scrollable text with comfortable line-height and contrast.
  - Provides a subtle reading pace indicator.
  - Allows manual scrolling so singers can read the lyrics while singing with the instrumental backing track.

---

## 3. Performance Optimization: O(1) Re-render Complexity

Because karaoke position updates arrive at 10Hz (every 100ms) to ensure smooth lyric sweeps, naïve React rendering would cause all $N$ lyric lines to re-evaluate on every tick.

### Custom Comparison Memoization (`React.memo`)
The single line component `LyricLineRow` uses a custom equality function:
```typescript
(prev, next) => {
  // 1. If neither was active nor is active, and past state hasn't changed, SKIP re-render
  if (!prev.isActive && !next.isActive && prev.isPast === next.isPast) {
    return true;
  }
  // 2. If active or past state transitioned, MUST re-render
  if (prev.isActive !== next.isActive || prev.isPast !== next.isPast || prev.fontSize !== next.fontSize) {
    return false;
  }
  // 3. For the single active line, only re-render if currentPositionMs changed
  if (next.isActive) {
    return prev.currentPositionMs === next.currentPositionMs;
  }
  return true;
}
```
This reduces render cycles per 100ms tick from $O(N)$ lines to strictly $O(1)$ (the single active line), guaranteeing 60fps UI performance even on budget mobile devices.
