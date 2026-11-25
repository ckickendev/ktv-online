'use client';

import React from 'react';
import { Clock, Hand, Loader2, MicOff, X } from 'lucide-react';
import {
  MAX_PENDING_MIC_REQUESTS,
  MicActionStatus,
} from '../store/mic.store';
import { cn } from '@/lib/utils';

export interface MemberMicControlsProps {
  isSocketRoomReady: boolean;
  isMember: boolean;
  isMuted: boolean;
  isCurrentSinger: boolean;
  myQueuePosition: number | null;
  pendingCount: number;
  isQueueFull: boolean;
  actionStatus: MicActionStatus;
  onRequestMic: () => void | Promise<boolean>;
  onCancelRequest: () => void | Promise<boolean>;
  className?: string;
}

export function MemberMicControls({
  isSocketRoomReady,
  isMember,
  isMuted,
  isCurrentSinger,
  myQueuePosition,
  pendingCount,
  isQueueFull,
  actionStatus,
  onRequestMic,
  onCancelRequest,
  className,
}: MemberMicControlsProps) {
  if (isCurrentSinger) {
    return null;
  }

  const isRequesting = actionStatus === 'requesting';
  const isCancelling = actionStatus === 'cancelling';
  const isBusy = actionStatus !== 'idle';

  // Member already has an active pending Stage Mic request
  if (myQueuePosition !== null) {
    const cancelDisabled = !isSocketRoomReady || !isMember || isBusy;

    return (
      <div
        data-testid="member-mic-controls"
        className={cn('flex items-center gap-2 flex-wrap', className)}
      >
        <span
          data-testid="mic-waiting-position"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-semibold text-amber-200"
        >
          <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>Waiting for Host (#{myQueuePosition})</span>
        </span>

        <button
          type="button"
          data-testid="mic-cancel-request-btn"
          onClick={() => {
            void onCancelRequest();
          }}
          disabled={cancelDisabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/35 text-xs font-semibold text-slate-200 hover:text-rose-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCancelling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-300" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          <span>{isCancelling ? 'Cancelling…' : 'Cancel Request'}</span>
        </button>
      </div>
    );
  }

  const requestDisabled =
    !isSocketRoomReady ||
    !isMember ||
    isMuted ||
    isCurrentSinger ||
    isQueueFull ||
    isBusy;

  let disabledReason: string | undefined;
  if (!isMember) {
    disabledReason = 'Join the lounge as a member to request the Stage Mic';
  } else if (!isSocketRoomReady) {
    disabledReason = 'Connecting to lounge realtime channel…';
  } else if (isMuted) {
    disabledReason = 'You cannot request the Stage Mic while muted in the lounge';
  } else if (isQueueFull) {
    disabledReason = `Stage Mic queue is full (${MAX_PENDING_MIC_REQUESTS}/${MAX_PENDING_MIC_REQUESTS})`;
  }

  return (
    <div
      data-testid="member-mic-controls"
      className={cn('flex items-center gap-2 flex-wrap', className)}
    >
      {isMuted && (
        <span
          data-testid="mic-member-muted-indicator"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] font-semibold text-rose-300"
        >
          <MicOff className="w-3 h-3 shrink-0" />
          <span>Muted in Lounge</span>
        </span>
      )}

      {!isMuted && isQueueFull && (
        <span
          data-testid="mic-queue-full-indicator"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-300"
        >
          <span>
            Queue Full ({pendingCount}/{MAX_PENDING_MIC_REQUESTS})
          </span>
        </span>
      )}

      <button
        type="button"
        data-testid="mic-request-btn"
        onClick={() => {
          void onRequestMic();
        }}
        disabled={requestDisabled}
        title={disabledReason || 'Request official Stage Mic'}
        className={cn(
          'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
          requestDisabled
            ? 'bg-white/5 border border-white/10 text-slate-400 opacity-60 cursor-not-allowed'
            : 'bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-md shadow-violet-950/50 active:scale-95'
        )}
      >
        {isRequesting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Hand className="w-3.5 h-3.5" />
        )}
        <span>
          {isRequesting
            ? 'Requesting…'
            : isQueueFull
            ? 'Queue Full'
            : 'Request Stage Mic'}
        </span>
      </button>
    </div>
  );
}
