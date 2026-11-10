# Karaoke Timed Lyrics Architecture Specification

## 1. Overview & Architectural Boundaries

Karaoke playback requires timed lyric lines synchronized with backing audio. However, lyrics data must not overload realtime WebSocket traffic:
1. **Separation from Playback Events**: Playback Socket.IO events (`karaoke:playback_updated`) broadcast only numeric state anchors (`positionMs`, `anchorStartedAt`, `playbackVersion`). They never carry full lyrics documents.
2. **On-Demand Querying**: Lyrics are fetched via HTTP REST API (`GET /api/v1/songs/:songId/lyrics`) and cached locally via TanStack Query (`queryKeys.karaoke.lyrics(songId)`) with a 60-second stale time.
3. **Deterministic Synchronization**: The active lyric line and active word highlighting are calculated purely as projections of the server-authoritative playback position `currentPositionMs`. No local frontend timers own lyric state.

---

## 2. Lyrics Contracts & Schemas (`@ktv/contracts`)

### 2.1 Timed Lyric Word (`TimedLyricWord`) (Sprint 2.6.4)

```typescript
export const TimedLyricWordSchema = z.object({
  id: z.string().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});
export type TimedLyricWord = z.infer<typeof TimedLyricWordSchema>;
```

- `id`: Optional unique identifier for the word token.
- `startMs`: Millisecond offset when the word or syllable vocalization begins.
- `endMs`: Millisecond offset when the word vocalization ends.
- `text`: Word or syllable text.

### 2.2 Timed Lyric Line (`TimedLyricLine`)

```typescript
export const TimedLyricLineSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative().optional(),
  text: z.string(),
  translation: z.string().optional(),
  words: z.array(TimedLyricWordSchema).optional(),
});
export type TimedLyricLine = z.infer<typeof TimedLyricLineSchema>;
```

- `id`: Deterministic unique identifier (e.g., `l1`, `l2`).
- `startMs`: Millisecond offset from start of track when the line begins.
- `endMs`: Millisecond offset when the line ends. If omitted, the line remains active until the next line's `startMs` or for a default duration (5,000 ms).
- `text`: Primary lyric text.
- `translation`: Optional phonetic guide or translation (supports multilingual karaoke).
- `words`: Optional array of `TimedLyricWord` tokens enabling sub-line, word, and syllable-level highlighting. When omitted, the line seamlessly falls back to continuous linear sweep highlighting.

### 2.3 Song Lyrics DTO (`SongLyricsDto`)

```typescript
export const SongLyricsDtoSchema = z.object({
  songId: z.string(),
  provider: z.string(),
  lines: z.array(TimedLyricLineSchema),
  language: z.string().default('en'),
  hasTimedLyrics: z.boolean(),
  attribution: z.string().optional(),
});
export type SongLyricsDto = z.infer<typeof SongLyricsDtoSchema>;
```

---

## 3. Lyrics Synchronization & Highlighting Algorithm

### 3.1 Active Line Derivation

The active line index is derived deterministically from the authoritative `currentPositionMs`:

```typescript
const activeIndex = useMemo(() => {
  if (!hasTimedLyrics || lines.length === 0) return -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const end = line.endMs ?? (lines[i + 1]?.startMs ?? line.startMs + 5000);
    if (currentPositionMs >= line.startMs && currentPositionMs < end) {
      return i;
    }
  }

  if (currentPositionMs >= (lines[lines.length - 1]?.startMs ?? 0)) {
    return lines.length - 1;
  }

  return 0;
}, [lines, currentPositionMs, hasTimedLyrics]);
```

### 3.2 Dual-Tier Highlighting (Word-Level vs. Continuous Sweep)

Within the active line:
1. **Tier 1 — Word-Level Synchronization (`line.words` present)**:
   - Each word evaluates its status:
     - `isPast`: `currentPositionMs >= word.endMs` (highlighted in bright, solid neon text).
     - `isActive`: `currentPositionMs >= word.startMs && currentPositionMs < word.endMs`. An intra-word sweep fills across the word characters using CSS `clipPath: polygon(...)`.
     - `isFuture`: Dimmed anticipatory text (`text-white/60`).
2. **Tier 2 — Line-Level Sweep Fallback (`line.words` absent/empty)**:
   - The line computes continuous linear progress:
     $$\text{progress} = \frac{\text{currentPositionMs} - \text{startMs}}{\text{endMs} - \text{startMs}}$$
   - Fills an overlying gradient span across the full line text using `clipPath: polygon(0 0, ${progress}% 0, ${progress}% 100%, 0 100%)`.

---

## 4. Rendering Performance & Memoization (Sprint 2.6.4)

### 4.1 O(1) Per-Tick Render Complexity
- Previously, updating `currentPositionMs` at 10 Hz forced all $N$ lines in the song to re-render, creating 500+ component evaluations per second.
- In Sprint 2.6.4, individual lyric lines are encapsulated inside `LyricLineRow`, wrapped in `React.memo` with a custom comparison function:
  ```typescript
  (prev, next) => {
    // If line remains inactive and not transitioning past, skip re-rendering completely
    if (!prev.isActive && !next.isActive && prev.isPast === next.isPast) {
      return true;
    }
    if (prev.isActive !== next.isActive || prev.isPast !== next.isPast || prev.isPlaying !== next.isPlaying) {
      return false;
    }
    if (next.isActive) {
      return prev.currentPositionMs === next.currentPositionMs;
    }
    return true;
  }
  ```
- **Outcome**: On every 10 Hz clock tick, **only the single active line** re-renders. Non-active lines are completely memoized, eliminating unnecessary DOM recalcs.

### 4.2 Non-Fighting Manual Scroll Protection
- When the user manually scrolls or drags the lyrics container, `handleScroll` sets `isUserScrollingRef.current = true` and schedules a 4,000 ms cooldown timer.
- During this window, automated auto-scrolling is suppressed so the view does not violently yank the container away from user interaction.
- Once the timer expires, smooth auto-scrolling resumes on the next line transition.

### 4.3 Accessibility: `prefers-reduced-motion`
- Checks `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
- When enabled, `scrollIntoView` switches from `'smooth'` to `'auto'`, and text transitions avoid rapid scale-shifting to accommodate motion-sensitive users.

---

## 5. Edge Cases & Fallbacks

1. **Instrumental Interludes**: When the elapsed time between lines exceeds 8,000 ms, the stage renders cleanly with upcoming line anticipation.
2. **Unavailable Lyrics**: If `lyricsAvailability === 'unavailable'` or query returns 404, the stage renders a clean fallback banner: `"Instrumental or Lyrics Unavailable"`.
3. **Network Resynchronization**: Seeking or jumping track positions immediately updates `currentPositionMs`, which instantly recalculates `activeIndex` and snaps the lyric scroll without audible or visual lag.
