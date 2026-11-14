'use client';

import React, { useState } from 'react';
import { useFriendActivity } from '../hooks/use-friend-activity';
import { FriendActivityCard } from './friend-activity-card';
import { PendingInvitationsInbox } from './pending-invitations-inbox';
import { StartSocialSessionDialog } from './start-social-session-dialog';
import {
  Mic2,
  Radio,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Users,
  UserPlus,
  Loader2,
} from 'lucide-react';

interface FriendActivitySectionProps {
  onFindPeopleClick?: () => void;
}

export function FriendActivitySection({ onFindPeopleClick }: FriendActivitySectionProps) {
  const { items, groups, stats, isLoading, isError, refetch } = useFriendActivity();
  const [showOfflineFriends, setShowOfflineFriends] = useState(false);
  const [isStarterOpen, setIsStarterOpen] = useState(false);
  const [starterFriendId, setStarterFriendId] = useState<string | undefined>(undefined);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        <span className="text-sm font-medium">Syncing friend activity and lounges...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-500/20 text-center space-y-3">
        <p className="text-sm text-rose-300">Unable to load friend activity at this time.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-rose-600/30 hover:bg-rose-600/40 text-rose-200 text-xs font-semibold transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Zero friends overall
  if (stats.totalFriends === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center rounded-3xl bg-white/[0.02] border border-white/5 p-8">
        <div className="w-14 h-14 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-violet-400" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">Your Friends List is Empty</h3>
        <p className="text-xs text-slate-400 max-w-sm mb-6">
          Karaoke is always more fun together. Search for other singers across KTVOnline and invite them to sing.
        </p>
        {onFindPeopleClick && (
          <button
            type="button"
            onClick={onFindPeopleClick}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/25 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Find People</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Section A — Friend Activity Header & Aggregated Badges */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-violet-950/30 via-white/[0.02] to-fuchsia-950/20 border border-white/10 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Friend Activity</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              See who&apos;s around and join the next karaoke night.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {/* Start a Session CTA */}
            <button
              type="button"
              onClick={() => {
                setStarterFriendId(undefined);
                setIsStarterOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-bold shadow-md shadow-violet-600/25 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Start a Session</span>
            </button>
          </div>
        </div>

        {/* Aggregate counts */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-xs font-semibold text-fuchsia-300">
            <Mic2 className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>{stats.singingCount} Singing Now</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-300">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>{stats.inLoungeCount} In a Lounge</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{stats.onlineCount} Available Online</span>
          </div>
        </div>
      </div>

      {/* Section 7 — Pending Invitations Inbox */}
      <PendingInvitationsInbox />

      {/* Section B — Singing Now (Highest Visual Prominence) */}
      {groups.singingNow.length > 0 && (
        <section aria-labelledby="singing-now-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-600 to-violet-600 p-0.5 shadow-md shadow-fuchsia-600/30">
              <div className="w-full h-full bg-[#120a1f] rounded-[6px] flex items-center justify-center">
                <Mic2 className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" />
              </div>
            </div>
            <h3 id="singing-now-heading" className="text-sm font-bold text-white tracking-wide uppercase">
              Singing Now
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 text-xs font-bold">
              {groups.singingNow.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {groups.singingNow.map((friendship) => (
              <FriendActivityCard
                key={friendship.id}
                friendship={friendship}
                section="singing"
              />
            ))}
          </div>
        </section>
      )}

      {/* Section C — In Lounges */}
      {groups.inLounges.length > 0 && (
        <section aria-labelledby="in-lounges-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <h3 id="in-lounges-heading" className="text-sm font-semibold text-white tracking-wide">
              In a Lounge
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold">
              {groups.inLounges.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {groups.inLounges.map((friendship) => (
              <FriendActivityCard
                key={friendship.id}
                friendship={friendship}
                section="lounge"
              />
            ))}
          </div>
        </section>
      )}

      {/* Section D — Available Online */}
      {groups.availableOnline.length > 0 && (
        <section aria-labelledby="available-online-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <h3 id="available-online-heading" className="text-sm font-semibold text-white tracking-wide">
              Available Online
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
              {groups.availableOnline.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {groups.availableOnline.map((friendship) => (
              <FriendActivityCard
                key={friendship.id}
                friendship={friendship}
                section="online"
                onInviteToSession={(friendId) => {
                  setStarterFriendId(friendId);
                  setIsStarterOpen(true);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* No Active Friends Prompt (when user has friends, but all are offline) */}
      {!stats.hasActiveFriends && (
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-white">No Friends Currently Active</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            None of your friends are currently singing or in lounges. You can explore public lounges or invite friends when they come online!
          </p>
        </div>
      )}

      {/* Section E — Offline Friends (Collapsible) */}
      {groups.offline.length > 0 && (
        <section aria-labelledby="offline-friends-heading" className="space-y-3 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowOfflineFriends((prev) => !prev)}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 text-slate-400 hover:text-white transition-all text-left"
          >
            <div className="flex items-center gap-2">
              <Circle className="w-2.5 h-2.5 fill-slate-500 text-slate-500" />
              <h3 id="offline-friends-heading" className="text-xs sm:text-sm font-medium">
                Offline Friends
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-white/5 text-[11px] font-semibold">
                {groups.offline.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>{showOfflineFriends ? 'Hide' : 'Show'}</span>
              {showOfflineFriends ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {showOfflineFriends && (
            <div className="grid grid-cols-1 gap-2.5 pt-1 animate-in fade-in duration-200">
              {groups.offline.map((friendship) => (
                <FriendActivityCard
                  key={friendship.id}
                  friendship={friendship}
                  section="offline"
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Social Session Starter Dialog */}
      <StartSocialSessionDialog
        isOpen={isStarterOpen}
        onClose={() => setIsStarterOpen(false)}
        friends={items}
        initialFriendId={starterFriendId}
      />
    </div>
  );
}
