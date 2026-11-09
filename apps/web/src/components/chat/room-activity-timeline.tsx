'use client';

import React from 'react';
import {
  LogIn,
  LogOut,
  UserX,
  Sparkles,
  Settings,
  Lock,
  Activity,
} from 'lucide-react';
import { RoomActivityDto } from '@ktv/contracts';
import { cn } from '@/lib/utils';

export interface RoomActivityTimelineProps {
  activities: RoomActivityDto[];
  isLoading?: boolean;
}

export function RoomActivityTimeline({ activities, isLoading }: RoomActivityTimelineProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'member_joined':
        return <LogIn className="w-3.5 h-3.5 text-emerald-400" />;
      case 'member_left':
        return <LogOut className="w-3.5 h-3.5 text-slate-400" />;
      case 'member_kicked':
        return <UserX className="w-3.5 h-3.5 text-rose-400" />;
      case 'room_created':
        return <Sparkles className="w-3.5 h-3.5 text-pink-400" />;
      case 'room_settings_updated':
        return <Settings className="w-3.5 h-3.5 text-amber-400" />;
      case 'room_closed':
        return <Lock className="w-3.5 h-3.5 text-red-500" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const formatActivityTime = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-medium text-slate-300">
          <Activity className="w-3.5 h-3.5 text-pink-400" />
          <span>Room Activity Timeline</span>
        </div>
        <span>{activities.length} activities</span>
      </div>

      {/* Activity Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700/50">
        {isLoading && (
          <div className="text-center py-8 text-xs text-slate-500">
            Loading activity timeline...
          </div>
        )}

        {!isLoading && activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <Activity className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No room activity yet</p>
            <p className="text-xs text-slate-500 mt-1">Actions by members and hosts will appear here.</p>
          </div>
        )}

        {activities.map((act) => (
          <div
            key={act.id}
            className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-800/30 border border-slate-800/60 text-xs hover:bg-slate-800/50 transition-colors"
          >
            <div className="p-1.5 bg-slate-800 rounded-md shrink-0 mt-0.5">
              {getActivityIcon(act.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-200 leading-snug">
                <span className={cn('font-semibold', act.actor.role === 'host' ? 'text-amber-400' : 'text-slate-300')}>
                  {act.actor.username}
                </span>{' '}
                <span className="text-slate-400">{act.message.replace(act.actor.username, '').trim()}</span>
              </p>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {formatActivityTime(act.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
