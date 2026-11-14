'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FriendshipDto } from '@ktv/contracts';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PresenceStatusBadge } from './presence-status-badge';
import { useRemoveFriend } from '../hooks/use-friends';
import { LogIn, Lock, Music2, UserMinus, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FriendActivityCardProps {
  friendship: FriendshipDto;
  section: 'singing' | 'lounge' | 'online' | 'offline';
  onInviteToSession?: (friendId: string) => void;
}

export function FriendActivityCard({
  friendship,
  section,
  onInviteToSession,
}: FriendActivityCardProps) {
  const [showConfirmUnfriend, setShowConfirmUnfriend] = useState(false);
  const removeFriendMutation = useRemoveFriend();

  const friend = friendship.friend;
  const presence = friend.presence;

  const avatarStatus =
    presence?.status === 'singing'
      ? 'singing'
      : presence?.status === 'in_lounge'
      ? 'idle'
      : presence?.status === 'online'
      ? 'online'
      : 'offline';

  const handleUnfriend = async () => {
    try {
      await removeFriendMutation.mutateAsync(friend.id);
      setShowConfirmUnfriend(false);
    } catch (err) {
      console.error('Failed to remove friend:', err);
    }
  };

  const isSinging = section === 'singing';
  const isInLounge = section === 'lounge';
  const isOnline = section === 'online';
  const isOffline = section === 'offline';

  const canJoinPublicLounge =
    (isSinging || isInLounge) &&
    Boolean(presence?.roomId) &&
    !presence?.isPrivateLounge;

  return (
    <div
      className={cn(
        'group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl transition-all gap-4',
        isSinging &&
          'bg-gradient-to-r from-fuchsia-950/25 via-[#121226] to-violet-950/25 border border-fuchsia-500/30 hover:border-fuchsia-400/50 shadow-lg shadow-fuchsia-950/20',
        isInLounge &&
          'bg-white/[0.03] border border-cyan-500/20 hover:border-cyan-500/40 shadow-sm',
        isOnline &&
          'bg-white/[0.02] border border-white/10 hover:border-emerald-500/30 shadow-sm',
        isOffline &&
          'bg-white/[0.015] border border-white/5 opacity-80 hover:opacity-100 hover:border-white/10'
      )}
    >
      {/* Friend info & presence */}
      <div className="flex items-center gap-3.5 min-w-0">
        <UserAvatar
          name={friend.displayName || friend.username}
          avatarUrl={friend.avatar}
          status={avatarStatus}
          size={isSinging ? 'lg' : 'md'}
        />

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm sm:text-base text-slate-100 truncate">
              {friend.displayName || friend.username}
            </h4>
            {friend.displayName && (
              <span className="text-xs text-slate-400 truncate">@{friend.username}</span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <PresenceStatusBadge presence={presence} />

            {/* Song details for singing section */}
            {isSinging && presence?.songTitle && (
              <span className="inline-flex items-center gap-1 text-xs text-fuchsia-300 font-medium truncate max-w-[220px]">
                <Music2 className="w-3 h-3 text-fuchsia-400 shrink-0" />
                <span className="truncate">{presence.songTitle}</span>
              </span>
            )}

            {/* Room information if in lounge */}
            {isInLounge && presence?.isPrivateLounge && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <Lock className="w-3 h-3 text-cyan-400" />
                <span>Private Lounge</span>
              </span>
            )}

            {/* Bio for online or offline if available */}
            {(isOnline || isOffline) && friend.bio && (
              <p className="text-xs text-slate-400 line-clamp-1 max-w-[260px]">
                {friend.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        {/* Join Lounge CTA for public rooms */}
        {canJoinPublicLounge && (
          <Link
            href={`/rooms/${presence?.roomId}`}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-sm',
              isSinging
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-fuchsia-600/20'
                : 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 shadow-violet-600/20'
            )}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Join Lounge</span>
          </Link>
        )}

        {/* Private room indicator button */}
        {(isSinging || isInLounge) && presence?.isPrivateLounge && (
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Private</span>
          </div>
        )}

        {/* Invite CTA for online friends */}
        {isOnline && onInviteToSession && (
          <button
            type="button"
            onClick={() => onInviteToSession(friend.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 text-xs font-semibold transition-all active:scale-95 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Invite</span>
          </button>
        )}

        {/* Unfriend Options (preserving friendship management actions) */}
        {showConfirmUnfriend ? (
          <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl">
            <span className="text-xs text-rose-300">Unfriend?</span>
            <button
              type="button"
              onClick={handleUnfriend}
              disabled={removeFriendMutation.isPending}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 underline disabled:opacity-50"
            >
              {removeFriendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmUnfriend(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowConfirmUnfriend(true)}
            className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Unfriend"
            aria-label={`Unfriend ${friend.displayName || friend.username}`}
          >
            <UserMinus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
