'use client';

import React from 'react';
import {
  Trash2,
  ChevronUp,
  ChevronDown,
  User,
  Disc3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomQueueItemDto } from '@ktv/contracts';
import { formatMsToTime } from './CurrentSongPanel';

interface QueueItemProps {
  item: RoomQueueItemDto;
  index: number;
  currentUserId?: string;
  isHost: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  isRemoving?: boolean;
  onRemove: (itemId: string) => void;
  onMoveUp?: (itemId: string) => void;
  onMoveDown?: (itemId: string) => void;
  className?: string;
}

export function QueueItem({
  item,
  index,
  currentUserId,
  isHost,
  canMoveUp = false,
  canMoveDown = false,
  isRemoving = false,
  onRemove,
  onMoveUp,
  onMoveDown,
  className,
}: QueueItemProps) {
  const isPlaying = item.status === 'playing';
  const isMyRequest = Boolean(currentUserId && item.requestedBy.id === currentUserId);
  const canRemove = isHost || isMyRequest;

  return (
    <div
      data-testid={`queue-item-${item.id}`}
      className={cn(
        'group p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all',
        isPlaying
          ? 'bg-violet-950/40 border-violet-500/40 text-white shadow-md shadow-violet-950/30'
          : index === 0
          ? 'bg-cyan-950/20 border-cyan-500/30 text-slate-200'
          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/5 text-slate-300',
        className
      )}
    >
      {/* Left: Position and Song Information */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-black/40 border border-white/10">
          {isPlaying ? (
            <Disc3 className="w-4 h-4 text-violet-400 animate-spin" />
          ) : (
            <span
              className={cn(
                'text-[11px] font-bold',
                index === 0 ? 'text-cyan-400' : 'text-slate-400'
              )}
            >
              #{item.position > 0 ? item.position : index + 1}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white truncate max-w-[170px] sm:max-w-[200px]">
              {item.song.title}
            </p>
            {isPlaying && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Playing
              </span>
            )}
            {!isPlaying && index === 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Next Up
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
            <span className="truncate max-w-[120px]">{item.song.artist}</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1 text-slate-400 truncate max-w-[110px]">
              <User className="w-2.5 h-2.5 text-slate-500" />
              {isMyRequest ? (
                <span className="text-violet-300 font-medium">You</span>
              ) : (
                item.requestedBy.displayName || item.requestedBy.username
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions and Duration */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Reorder Buttons (Host only, queued items) */}
        {isHost && !isPlaying && (
          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => onMoveUp?.(item.id)}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title="Move song up in queue"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onMoveDown?.(item.id)}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title="Move song down in queue"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Duration */}
        <span className="text-[11px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-black/20">
          {formatMsToTime(item.song.durationMs)}
        </span>

        {/* Remove Button */}
        {canRemove && (
          <button
            type="button"
            data-testid={`queue-remove-button-${item.id}`}
            disabled={isRemoving}
            onClick={() => onRemove(item.id)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
            title={isMyRequest ? 'Remove your song from queue' : 'Remove song (Host)'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
