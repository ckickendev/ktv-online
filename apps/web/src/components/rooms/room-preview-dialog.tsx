'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  Users,
  Music,
  Crown,
  Sparkles,
  Share2,
  Check,
  LogIn,
  AlertCircle,
  Eye,
  Volume2,
  ShieldCheck,
  Disc3,
  Radio,
} from 'lucide-react';
import { RoomDto } from '@ktv/contracts';
import { ATMOSPHERE_PRESETS } from '@/features/rooms/atmosphere';
import { RoomStatusBadge } from '@/components/shared/room-status-badge';
import { UserAvatar } from '@/components/shared/user-avatar';
import { GENRE_METADATA } from '@ktv/contracts';
import { cn } from '@/lib/utils';

export interface RoomPreviewDialogProps {
  room: RoomDto | null;
  isOpen: boolean;
  onClose: () => void;
  onJoin: (room: RoomDto) => void;
  isJoining?: boolean;
  isAuthenticated: boolean;
  joinError?: string | null;
}

export function RoomPreviewDialog({
  room,
  isOpen,
  onClose,
  onJoin,
  isJoining = false,
  isAuthenticated,
  joinError,
}: RoomPreviewDialogProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !room) return null;

  const isClosed = room.status === 'closed';
  const isFull = !isClosed && room.currentParticipantsCount >= room.capacity;
  const isVip = room.roomType === 'vip';
  const isParty = room.roomType === 'party';

  const hostUsername = room.host?.username || 'Lounge Host';
  const hostAvatar = room.host?.avatar;

  const atmosphereConfig = room.atmospherePreset
    ? ATMOSPHERE_PRESETS[room.atmospherePreset]
    : ATMOSPHERE_PRESETS.midnight_lounge;

  const genreMeta = room.category ? (GENRE_METADATA as Record<string, { label: string; icon: string }>)[room.category] : null;

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/rooms/${room.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  return (
    <div
      data-testid="room-preview-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0d111e] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-room-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dynamic ambient atmosphere glow banner */}
        <div
          className={cn(
            'absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none',
            isVip ? 'bg-amber-500' : isParty ? 'bg-cyan-500' : 'bg-violet-600'
          )}
        />

        {/* Header bar: tags, close button */}
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Atmosphere Vibe Badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide px-2.5 py-1 rounded-full border',
                atmosphereConfig.styles.badgeClass
              )}
            >
              <Disc3 className="w-3 h-3 text-cyan-400 animate-spin-slow" />
              <span>{atmosphereConfig.name}</span>
            </span>

            {/* Room Style Badge */}
            {isVip && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Crown className="w-3 h-3" /> VIP
              </span>
            )}
            {isParty && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Sparkles className="w-3 h-3" /> Party
              </span>
            )}

            {/* Status Badge */}
            <RoomStatusBadge status={room.status} />
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto pr-1 space-y-4 flex-1 scrollbar-thin">
          {/* Room Title & Host Header */}
          <div>
            <h2 id="preview-room-title" className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {room.name}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <UserAvatar
                name={hostUsername}
                avatarUrl={hostAvatar}
                size="sm"
                className="w-5 h-5 text-[10px]"
              />
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <span>Hosted by</span>
                <span className="text-slate-200 font-medium">{hostUsername}</span>
                {isVip && <ShieldCheck className="w-3 h-3 text-amber-400 inline" />}
              </span>
            </div>
          </div>

          {/* Room Description */}
          {room.description && (
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-white/[0.02] p-3 rounded-xl border border-white/5">
              {room.description}
            </p>
          )}

          {/* Current Stage Performance Banner */}
          <div className="p-3.5 rounded-2xl bg-[#070914] border border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold flex items-center gap-1.5 text-slate-300">
                <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                Live Stage
              </span>
              <span className="text-[11px] text-slate-400">
                {room.status === 'singing' ? 'Performance in Progress' : 'Queue Open'}
              </span>
            </div>

            {room.status === 'singing' && room.currentSongTitle ? (
              <div className="flex items-center gap-3 pt-1">
                <div className="w-9 h-9 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0 border border-violet-500/20">
                  <Music className="w-4 h-4 animate-bounce" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{room.currentSongTitle}</p>
                  <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                    <span>Now singing:</span>
                    <span className="text-violet-300 font-medium">
                      {room.currentSingerName || 'Featured Performer'}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-xs text-slate-400 pt-1">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 animate-ping" />
                <span>The microphone is ready &bull; Step up and queue your track</span>
              </div>
            )}
          </div>

          {/* Room Metadata Grid: Category, Capacity, Atmosphere Tagline */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Category / Genre */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
                Music Category
              </span>
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 truncate">
                <span>{genreMeta?.icon || '🎵'}</span>
                <span>{genreMeta?.label || room.category}</span>
              </div>
            </div>

            {/* Occupancy */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
                Singers / Capacity
              </span>
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-violet-400" />
                <span>
                  {room.currentParticipantsCount} / {room.capacity}
                </span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto',
                    isClosed
                      ? 'bg-slate-500/20 text-slate-400'
                      : isFull
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-emerald-500/20 text-emerald-400'
                  )}
                >
                  {isClosed ? 'Closed' : isFull ? 'Full' : 'Open'}
                </span>
              </div>
            </div>
          </div>

          {/* Safe Preview Notice Banner */}
          <div className="p-2.5 rounded-xl bg-violet-950/30 border border-violet-500/20 text-[11px] text-violet-300 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
            <span>
              Previewing lounge details. You are not connected to audio or reserving a slot until you join.
            </span>
          </div>

          {/* Join Error Notice if present */}
          {joinError && (
            <div
              data-testid="preview-join-error-alert"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{joinError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 mt-3 border-t border-white/5 flex items-center justify-between gap-3 shrink-0">
          {/* Share Link Tool */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
            title="Copy lounge invite link"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </>
            )}
          </button>

          {/* Primary Action Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isJoining}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Close
            </button>

            {isClosed ? (
              <button
                disabled
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed"
              >
                Lounge Closed
              </button>
            ) : isFull ? (
              <button
                disabled
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-not-allowed"
              >
                Lounge Full
              </button>
            ) : !isAuthenticated ? (
              <Link
                href={`/login?redirect=/rooms/${room.id}`}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-lg shadow-violet-600/25 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in to Join</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onJoin(room)}
                disabled={isJoining}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-lg shadow-violet-600/25 transition-all active:scale-95 disabled:opacity-50"
              >
                {isJoining ? (
                  <>
                    <Disc3 className="w-3.5 h-3.5 animate-spin" />
                    <span>Entering Stage...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Join Lounge</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
