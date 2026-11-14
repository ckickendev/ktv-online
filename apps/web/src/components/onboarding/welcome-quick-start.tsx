'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Compass,
  Lock,
  Plus,
  ArrowRight,
  X,
  Mic2,
  Users2,
  CheckCircle2,
} from 'lucide-react';

interface WelcomeQuickStartProps {
  onDismiss: () => void;
  onExploreClick?: () => void;
}

export function WelcomeQuickStart({
  onDismiss,
  onExploreClick,
}: WelcomeQuickStartProps) {
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => {
      onDismiss();
    }, 200);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-950/40 via-[#0e121e] to-cyan-950/30 border border-white/10 p-6 sm:p-8 mb-8 shadow-2xl transition-all duration-200 ${
        isDismissing ? 'opacity-0 scale-98' : 'animate-in fade-in zoom-in-98'
      }`}
      data-testid="welcome-quick-start"
    >
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Dismiss Button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Dismiss welcome guide"
        title="Dismiss welcome guide"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header Badge & Title */}
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Welcome to KTVOnline</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Your Virtual Hangout.{' '}
          <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
            Your Karaoke Night.
          </span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
          Step into synchronized live singing rooms, cheer with friends, or host your own private
          hangout in your browser. Choose your path to get started:
        </p>
      </div>

      {/* Quick Start Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {/* Path 1: Explore Public Lounges */}
        <div className="p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-cyan-500/30 transition-all flex flex-col justify-between group">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Explore Public Lounges</h3>
                <span className="text-[11px] text-cyan-400 font-medium">Join Open Stages</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Browse open rooms, preview ongoing performances without joining, and jump in to sing
              along with the community.
            </p>
          </div>

          <button
            type="button"
            onClick={onExploreClick || handleDismiss}
            className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold border border-cyan-500/30 flex items-center justify-center gap-2 transition-colors min-h-[44px]"
          >
            <span>Explore Lounges Below</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Path 2: Create a Private Lounge */}
        <div className="p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-violet-500/30 transition-all flex flex-col justify-between group">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Create a Private Lounge</h3>
                <span className="text-[11px] text-violet-400 font-medium">Invite-Only Room</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Host your own lounge hidden from the public list. Get an instant, secure invitation
              link to share directly with your friends.
            </p>
          </div>

          <Link
            href="/rooms/create"
            className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 transition-all min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Create Private Lounge</span>
          </Link>
        </div>
      </div>

      {/* Feature Highlights Footer */}
      <div className="mt-6 pt-5 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-400 text-xs">
        <div className="flex items-center gap-2">
          <Mic2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Synchronized Karaoke Lyrics</span>
        </div>
        <div className="flex items-center gap-2">
          <Users2 className="w-4 h-4 text-violet-400 shrink-0" />
          <span>Low-Latency WebRTC Voice</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Instant Shareable Invite Links</span>
        </div>
      </div>
    </div>
  );
}
