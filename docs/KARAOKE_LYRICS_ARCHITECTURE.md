# Karaoke Timed Lyrics Architecture Specification

## 1. Overview & Architectural Boundaries

Karaoke playback requires timed lyric lines synchronized with backing audio. However, lyrics data must not overload realtime WebSocket traffic:
1. **Separation from Playback Events**: Playback Socket.IO events (`karaoke:playback_updated`) broadcast only numeric state anchors (`positionMs`, `anchorStartedAt`, `playbackVersion`). They never carry full lyrics documents.
2. **On-Demand Querying**: Lyrics are fetched via HTTP REST API (`GET /api/v1/songs/:songId/lyrics`) and cached locally via TanStack Query (`queryKeys.karaoke.lyrics(songId)`) with a 60-second stale time.
3. **Deterministic Synchronization**: The active lyric line is calculated purely as a projection of the server-authoritative playback position `currentPositionMs`. No local frontend timers own lyric state.

---

## 2. Lyrics Contracts & Schemas (`@ktv/contracts`)

### 2.1 Timed Lyric Line (`TimedLyricLine`)

```typescript
export interface TimedLyricLine {
  id: string;
  startMs: number;
  endMs?: number;
  text: string;
  translation?: string;
}
```

- `id`: Deterministic unique identifier (e.g., `l1`, `l2`).
- `startMs`: Millisecond offset from start of track when the line begins.
- `endMs`: Millisecond offset when the line ends. If omitted, the line remains active until the next line's `startMs` or for a default duration (5,000 ms).
- `text`: Primary lyric text.
- `translation`: Optional phonetic guide or translation (supports multilingual karaoke).

### 2.2 Song Lyrics DTO (`SongLyricsDto`)

```typescript
export interface SongLyricsDto {
  songId: string;
  hasTimedLyrics: boolean;
  lyricsAvailability: 'timed_available' | 'text_only' | 'unavailable';
  lines: TimedLyricLine[];
  attribution?: string;
}
```

---

## 3. Lyrics Synchronization Algorithm

### 3.1 Active Line Derivation

The active line index is derived deterministically from `currentPositionMs`:

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

### 3.2 Smooth Vertical Auto-Scrolling

The `LyricsStage` component automatically scrolls the container to keep the active line vertically centered:
- Uses `scrollIntoView({ behavior: 'smooth', block: 'center' })` on line change.
- Throttled so that manual user interaction is not violently snapped back during pauses.

### 3.3 Visual Typography & Gradient Sweep

- **Past Lines**: Visual opacity reduced (`opacity-35 text-slate-400`), font scale reduced.
- **Active Line**: Prominently emphasized (`text-xl font-black text-white scale-105`), surrounded by dynamic violet/cyan ambient glow.
- **Progress Sweep**: A sub-bar computes proportional progress through the active line:
  $$\text{progress} = \frac{\text{currentPositionMs} - \text{startMs}}{\text{endMs} - \text{startMs}}$$
  rendering a smooth gradient sweep across the active line.
- **Upcoming Lines**: Readable (`opacity-70 text-slate-300`), allowing singers to anticipate subsequent lyrics.

---

## 4. Edge Cases & Fallbacks

1. **Instrumental Interludes**: When the elapsed time between lines exceeds 8,000 ms, the stage renders an animated musical note icon indicating an instrumental break.
2. **Unavailable Lyrics**: If `lyricsAvailability === 'unavailable'` or query returns 404, the stage renders a clean fallback banner: `"Instrumental or Lyrics Unavailable"`.
3. **Network Resynchronization**: Seeking or jumping track positions immediately updates `currentPositionMs`, which instantly recalculates `activeIndex` and snaps the lyric scroll without audible or visual lag.
