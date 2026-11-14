'use client';

import React from 'react';
import { Flame, Music, Clock, Trophy } from 'lucide-react';
import { useMyStats } from '../hooks/use-history';

function formatDurationToMinutes(durationMs: number): string {
  if (!durationMs || durationMs <= 0) return '0 min';
  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;
  return `${hours}h ${remainingMins}m`;
}

export function KaraokeStatsCards() {
  const { data: stats, isLoading } = useMyStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-panel p-4 rounded-2xl border border-white/5 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  const topGenre = stats?.topGenres?.[0]?.genre
    ? stats.topGenres[0].genre.toUpperCase()
    : 'ALL-GENRE';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {/* Sessions Joined */}
      <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center transition-all hover:border-violet-500/20">
        <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center mx-auto mb-2">
          <Flame className="w-4 h-4" />
        </div>
        <p className="text-xl sm:text-2xl font-bold text-white">
          {stats?.totalSessionsJoined ?? 0}
        </p>
        <p className="text-[11px] text-slate-400">Lounges Joined</p>
      </div>

      {/* Songs Performed */}
      <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center transition-all hover:border-cyan-500/20">
        <div className="w-8 h-8 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center mx-auto mb-2">
          <Music className="w-4 h-4" />
        </div>
        <p className="text-xl sm:text-2xl font-bold text-white">
          {stats?.totalPerformancesStarted ?? 0}
        </p>
        <p className="text-[11px] text-slate-400">
          {stats?.completedPerformances ?? 0} Completed ({stats?.skippedPerformances ?? 0} Skipped)
        </p>
      </div>

      {/* Total Stage Time */}
      <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center transition-all hover:border-amber-500/20">
        <div className="w-8 h-8 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center mx-auto mb-2">
          <Clock className="w-4 h-4" />
        </div>
        <p className="text-xl sm:text-2xl font-bold text-white">
          {formatDurationToMinutes(stats?.totalPerformanceDurationMs ?? 0)}
        </p>
        <p className="text-[11px] text-slate-400">Total Sing Time</p>
      </div>

      {/* Top Genre */}
      <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center transition-all hover:border-emerald-500/20">
        <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
          <Trophy className="w-4 h-4" />
        </div>
        <p className="text-base sm:text-lg font-bold text-white truncate px-1">
          {topGenre}
        </p>
        <p className="text-[11px] text-slate-400">
          {stats?.uniqueSongsCount ?? 0} Unique Tracks
        </p>
      </div>
    </div>
  );
}
