'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Mic,
  Music,
  CheckCircle2,
  SkipForward,
  AlertCircle,
  Calendar,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useMySongs } from '../hooks/use-history';
import { formatMsToTime } from '@/features/karaoke/components/CurrentSongPanel';

interface RecentlySungListProps {
  onOpenSessionRecap?: (sessionId: string) => void;
}

export function RecentlySungList({ onOpenSessionRecap }: RecentlySungListProps) {
  const { data, isLoading, isError, refetch } = useMySongs({ page: 1, limit: 10 });
  const performances = data?.items || [];

  if (isLoading) {
    return (
      <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        <span className="text-xs">Loading performance history...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-white">Could Not Load Singing History</h4>
        <p className="text-xs text-slate-400 mt-1 mb-3">
          Failed to fetch your recent karaoke performances.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  if (performances.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto mb-3">
          <Mic className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          No songs performed yet
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
          Step into any active karaoke room, queue an authorized track, and start your performance history!
        </p>
        <Link
          href="/rooms"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-all shadow-md shadow-violet-600/20"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Explore Live Lounges</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {performances.map((p) => {
        const isCompleted = p.outcome === 'completed';
        const isSkipped = p.outcome === 'skipped';

        return (
          <div
            key={p.id}
            className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-900 border border-white/10 shrink-0">
                {p.thumbnailUrl ? (
                  <Image
                    src={p.thumbnailUrl}
                    alt={p.songTitle}
                    fill
                    className="object-cover"
                    sizes="48px"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-violet-950/40">
                    <Music className="w-5 h-5 text-violet-400" />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                  {p.songTitle}
                </h4>
                <p className="text-xs text-slate-400 truncate mt-0.5">{p.artist}</p>

                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onOpenSessionRecap?.(p.sessionId)}
                    className="text-cyan-400 hover:underline font-medium truncate max-w-[140px]"
                    title={`Session: ${p.roomName}`}
                  >
                    {p.roomName}
                  </button>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>{new Date(p.startedAt).toLocaleDateString()}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {isCompleted ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Completed</span>
                </span>
              ) : isSkipped ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-500/20">
                  <SkipForward className="w-3 h-3" />
                  <span>Skipped</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-500/10 text-slate-400 text-[10px] border border-slate-500/20">
                  <span>Interrupted</span>
                </span>
              )}

              <span className="text-[11px] text-slate-400 font-medium">
                {formatMsToTime(p.durationPerformedMs)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
