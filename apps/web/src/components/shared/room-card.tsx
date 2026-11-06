import React from 'react';
import Link from 'next/link';
import { Users, Music, Crown, Sparkles, ArrowRight } from 'lucide-react';
import { RoomDto } from '@ktv/contracts';
import { RoomStatusBadge } from './room-status-badge';
import { cn } from '@/lib/utils';

interface RoomCardProps {
  room: RoomDto;
  className?: string;
}

export function RoomCard({ room, className }: RoomCardProps) {
  const isVip = room.roomType === 'vip';
  const isParty = room.roomType === 'party';

  return (
    <div
      className={cn(
        'glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group border transition-all duration-300',
        isVip && 'border-amber-500/30 hover:border-amber-500/60',
        isParty && 'border-cyan-500/30 hover:border-cyan-500/60',
        !isVip && !isParty && 'border-white/10 hover:border-violet-500/50',
        className
      )}
    >
      {/* Subtle background glow */}
      <div
        className={cn(
          'absolute -right-16 -top-16 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity',
          isVip ? 'bg-amber-500' : isParty ? 'bg-cyan-500' : 'bg-violet-600'
        )}
      />

      <div>
        {/* Top bar with badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
              {room.category}
            </span>

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
          </div>

          <RoomStatusBadge status={room.status} />
        </div>

        {/* Room Title */}
        <h3 className="font-semibold text-lg text-white group-hover:text-violet-300 transition-colors line-clamp-1 mb-1.5">
          {room.name}
        </h3>

        {/* Room Description */}
        <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px] mb-4">
          {room.description || 'Welcome to our virtual karaoke hangout! Grab a mic or chill with friends.'}
        </p>

        {/* Currently playing track preview */}
        <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 mb-4">
          {room.status === 'singing' && room.currentSongTitle ? (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                <Music className="w-3.5 h-3.5 animate-bounce" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{room.currentSongTitle}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  Performed by <span className="text-violet-300">{room.currentSingerName || 'Singer'}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <div className="w-2 h-2 rounded-full bg-slate-600" />
              <span>Queue is open &bull; Pick the next track</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer bar: Occupancy & Join CTA */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-medium text-slate-300">{room.currentParticipantsCount}</span>
          <span>/</span>
          <span>{room.capacity}</span>
        </div>

        <Link
          href={`/rooms/${room.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-sm hover:shadow-violet-500/25 transition-all group/btn"
        >
          <span>Join Lounge</span>
          <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
