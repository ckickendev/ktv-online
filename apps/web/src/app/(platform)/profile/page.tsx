'use client';

import React from 'react';
import Link from 'next/link';
import {
  Mic,
  Trophy,
  Music,
  Flame,
  Radio,
  Settings,
  Sparkles,
  Calendar,
  Volume2,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { PersonalPreferencesCard } from '@/components/profile/personal-preferences-card';
import { useAuth } from '@/hooks/use-auth';

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const displayName = user?.username || 'Alex Singer';
  const roleLabel = user?.role ? `${user.role.toUpperCase()} Member` : 'Karaoke Legend • Lvl 14';

  const recentPerformances = [
    { title: 'Blinding Lights', artist: 'The Weeknd', room: 'Billboard 100 Golden Hits', date: '2 hours ago', score: '96%' },
    { title: 'Gurenge', artist: 'LiSA', room: 'Neo Tokyo Cyber Lounge', date: 'Yesterday', score: '98%' },
    { title: 'Bohemian Rhapsody', artist: 'Queen', room: 'Classic Rock Arena', date: '3 days ago', score: '92%' },
  ];

  return (
    <ProtectedRoute>
      <div className="flex-1 py-10">
        <PageContainer size="md">
        {/* Profile Card Header */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden mb-8">
          {/* Decorative ambient gradient */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-violet-600/20 via-cyan-500/10 to-transparent blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
            <UserAvatar name={displayName} size="xl" status="online" className="shadow-2xl" />

            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{displayName}</h1>
                  <p className="text-xs text-violet-400 font-medium">@{displayName.toLowerCase().replace(/\s+/g, '_')} &bull; Member since Oct 2026</p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/my-rooms"
                    className="px-3 py-1 rounded-full bg-violet-600/30 border border-violet-500/40 text-violet-300 hover:bg-violet-600/50 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>My Lounges</span>
                  </Link>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>{roleLabel}</span>
                  </div>

                  {isAuthenticated && (
                    <button
                      onClick={() => logout()}
                      className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors"
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 text-xs sm:text-sm text-slate-300 max-w-lg leading-relaxed">
                Belting out 80s rock &amp; modern pop chart toppers. Weekly host of Friday Night Cyber Lounge. Always down for duets!
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" /> Tokyo &amp; Global Servers
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" /> 142 Sessions Completed
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center mx-auto mb-2">
              <Mic className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-white">142</p>
            <p className="text-[11px] text-slate-400">Songs Sung</p>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
            <div className="w-8 h-8 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center mx-auto mb-2">
              <Flame className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-white">28</p>
            <p className="text-[11px] text-slate-400">Lounges Hosted</p>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
            <div className="w-8 h-8 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center mx-auto mb-2">
              <Sparkles className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-white">1,480</p>
            <p className="text-[11px] text-slate-400">Cheers Received</p>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
            <div className="w-8 h-8 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto mb-2">
              <Music className="w-4 h-4" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-white">Pop / Rock</p>
            <p className="text-[11px] text-slate-400">Top Genre</p>
          </div>
        </div>

        {/* Personal Karaoke Experience Preferences (Sprint 3.5) */}
        <PersonalPreferencesCard />

        {/* History and Hardware Preferences */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Recent Performances (Col 8) */}
          <div className="md:col-span-8 glass-panel rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Recent Lounge Sing-Alongs
              </h2>
              <span className="text-[11px] text-slate-400">Last 30 Days</span>
            </div>

            <div className="space-y-3">
              {recentPerformances.map((perf, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center">
                      <Music className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{perf.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {perf.artist} &bull; {perf.room}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                      Score: {perf.score}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">{perf.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audio Setup Settings Placeholder (Col 4) */}
          <div className="md:col-span-4 glass-panel rounded-2xl p-6 border border-white/5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Audio Setup
                </h2>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Microphone Input</label>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-slate-200 text-xs">
                    Default - Studio USB Mic
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Echo Cancellation</label>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-emerald-400 text-xs font-medium">
                    Active (Hardware Optimized)
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Preferred Reverb</label>
                  <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-violet-300 text-xs font-medium">
                    Studio Vocal Reverb
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 mt-4 flex items-center gap-2 text-[11px] text-slate-500">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Web Audio API configured</span>
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
    </ProtectedRoute>
  );
}
