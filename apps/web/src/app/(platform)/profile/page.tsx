'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Mic,
  Trophy,
  Radio,
  Settings,
  Calendar,
  Volume2,
  Edit3,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { PersonalPreferencesCard } from '@/components/profile/personal-preferences-card';
import { ProfileEditDialog } from '@/components/profile/profile-edit-dialog';
import {
  KaraokeStatsCards,
  RecentlySungList,
  SessionHistoryList,
  SessionRecapDialog,
  HistoryPrivacySettings,
} from '@/features/history/components';
import { useAuth } from '@/hooks/use-auth';
import { useUserProfile } from '@/hooks/queries/use-user-profile';

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRecapSessionId, setSelectedRecapSessionId] = useState<string | null>(null);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'songs' | 'sessions'>('songs');

  const { data: userProfile } = useUserProfile(user?.id);

  const stageName = user?.displayName || userProfile?.displayName || user?.username || 'Performer';
  const username = user?.username || userProfile?.username || 'user';
  const avatarUrl = user?.avatar || userProfile?.avatar || null;
  const bio = user?.bio || userProfile?.bio || null;
  const roleLabel = user?.role ? `${user.role.toUpperCase()} Member` : 'Performer';

  const memberSince = userProfile?.createdAt
    ? new Date(userProfile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : 'Active Lounge Member';

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

          {/* Personal Karaoke Statistics (Sprint 5.3) */}
          <KaraokeStatsCards />

          {/* Personal Karaoke Experience Preferences (Sprint 3.5) */}
          <PersonalPreferencesCard />

          {/* History and Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Karaoke History Section (Sprint 5.3) */}
            <div className="md:col-span-8 glass-panel rounded-2xl p-6 border border-white/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    Karaoke Activity &amp; Memories
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Your verified performances and lounge session recaps
                  </p>
                </div>

                {/* History Tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveHistoryTab('songs')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[36px] ${
                      activeHistoryTab === 'songs'
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-950/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Recently Sung
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHistoryTab('sessions')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[36px] ${
                      activeHistoryTab === 'sessions'
                        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Attended Lounges
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {activeHistoryTab === 'songs' ? (
                <RecentlySungList onOpenSessionRecap={setSelectedRecapSessionId} />
              ) : (
                <SessionHistoryList onOpenSessionRecap={setSelectedRecapSessionId} />
              )}
            </div>

            {/* Right Column: Audio Setup & Privacy Controls */}
            <div className="md:col-span-4 space-y-6">
              {/* History & Privacy Controls (Sprint 5.3) */}
              <HistoryPrivacySettings />

              {/* Audio Setup Settings */}
              <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col justify-between">
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

          {/* Session Recap Dialog Modal (Sprint 5.3) */}
          <SessionRecapDialog
            sessionId={selectedRecapSessionId}
            isOpen={Boolean(selectedRecapSessionId)}
            onClose={() => setSelectedRecapSessionId(null)}
          />
        </PageContainer>
      </div>
    </ProtectedRoute>
  );
}
