'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  X,
  Users,
  Crown,
  Sparkles,
  Share2,
  Check,
  Lock,
  Globe,
  Settings,
  Music,
  Radio,
} from 'lucide-react';
import { RoomSnapshotDto, HostDto } from '@ktv/contracts';
import { getAtmosphereConfig } from '@/features/rooms/atmosphere/atmosphere-presets';
import { cn } from '@/lib/utils';

export interface RoomIdentityDialogProps {
  room: RoomSnapshotDto | null;
  host?: HostDto | null;
  totalOnline?: number;
  voiceParticipantsCount?: number;
  isOpen: boolean;
  isHost?: boolean;
  onClose: () => void;
  onOpenCustomization?: () => void;
}

export function RoomIdentityDialog({
  room,
  host,
  totalOnline = 0,
  voiceParticipantsCount = 0,
  isOpen,
  isHost = false,
  onClose,
  onOpenCustomization,
}: RoomIdentityDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !room) return null;

  const atmosphere = getAtmosphereConfig(room.atmospherePreset);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      data-testid="room-identity-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        data-testid="room-identity-dialog"
        className="w-full max-w-lg bg-[#0c101c] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-identity-title"
      >
        {/* Subtle Ambient Glow Header */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-48 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ background: atmosphere.swatch.primary }}
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          data-testid="close-room-identity-dialog"
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          aria-label="Close room details dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Room Header Info */}
        <div className="flex items-start gap-3.5 mb-5 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/30 via-indigo-600/20 to-cyan-500/30 border border-violet-500/30 flex items-center justify-center shrink-0 shadow-lg">
            <Music className="w-6 h-6 text-violet-300" />
          </div>
          <div className="min-w-0 pr-6">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="room-identity-title" className="text-lg font-bold text-white tracking-wide truncate">
                {room.name}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-white/10 text-slate-300 border border-white/10">
                {room.roomType}
              </span>
            </div>
            {room.description ? (
              <p className="text-xs text-slate-300 mt-1 leading-relaxed line-clamp-2">
                {room.description}
              </p>
            ) : (
              <p className="text-xs text-slate-500 italic mt-1">No description provided for this lounge.</p>
            )}
          </div>
        </div>

        {/* Lounge Identity Details Grid */}
        <div className="space-y-3 relative z-10">
          {/* Atmosphere Preset Banner */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-inner"
                style={{
                  background: `linear-gradient(135deg, ${atmosphere.swatch.primary}40, ${atmosphere.swatch.secondary}20)`,
                  borderColor: atmosphere.swatch.primary,
                }}
              >
                <Sparkles className="w-4 h-4" style={{ color: atmosphere.swatch.secondary }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Atmosphere Vibe
                  </span>
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.2 rounded-full border', atmosphere.styles.badgeClass)}>
                    {atmosphere.name}
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium truncate mt-0.5">
                  {atmosphere.tagline}
                </p>
              </div>
            </div>

            {isHost && onOpenCustomization && (
              <button
                type="button"
                data-testid="open-customization-from-identity"
                onClick={() => {
                  onClose();
                  onOpenCustomization();
                }}
                className="shrink-0 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors text-xs font-medium flex items-center gap-1.5"
                title="Change atmosphere"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Theme</span>
              </button>
            )}
          </div>

          {/* Host & Category Info Card */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Host Info */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 overflow-hidden">
                {host?.avatar ? (
                  <Image
                    src={host.avatar}
                    alt={host.username}
                    fill
                    className="object-cover"
                    sizes="32px"
                    unoptimized
                  />
                ) : (
                  <Crown className="w-4 h-4 text-amber-300 fill-amber-300/40" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Host</span>
                <span className="text-xs font-bold text-white truncate block">
                  {host?.username || 'Lounge Host'}
                </span>
              </div>
            </div>

            {/* Visibility & Category */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-slate-400">
                {room.visibility === 'private' ? (
                  <Lock className="w-4 h-4 text-amber-400" />
                ) : (
                  <Globe className="w-4 h-4 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  {room.visibility} lounge
                </span>
                <span className="text-xs font-bold text-white capitalize truncate block">
                  {room.category} Vibe
                </span>
              </div>
            </div>
          </div>

          {/* Realtime Attendance & Presence Metrics */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-violet-400" />
                <span>
                  <strong className="text-white">{room.currentParticipantsCount}</strong>
                  <span className="text-slate-500"> / {room.capacity} members</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  <strong className="text-emerald-300">{totalOnline}</strong> online
                </span>
              </div>
              {voiceParticipantsCount > 0 && (
                <div className="flex items-center gap-1.5 text-cyan-400">
                  <Radio className="w-3 h-3" />
                  <span>
                    <strong>{voiceParticipantsCount}</strong> in voice
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-3 relative z-10">
          <button
            type="button"
            data-testid="copy-room-link-button"
            onClick={handleCopyLink}
            className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-white/10 transition-all"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">Invite Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-violet-400" />
                <span>Share Lounge Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white text-xs font-semibold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
