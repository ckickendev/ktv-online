'use client';

import React from 'react';
import { Clock, Loader2, Mic2, Radio } from 'lucide-react';
import { MicOwnershipState, MicSingerDto } from '@ktv/contracts';
import { UserAvatar } from '@/components/shared/user-avatar';
import { cn } from '@/lib/utils';

export interface MicStatusIndicatorProps {
  state: MicOwnershipState;
  currentSinger: MicSingerDto | null;
  pendingCount: number;
  isInitialized?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function MicStatusIndicator({
  state,
  currentSinger,
  pendingCount,
  isInitialized = true,
  isLoading = false,
  className,
}: MicStatusIndicatorProps) {
  if (isLoading && !isInitialized) {
    return (
      <div
        data-testid="mic-status-indicator"
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300',
          className
        )}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
        <span className="font-medium">Syncing Stage Mic…</span>
      </div>
    );
  }

  if (state === 'OCCUPIED' && currentSinger) {
    const singerName =
      currentSinger.displayName?.trim() || currentSinger.username;

    return (
      <div
        data-testid="mic-status-indicator"
        data-mic-state="OCCUPIED"
        className={cn(
          'inline-flex items-center gap-2.5 min-w-0',
          className
        )}
      >
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-[11px] font-bold uppercase tracking-wider text-amber-300 shrink-0">
          <Mic2 className="w-3.5 h-3.5 text-amber-300" />
          <span>Official Singer</span>
        </span>

        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar
            name={singerName}
            avatarUrl={currentSinger.avatar}
            size="sm"
            status="singing"
          />
          <div className="min-w-0">
            <p
              data-testid="mic-official-singer-name"
              className="text-xs sm:text-sm font-bold text-white truncate"
            >
              {singerName}
            </p>
            {currentSinger.displayName && (
              <p className="text-[10px] text-slate-400 truncate hidden sm:block">
                @{currentSinger.username}
              </p>
            )}
          </div>
        </div>

        {pendingCount > 0 && (
          <span
            data-testid="mic-waiting-count-pill"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-[10px] font-semibold text-violet-300 shrink-0"
          >
            <Clock className="w-3 h-3" />
            <span>{pendingCount} waiting</span>
          </span>
        )}
      </div>
    );
  }

  if (state === 'REQUEST_PENDING') {
    return (
      <div
        data-testid="mic-status-indicator"
        data-mic-state="REQUEST_PENDING"
        className={cn('inline-flex items-center gap-2 flex-wrap', className)}
      >
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>Stage Mic Open</span>
        </span>
        <span
          data-testid="mic-waiting-count-pill"
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-300"
        >
          <Clock className="w-3 h-3" />
          <span>
            {pendingCount} {pendingCount === 1 ? 'waiting' : 'waiting'}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="mic-status-indicator"
      data-mic-state="AVAILABLE"
      className={cn('inline-flex items-center gap-2', className)}
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
        <Radio className="w-3.5 h-3.5 text-emerald-400" />
        <span>Stage Mic Open</span>
      </span>
      <span className="text-xs text-slate-400 hidden sm:inline">
        Ready for the next official singer
      </span>
    </div>
  );
}
