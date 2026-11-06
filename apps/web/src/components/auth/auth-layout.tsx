'use client';

import React from 'react';
import Link from 'next/link';
import { Mic2, Sparkles, Music, Radio, Users2 } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex-1 flex min-h-[calc(100vh-4rem)]">
      {/* Left Column: Atmospheric Brand Visuals (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-gradient-to-br from-[#0c0f1d] via-[#090b14] to-[#120a21] border-r border-white/5 overflow-hidden">
        {/* Ambient Neon Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-violet-600/20 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] bg-cyan-500/15 blur-[130px] pointer-events-none rounded-full" />

        {/* Brand Top Header */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 p-0.5 shadow-xl shadow-violet-600/30 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#090b12] rounded-[10px] flex items-center justify-center text-violet-400">
                <Mic2 className="w-5 h-5" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-violet-300 bg-clip-text text-transparent">
                KTV ONLINE
              </span>
              <span className="text-[10px] font-semibold tracking-widest text-cyan-400 uppercase -mt-1">
                Virtual Karaoke Lounges
              </span>
            </div>
          </Link>
        </div>

        {/* Center Positioning & Highlights */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs font-medium backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Next-Gen Social Audio Platform</span>
          </div>

          <h2 className="text-4xl lg:text-5xl font-black text-white leading-[1.15] tracking-tight">
            Your Virtual Hangout.{' '}
            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              Your Karaoke Night.
            </span>
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed">
            Meet your friends, discover new voices, and create unforgettable karaoke nights —
            wherever you are.
          </p>

          {/* Social Proof Pills */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 text-cyan-400 font-bold text-sm mb-1">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Low-Latency Audio</span>
              </div>
              <p className="text-xs text-slate-400">High-fidelity synchronized live voice chat &amp; lyric cues.</p>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 text-violet-400 font-bold text-sm mb-1">
                <Users2 className="w-4 h-4" />
                <span>Social Lounges</span>
              </div>
              <p className="text-xs text-slate-400">Public stages, private VIP booths, and live audience cheering.</p>
            </div>
          </div>
        </div>

        {/* Bottom Metadata */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 pt-6 border-t border-white/5">
          <span>&copy; {new Date().getFullYear()} KTV Online. All rights reserved.</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Music className="w-3.5 h-3.5 text-violet-400" /> Powered by Modern Web Audio
          </span>
        </div>
      </div>

      {/* Right Column: Authentication Card & Form */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-12 py-12 relative">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center sm:text-left space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              {subtitle}
            </p>
          </div>

          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
