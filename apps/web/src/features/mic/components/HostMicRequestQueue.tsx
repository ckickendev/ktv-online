'use client';

import React from 'react';
import {
  Check,
  Crown,
  Info,
  Loader2,
  Mic2,
  PowerOff,
  X,
} from 'lucide-react';
import {
  MicOwnershipState,
  MicPendingRequestDto,
  MicSingerDto,
} from '@ktv/contracts';
import { UserAvatar } from '@/components/shared/user-avatar';
import { MicActionStatus } from '../store/mic.store';
import { cn } from '@/lib/utils';

export interface HostMicRequestQueueProps {
  isHost: boolean;
  isSocketRoomReady: boolean;
  state: MicOwnershipState;
  currentSinger: MicSingerDto | null;
  currentUserId?: string | null;
  pendingRequests: MicPendingRequestDto[];
  actionStatus: MicActionStatus;
  actingTargetUserId: string | null;
  canForceRelease: boolean;
  onApprove: (targetUserId: string) => void | Promise<boolean>;
  onReject: (targetUserId: string) => void | Promise<boolean>;
  onForceRelease: () => void | Promise<boolean>;
  className?: string;
}

export function HostMicRequestQueue({
  isHost,
  isSocketRoomReady,
  state,
  currentSinger,
  currentUserId,
  pendingRequests,
  actionStatus,
  actingTargetUserId,
  canForceRelease,
  onApprove,
  onReject,
  onForceRelease,
  className,
}: HostMicRequestQueueProps) {
  if (!isHost) {
    return null;
  }

  const isOccupied = state === 'OCCUPIED' && Boolean(currentSinger);
  const isBusy = actionStatus !== 'idle';
  const isForceReleasingCurrent =
    actionStatus === 'releasing' &&
    Boolean(currentSinger && actingTargetUserId === currentSinger.userId);
  const isHostAlsoSinger = Boolean(
    currentSinger && currentUserId && currentSinger.userId === currentUserId
  );

  return (
    <div
      data-testid="host-mic-request-queue"
      className={cn(
        'rounded-2xl bg-black/40 border border-white/10 p-3 space-y-2.5',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
          <Crown className="w-3.5 h-3.5 fill-amber-300/30" />
          <span>Host Stage Mic Controls</span>
        </div>
        <span className="text-[11px] text-slate-400">
          FIFO Queue ({pendingRequests.length})
        </span>
      </div>

      {/* Current Official Singer + Force Release */}
      {isOccupied && currentSinger && (
        <div
          data-testid="host-current-singer-card"
          className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex-wrap"
        >
          <div className="flex items-center gap-2 min-w-0">
            <UserAvatar
              name={currentSinger.displayName?.trim() || currentSinger.username}
              avatarUrl={currentSinger.avatar}
              size="sm"
              status="singing"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-white truncate">
                  {currentSinger.displayName?.trim() || currentSinger.username}
                </span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-200 border border-amber-500/30">
                  <Mic2 className="w-2.5 h-2.5" />
                  Official Singer
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                @{currentSinger.username}
              </p>
            </div>
          </div>

          {!isHostAlsoSinger && (
            <button
              type="button"
              data-testid="host-force-release-btn"
              onClick={() => {
                void onForceRelease();
              }}
              disabled={!canForceRelease}
              title="Force-release the current singer's Stage Mic session"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-semibold text-rose-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isForceReleasingCurrent ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PowerOff className="w-3.5 h-3.5" />
              )}
              <span>
                {isForceReleasingCurrent ? 'Releasing…' : 'Force Release'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Explanation when OCCUPIED */}
      {state === 'OCCUPIED' && pendingRequests.length > 0 && (
        <div
          data-testid="host-occupied-explanation"
          className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200"
        >
          <Info className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>
            The current singer must release the Stage Mic first before another
            request can be approved.
          </span>
        </div>
      )}

      {/* FIFO Pending Requests */}
      {pendingRequests.length === 0 ? (
        <p
          data-testid="host-mic-queue-empty"
          className="text-xs text-slate-400 py-1"
        >
          No pending Stage Mic requests right now.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {pendingRequests.map((req, idx) => {
            const position = idx + 1;
            const displayName = req.displayName?.trim() || req.username;
            const isApprovingRow =
              actionStatus === 'approving' && actingTargetUserId === req.userId;
            const isRejectingRow =
              actionStatus === 'rejecting' && actingTargetUserId === req.userId;
            const approveDisabled =
              !isSocketRoomReady || state === 'OCCUPIED' || isBusy;
            const rejectDisabled = !isSocketRoomReady || isBusy;

            return (
              <div
                key={req.requestId}
                data-testid={`host-mic-request-row-${req.userId}`}
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 border border-white/10"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    data-testid={`host-mic-request-pos-${req.userId}`}
                    className="px-1.5 py-0.5 rounded-md bg-violet-500/20 border border-violet-500/30 text-[10px] font-bold text-violet-200 shrink-0"
                  >
                    #{position}
                  </span>
                  <UserAvatar
                    name={displayName}
                    avatarUrl={req.avatar}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100 truncate">
                      {displayName}
                    </p>
                    {req.displayName && (
                      <p className="text-[10px] text-slate-400 truncate">
                        @{req.username}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid={`host-approve-mic-btn-${req.userId}`}
                    onClick={() => {
                      void onApprove(req.userId);
                    }}
                    disabled={approveDisabled}
                    title={
                      state === 'OCCUPIED'
                        ? 'Current singer must release the Stage Mic first'
                        : `Approve ${displayName} for Stage Mic`
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-[11px] font-semibold text-emerald-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isApprovingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>{isApprovingRow ? 'Approving…' : 'Approve'}</span>
                  </button>

                  <button
                    type="button"
                    data-testid={`host-reject-mic-btn-${req.userId}`}
                    onClick={() => {
                      void onReject(req.userId);
                    }}
                    disabled={rejectDisabled}
                    title={`Reject ${displayName}'s Stage Mic request`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/35 text-[11px] font-semibold text-slate-300 hover:text-rose-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRejectingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                    <span>{isRejectingRow ? 'Rejecting…' : 'Reject'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
