'use client';

import React from 'react';
import { Loader2, Mic2, MicOff, PhoneOff, PowerOff } from 'lucide-react';
import { MicActionStatus } from '../store/mic.store';
import { cn } from '@/lib/utils';

export interface SingerControlsProps {
  isSocketRoomReady: boolean;
  isVoiceConnected: boolean;
  isVoiceMuted: boolean;
  actionStatus: MicActionStatus;
  canReleaseMic: boolean;
  onReleaseMic: () => void | Promise<boolean>;
  className?: string;
}

export function SingerControls({
  isSocketRoomReady,
  isVoiceConnected,
  isVoiceMuted,
  actionStatus,
  canReleaseMic,
  onReleaseMic,
  className,
}: SingerControlsProps) {
  const isReleasing = actionStatus === 'releasing';
  const releaseDisabled = !isSocketRoomReady || !canReleaseMic || isReleasing;

  return (
    <div
      data-testid="singer-controls"
      className={cn('flex items-center gap-2 flex-wrap', className)}
    >
      <span
        data-testid="singer-hold-mic-badge"
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500/20 to-fuchsia-500/20 border border-amber-400/40 text-xs font-bold text-amber-200 shadow-sm"
      >
        <Mic2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
        <span>You Hold Stage Mic</span>
      </span>

      {!isVoiceConnected && (
        <span
          data-testid="singer-voice-disconnected-hint"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-[11px] font-medium text-cyan-200"
        >
          <PhoneOff className="w-3 h-3 text-cyan-300 shrink-0" />
          <span>Join Voice to transmit audio</span>
        </span>
      )}

      {isVoiceConnected && isVoiceMuted && (
        <span
          data-testid="singer-voice-muted-hint"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-medium text-amber-200"
        >
          <MicOff className="w-3 h-3 text-amber-300 shrink-0" />
          <span>Unmute Voice Mic</span>
        </span>
      )}

      <button
        type="button"
        data-testid="singer-release-mic-btn"
        onClick={() => {
          void onReleaseMic();
        }}
        disabled={releaseDisabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-semibold text-rose-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isReleasing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <PowerOff className="w-3.5 h-3.5" />
        )}
        <span>{isReleasing ? 'Releasing…' : 'Release Mic'}</span>
      </button>
    </div>
  );
}
