'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import {
  Mic,
  Sparkles,
  BellRing,
  Music2,
  Radio,
  Pause,
  Loader2,
  Gift,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomQueueItemDto, RoomQueueRequesterDto, StageReactionEmoji } from '@ktv/contracts';
import { StageReactionParticle } from '../hooks/use-stage-reactions';

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
  durationMs?: number;
  currentPositionMs?: number;
  onOpenSearch?: () => void;
  className?: string;
  onSendReaction?: (emoji: StageReactionEmoji) => void;
  activeReactions?: StageReactionParticle[];
  prefersReducedMotion?: boolean;
  onOpenGiftSelector?: () => void;
}

const CHEER_EMOJIS: StageReactionEmoji[] = ['👏', '🔥', '❤️', '🎉', '🎤'];

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
  durationMs,
  currentPositionMs,
  onOpenSearch,
  className,
  onSendReaction,
  activeReactions,
  prefersReducedMotion = false,
  onOpenGiftSelector,
}: SingerTurnIndicatorProps) {
  const [localParticles, setLocalParticles] = useState<StageReactionParticle[]>([]);

  const handleCheer = useCallback(
    (emoji: StageReactionEmoji) => {
      if (onSendReaction) {
        onSendReaction(emoji);
      } else {
        // Fallback local particle if not connected to shared reactions
        const id = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const x = 30 + Math.random() * 40;
        const newParticle: StageReactionParticle = {
          id,
          emoji,
          x,
          senderName: 'You',
          isSelf: true,
        };
        setLocalParticles((prev) => [...prev.slice(-15), newParticle]);

        setTimeout(() => {
          setLocalParticles((prev) => prev.filter((p) => p.id !== id));
        }, 2000);
      }
    },
    [onSendReaction]
  );

  const displayParticles = activeReactions ?? localParticles;
  const latestParticle = displayParticles[displayParticles.length - 1];

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

  const isEndingSoon = Boolean(
    durationMs && currentPositionMs && durationMs > 20000 && durationMs - currentPositionMs <= 15000
  );

  const isTransitioning = Boolean(
    (durationMs && currentPositionMs && durationMs > 1000 && currentPositionMs >= durationMs) ||
    (performerState === 'ended' && Boolean(nextUpItem))
  );

  return (
    <div className={cn('relative w-full overflow-hidden select-none', className)}>
      {/* Floating Stage Particles Overlay */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden z-20"
        aria-hidden="true"
      >
        {displayParticles.map((particle) => (
          <div
            key={particle.id}
            style={{ left: `${particle.x}%` }}
            className={cn(
              'absolute bottom-2 flex flex-col items-center pointer-events-none select-none transition-transform',
              prefersReducedMotion ? 'animate-pulse-fade' : 'animate-float-fade'
            )}
          >
            <span className="text-2xl sm:text-3xl drop-shadow-md">
              {particle.emoji}
            </span>
            {particle.senderName && !particle.isSelf && (
              <span className="text-[10px] text-white/90 font-medium px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs border border-white/10 shadow-xs truncate max-w-[80px]">
                {particle.senderName}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Screen Reader Live Region for Audience Reactions */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestParticle
          ? `${latestParticle.senderName} cheered with ${latestParticle.emoji}`
          : ''}
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
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/30 text-violet-200 border border-violet-400/30">
                    Lead Singer
                  </span>
                  {isSingerSpeaking && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
                      Live
                    </span>
                  )}
                  {isTransitioning ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 animate-pulse">
                      <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
                      Performance Complete
                    </span>
                  ) : isEndingSoon ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/40 animate-pulse">
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      Wrapping Up
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-violet-200/80 mt-0.5 truncate">
                  {isTransitioning
                    ? nextUpItem
                      ? `Great performance! Wrapping up stage for "${nextUpItem.song.title}".`
                      : 'Great performance! Wrapping up the stage.'
                    : performerState === 'paused'
                    ? 'Performance is paused. Resume when ready.'
                    : 'Your song is live on stage. Sing with the backing track!'}
                </p>
              </div>
            </div>

            {/* Next Up Teaser & Stage Cheers */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {nextUpItem && (
                <div className="hidden lg:flex flex-col items-end text-right pr-2 border-r border-white/10 max-w-[190px]">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 truncate w-full justify-end">
                    <span>Up Next</span>
                    <span className="text-slate-400 font-normal truncate">
                      &bull; {nextUpItem.song.title}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-slate-200 truncate max-w-[160px]">
                    {nextSingerName || 'Next Performer'}
                  </span>
                </div>
              )}
              <div
                role="toolbar"
                aria-label="Stage cheer reactions"
                className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10"
              >
                {CHEER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleCheer(emoji)}
                    className="w-11 h-11 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center hover:bg-white/15 rounded-xl text-lg sm:text-sm transition-all active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    title={`Cheer with ${emoji}`}
                    aria-label={`Cheer with ${emoji}`}
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
                    {isTransitioning ? 'Step Up to the Stage!' : 'You Are Up Next!'}
                  </h4>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      isTransitioning
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse flex items-center gap-1'
                        : 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                    )}
                  >
                    {isTransitioning ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-emerald-400" />
                        Stage Handoff
                      </>
                    ) : (
                      'Get Ready'
                    )}
                  </span>
                </div>
                <p className="text-xs text-amber-200/90 mt-0.5 truncate">
                  {isTransitioning
                    ? `Get ready! "${nextUpItem?.song.title || 'Your song'}" is taking the spotlight right now!`
                    : nextUpItem
                    ? `"${nextUpItem.song.title}" takes the stage right after this performance.`
                    : 'Your turn is coming up next.'}
                </p>
              </div>
            </div>

            {/* Quick Cheer / Stage Audience Interaction */}
            <div
              role="toolbar"
              aria-label="Stage cheer reactions"
              className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 self-end sm:self-auto shrink-0"
            >
              {CHEER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleCheer(emoji)}
                  className="w-11 h-11 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center hover:bg-white/15 rounded-xl text-lg sm:text-sm transition-all active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  title={`Cheer with ${emoji}`}
                  aria-label={`Cheer with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              {onOpenGiftSelector && (
                <button
                  type="button"
                  onClick={onOpenGiftSelector}
                  className="w-11 h-11 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center hover:bg-pink-500/20 text-pink-300 hover:text-pink-200 rounded-xl transition-all active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 border border-pink-500/30 ml-0.5"
                  title="Send a virtual gift to the current performer"
                  aria-label="Send a virtual gift to the current performer"
                >
                  <Gift className="w-4 h-4 text-pink-300" />
                </button>
              )}
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
                  {isTransitioning ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 animate-pulse">
                      <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
                      Stage Handoff
                    </span>
                  ) : isEndingSoon ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/40 animate-pulse">
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      Wrapping Up
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  {isTransitioning ? (
                    <span className="text-cyan-300 truncate font-medium">
                      {nextUpItem
                        ? `Performance complete. Next up: "${nextUpItem.song.title}" (${nextSingerName || 'Next Singer'})`
                        : 'Performance complete. Wrapping up stage...'}
                    </span>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Stage Audience Cheer Buttons & Up Next */}
            <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
              {nextUpItem && (
                <div className="hidden md:flex flex-col items-end text-right pr-2 border-r border-white/10 max-w-[190px]">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 flex items-center gap-1 truncate w-full justify-end">
                    <span>Up Next</span>
                    <span className="text-slate-400 font-normal truncate">
                      &bull; {nextUpItem.song.title}
                    </span>
                  </span>
                  <span className="text-xs text-slate-300 font-medium truncate max-w-[160px]">
                    {nextSingerName || 'Next Performer'}
                  </span>
                </div>
              )}

              {/* Cheer Pills */}
              <div
                role="toolbar"
                aria-label="Audience cheer reactions"
                className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10"
              >
                {CHEER_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleCheer(emoji)}
                    className="w-11 h-11 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center hover:bg-white/15 rounded-xl text-lg sm:text-sm transition-all active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    title={`Cheer ${effectiveSingerName} with ${emoji}`}
                    aria-label={`Cheer ${effectiveSingerName} with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                {onOpenGiftSelector && (
                  <button
                    type="button"
                    onClick={onOpenGiftSelector}
                    className="w-11 h-11 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center hover:bg-pink-500/20 text-pink-300 hover:text-pink-200 rounded-xl transition-all active:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 border border-pink-500/30 ml-0.5"
                    title={`Send a virtual gift to ${effectiveSingerName}`}
                    aria-label={`Send a virtual gift to ${effectiveSingerName}`}
                  >
                    <Gift className="w-4 h-4 text-pink-300" />
                  </button>
                )}
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
