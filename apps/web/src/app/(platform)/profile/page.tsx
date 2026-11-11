'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Mic,
  Trophy,
  Music,
  Flame,
  Radio,
  Settings,
  Sparkles,
  Calendar,
  Volume2,
  Edit3,
  UserCheck,
  Headphones,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { PersonalPreferencesCard } from '@/components/profile/personal-preferences-card';
import { ProfileEditDialog } from '@/components/profile/profile-edit-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useUserProfile } from '@/hooks/queries/use-user-profile';
import { useMyRooms } from '@/hooks/queries/use-my-rooms';
import { useUserPreferences } from '@/hooks/queries/use-user-preferences';

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: userProfile } = useUserProfile(user?.id);
  const { data: myRoomsData } = useMyRooms();
  const { preferences } = useUserPreferences();

  const stageName = user?.displayName || userProfile?.displayName || user?.username || 'Performer';
  const username = user?.username || userProfile?.username || 'user';
  const avatarUrl = user?.avatar || userProfile?.avatar || null;
  const bio = user?.bio || userProfile?.bio || null;
  const roleLabel = user?.role ? `${user.role.toUpperCase()} Member` : 'Performer';

  const memberSince = userProfile?.createdAt
    ? new Date(userProfile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : 'Active Lounge Member';

  const hostedCount = myRoomsData?.pagination?.total ?? myRoomsData?.items?.length ?? 0;
  const topGenre = preferences?.preferredGenres?.length
    ? preferences.preferredGenres.slice(0, 2).map((g) => g.toUpperCase()).join(' / ')
    : 'ALL-GENRE';
  const styleLabel = preferences?.participationStyle
    ? preferences.participationStyle.charAt(0).toUpperCase() + preferences.participationStyle.slice(1)
    : 'Performer';

  return (
    <ProtectedRoute>
      <div className="flex-1 py-10">
        <PageContainer size="md">
          {/* Profile Card Header */}
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden mb-8">
            {/* Decorative ambient gradient */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-violet-600/20 via-cyan-500/10 to-transparent blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
              <UserAvatar
                name={stageName}
                avatarUrl={avatarUrl}
                size="xl"
                status="online"
                className="shadow-2xl ring-2 ring-violet-500/30"
              />

              <div className="flex-1 text-center sm:text-left min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                      <h1 className="text-2xl sm:text-3xl font-extrabold text-white truncate">
                        {stageName}
                      </h1>
                      {user?.displayName && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 font-medium">
                          Stage Name
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-violet-400 font-medium mt-0.5">
                      @{username} &bull; Member since {memberSince}
                    </p>
                  </div>

                  <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                    <button
                      onClick={() => setIsEditDialogOpen(true)}
                      className="px-3.5 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/20 transition-all flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Profile</span>
                    </button>

                    <Link
                      href="/my-rooms"
                      className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5 text-violet-400" />
                      <span>My Lounges</span>
                    </Link>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>{roleLabel}</span>
                    </div>

                    {isAuthenticated && (
                      <button
                        onClick={() => logout()}
                        className="px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors"
                      >
                        Sign Out
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3.5">
                  {bio ? (
                    <p className="text-xs sm:text-sm text-slate-200 max-w-xl leading-relaxed whitespace-pre-line">
                      {bio}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No singer bio set yet. Click &quot;Edit Profile&quot; to introduce your vocal vibe to the lounge!
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" /> Live Karaoke Lounge Member
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Profile verified &amp; ready
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
              <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center mx-auto mb-2">
                <Flame className="w-4 h-4" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white">{hostedCount}</p>
              <p className="text-[11px] text-slate-400">Lounges Hosted</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
              <div className="w-8 h-8 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center mx-auto mb-2">
                <Music className="w-4 h-4" />
              </div>
              <p className="text-base sm:text-lg font-bold text-white truncate px-1">
                {topGenre}
              </p>
              <p className="text-[11px] text-slate-400">Top Music Taste</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
              <div className="w-8 h-8 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center mx-auto mb-2">
                <Headphones className="w-4 h-4" />
              </div>
              <p className="text-base sm:text-lg font-bold text-white truncate px-1">
                {styleLabel}
              </p>
              <p className="text-[11px] text-slate-400">Participation Style</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <UserCheck className="w-4 h-4" />
              </div>
              <p className="text-base sm:text-lg font-bold text-white truncate px-1">Active</p>
              <p className="text-[11px] text-slate-400">Stage Status</p>
            </div>
          </div>

          {/* Personal Karaoke Experience Preferences (Sprint 3.5) */}
          <PersonalPreferencesCard />

          {/* History and Hardware Preferences */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Recent Lounge Sing-Alongs */}
            <div className="md:col-span-8 glass-panel rounded-2xl p-6 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Recent Lounge Sing-Alongs
                </h2>
                <span className="text-[11px] text-slate-400">Live Lounge Session</span>
              </div>

              <div className="p-8 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-violet-600/10 text-violet-400 flex items-center justify-center mx-auto mb-3">
                  <Mic className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  Ready for your next performance
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Join any active karaoke room, request a track in queue, and let the room cheer for you!
                </p>
                <Link
                  href="/rooms"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-all shadow-md shadow-violet-600/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Explore Live Lounges</span>
                </Link>
              </div>
            </div>

            {/* Audio Setup Settings */}
            <div className="md:col-span-4 glass-panel rounded-2xl p-6 border border-white/5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="w-4 h-4 text-violet-400" />
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    Audio Setup
                  </h2>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 text-[11px] block mb-1">Microphone Input</label>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-slate-200 text-xs">
                      Default - Studio USB Mic
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-[11px] block mb-1">Echo Cancellation</label>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-emerald-400 text-xs font-medium">
                      Active (Hardware Optimized)
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-[11px] block mb-1">Preferred Reverb</label>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/10 text-violet-300 text-xs font-medium">
                      Studio Vocal Reverb
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 mt-4 flex items-center gap-2 text-[11px] text-slate-500">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>LiveKit Voice &amp; Web Audio</span>
              </div>
            </div>
          </div>

          {/* Edit Profile Modal Dialog */}
          <ProfileEditDialog
            isOpen={isEditDialogOpen}
            onClose={() => setIsEditDialogOpen(false)}
            initialDisplayName={user?.displayName || userProfile?.displayName}
            initialBio={user?.bio || userProfile?.bio}
            initialAvatar={user?.avatar || userProfile?.avatar}
            username={username}
          />
        </PageContainer>
      </div>
    </ProtectedRoute>
  );
}
