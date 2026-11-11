'use client';

import React from 'react';
import { X, Trophy, Music, Calendar, Loader2, Headphones } from 'lucide-react';
import { usePublicUserProfile } from '@/hooks/queries/use-user-profile';
import { UserAvatar } from '../shared/user-avatar';

export interface UserProfileModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileModal({ userId, isOpen, onClose }: UserProfileModalProps) {
  const { data: profile, isLoading } = usePublicUserProfile(userId ?? undefined);

  if (!isOpen || !userId) return null;

  const stageName = profile?.displayName || profile?.username || 'Performer';
  const username = profile?.username || 'user';
  const avatarUrl = profile?.avatar || null;
  const bio = profile?.bio;
  const roleLabel = profile?.role ? `${profile.role.toUpperCase()} Member` : 'Performer';

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : 'Lounge Member';

  const favoriteGenres = profile?.favoriteGenres || [];
  const participationStyle = profile?.participationStyle;

  return (
    <div
      data-testid="user-profile-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-sm bg-[#0e121e] border border-white/10 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-modal-title"
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-violet-600/20 via-cyan-500/10 to-transparent blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors z-10"
          aria-label="Close profile"
        >
          <X className="w-4 h-4" />
        </button>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            <p className="text-xs text-slate-400">Loading singer profile...</p>
          </div>
        ) : (
          <div className="relative z-10">
            {/* Header / Avatar */}
            <div className="flex flex-col items-center text-center">
              <UserAvatar
                name={stageName}
                avatarUrl={avatarUrl}
                size="xl"
                status="online"
                className="shadow-xl ring-2 ring-violet-500/30 mb-3"
              />

              <div className="flex items-center gap-1.5 justify-center flex-wrap">
                <h3 id="user-profile-modal-title" className="text-lg font-bold text-white truncate">
                  {stageName}
                </h3>
                {profile?.displayName && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold">
                    Stage
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400">@{username}</p>

              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[11px] font-medium">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  {roleLabel}
                </span>

                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Calendar className="w-3 h-3 text-cyan-400" />
                  Joined {memberSince}
                </span>
              </div>
            </div>

            {/* Bio */}
            <div className="mt-4 p-3 rounded-2xl bg-white/[0.03] border border-white/5 text-center">
              <p className="text-xs text-slate-300 leading-relaxed italic">
                {bio || '“Here to sing, listen, and share good vibes in the lounge!”'}
              </p>
            </div>

            {/* Music Taste / Preferences */}
            <div className="mt-4 space-y-2.5">
              {participationStyle && (
                <div className="flex items-center justify-between text-xs px-2">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5 text-violet-400" /> Participation Style
                  </span>
                  <span className="text-slate-200 font-medium capitalize">
                    {participationStyle}
                  </span>
                </div>
              )}

              {favoriteGenres.length > 0 && (
                <div className="px-2">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <Music className="w-3.5 h-3.5 text-cyan-400" /> Favorite Genres
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {favoriteGenres.map((genre: string) => (
                      <span
                        key={genre}
                        className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-medium uppercase"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Close Button Action */}
            <div className="mt-6 pt-3 border-t border-white/5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
