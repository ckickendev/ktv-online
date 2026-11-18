'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { VirtualRoomExperience } from '@/features/virtual-room';

export default function VirtualRoomPreviewPage() {
  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#07090f] text-slate-100 p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
      <header className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Link
            href="/rooms"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <span>2.5D Social Virtual Room – S1 Scene Engine Preview</span>
            </h1>
            <p className="text-xs text-slate-400">
              Interactive isometric pixel-art lounge with 12x12 floor grid, procedural furniture, depth sorting, and hybrid camera pan/zoom.
            </p>
          </div>
        </div>

        <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
          S1 Engine Active
        </span>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        <VirtualRoomExperience
          roomId="preview-room"
          roomName="Cyberpunk Neon Lounge"
          currentSongTitle="Midnight City"
          currentSingerName="NeonVocalist"
          isSingerSpeaking={true}
          atmospherePreset="neon_stage"
        />
      </main>
    </div>
  );
}
