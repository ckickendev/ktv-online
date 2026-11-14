'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic2,
  Users,
  Lock,
  Globe,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
  Clock,
  Ban,
  ShieldAlert,
  LogIn,
  Crown,
  Music2,
  Disc3,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useInvitationPreview, useJoinViaInvitation } from '@/hooks/queries/use-invitation';
import { ATMOSPHERE_PRESETS } from '@/features/rooms/atmosphere';
import { GENRE_METADATA } from '@ktv/contracts';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ApiError } from '@/lib/api/errors';

export default function InvitationLandingPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === 'string' ? params.token : '';

  const { isAuthenticated, isInitializing } = useAuth();
  const { data: previewData, isLoading: isPreviewLoading, error: previewError } =
    useInvitationPreview(token);
  const joinMutation = useJoinViaInvitation();

  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!token) return;
    setJoinError(null);

    try {
      const membership = await joinMutation.mutateAsync(token);
      if (membership?.roomId) {
        router.push(`/rooms/${membership.roomId}`);
      } else if (previewData?.room?.id) {
        router.push(`/rooms/${previewData.room.id}`);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setJoinError(err.message || 'Failed to join the lounge.');
      } else if (err instanceof Error) {
        setJoinError(err.message);
      } else {
        setJoinError('An unexpected error occurred while joining.');
      }
    }
  };

  const isLoading = isInitializing || isPreviewLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-[#0e121e] border border-white/10 flex flex-col items-center text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center mb-4">
            <Mic2 className="w-7 h-7 text-cyan-400 animate-pulse" />
          </div>
          <h2 className="text-base font-bold text-white mb-1">Checking Invitation</h2>
          <p className="text-xs text-slate-400 mb-6">Preparing your virtual karaoke stage...</p>
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      </div>
    );
  }

  const invitation = previewData?.invitation;
  const room = previewData?.room;
  const userState = previewData?.userState;

  // Handle Invalid / Non-existent Invitation
  if (previewError || !invitation || invitation.status === 'invalid') {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-[#0e121e] border border-white/10 text-center shadow-2xl space-y-5 animate-in fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Invitation Not Found</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              This invite link is invalid or may have been mistyped. Please ask the lounge
              host for a new invitation.
            </p>
          </div>
          <Link
            href="/rooms"
            className="inline-flex w-full items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition-colors min-h-[44px]"
          >
            Explore Public Lounges
          </Link>
        </div>
      </div>
    );
  }

  // Handle Expired Invitation
  if (invitation.status === 'expired') {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-[#0e121e] border border-white/10 text-center shadow-2xl space-y-5 animate-in fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Clock className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Invitation Expired</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              This invitation link has expired. Reach out to the lounge host to get a
              fresh invitation link.
            </p>
          </div>
          <Link
            href="/rooms"
            className="inline-flex w-full items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition-colors min-h-[44px]"
          >
            Explore Public Lounges
          </Link>
        </div>
      </div>
    );
  }

  // Handle Revoked Invitation
  if (invitation.status === 'revoked') {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-[#0e121e] border border-white/10 text-center shadow-2xl space-y-5 animate-in fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
            <Ban className="w-7 h-7 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Invitation Revoked</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              The host has revoked this invitation link. A new link must be issued by the
              host to enter.
            </p>
          </div>
          <Link
            href="/rooms"
            className="inline-flex w-full items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition-colors min-h-[44px]"
          >
            Explore Public Lounges
          </Link>
        </div>
      </div>
    );
  }

  // Handle Room Closed
  if (invitation.status === 'room_closed' || !room) {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-[#0e121e] border border-white/10 text-center shadow-2xl space-y-5 animate-in fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-500/15 border border-slate-500/25 flex items-center justify-center">
            <Disc3 className="w-7 h-7 text-slate-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Lounge Closed</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              This karaoke lounge has concluded and is no longer active.
            </p>
          </div>
          <Link
            href="/rooms"
            className="inline-flex w-full items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition-colors min-h-[44px]"
          >
            Explore Active Lounges
          </Link>
        </div>
      </div>
    );
  }

  // Handle Kicked User
  if (userState?.isKicked) {
    return (
      <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-[#0e121e] border border-white/10 text-center shadow-2xl space-y-5 animate-in fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Access Restricted</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              You were removed from this lounge by the host and cannot rejoin with this
              invitation.
            </p>
          </div>
          <Link
            href="/rooms"
            className="inline-flex w-full items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition-colors min-h-[44px]"
          >
            Back to Lounges
          </Link>
        </div>
      </div>
    );
  }

  const isFull = room.currentParticipantsCount >= room.capacity;
  const isPrivate = room.visibility === 'private';
  const atmosphereConfig = room.atmospherePreset
    ? ATMOSPHERE_PRESETS[room.atmospherePreset]
    : ATMOSPHERE_PRESETS.midnight_lounge;

  const genreMeta = room.category
    ? (GENRE_METADATA as Record<string, { label: string; icon: string }>)[room.category]
    : null;

  const hostDisplayName = room.host?.displayName || room.host?.username || 'Lounge Host';

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Preview Card */}
      <div className="w-full max-w-lg bg-[#0e121e]/90 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 backdrop-blur-xl animate-in zoom-in-95 duration-200">
        {/* Branding header */}
        <div className="flex items-center justify-between pb-6 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Mic2 className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">
              KTVOnline
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
              isPrivate
                ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {isPrivate ? (
              <>
                <Lock className="w-3 h-3" /> Private Lounge
              </>
            ) : (
              <>
                <Globe className="w-3 h-3" /> Public Lounge
              </>
            )}
          </span>
        </div>

        {/* Room Atmosphere & Hero Identity */}
        <div className="py-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {genreMeta && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1">
                <span>{genreMeta.icon}</span>
                <span>{genreMeta.label}</span>
              </span>
            )}
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1 capitalize">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>{atmosphereConfig.name}</span>
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 uppercase">
              {room.roomType}
            </span>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {room.name}
            </h1>
            {room.description && (
              <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                {room.description}
              </p>
            )}
          </div>

          {/* Host Info */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/5">
            <UserAvatar
              name={hostDisplayName}
              avatarUrl={room.host?.avatar}
              className="w-10 h-10 rounded-xl"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">
                  {hostDisplayName}
                </span>
                <Crown className="w-3 h-3 text-amber-400 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400">Lounge Host & DJ</p>
            </div>
          </div>

          {/* Capacity & Live Status */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-[#090b12] border border-white/5">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Users className="w-3.5 h-3.5" />
                <span>Attendance</span>
              </div>
              <div className="text-sm font-bold text-white">
                {room.currentParticipantsCount} / {room.capacity}
                <span className="text-[11px] font-normal text-slate-400 ml-1">Singers</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#090b12] border border-white/5">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Music2 className="w-3.5 h-3.5" />
                <span>Stage Status</span>
              </div>
              <div className="text-sm font-bold text-cyan-300 capitalize truncate">
                {room.status === 'singing' ? 'Live Karaoke' : 'Open Stage'}
              </div>
            </div>
          </div>
        </div>

        {/* Error notice if join fails */}
        {joinError && (
          <div className="p-3.5 mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{joinError}</span>
          </div>
        )}

        {/* Join CTA Footer */}
        <div className="pt-2 border-t border-white/5 space-y-3">
          {userState?.isMember ? (
            <button
              type="button"
              onClick={() => router.push(`/rooms/${room.id}`)}
              className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-2 transition-colors min-h-[44px]"
            >
              <span>You are in this Lounge — Enter Stage</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : isFull ? (
            <div className="space-y-2">
              <button
                disabled
                className="w-full py-3.5 px-5 rounded-2xl bg-white/5 text-slate-500 text-xs font-bold border border-white/5 cursor-not-allowed min-h-[44px]"
              >
                Lounge Is Full ({room.capacity}/{room.capacity})
              </button>
              <p className="text-[11px] text-center text-slate-500">
                Wait for a singer to depart or explore other active rooms.
              </p>
            </div>
          ) : !isAuthenticated ? (
            <div className="space-y-2">
              <Link
                href={`/login?redirect=/invite/${encodeURIComponent(token)}`}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all min-h-[44px]"
              >
                <LogIn className="w-4 h-4" />
                <span>Log In to Enter Lounge</span>
              </Link>
              <p className="text-[11px] text-center text-slate-400">
                You must sign in with a singer profile to enter this private stage.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleJoin}
              disabled={joinMutation.isPending}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50 min-h-[44px]"
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Joining Lounge...</span>
                </>
              ) : (
                <>
                  <Mic2 className="w-4 h-4" />
                  <span>Join Karaoke Lounge</span>
                </>
              )}
            </button>
          )}

          <div className="text-center pt-2">
            <Link
              href="/rooms"
              className="text-[11px] text-slate-400 hover:text-white transition-colors"
            >
              Back to Browse Lounges
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
