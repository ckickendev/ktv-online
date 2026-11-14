'use client';

import React, { useState } from 'react';
import { useFriends, useIncomingRequests } from '@/features/friends/hooks/use-friends';
import { FriendCard } from '@/features/friends/components/friend-card';
import { FriendRequestsList } from '@/features/friends/components/friend-requests-list';
import { UserSearchTab } from '@/features/friends/components/user-search-tab';
import { Users, UserPlus, Inbox, Sparkles, Loader2, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';

export default function FriendsPage() {
  const { isAuthenticated, isInitializing } = useAuth();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');

  const { data: friendsData, isLoading: isLoadingFriends } = useFriends();
  const { data: incomingData } = useIncomingRequests();

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
          <Users className="w-8 h-8 text-violet-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Connect with Karaoke Friends</h1>
        <p className="text-sm text-slate-400 mb-6">
          Sign in to discover other singers, see who is online in real time, and invite friends to private karaoke lounges.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-violet-600/25 hover:from-violet-500 hover:to-indigo-500 transition-all"
        >
          Sign In to Continue
        </Link>
      </div>
    );
  }

  const friends = friendsData?.items ?? [];
  const totalFriends = friendsData?.total ?? 0;
  const onlineFriends = friends.filter(
    (f) => f.friend.presence?.status && f.friend.presence.status !== 'offline'
  ).length;
  const incomingRequestsCount = incomingData?.total ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-0.5 shadow-lg shadow-violet-600/20">
              <div className="w-full h-full bg-[#0a0d17] rounded-[14px] flex items-center justify-center">
                <Users className="w-5 h-5 text-violet-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Social Lounge & Friends</h1>
              <p className="text-xs text-slate-400">
                Your virtual hangout circle. See who is available and sing together.
              </p>
            </div>
          </div>
        </div>

        {/* Live friends stats pill */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-semibold">{onlineFriends} Online</span>
          </div>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">{totalFriends} Total Friends</span>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('friends')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
            activeTab === 'friends'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <Users className="w-4 h-4" />
          <span>My Friends</span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-bold',
              activeTab === 'friends' ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400'
            )}
          >
            {totalFriends}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all relative',
            activeTab === 'requests'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <Inbox className="w-4 h-4" />
          <span>Requests</span>
          {incomingRequestsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-fuchsia-500 text-white text-xs font-bold animate-pulse">
              {incomingRequestsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('search')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
            activeTab === 'search'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <UserPlus className="w-4 h-4" />
          <span>Find People</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'friends' && (
        <div>
          {isLoadingFriends ? (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
              <span className="text-sm">Updating presence and friendships...</span>
            </div>
          ) : friends.length > 0 ? (
            <div className="space-y-3">
              {friends.map((friendship) => (
                <FriendCard key={friendship.id} friendship={friendship} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center rounded-3xl bg-white/[0.02] border border-white/5 p-8">
              <div className="w-14 h-14 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-violet-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">Your Friends List is Empty</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-6">
                Karaoke is always more fun together. Search for other singers across KTVOnline and invite them to sing.
              </p>
              <button
                onClick={() => setActiveTab('search')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/25 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>Find People</span>
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'requests' && <FriendRequestsList />}

      {activeTab === 'search' && <UserSearchTab />}
    </div>
  );
}
