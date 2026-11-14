import React from 'react';
import { FriendPresenceDto } from '@ktv/contracts';
import { Mic, Radio, Circle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PresenceStatusBadgeProps {
  presence?: FriendPresenceDto | null;
  className?: string;
}

export function PresenceStatusBadge({ presence, className }: PresenceStatusBadgeProps) {
  const status = presence?.status || 'offline';

  if (status === 'singing') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold',
          'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30',
          'shadow-sm shadow-fuchsia-500/20',
          className
        )}
      >
        <Mic className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" />
        <span className="truncate max-w-[140px]">
          {presence?.songTitle ? `Singing: ${presence.songTitle}` : 'Singing on Stage'}
        </span>
      </div>
    );
  }

  if (status === 'in_lounge') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
          'bg-cyan-500/10 text-cyan-300 border border-cyan-500/25',
          className
        )}
      >
        {presence?.isPrivateLounge ? (
          <Lock className="w-3 h-3 text-cyan-400" />
        ) : (
          <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
        )}
        <span className="truncate max-w-[140px]">
          {presence?.roomTitle || 'In a Lounge'}
        </span>
      </div>
    );
  }

  if (status === 'online') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Online</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
        'bg-slate-800/60 text-slate-400 border border-slate-700/40',
        className
      )}
    >
      <Circle className="w-1.5 h-1.5 fill-slate-500 text-slate-500" />
      <span>Offline</span>
    </div>
  );
}
