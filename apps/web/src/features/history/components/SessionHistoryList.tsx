'use client';

import React from 'react';
import Link from 'next/link';
import {
  Radio,
  Lock,
  Calendar,
  Clock,
  Music2,
  Compass,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useMySessions } from '../hooks/use-history';

interface SessionHistoryListProps {
  onOpenSessionRecap: (sessionId: string) => void;
}

function formatMinutes(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs <= 0) return 'In progress';
  const mins = Math.round(durationMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}m`;
}

export function SessionHistoryList({ onOpenSessionRecap }: SessionHistoryListProps) {
  const { data, isLoading, isError, refetch } = useMySessions({ page: 1, limit: 10 });
  const sessions = data?.items || [];

  if (isLoading) {
    return (
      <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        <span className="text-xs">Loading attended sessions...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-white">Could Not Load Session History</h4>
        <p className="text-xs text-slate-400 mt-1 mb-3">
          Failed to fetch your karaoke session participation.
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

  if (sessions.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
        <div className="w-12 h-12 rounded-2xl bg-cyan-600/10 text-cyan-400 flex items-center justify-center mx-auto mb-3">
          <Compass className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          No sessions attended yet
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
          Join a live karaoke lounge or host a private lounge with friends to start recording sessions!
        </p>
        <Link
          href="/rooms"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all shadow-md shadow-cyan-600/20"
        >
          <span>Discover Lounges</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {sessions.map((s) => {
        const isPrivate = s.visibility === 'private';

        return (
          <div
            key={s.id}
            className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {isPrivate ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Private</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                    <Radio className="w-2.5 h-2.5" />
                    <span>Public</span>
                  </span>
                )}
                <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                  {s.roomName}
                </h4>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                <span>
                  Host: <strong className="text-slate-300">{s.hostDisplayName || s.hostUsername}</strong>
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span>{new Date(s.startedAt).toLocaleDateString()}</span>
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{formatMinutes(s.durationMs)}</span>
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1 text-violet-300 font-medium">
                  <Music2 className="w-3 h-3" />
                  <span>{s.totalSongsPlayed} songs</span>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenSessionRecap(s.id)}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-colors flex items-center gap-1.5 self-end sm:self-center shrink-0 min-h-[44px]"
            >
              <span>View Recap</span>
              <ArrowRight className="w-3.5 h-3.5 text-violet-400" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
