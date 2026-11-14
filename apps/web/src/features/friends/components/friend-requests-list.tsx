'use client';

import React, { useState } from 'react';
import {
  useIncomingRequests,
  useOutgoingRequests,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useCancelFriendRequest,
} from '../hooks/use-friends';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Check, X, Loader2, ArrowUpRight, ArrowDownLeft, Clock, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FriendRequestsList() {
  const [subTab, setSubTab] = useState<'incoming' | 'outgoing'>('incoming');

  const { data: incomingData, isLoading: isLoadingIncoming } = useIncomingRequests();
  const { data: outgoingData, isLoading: isLoadingOutgoing } = useOutgoingRequests();

  const acceptMutation = useAcceptFriendRequest();
  const declineMutation = useDeclineFriendRequest();
  const cancelMutation = useCancelFriendRequest();

  const incomingCount = incomingData?.total ?? 0;
  const outgoingCount = outgoingData?.total ?? 0;

  return (
    <div className="space-y-5">
      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setSubTab('incoming')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
            subTab === 'incoming'
              ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          <span>Received</span>
          {incomingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-violet-500 text-white text-[10px] font-bold">
              {incomingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('outgoing')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
            subTab === 'outgoing'
              ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span>Sent</span>
          {outgoingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300 text-[10px] font-semibold">
              {outgoingCount}
            </span>
          )}
        </button>
      </div>

      {/* Sub Tab: Incoming Requests */}
      {subTab === 'incoming' && (
        <div>
          {isLoadingIncoming ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span className="text-xs">Loading incoming requests...</span>
            </div>
          ) : incomingData?.items && incomingData.items.length > 0 ? (
            <div className="space-y-3">
              {incomingData.items.map((request) => {
                const requester = request.requester;
                const isAccepting = acceptMutation.isPending;
                const isDeclining = declineMutation.isPending;

                return (
                  <div
                    key={request.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-500/30 transition-all gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <UserAvatar
                        name={requester.displayName || requester.username}
                        avatarUrl={requester.avatar}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm text-slate-100 truncate">
                            {requester.displayName || requester.username}
                          </h4>
                          <span className="text-xs text-slate-400 truncate">@{requester.username}</span>
                        </div>
                        {requester.bio && (
                          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{requester.bio}</p>
                        )}
                        <span className="text-[10px] text-slate-500 mt-1 block">
                          Sent {new Date(request.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => acceptMutation.mutate(request.id)}
                        disabled={isAccepting || isDeclining}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/20 transition-all disabled:opacity-50"
                      >
                        {isAccepting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Accept</span>
                      </button>

                      <button
                        onClick={() => declineMutation.mutate(request.id)}
                        disabled={isAccepting || isDeclining}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium transition-all disabled:opacity-50"
                      >
                        {isDeclining ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <Inbox className="w-10 h-10 mb-3 text-slate-600" />
              <p className="text-sm font-medium text-slate-400">No incoming friend requests</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                When people want to connect with you to sing together, their requests will appear here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sub Tab: Outgoing Requests */}
      {subTab === 'outgoing' && (
        <div>
          {isLoadingOutgoing ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span className="text-xs">Loading sent requests...</span>
            </div>
          ) : outgoingData?.items && outgoingData.items.length > 0 ? (
            <div className="space-y-3">
              {outgoingData.items.map((request) => {
                const addressee = request.addressee;
                const isCancelling = cancelMutation.isPending;

                return (
                  <div
                    key={request.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-500/30 transition-all gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <UserAvatar
                        name={addressee.displayName || addressee.username}
                        avatarUrl={addressee.avatar}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm text-slate-100 truncate">
                            {addressee.displayName || addressee.username}
                          </h4>
                          <span className="text-xs text-slate-400 truncate">@{addressee.username}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-amber-400/90">
                          <Clock className="w-3 h-3" />
                          <span>Pending response</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => cancelMutation.mutate(request.id)}
                        disabled={isCancelling}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 text-xs font-medium transition-all disabled:opacity-50"
                      >
                        {isCancelling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        <span>Cancel Request</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <Clock className="w-10 h-10 mb-3 text-slate-600" />
              <p className="text-sm font-medium text-slate-400">No sent requests pending</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Use the Find People tab to search for karaoke friends and send them a request.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
