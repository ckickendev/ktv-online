'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FriendshipDto } from '@ktv/contracts';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PresenceStatusBadge } from './presence-status-badge';
import { useRemoveFriend } from '../hooks/use-friends';
import { LogIn, UserMinus, Loader2 } from 'lucide-react';

interface FriendCardProps {
  friendship: FriendshipDto;
}

export function FriendCard({ friendship }: FriendCardProps) {
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

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-500/30 transition-all gap-4">
      <div className="flex items-center gap-3.5 min-w-0">
        <UserAvatar
          name={friend.displayName || friend.username}
          avatarUrl={friend.avatar}
          status={avatarStatus}
          size="lg"
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
            {friend.bio && (
              <p className="text-xs text-slate-400 line-clamp-1 max-w-[280px]">
                {friend.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        {/* Join Lounge CTA if friend is in a public lounge */}
        {presence?.status === 'in_lounge' && presence.roomId && !presence.isPrivateLounge && (
          <Link
            href={`/rooms/${presence.roomId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 text-xs font-medium transition-all shadow-sm shadow-violet-600/20"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Join Lounge</span>
          </Link>
        )}

        {/* Join Stage / Performer CTA if friend is singing in a public lounge */}
        {presence?.status === 'singing' && presence.roomId && !presence.isPrivateLounge && (
          <Link
            href={`/rooms/${presence.roomId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-semibold shadow-md shadow-fuchsia-600/20 transition-all animate-pulse"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Watch Live</span>
          </Link>
        )}

        {/* Unfriend Options */}
        {showConfirmUnfriend ? (
          <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl">
            <span className="text-xs text-rose-300">Unfriend?</span>
            <button
              onClick={handleUnfriend}
              disabled={removeFriendMutation.isPending}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 underline disabled:opacity-50"
            >
              {removeFriendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
            </button>
            <button
              onClick={() => setShowConfirmUnfriend(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmUnfriend(true)}
            className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Unfriend"
          >
            <UserMinus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
