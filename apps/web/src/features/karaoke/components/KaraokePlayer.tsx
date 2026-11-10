'use client';

import React, { useRef, useState } from 'react';
import {
  Disc3,
  AlertCircle,
  Radio,
  Volume2,
  VolumeX,
  Mic2,
  Activity,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlaybackStateDto, RoomQueueItemDto, RoomQueueRequesterDto } from '@ktv/contracts';
import { CurrentSongPanel, formatMsToTime } from './CurrentSongPanel';
import { PlaybackControls } from './PlaybackControls';
import { SingerTurnIndicator } from './SingerTurnIndicator';
import { LyricsStage } from './LyricsStage';
import { useKaraokeAudio } from '../hooks/use-karaoke-audio';
import { KaraokeEqPreset } from '../services/karaoke-equalizer';

interface KaraokePlayerProps {
  playback: PlaybackStateDto | undefined;
  currentPositionMs: number;
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
  canControlPlayback: boolean;
  isMutating?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  onStop: () => void;
  onSeek: (positionMs: number) => void;
  onOpenSearch?: () => void;
  onOpenEqSettings?: () => void;
  currentEqPreset?: KaraokeEqPreset;
  className?: string;
}

export function KaraokePlayer({
  playback,
  currentPositionMs,
  isCurrentSinger,
  isNextUpSinger,
  currentSingerName,
  currentSinger,
  currentRequester,
  nextUpItem,
  nextSinger,
  nextRequester,
  performerState,
  isSingerSpeaking,
  isSingerVoiceConnected,
  isSingerMuted,
  canControlPlayback,
  isMutating = false,
  onPlay,
  onPause,
  onSkip,
  onStop,
  onSeek,
  onOpenSearch,
  onOpenEqSettings,
  currentEqPreset,
  className,
}: KaraokePlayerProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [stageView, setStageView] = useState<'lyrics' | 'visualizer'>('lyrics');

  // Authoritative Audio Engine Hook
  const {
    executionState,
    isBuffering,
    isAutoplayBlocked,
    audioError,
    volume,
    isMuted,
    isAudioAvailable,
    driftMs,
    unlockAutoplay,
    setVolume,
    toggleMute,
    retryAudioLoad,
  } = useKaraokeAudio({
    playback,
    currentPositionMs,
    enabled: true,
  });

  const currentItem = playback?.currentItem || null;
  const status = playback?.status || 'idle';
  const durationMs = currentItem?.song?.durationMs || 1;
  const progressRatio = Math.min(1, Math.max(0, currentPositionMs / durationMs));
  const progressPercent = (progressRatio * 100).toFixed(2);

  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isIdle = status === 'idle' || status === 'ended';

  // Handle click on progress bar for seeking
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canControlPlayback || !currentItem || isIdle) return;
    if (!progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetMs = Math.floor(ratio * durationMs);
    onSeek(targetMs);
  };

  return (
    <div
      data-testid="karaoke-player-container"
      className={cn('flex flex-col gap-3 w-full', className)}
    >
      {/* Singer Turn Alert / Status Indicator */}
      <SingerTurnIndicator
        isCurrentSinger={isCurrentSinger}
        isNextUpSinger={isNextUpSinger}
        currentSingerName={currentSingerName}
        currentSinger={currentSinger}
        currentRequester={currentRequester}
        nextUpItem={nextUpItem}
        nextSinger={nextSinger}
        nextRequester={nextRequester}
        performerState={performerState}
        isSingerSpeaking={isSingerSpeaking}
        isSingerVoiceConnected={isSingerVoiceConnected}
        isSingerMuted={isSingerMuted}
        onOpenSearch={onOpenSearch}
      />

      {/* Autoplay Blocked Notification Banner */}
      {isAutoplayBlocked && (
        <div
          data-testid="autoplay-blocked-banner"
          className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-200 text-xs shadow-lg animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <VolumeX className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium">
              Audio autoplay blocked by browser. Click to unmute backing track.
            </span>
          </div>
          <button
            type="button"
            data-testid="autoplay-unlock-button"
            onClick={unlockAutoplay}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-transform active:scale-95 shadow-md shadow-amber-950/40 shrink-0"
          >
            Listen to Backing Track
          </button>
        </div>
      )}

      {/* Audio Reconnecting Banner */}
      {executionState === 'reconnecting' && (
        <div
          data-testid="audio-reconnecting-banner"
          className="flex items-center gap-2 p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs shadow-lg animate-in fade-in"
        >
          <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
          <span>Reconnecting audio stream... Attempting automatic recovery.</span>
        </div>
      )}

      {/* Audio Loading Error Banner */}
      {audioError && isAudioAvailable && (
        <div
          data-testid="audio-load-error-banner"
          className="flex items-center justify-between p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs shadow-lg"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Audio stream failed to load ({audioError})</span>
          </div>
          <button
            type="button"
            onClick={retryAudioLoad}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] transition-colors"
          >
            Retry Audio
          </button>
        </div>
      )}

      {/* Main Virtual Karaoke Stage Screen */}
      <div
        data-testid="karaoke-stage-surface"
        className="relative rounded-2xl bg-[#030408] border border-violet-500/20 overflow-hidden shadow-2xl flex flex-col justify-between p-5 min-h-[380px] group transition-all"
      >
        {/* Stage Ambient Glow Effect */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Screen Top Status Bar */}
        <div className="flex items-center justify-between text-xs text-slate-400 relative z-10">
          <div className="flex items-center gap-2">
            {isPlaying ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/25 font-bold uppercase tracking-wider text-[10px]">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                ON AIR
              </span>
            ) : isPaused ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25 font-bold uppercase tracking-wider text-[10px]">
                PAUSED
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5 font-semibold text-[10px]">
                STANDBY
              </span>
            )}

            {executionState === 'reconnecting' ? (
              <span className="flex items-center gap-1 text-[11px] text-cyan-300 font-medium">
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                Reconnecting...
              </span>
            ) : isBuffering && isPlaying ? (
              <span className="flex items-center gap-1 text-[11px] text-amber-300 font-medium">
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                Buffering...
              </span>
            ) : null}

            <span className="hidden sm:inline text-slate-500 text-[11px]">
              &bull; Server Version: v{playback?.playbackVersion ?? 1}
            </span>

            {isPlaying && (
              <span
                data-testid="sync-drift-indicator"
                className="hidden lg:inline text-[10px] text-slate-500 font-mono"
                title="Authoritative clock synchronization drift"
              >
                &bull; Drift: {driftMs > 0 ? `+${driftMs}` : driftMs}ms
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {/* View Switcher: Lyrics vs Visualizer */}
            {currentItem && (
              <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10">
                <button
                  type="button"
                  data-testid="stage-view-lyrics-button"
                  onClick={() => setStageView('lyrics')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors',
                    stageView === 'lyrics'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  )}
                  title="Switch to Timed Lyrics Stage"
                >
                  <Mic2 className="w-3 h-3" />
                  <span>Lyrics</span>
                </button>
                <button
                  type="button"
                  data-testid="stage-view-visualizer-button"
                  onClick={() => setStageView('visualizer')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors',
                    stageView === 'visualizer'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  )}
                  title="Switch to Audio Wave Visualizer"
                >
                  <Activity className="w-3 h-3" />
                  <span>Wave</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <Radio className={cn('w-3.5 h-3.5', isPlaying && 'text-cyan-400 animate-pulse')} />
              <span className="hidden md:inline">Authoritative Sync Engine</span>
            </div>
          </div>
        </div>

        {/* Central Stage Area: Either LyricsStage or Visualizer */}
        <div className="my-auto py-4 relative z-10 w-full">
          {currentItem ? (
            stageView === 'lyrics' ? (
              <LyricsStage
                songId={currentItem.song.id}
                currentPositionMs={currentPositionMs}
                isPlaying={isPlaying}
                className="max-h-[220px]"
              />
            ) : (
              /* Visualizer Mode */
              <div className="text-center space-y-4 py-4">
                <div className="flex items-center justify-center gap-1.5 h-12 mb-2">
                  {[40, 75, 55, 90, 65, 100, 80, 50, 85, 60, 95, 70, 45, 80, 60].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        height: isPlaying ? `${h}%` : '20%',
                        animationDelay: `${(i * 0.08).toFixed(2)}s`,
                      }}
                      className={cn(
                        'w-1.5 rounded-full transition-all duration-300',
                        isPlaying
                          ? 'bg-gradient-to-t from-violet-600 via-fuchsia-500 to-cyan-400 animate-pulse'
                          : 'bg-white/10'
                      )}
                    />
                  ))}
                </div>

                <div className="inline-block p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-violet-600/15 via-cyan-500/10 to-violet-600/15 border border-violet-500/30 shadow-inner max-w-xl mx-auto">
                  <p className="text-xl sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-300 via-white to-cyan-300 tracking-wide truncate">
                    {currentItem.song.title}
                  </p>
                  <p className="text-sm font-medium text-slate-300 mt-1">
                    {currentItem.song.artist}
                  </p>
                </div>

                <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-slate-500" />
                  <span>
                    Synchronized backing audio player &bull; Native browser HTMLAudioElement
                  </span>
                </p>
              </div>
            )
          ) : (
            /* Empty Stage Callout */
            <div className="space-y-3 py-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center shadow-lg">
                <Disc3 className="w-8 h-8 text-violet-400/80" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Stage is Waiting for You</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Pick a track from the song catalog to start the performance.
                </p>
              </div>
              {onOpenSearch && (
                <button
                  type="button"
                  data-testid="stage-open-catalog-button"
                  onClick={onOpenSearch}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-md shadow-violet-600/30 transition-all active:scale-95"
                >
                  Browse Song Catalog
                </button>
              )}
            </div>
          )}
        </div>

        {/* Screen Bottom: Track Progress & Timeline Slider */}
        <div className="space-y-2 relative z-10">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>{formatMsToTime(currentPositionMs)}</span>
            <span className="text-[11px] text-slate-500">
              {currentItem ? `${progressPercent}%` : '0:00'}
            </span>
            <span>{currentItem ? formatMsToTime(durationMs) : '00:00'}</span>
          </div>

          {/* Interactive Seekable Progress Bar */}
          <div
            ref={progressBarRef}
            onClick={handleProgressBarClick}
            data-testid="karaoke-progress-bar"
            className={cn(
              'w-full bg-white/10 rounded-full h-2 overflow-hidden relative transition-all',
              canControlPlayback && currentItem && !isIdle ? 'cursor-pointer hover:h-2.5' : 'cursor-default'
            )}
            title={canControlPlayback && currentItem ? 'Click to seek playback position' : undefined}
          >
            <div
              style={{ width: `${progressPercent}%` }}
              className={cn(
                'h-full rounded-full transition-all duration-100',
                isPlaying
                  ? 'bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-400'
                  : 'bg-amber-400'
              )}
            />
          </div>
        </div>

        {/* Error overlay if playback encountered a server error */}
        {status === 'error' && (
          <div
            data-testid="playback-error-banner"
            className="absolute inset-0 bg-black/85 backdrop-blur-sm p-6 flex flex-col items-center justify-center gap-3 text-center z-20"
          >
            <AlertCircle className="w-10 h-10 text-rose-500 animate-bounce" />
            <div>
              <h4 className="text-sm font-bold text-white">Playback Error Occurred</h4>
              <p className="text-xs text-rose-300 mt-1 max-w-sm">
                The current track encountered an issue and could not continue.
              </p>
            </div>
            {canControlPlayback && (
              <button
                type="button"
                onClick={onSkip}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-rose-900/50"
              >
                Skip to Next Song
              </button>
            )}
          </div>
        )}
      </div>

      {/* Current Song Details Panel */}
      <CurrentSongPanel item={currentItem} isPlaying={isPlaying} />

      {/* Authoritative Playback Controls with Independent Backing Audio Controls & EQ trigger */}
      <PlaybackControls
        status={status}
        currentPositionMs={currentPositionMs}
        durationMs={durationMs}
        canControlPlayback={canControlPlayback}
        isMutating={isMutating}
        volume={volume}
        isMuted={isMuted}
        onVolumeChange={setVolume}
        onToggleMute={toggleMute}
        onPlay={onPlay}
        onPause={onPause}
        onSkip={onSkip}
        onStop={onStop}
        onSeek={onSeek}
        onOpenEqSettings={onOpenEqSettings}
        currentEqPreset={currentEqPreset}
      />
    </div>
  );
}
