'use client';

import React from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  RotateCw,
  Square,
  Lock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlaybackStatus } from '@ktv/contracts';

interface PlaybackControlsProps {
  status: PlaybackStatus;
  currentPositionMs: number;
  durationMs: number;
  canControlPlayback: boolean;
  isMutating?: boolean;
  volume?: number;
  isMuted?: boolean;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  onStop: () => void;
  onSeek: (positionMs: number) => void;
  className?: string;
}

export function PlaybackControls({
  status,
  currentPositionMs,
  durationMs,
  canControlPlayback,
  isMutating = false,
  volume = 0.8,
  isMuted = false,
  onVolumeChange,
  onToggleMute,
  onPlay,
  onPause,
  onSkip,
  onStop,
  onSeek,
  className,
}: PlaybackControlsProps) {
  const isPlaying = status === 'playing';
  const isIdle = status === 'idle' || status === 'ended';

  const handleRewind = () => {
    if (!canControlPlayback) return;
    const newPos = Math.max(0, currentPositionMs - 10000);
    onSeek(newPos);
  };

  const handleForward = () => {
    if (!canControlPlayback) return;
    const newPos = Math.min(durationMs, currentPositionMs + 10000);
    onSeek(newPos);
  };

  const handleTogglePlay = () => {
    if (!canControlPlayback) return;
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  return (
    <div
      data-testid="karaoke-playback-controls"
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg',
        className
      )}
    >
      {/* Left: Authorization / Role indicator */}
      <div className="flex items-center gap-2 text-xs">
        {canControlPlayback ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Authoritative Controls
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-400 border border-white/5 text-[11px]"
            title="Only the host or current active singer can control playback"
          >
            <Lock className="w-3 h-3 text-slate-400" />
            Listener Mode
          </span>
        )}
      </div>

      {/* Center: Playback Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Rewind -10s */}
        <button
          type="button"
          onClick={handleRewind}
          disabled={!canControlPlayback || isIdle || isMutating}
          title="Rewind 10 seconds"
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-white/5 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Play / Pause Toggle */}
        <button
          type="button"
          data-testid="playback-toggle-button"
          onClick={handleTogglePlay}
          disabled={!canControlPlayback || isIdle || isMutating}
          title={isPlaying ? 'Pause playback' : 'Start playback'}
          className={cn(
            'p-3 rounded-xl active:scale-95 text-white transition-all shadow-md flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed',
            isPlaying
              ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/30'
              : 'bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 shadow-violet-600/30'
          )}
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
        </button>

        {/* Fast-Forward +10s */}
        <button
          type="button"
          onClick={handleForward}
          disabled={!canControlPlayback || isIdle || isMutating}
          title="Fast forward 10 seconds"
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-white/5 transition-all"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        {/* Stop Track */}
        <button
          type="button"
          onClick={onStop}
          disabled={!canControlPlayback || isIdle || isMutating}
          title="Stop playback"
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-white/5 transition-all"
        >
          <Square className="w-4 h-4" />
        </button>

        {/* Skip Track */}
        <button
          type="button"
          data-testid="playback-skip-button"
          onClick={onSkip}
          disabled={!canControlPlayback || isIdle || isMutating}
          title="Skip to next track"
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed border border-white/5 transition-all text-xs font-medium"
        >
          <SkipForward className="w-4 h-4" />
          <span className="hidden sm:inline">Skip</span>
        </button>
      </div>

      {/* Right: Backing Track Volume Slider & Status Badge */}
      <div className="flex items-center gap-3">
        {/* Independent Karaoke Backing Track Volume */}
        <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={onToggleMute}
            title={isMuted ? 'Unmute backing audio' : 'Mute backing audio'}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange?.(parseFloat(e.target.value))}
            title={`Backing audio volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-violet-400"
          />
        </div>

        {/* Server Playback Status */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              status === 'playing' && 'bg-emerald-400 animate-pulse',
              status === 'paused' && 'bg-amber-400',
              status === 'loading' && 'bg-cyan-400 animate-ping',
              status === 'idle' && 'bg-slate-500',
              status === 'error' && 'bg-rose-500'
            )}
          />
          <span className="capitalize font-mono text-[11px] text-slate-300">{status}</span>
        </div>
      </div>
    </div>
  );
}
