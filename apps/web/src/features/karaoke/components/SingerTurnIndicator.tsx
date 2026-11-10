'use client';

import React from 'react';
import { Mic, Sparkles, BellRing, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomQueueItemDto } from '@ktv/contracts';

interface SingerTurnIndicatorProps {
  isCurrentSinger: boolean;
  isNextUpSinger: boolean;
  currentSingerName: string | null;
  nextUpItem: RoomQueueItemDto | null;
  className?: string;
}

export function SingerTurnIndicator({
  isCurrentSinger,
  isNextUpSinger,
  currentSingerName,
  nextUpItem,
  className,
}: SingerTurnIndicatorProps) {
  if (isCurrentSinger) {
    return (
      <div
        data-testid="singer-turn-active"
        className={cn(
          'flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600/30 via-fuchsia-600/20 to-cyan-500/30 border border-violet-500/40 text-violet-200 shadow-lg shadow-violet-900/30 animate-pulse',
          className
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-md shadow-violet-600/50">
          <Mic className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <h4 className="text-xs font-bold text-white tracking-wide uppercase">You are on stage!</h4>
          </div>
          <p className="text-[11px] text-violet-300 truncate">
            Your track is currently playing. Sing into your microphone!
          </p>
        </div>
      </div>
    );
  }

  if (isNextUpSinger) {
    return (
      <div
        data-testid="singer-turn-next"
        className={cn(
          'flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 shadow-lg shadow-amber-950/20',
          className
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-amber-500/30 border border-amber-500/50 flex items-center justify-center shrink-0">
          <BellRing className="w-4 h-4 text-amber-300 animate-bounce" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">You are up next!</h4>
          <p className="text-[11px] text-amber-200/80 truncate">
            {nextUpItem ? `"${nextUpItem.song.title}" is next in queue. Get ready!` : 'Your turn is coming up next.'}
          </p>
        </div>
      </div>
    );
  }

  if (currentSingerName) {
    return (
      <div
        data-testid="singer-turn-other"
        className={cn(
          'flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300',
          className
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <span className="text-slate-400">Current Singer:</span>
          <span className="font-semibold text-white truncate">{currentSingerName}</span>
        </div>
        {nextUpItem && (
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
            <span className="text-slate-500">Up next:</span>
            <span className="text-slate-300 font-medium truncate">
              {nextUpItem.requestedBy.displayName || nextUpItem.requestedBy.username}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="singer-turn-empty"
      className={cn(
        'flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-400',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
        <span>Stage is open — queue your favorite song to start singing!</span>
      </div>
      <Music2 className="w-3.5 h-3.5 text-slate-500" />
    </div>
  );
}
