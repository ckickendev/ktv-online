'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Radio, Lock, LogIn, Music2, ChevronRight } from 'lucide-react';
import { useFriendActivity } from '../hooks/use-friend-activity';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PresenceStatusBadge } from './presence-status-badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

export function FriendsLiveBar() {
  const { isAuthenticated } = useAuth();
  const { groups, stats, isLoading, isError } = useFriendActivity();

  // Prioritize: Singing Now -> In a Lounge
  const activeFriends = useMemo(() => {
    if (!isAuthenticated) return [];
    return [...groups.singingNow, ...groups.inLounges];
  }, [isAuthenticated, groups.singingNow, groups.inLounges]);

  // If not authenticated, or no active friends in lounges/singing, collapse cleanly
  if (!isAuthenticated || isLoading || isError || activeFriends.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Friends currently singing and in lounges"
      className="mb-8 p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-violet-950/40 via-white/[0.02] to-fuchsia-950/30 border border-white/10 shadow-lg animate-in fade-in duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-600 p-0.5 shadow-md shadow-fuchsia-600/20">
            <div className="w-full h-full bg-[#120a1f] rounded-[10px] flex items-center justify-center">
              <Radio className="w-4 h-4 text-fuchsia-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Friends Live Now
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 text-[11px] font-bold">
                {stats.singingCount + stats.inLoungeCount}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Your friends are performing and hanging out in lounges.
            </p>
          </div>
        </div>

        <Link
          href="/friends"
          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors shrink-0"
        >
          <span>View All Activity</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Horizontal Scrollable Friend Cards Strip */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none focus:outline-none">
        {activeFriends.map((friendship) => {
          const friend = friendship.friend;
          const presence = friend.presence;
          const isSinging = presence?.status === 'singing';
          const isPrivate = Boolean(presence?.isPrivateLounge);
          const canJoin = Boolean(presence?.roomId) && !isPrivate;

          return (
            <div
              key={friendship.id}
              className={cn(
                'flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all shrink-0 min-w-[280px] sm:min-w-[320px] max-w-[360px] select-none',
                isSinging
                  ? 'bg-gradient-to-r from-fuchsia-950/30 via-[#131126] to-violet-950/20 border-fuchsia-500/30 shadow-md shadow-fuchsia-950/20'
                  : 'bg-white/[0.025] border-cyan-500/20 hover:border-cyan-500/35'
              )}
            >
              {/* Avatar & Identifiers */}
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatar
                  name={friend.displayName || friend.username}
                  avatarUrl={friend.avatar}
                  status={isSinging ? 'singing' : 'idle'}
                  size="md"
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-100 truncate">
                      {friend.displayName || friend.username}
                    </span>
                    {friend.displayName && (
                      <span className="text-[10px] text-slate-400 truncate hidden sm:inline">
                        @{friend.username}
                      </span>
                    )}
                  </div>

                  {/* Presence Status & Context */}
                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <PresenceStatusBadge presence={presence} className="scale-75 origin-left" />

                    {/* Song details for singing friend */}
                    {isSinging && presence?.songTitle && !isPrivate && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300 font-medium truncate max-w-[140px]">
                        <Music2 className="w-3 h-3 text-fuchsia-400 shrink-0" />
                        <span className="truncate">{presence.songTitle}</span>
                      </span>
                    )}

                    {/* Private room protection: never expose title or details */}
                    {isPrivate ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                        <span>Private</span>
                      </span>
                    ) : (
                      presence?.roomTitle &&
                      !isSinging && (
                        <span className="text-[11px] text-cyan-300 font-medium truncate max-w-[130px]">
                          {presence.roomTitle}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="shrink-0">
                {canJoin ? (
                  <Link
                    href={`/rooms/${presence?.roomId}`}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm min-h-[36px] sm:min-h-[38px]',
                      isSinging
                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-fuchsia-600/25'
                        : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/30'
                    )}
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Join Lounge</span>
                  </Link>
                ) : (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[11px] text-slate-500">
                    <Lock className="w-3 h-3" />
                    <span>Private</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
