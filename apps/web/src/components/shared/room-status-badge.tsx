import React from 'react';
import { cn } from '@/lib/utils';
import { Mic, Disc3, Pause, Lock } from 'lucide-react';
import { RoomStatus } from '@ktv/contracts';

interface RoomStatusBadgeProps {
  status: RoomStatus;
  className?: string;
}

export function RoomStatusBadge({ status, className }: RoomStatusBadgeProps) {
  const config = {
    singing: {
      label: 'Singing Now',
      icon: Mic,
      containerClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
      dotClass: 'bg-violet-400 animate-pulse',
    },
    idle: {
      label: 'Chilling',
      icon: Disc3,
      containerClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      dotClass: 'bg-emerald-400',
    },
    paused: {
      label: 'Intermission',
      icon: Pause,
      containerClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      dotClass: 'bg-amber-400',
    },
    closed: {
      label: 'Closed',
      icon: Lock,
      containerClass: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      dotClass: 'bg-slate-500',
    },
  }[status] || {
    label: status,
    icon: Disc3,
    containerClass: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    dotClass: 'bg-slate-500',
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm',
        config.containerClass,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dotClass)} />
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
    </span>
  );
}
