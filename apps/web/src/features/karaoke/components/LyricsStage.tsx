'use client';

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Music, Mic2 } from 'lucide-react';
import { SongLyricsDto, TimedLyricLine } from '@ktv/contracts';
import { karaokeApi } from '../api/karaoke-api';
import { queryKeys } from '@/hooks/queries/query-keys';
import { cn } from '@/lib/utils';

export interface LyricsStageProps {
  songId: string | null;
  currentPositionMs: number;
  isPlaying: boolean;
  className?: string;
}

interface LyricLineRowProps {
  line: TimedLyricLine;
  index: number;
  isActive: boolean;
  isPast: boolean;
  isPlaying: boolean;
  currentPositionMs: number;
}

/**
 * Memoized single lyric line row.
 * Prevents non-active lines from re-rendering on 10Hz position updates,
 * reducing render complexity from O(N) to O(1) per tick.
 */
const LyricLineRow = React.memo(
  React.forwardRef<HTMLDivElement, LyricLineRowProps>(function LyricLineRow(
    { line, index, isActive, isPast, isPlaying, currentPositionMs },
    ref
  ) {
    const hasWordTiming = Boolean(line.words && line.words.length > 0);

    // Calculate progress percentage through active line for fallback line sweep
    let lineProgress = 0;
    if (isActive) {
      const lineDuration = (line.endMs ? line.endMs - line.startMs : 4000) || 4000;
      const elapsedInLine = Math.max(0, currentPositionMs - line.startMs);
      lineProgress = Math.min(100, Math.max(0, (elapsedInLine / lineDuration) * 100));
    }

    return (
      <div
        key={line.id || index}
        ref={ref}
        data-testid={isActive ? 'active-lyric-line' : undefined}
        className={cn(
          'transition-all duration-300 py-1.5 px-3 rounded-xl mx-auto max-w-2xl',
          isActive
            ? 'scale-105 font-black text-lg sm:text-2xl drop-shadow-md'
            : isPast
            ? 'text-slate-500 font-medium text-sm sm:text-base opacity-40'
            : 'text-slate-300/80 font-semibold text-sm sm:text-base opacity-75'
        )}
      >
        {/* Active Karaoke Lyric with word-level timing or line-level progress sweep */}
        {isActive ? (
          hasWordTiming ? (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              {line.words!.map((w, wIdx) => {
                const isWordActive = currentPositionMs >= w.startMs && currentPositionMs < w.endMs;
                const isWordPast = currentPositionMs >= w.endMs;
                let wordProgress = 0;
                if (isWordActive) {
                  const wDur = Math.max(1, w.endMs - w.startMs);
                  wordProgress = Math.min(100, Math.max(0, ((currentPositionMs - w.startMs) / wDur) * 100));
                } else if (isWordPast) {
                  wordProgress = 100;
                }

                return (
                  <span key={w.id || wIdx} className="relative inline-block">
                    <span
                      className={cn(
                        'transition-colors duration-150',
                        isWordPast
                          ? 'text-pink-300 font-bold'
                          : isWordActive
                          ? 'text-white/30'
                          : 'text-white/60'
                      )}
                    >
                      {w.text}
                    </span>
                    {isWordActive && (
                      <span
                        style={{
                          clipPath: `polygon(0 0, ${wordProgress}% 0, ${wordProgress}% 100%, 0 100%)`,
                        }}
                        className={cn(
                          'absolute inset-0 text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-pink-300 to-cyan-300 font-black',
                          isPlaying && 'drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]'
                        )}
                      >
                        {w.text}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="relative inline-block">
              {/* Background base text */}
              <span className="text-white/40">{line.text}</span>
              {/* Foreground sweep fill text */}
              <span
                style={{
                  clipPath: `polygon(0 0, ${lineProgress}% 0, ${lineProgress}% 100%, 0 100%)`,
                }}
                className={cn(
                  'absolute inset-0 text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-pink-300 to-cyan-300',
                  isPlaying && 'drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]'
                )}
              >
                {line.text}
              </span>
            </div>
          )
        ) : (
          <span>{line.text}</span>
        )}

        {/* Optional Lyric Translation */}
        {line.translation && (
          <p className={cn('text-xs mt-1', isActive ? 'text-cyan-300/80 font-normal' : 'text-slate-500')}>
            {line.translation}
          </p>
        )}
      </div>
    );
  }),
  (prev, next) => {
    // If neither was active nor is active, and past state hasn't changed, skip re-render
    if (!prev.isActive && !next.isActive && prev.isPast === next.isPast) {
      return true;
    }
    // If active or past state transitioned, must re-render
    if (prev.isActive !== next.isActive || prev.isPast !== next.isPast || prev.isPlaying !== next.isPlaying) {
      return false;
    }
    // If active line, re-render only when currentPositionMs changed
    if (next.isActive) {
      return prev.currentPositionMs === next.currentPositionMs;
    }
    return true;
  }
);

export function LyricsStage({
  songId,
  currentPositionMs,
  isPlaying,
  className,
}: LyricsStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: lyricsData, isLoading } = useQuery<SongLyricsDto>({
    queryKey: queryKeys.karaoke.lyrics(songId || ''),
    queryFn: () => (songId ? karaokeApi.getLyrics(songId) : Promise.reject('No songId')),
    enabled: Boolean(songId),
    staleTime: 60000,
  });

  const lines = useMemo(() => lyricsData?.lines || [], [lyricsData?.lines]);
  const hasTimedLyrics = Boolean(lyricsData?.hasTimedLyrics && lines.length > 0);

  // Identify currently active line based on server-authoritative currentPositionMs
  const activeIndex = useMemo(() => {
    if (!hasTimedLyrics) return -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const end = line.endMs ?? (lines[i + 1]?.startMs ?? line.startMs + 5000);
      if (currentPositionMs >= line.startMs && currentPositionMs < end) {
        return i;
      }
    }

    // If past last line
    if (lines.length > 0 && currentPositionMs >= (lines[lines.length - 1]?.startMs ?? 0)) {
      return lines.length - 1;
    }

    return 0;
  }, [lines, currentPositionMs, hasTimedLyrics]);

  // Track user manual scrolling to pause auto-scrolling temporarily
  const handleScroll = useCallback(() => {
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 4000);
  }, []);

  // Smooth auto-scroll to keep active lyric line vertically centered
  useEffect(() => {
    if (isUserScrollingRef.current) return;

    if (activeLineRef.current && containerRef.current) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      activeLineRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  // Clean up user scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 gap-3 text-slate-400', className)}>
        <Music className="w-8 h-8 animate-pulse text-violet-400" />
        <p className="text-xs font-medium">Loading synchronized lyrics...</p>
      </div>
    );
  }

  if (!hasTimedLyrics) {
    return (
      <div
        data-testid="lyrics-unavailable-state"
        className={cn('flex flex-col items-center justify-center py-12 px-4 text-center gap-3', className)}
      >
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
          <Mic2 className="w-6 h-6 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-white">Instrumental / No Timed Lyrics</h4>
          <p className="text-xs text-slate-400 max-w-sm">
            Synchronized lyrics are not available for this track. Sing along with the backing audio!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      data-testid="lyrics-stage-container"
      className={cn(
        'relative w-full max-h-[280px] overflow-y-auto px-4 py-8 space-y-5 text-center scrollbar-none select-none transition-all',
        className
      )}
    >
      {/* Top & bottom subtle gradient masks for smooth fade in/out */}
      <div className="sticky -top-8 left-0 right-0 h-8 bg-gradient-to-b from-[#030408] to-transparent pointer-events-none z-10" />

      {lines.map((line: TimedLyricLine, index: number) => {
        const isActive = index === activeIndex;
        const isPast = index < activeIndex;

        return (
          <LyricLineRow
            key={line.id || index}
            ref={isActive ? activeLineRef : undefined}
            line={line}
            index={index}
            isActive={isActive}
            isPast={isPast}
            isPlaying={isPlaying}
            currentPositionMs={isActive ? currentPositionMs : 0}
          />
        );
      })}

      <div className="sticky -bottom-8 left-0 right-0 h-8 bg-gradient-to-t from-[#030408] to-transparent pointer-events-none z-10" />
    </div>
  );
}
