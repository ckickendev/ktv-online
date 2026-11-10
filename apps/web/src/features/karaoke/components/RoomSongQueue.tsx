'use client';

import React from 'react';
import { Plus, ListMusic, Music, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomQueueItemDto, RoomQueueSnapshotDto } from '@ktv/contracts';
import { QueueItem } from './QueueItem';

interface RoomSongQueueProps {
  queue: RoomQueueSnapshotDto | undefined;
  currentItem: RoomQueueItemDto | null;
  currentUserId?: string;
  isHost: boolean;
  canAddSongs: boolean;
  isMutating?: boolean;
  onRemove: (itemId: string) => void;
  onReorder: (itemIds: string[]) => void;
  onOpenSearch: () => void;
  className?: string;
}

export function RoomSongQueue({
  queue,
  currentItem,
  currentUserId,
  isHost,
  canAddSongs,
  isMutating = false,
  onRemove,
  onReorder,
  onOpenSearch,
  className,
}: RoomSongQueueProps) {
  const queuedItems = queue?.items || [];
  const totalCount = (currentItem ? 1 : 0) + queuedItems.length;
  const maxQueueSize = queue?.maxQueueSize || 50;
  const isQueueFull = totalCount >= maxQueueSize;

  // Reorder helpers for host
  const handleMoveUp = (itemId: string) => {
    const idx = queuedItems.findIndex((it) => it.id === itemId);
    if (idx <= 0) return;
    const newItems = [...queuedItems];
    const temp = newItems[idx - 1]!;
    newItems[idx - 1] = newItems[idx]!;
    newItems[idx] = temp;
    onReorder(newItems.map((it) => it.id));
  };

  const handleMoveDown = (itemId: string) => {
    const idx = queuedItems.findIndex((it) => it.id === itemId);
    if (idx < 0 || idx >= queuedItems.length - 1) return;
    const newItems = [...queuedItems];
    const temp = newItems[idx + 1]!;
    newItems[idx + 1] = newItems[idx]!;
    newItems[idx] = temp;
    onReorder(newItems.map((it) => it.id));
  };

  return (
    <div
      data-testid="room-song-queue"
      className={cn('flex flex-col justify-between h-full space-y-4', className)}
    >
      {/* Queue Header & Capacity Indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Song Queue</h3>
        </div>
        <span
          className={cn(
            'text-[11px] font-mono px-2 py-0.5 rounded-full border',
            isQueueFull
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              : 'bg-white/5 text-slate-400 border-white/5'
          )}
        >
          {totalCount} / {maxQueueSize} songs
        </span>
      </div>

      {/* Queue Items List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[460px]">
        {/* Currently playing item if present */}
        {currentItem && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-400 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-ping" />
              <span>Now Singing</span>
            </div>
            <QueueItem
              item={currentItem}
              index={0}
              currentUserId={currentUserId}
              isHost={isHost}
              onRemove={onRemove}
            />
          </div>
        )}

        {/* Queued upcoming items */}
        {queuedItems.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
              <span>Up Next</span>
              <span className="text-slate-500 font-mono text-[9px]">{queuedItems.length} in line</span>
            </div>
            {queuedItems.map((item, idx) => (
              <QueueItem
                key={item.id}
                item={item}
                index={idx}
                currentUserId={currentUserId}
                isHost={isHost}
                canMoveUp={isHost && idx > 0}
                canMoveDown={isHost && idx < queuedItems.length - 1}
                isRemoving={isMutating}
                onRemove={onRemove}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!currentItem && queuedItems.length === 0 && (
          <div
            data-testid="queue-empty-state"
            className="flex flex-col items-center justify-center p-8 text-center text-slate-400 my-auto rounded-xl bg-white/[0.02] border border-dashed border-white/10"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-3">
              <Music className="w-6 h-6 text-violet-400" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">The Queue is Empty</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
              No songs lined up. Step up and be the first to queue a track!
            </p>
          </div>
        )}
      </div>

      {/* Add Song CTA Button */}
      <div className="pt-2">
        {canAddSongs ? (
          <button
            type="button"
            data-testid="add-song-to-queue-button"
            disabled={isQueueFull || isMutating}
            onClick={onOpenSearch}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 active:scale-95 text-white text-xs font-semibold shadow-md shadow-violet-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>{isQueueFull ? 'Queue is Full (50/50)' : 'Add Song to Queue'}</span>
          </button>
        ) : (
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>Join lounge to add songs</span>
          </div>
        )}
      </div>
    </div>
  );
}
