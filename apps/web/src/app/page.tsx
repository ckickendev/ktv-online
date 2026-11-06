import React from 'react';
import Link from 'next/link';
import {
  Mic2,
  Sparkles,
  Users2,
  Disc3,
  Radio,
  ArrowRight,
  Headphones,
  Sliders,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { FeaturedRooms } from '@/features/rooms/featured-rooms';

export default function LandingPage() {

  return (
    <div className="relative overflow-hidden flex flex-col">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-violet-600/20 via-cyan-500/10 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] bg-cyan-600/10 blur-[120px] pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="pt-20 pb-16 md:pt-28 md:pb-24 border-b border-white/5">
        <PageContainer className="text-center flex flex-col items-center">
          {/* Top Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs font-medium mb-8 backdrop-blur-md shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sprint 0 Architecture Foundation Live</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-slate-400">Next.js 15 &bull; Express &bull; Mongoose</span>
          </div>

          {/* Main Title */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-[1.1] text-white">
            Your Virtual Hangout.{' '}
            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              Your Karaoke Night.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-300 max-w-2xl leading-relaxed">
            Step into live virtual karaoke lounges. Sing along with synchronized lyrics, talk and
            cheer through low-latency voice, and socialize in modern themed rooms with friends.
          </p>

          {/* Hero CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link
              href="/rooms"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold text-sm shadow-xl shadow-violet-600/30 hover:shadow-cyan-500/30 transition-all flex items-center justify-center gap-2 group"
            >
              <span>Explore Karaoke Lounges</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/profile"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              <Headphones className="w-4 h-4 text-violet-400" />
              <span>Studio Profile</span>
            </Link>
          </div>

          {/* Hero Sound Wave Graphic */}
          <div className="mt-14 inline-flex items-center gap-1.5 px-6 py-3 rounded-2xl glass-panel border border-white/10 shadow-2xl">
            <Mic2 className="w-4 h-4 text-violet-400 mr-2" />
            <div className="flex items-center gap-1 h-6">
              <span className="w-1 bg-violet-400 rounded-full wave-bar-1" />
              <span className="w-1 bg-cyan-400 rounded-full wave-bar-2" />
              <span className="w-1 bg-indigo-400 rounded-full wave-bar-3" />
              <span className="w-1 bg-violet-300 rounded-full wave-bar-4" />
              <span className="w-1 bg-cyan-300 rounded-full wave-bar-5" />
            </div>
            <span className="text-xs font-semibold text-slate-300 ml-3">
              Live Synchronized Audio Engine
            </span>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 pt-12 border-t border-white/5 w-full max-w-4xl text-center">
            <div>
              <p className="text-2xl md:text-3xl font-extrabold text-white">100%</p>
              <p className="text-xs text-slate-400 mt-1">Synchronized Lyrics</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold text-violet-400">&lt; 50ms</p>
              <p className="text-xs text-slate-400 mt-1">Voice Target Latency</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold text-cyan-400">50+</p>
              <p className="text-xs text-slate-400 mt-1">Curated Song Genres</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold text-emerald-400">Unlimited</p>
              <p className="text-xs text-slate-400 mt-1">Social Hangouts</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* Featured Lounges Preview */}
      <section className="py-16 md:py-20 bg-[#080a10]">
        <PageContainer>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-400 mb-2 block">
                Live Preview
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Popular Lounges Right Now</h2>
              <p className="text-sm text-slate-400 mt-1">
                Jump into an ongoing singing session or host your own private party.
              </p>
            </div>

            <Link
              href="/rooms"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <span>View all lounges</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <FeaturedRooms />
        </PageContainer>
      </section>

      {/* Core Platform Features */}
      <section className="py-20 md:py-24 border-t border-white/5 relative">
        <PageContainer>
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2 block">
              Architectural Pillars
            </span>
            <h2 className="text-3xl font-bold text-white">Built for High-Energy Virtual Nightlife</h2>
            <p className="text-sm text-slate-400 mt-3">
              Crafted with a clean modular monorepo stack designed to support real-time audio,
              social mini-games, and 3D customizable avatar lounges.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-violet-500/30 transition-all">
              <div className="w-12 h-12 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center mb-5">
                <Disc3 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Synchronized Karaoke Engine</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Real-time synchronized audio playback and timed lyrics ensure every participant in the
                room sees the exact same lyric cues simultaneously.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all">
              <div className="w-12 h-12 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center mb-5">
                <Users2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Low-Latency Social Audio</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Seamless voice chat with volume isolation, mic muting, cheer soundboard effects, and
                audience participation modes.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-5">
                <Sliders className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">Vocal Effects &amp; Equalizer</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Studio-grade vocal reverb, echo suppression, and pitch correction controls designed to
                make every singer sound like a rockstar.
              </p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* Ready to Sing CTA */}
      <section className="py-16 bg-gradient-to-r from-violet-950/40 via-indigo-950/20 to-cyan-950/40 border-t border-b border-white/5 text-center">
        <PageContainer className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 p-0.5 mb-6">
            <div className="w-full h-full bg-[#090b12] rounded-[14px] flex items-center justify-center text-violet-400">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white max-w-xl">
            Ready to Grab the Mic?
          </h2>
          <p className="mt-3 text-sm text-slate-300 max-w-md">
            Join a public room or invite your crew to a private lounge. Free, instant, and inside your
            browser.
          </p>

          <Link
            href="/rooms"
            className="mt-8 px-8 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm shadow-xl shadow-violet-600/30 transition-all flex items-center gap-2"
          >
            <span>Start Singing Now</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </PageContainer>
      </section>
    </div>
  );
}
