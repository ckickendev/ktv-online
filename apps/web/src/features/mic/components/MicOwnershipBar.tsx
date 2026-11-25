'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Crown,
  Eye,
  Info,
  X,
} from 'lucide-react';
import {
  MicOwnershipState,
  MicPendingRequestDto,
  MicSingerDto,
} from '@ktv/contracts';
import { MicActionStatus } from '../store/mic.store';
import { MicStatusIndicator } from './MicStatusIndicator';
import { MemberMicControls } from './MemberMicControls';
import { SingerControls } from './SingerControls';
import { HostMicRequestQueue } from './HostMicRequestQueue';
import { cn } from '@/lib/utils';

export interface MicOwnershipBarProps {
  state: MicOwnershipState;
  currentSinger: MicSingerDto | null;
  currentUserId?: string | null;
  pendingRequests: MicPendingRequestDto[];
  isInitialized: boolean;
  isLoading: boolean;
  isSocketRoomReady: boolean;
  isMember: boolean;
  isHost: boolean;
  isMuted: boolean;
  isCurrentSinger: boolean;
  myQueuePosition: number | null;
  isQueueFull: boolean;
  isVoiceConnected: boolean;
  isVoiceMuted: boolean;
  actionStatus: MicActionStatus;
  actingTargetUserId: string | null;
  canReleaseMic: boolean;
  canForceRelease: boolean;
  errorMessage: string | null;
  lastNotice: string | null;
  onRequestMic: () => void | Promise<boolean>;
  onCancelRequest: () => void | Promise<boolean>;
  onApproveRequest: (targetUserId: string) => void | Promise<boolean>;
  onRejectRequest: (targetUserId: string) => void | Promise<boolean>;
  onReleaseMic: () => void | Promise<boolean>;
  onForceReleaseMic: () => void | Promise<boolean>;
  onClearError?: () => void;
  onClearNotice?: () => void;
  className?: string;
}

export function MicOwnershipBar({
  state,
  currentSinger,
  currentUserId,
  pendingRequests,
  isInitialized,
  isLoading,
  isSocketRoomReady,
  isMember,
  isHost,
  isMuted,
  isCurrentSinger,
  myQueuePosition,
  isQueueFull,
  isVoiceConnected,
  isVoiceMuted,
  actionStatus,
  actingTargetUserId,
  canReleaseMic,
  canForceRelease,
  errorMessage,
  lastNotice,
  onRequestMic,
  onCancelRequest,
  onApproveRequest,
  onRejectRequest,
  onReleaseMic,
  onForceReleaseMic,
  onClearError,
  onClearNotice,
  className,
}: MicOwnershipBarProps) {
  const [isHostPanelOpen, setIsHostPanelOpen] = useState(true);

  return (
    <section
      aria-label="Official Stage Microphone"
      data-testid="mic-ownership-bar"
      className={cn(
        'rounded-2xl bg-[#090c17]/90 border border-white/10 backdrop-blur-md p-3 shadow-lg space-y-2.5 shrink-0',
        className
      )}
    >
      {/* Primary Status & Role Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <MicStatusIndicator
          state={state}
          currentSinger={currentSinger}
          pendingCount={pendingRequests.length}
          isInitialized={isInitialized}
          isLoading={isLoading}
        />

        <div className="flex items-center gap-2 flex-wrap">
          {isCurrentSinger ? (
            <SingerControls
              isSocketRoomReady={isSocketRoomReady}
              isVoiceConnected={isVoiceConnected}
              isVoiceMuted={isVoiceMuted}
              actionStatus={actionStatus}
              canReleaseMic={canReleaseMic}
              onReleaseMic={onReleaseMic}
            />
          ) : isMember ? (
            <MemberMicControls
              isSocketRoomReady={isSocketRoomReady}
              isMember={isMember}
              isMuted={isMuted}
              isCurrentSinger={isCurrentSinger}
              myQueuePosition={myQueuePosition}
              pendingCount={pendingRequests.length}
              isQueueFull={isQueueFull}
              actionStatus={actionStatus}
              onRequestMic={onRequestMic}
              onCancelRequest={onCancelRequest}
            />
          ) : (
            <span
              data-testid="mic-viewer-readonly-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] font-medium text-slate-400"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Viewer Mode • Join lounge for Stage Mic</span>
            </span>
          )}

          {isHost && (
            <button
              type="button"
              data-testid="mic-host-queue-toggle-btn"
              onClick={() => setIsHostPanelOpen((prev) => !prev)}
              aria-expanded={isHostPanelOpen}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-semibold text-amber-200 transition-colors"
            >
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              <span>Requests ({pendingRequests.length})</span>
              {isHostPanelOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Contextual Notice Banner */}
      {lastNotice && (
        <div
          data-testid="mic-ownership-notice"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Info className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="truncate">{lastNotice}</span>
          </div>
          {onClearNotice && (
            <button
              type="button"
              onClick={onClearNotice}
              aria-label="Dismiss Stage Mic notice"
              className="p-0.5 rounded hover:bg-white/10 text-cyan-300 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Error Feedback Banner */}
      {errorMessage && (
        <div
          aria-live="assertive"
          data-testid="mic-ownership-error"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          {onClearError && (
            <button
              type="button"
              onClick={onClearError}
              aria-label="Dismiss Stage Mic error"
              className="p-0.5 rounded hover:bg-white/10 text-rose-300 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Host Request Queue & Force-Release Panel */}
      {isHost && isHostPanelOpen && (
        <HostMicRequestQueue
          isHost={isHost}
          isSocketRoomReady={isSocketRoomReady}
          state={state}
          currentSinger={currentSinger}
          currentUserId={currentUserId}
          pendingRequests={pendingRequests}
          actionStatus={actionStatus}
          actingTargetUserId={actingTargetUserId}
          canForceRelease={canForceRelease}
          onApprove={onApproveRequest}
          onReject={onRejectRequest}
          onForceRelease={onForceReleaseMic}
        />
      )}
    </section>
  );
}
