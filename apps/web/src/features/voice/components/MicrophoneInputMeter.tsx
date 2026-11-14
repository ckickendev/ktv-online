'use client';

import React from 'react';
import { Mic, AlertTriangle, CheckCircle2, VolumeX, Sparkles } from 'lucide-react';
import { VocalInputLevelCategory } from '../hooks/use-microphone-tester';

export interface MicrophoneInputMeterProps {
  level: number; // 0 to 100
  peakLevel?: number; // 0 to 100
  category: VocalInputLevelCategory;
  isTesting: boolean;
  className?: string;
}

const TOTAL_SEGMENTS = 24;

export function MicrophoneInputMeter({
  level,
  peakLevel = 0,
  category,
  isTesting,
  className = '',
}: MicrophoneInputMeterProps) {
  const activeSegments = Math.round((level / 100) * TOTAL_SEGMENTS);
  const peakSegment = Math.min(TOTAL_SEGMENTS - 1, Math.round((peakLevel / 100) * TOTAL_SEGMENTS));

  const getStatusBadge = () => {
    if (!isTesting) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/5 border border-white/10 text-slate-400">
          <VolumeX className="w-3.5 h-3.5 text-slate-500" />
          <span>Meter Standby</span>
        </span>
      );
    }

    switch (category) {
      case 'peaking':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Peaking / Clipping</span>
          </span>
        );
      case 'optimal':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Optimal Vocal Level</span>
          </span>
        );
      case 'quiet':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300">
            <Mic className="w-3.5 h-3.5 text-amber-400" />
            <span>Quiet Input</span>
          </span>
        );
      case 'silent':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-500/15 border border-slate-500/30 text-slate-300">
            <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            <span>No Vocal Signal</span>
          </span>
        );
    }
  };

  const getGuidanceText = () => {
    if (!isTesting) {
      return 'Click "Test Microphone" to verify your voice input level before entering stage.';
    }

    switch (category) {
      case 'peaking':
        return 'Audio input is clipping! Step back from your microphone slightly or lower input volume in system settings.';
      case 'optimal':
        return 'Excellent vocal level! Your microphone captures clear, resonant voice ready for karaoke.';
      case 'quiet':
        return 'Signal is quiet. Move closer to the microphone, sing louder, or increase your input gain.';
      case 'silent':
      default:
        return 'No voice input detected. Sing or speak into your microphone to test response.';
    }
  };

  return (
    <div
      data-testid="microphone-input-meter"
      className={`p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3.5 ${className}`}
    >
      {/* Header with status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">Live Microphone Input Level</h4>
            <p className="text-[10px] text-slate-400">Real-time Web Audio vocal amplitude</p>
          </div>
        </div>

        {getStatusBadge()}
      </div>

      {/* 24-Segment VU Meter Bar */}
      <div className="space-y-1.5">
        <div className="h-5 p-1 rounded-xl bg-slate-950/80 border border-white/10 flex items-center gap-1">
          {Array.from({ length: TOTAL_SEGMENTS }).map((_, index) => {
            const isActive = isTesting && index < activeSegments;
            const isPeak = isTesting && index === peakSegment && peakSegment > 0;

            // Color coding segments:
            // 0 - 14 (Green / Emerald)
            // 15 - 19 (Cyan / Violet)
            // 20 - 23 (Amber / Rose - Peaking)
            let colorClass = 'bg-white/5';
            if (isActive || isPeak) {
              if (index >= 20) {
                colorClass = 'bg-rose-500 shadow-sm shadow-rose-500/60';
              } else if (index >= 15) {
                colorClass = 'bg-violet-400 shadow-sm shadow-violet-500/50';
              } else {
                colorClass = 'bg-emerald-400 shadow-sm shadow-emerald-500/50';
              }
            }

            return (
              <div
                key={index}
                className={`flex-1 h-full rounded-sm transition-all duration-75 ${colorClass} ${
                  isPeak ? 'ring-1 ring-white/80' : ''
                }`}
              />
            );
          })}
        </div>

        {/* Meter Legend */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-0.5">
          <span>-40 dB (Silent)</span>
          <span className="text-emerald-400/80 font-medium">Optimal Karaoke Zone</span>
          <span className="text-rose-400/80 font-medium">0 dB (Peak)</span>
        </div>
      </div>

      {/* Guidance Message Banner */}
      <div
        className={`px-3 py-2 rounded-xl text-xs flex items-start gap-2 transition-colors ${
          !isTesting
            ? 'bg-white/[0.03] text-slate-400 border border-white/5'
            : category === 'peaking'
            ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
            : category === 'optimal'
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
            : category === 'quiet'
            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
            : 'bg-white/5 text-slate-400 border border-white/5'
        }`}
      >
        {isTesting && category === 'optimal' ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        ) : isTesting && category === 'peaking' ? (
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        ) : (
          <Mic className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
        )}
        <p className="leading-relaxed text-[11px]">{getGuidanceText()}</p>
      </div>
    </div>
  );
}
