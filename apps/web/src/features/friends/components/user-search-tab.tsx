'use client';

import React, { useState } from 'react';
import { useUserSearch, useSendFriendRequest, useAcceptFriendRequest } from '../hooks/use-friends';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Search, UserPlus, Check, Clock, Loader2, Sparkles, AlertCircle } from 'lucide-react';

export function UserSearchTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: searchResults, isLoading, isError } = useUserSearch(searchTerm);

  const sendRequestMutation = useSendFriendRequest();
  const acceptRequestMutation = useAcceptFriendRequest();

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search singers by username or display name..."
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all"
        />
        {isLoading && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-violet-400" />
        )}
      </div>

      {/* Results View */}
      {searchTerm.trim().length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <Sparkles className="w-10 h-10 mb-3 text-violet-400/50 animate-pulse" />
          <p className="text-sm font-semibold text-slate-300">Discover Karaoke Enthusiasts</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Type a username or display name to find singers, send friend requests, and start inviting them to your private lounges.
          </p>
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center py-12 text-rose-400 gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs">Failed to search users. Please try again.</span>
        </div>
      ) : searchResults && searchResults.length > 0 ? (
        <div className="space-y-3">
          {searchResults.map((user) => {
            const isSending = sendRequestMutation.isPending && sendRequestMutation.variables === user.id;
            const isAccepting = acceptRequestMutation.isPending && acceptRequestMutation.variables === user.requestId;

            return (
              <div
                key={user.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-500/30 transition-all gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <UserAvatar
                    name={user.displayName || user.username}
                    avatarUrl={user.avatar}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm text-slate-100 truncate">
                        {user.displayName || user.username}
                      </h4>
                      <span className="text-xs text-slate-400 truncate">@{user.username}</span>
                    </div>
                    {user.bio && (
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{user.bio}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {user.relationship === 'none' && (
                    <button
                      onClick={() => sendRequestMutation.mutate(user.id)}
                      disabled={isSending}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/20 transition-all disabled:opacity-50"
                    >
                      {isSending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>Add Friend</span>
                    </button>
                  )}

                  {user.relationship === 'friends' && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                      <Check className="w-3.5 h-3.5" />
                      <span>Friends</span>
                    </div>
                  )}

                  {user.relationship === 'pending_outgoing' && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Request Sent</span>
                    </div>
                  )}

                  {user.relationship === 'pending_incoming' && user.requestId && (
                    <button
                      onClick={() => acceptRequestMutation.mutate(user.requestId!)}
                      disabled={isAccepting}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/20 transition-all disabled:opacity-50"
                    >
                      {isAccepting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Accept Request</span>
                    </button>
                  )}

                  {user.relationship === 'blocked' && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium">
                      <span>Blocked</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <Search className="w-10 h-10 mb-3 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">No users found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            We couldn't find anyone matching &ldquo;{searchTerm}&rdquo;. Check spelling or try a different username.
          </p>
        </div>
      )}
    </div>
  );
}
