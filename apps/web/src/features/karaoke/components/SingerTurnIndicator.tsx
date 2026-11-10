'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import {
  Mic,
  MicOff,
  Sparkles,
  BellRing,
  Music2,
  Radio,
  Pause,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomQueueItemDto, RoomQueueRequesterDto } from '@ktv/contracts';

export interface SingerTurnIndicatorProps {
  isCurrentSinger: boolean;
  isNextUpSinger: boolean;
  currentSingerName: string | null;
  currentSinger?: RoomQueueRequesterDto | null;
  currentRequester?: RoomQueueRequesterDto | null;
  nextUpItem: RoomQueueItemDto | null;
  nextSinger?: RoomQueueRequesterDto | null;
  nextRequester?: RoomQueueRequesterDto | null;
  performerState?: 'singing' | 'paused' | 'preparing' | 'ended' | 'idle';
  isSingerSpeaking?: boolean;
  isSingerVoiceConnected?: boolean;
  isSingerMuted?: boolean;
  onOpenSearch?: () => void;
  className?: string;
}

interface FloatingParticle {
  id: number;
  emoji: string;
  x: number; // percentage across container
}

const CHEER_EMOJIS = ['👏', '🔥', '❤️', '🎉', '🎤'];

export function SingerTurnIndicator({
  isCurrentSinger,
  isNextUpSinger,
  currentSingerName,
  currentSinger,
  currentRequester,
  nextUpItem,
  nextSinger,
  nextRequester: _nextRequester,
  performerState = 'singing',
  isSingerSpeaking = false,
  isSingerVoiceConnected = false,
  isSingerMuted = false,
  onOpenSearch,
  className,
}: SingerTurnIndicatorProps) {
  const [particles, setParticles] = useState<FloatingParticle[]>([]);

  const handleCheer = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    const x = 30 + Math.random() * 40; // 30% to 70%
    setParticles((prev) => [...prev.slice(-15), { id, emoji, x }]);

    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 2000);
  }, []);

  const effectiveSingerName =
    currentSinger?.displayName || currentSinger?.username || currentSingerName;
  const effectiveSingerAvatar = currentSinger?.avatar;
  const isDedicatedSinger = Boolean(
    currentRequester &&
      currentSinger &&
      currentRequester.id !== currentSinger.id
  );

  const nextSingerName =
    nextSinger?.displayName ||
    nextSinger?.username ||
    nextUpItem?.singer?.displayName ||
    nextUpItem?.singer?.username ||
    nextUpItem?.requestedBy?.displayName ||
    nextUpItem?.requestedBy?.username ||
    null;

  return (
    <div className={cn('relative w-full overflow-hidden select-none', className)}>
      {/* Floating Stage Particles Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {particles.map((particle) => (
          <span
            key={particle.id}
            style={{ left: `${particle.x}%` }}
            className="absolute bottom-1 text-2xl animate-float-fade"
          >
            {particle.emoji}
          </span>
        ))}
      </div>

      {/* 1. YOU ARE ON STAGE (CURRENT SINGER VIEW) */}
      {isCurrentSinger ? (
        <div
          data-testid="singer-turn-active"
          className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-violet-950/70 via-purple-900/50 to-indigo-950/70 border border-violet-500/40 shadow-xl shadow-violet-950/30 backdrop-blur-md"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white font-bold shadow-md shadow-violet-600/40 overflow-hidden">
                  {effectiveSingerAvatar ? (
                    <Image
                      src={effectiveSingerAvatar}
                      alt={effectiveSingerName || 'You'}
                      fill
                      className="object-cover rounded-xl"
                      sizes="48px"
                      unoptimized
                    />
                  ) : (
                    <Mic className="w-5 h-5 text-white" />
                  )}
                </div>
                {/* Voice Status Dot */}
                <span
                  className={cn(
                    'absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#0d0f18]',
                    isSingerSpeaking
                      ? 'bg-emerald-400 ring-2 ring-emerald-400/50 animate-ping'
                      : isSingerMuted
                      ? 'bg-rose-500'
                      : 'bg-emerald-500'
                  )}
                  title={
                    isSingerSpeaking
                      ? 'Microphone active — speaking'
                      : isSingerMuted
                      ? 'Microphone muted'
                      : 'Microphone ready'
                  }
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white tracking-wide">
                    You are in the Spotlight!
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    Lead Vocal
                  </span>
                  {isSingerSpeaking && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                      <Radio className="w-2.5 h-2.5 text-emerald-400" />
                      Live Audio
                    </span>
                  )}
                  {isSingerMuted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      <MicOff className="w-2.5 h-2.5 text-rose-400" />
                      Mic Muted
                    </span>
                  )}
                </div>
                <p className="text-xs text-violet-200/80 mt-0.5 truncate">
                  {performerState === 'paused'
                    ? 'Performance is paused. Resume when ready.'
                    : 'Your song is live on stage. Sing with the backing track!'}
                </p>
              </div>
            </div>

            {/* Next Up Teaser or Cheer Bar */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {nextUpItem && (
                <div className="hidden lg:flex flex-col items-end text-right pr-2 border-r border-white/10">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Up Next</span>
                  <span className="text-xs font-medium text-slate-200 truncate max-w-[140px]">
                    {nextSingerName || 'Next Performer'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                {CHEER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleCheer(emoji)}
                    className="p-1 hover:bg-white/10 rounded-lg text-sm transition-transform active:scale-125"
                    title={`Cheer with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : isNextUpSinger ? (
        /* 2. YOU ARE UP NEXT */
        <div
          data-testid="singer-turn-next"
          className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-950/70 via-amber-900/40 to-amber-950/70 border border-amber-500/40 shadow-xl shadow-amber-950/30 backdrop-blur-md"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5 text-amber-300 animate-bounce" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                    You Are Up Next!
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/30">
                    Get Ready
                  </span>
                </div>
                <p className="text-xs text-amber-200/90 mt-0.5 truncate">
                  {nextUpItem
                    ? `"${nextUpItem.song.title}" takes the stage right after this performance.`
                    : 'Your turn is coming up next.'}
                </p>
              </div>
            </div>

            {/* Quick Cheer / Stage Audience Interaction */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 self-end sm:self-auto shrink-0">
              {CHEER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleCheer(emoji)}
                  className="p-1 hover:bg-white/10 rounded-lg text-sm transition-transform active:scale-125"
                  title={`Cheer with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : effectiveSingerName ? (
        /* 3. SOMEONE ELSE IS SINGING (AUDIENCE / LOUNGE VIEW) */
        <div
          data-testid="singer-turn-other"
          className="p-3 sm:p-3.5 rounded-2xl bg-white/5 border border-white/10 shadow-lg backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0">
              {/* Singer Avatar */}
              <div className="relative shrink-0">
                <div className="relative w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center overflow-hidden">
                  {effectiveSingerAvatar ? (
                    <Image
                      src={effectiveSingerAvatar}
                      alt={effectiveSingerName}
                      fill
                      className="object-cover rounded-xl"
                      sizes="40px"
                      unoptimized
                    />
                  ) : (
                    <Mic className="w-4 h-4 text-violet-300" />
                  )}
                </div>
                {/* Voice Status Dot */}
                <span
                  className={cn(
                    'absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0d0f18]',
                    isSingerSpeaking
                      ? 'bg-emerald-400 ring-2 ring-emerald-400/50 animate-ping'
                      : isSingerVoiceConnected
                      ? 'bg-cyan-400'
                      : 'bg-slate-500'
                  )}
                  title={
                    isSingerSpeaking
                      ? 'Singing live'
                      : isSingerVoiceConnected
                      ? 'Voice connected'
                      : 'Voice off'
                  }
                />
              </div>

              {/* Singer Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">On Stage:</span>
                  <span className="text-sm font-bold text-white truncate max-w-[160px] sm:max-w-[220px]">
                    {effectiveSingerName}
                  </span>
                  <span className="hidden xs:inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-slate-300">
                    Performer
                  </span>
                  {isSingerSpeaking && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
                      Singing
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  {isDedicatedSinger && currentRequester && (
                    <span className="text-slate-500 truncate">
                      Queued by {currentRequester.displayName || currentRequester.username}
                    </span>
                  )}
                  {performerState === 'paused' && (
                    <span className="text-amber-400 flex items-center gap-1 font-medium">
                      <Pause className="w-2.5 h-2.5" /> Paused
                    </span>
                  )}
                  {performerState === 'preparing' && (
                    <span className="text-cyan-400 flex items-center gap-1 font-medium">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Preparing
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stage Audience Cheer Buttons & Up Next */}
            <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
              {nextUpItem && (
                <div className="hidden md:flex flex-col items-end text-right pr-2 border-r border-white/10">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Up Next</span>
                  <span className="text-xs text-slate-300 font-medium truncate max-w-[140px]">
                    {nextSingerName || 'Next Performer'}
                  </span>
                </div>
              )}

              {/* Cheer Pills */}
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                {CHEER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleCheer(emoji)}
                    className="p-1 hover:bg-white/10 rounded-lg text-sm transition-transform active:scale-125"
                    title={`Cheer ${effectiveSingerName} with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 4. STAGE OPEN (EMPTY QUEUE CALLOUT) */
        <div
          data-testid="singer-turn-empty"
          className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 shadow-md backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-300">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-white">Stage is open!</p>
                <p className="text-[11px] text-slate-400">
                  Pick a song from the catalog to take the spotlight.
                </p>
              </div>
            </div>

            {onOpenSearch ? (
              <button
                type="button"
                data-testid="stage-open-add-song-cta"
                onClick={onOpenSearch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-md shadow-violet-600/30 transition-all active:scale-95 shrink-0"
              >
                <Music2 className="w-3.5 h-3.5" />
                <span>Add Song</span>
              </button>
            ) : (
              <Music2 className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
