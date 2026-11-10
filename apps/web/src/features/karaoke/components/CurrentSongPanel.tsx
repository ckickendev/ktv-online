'use client';

import React from 'react';
import Image from 'next/image';
import { Disc3, Music2, User, Globe2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomQueueItemDto } from '@ktv/contracts';

interface CurrentSongPanelProps {
  item: RoomQueueItemDto | null;
  isPlaying?: boolean;
  className?: string;
}

export function formatMsToTime(ms: number): string {
  if (!ms || isNaN(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function CurrentSongPanel({ item, isPlaying = false, className }: CurrentSongPanelProps) {
  if (!item) {
    return (
      <div
        data-testid="current-song-panel-empty"
        className={cn(
          'p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-4 text-slate-400',
          className
        )}
      >
        <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
          <Music2 className="w-8 h-8 text-slate-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-300">No song currently playing</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Select a song from the catalog to step up to the mic
          </p>
        </div>
      </div>
    );
  }

  const { song, requestedBy } = item;
  const isFixture = song.mediaAvailability === 'fixture_mock';

  return (
    <div
      data-testid="current-song-panel"
      className={cn(
        'p-4 rounded-2xl bg-gradient-to-r from-violet-950/20 via-black/40 to-cyan-950/20 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl',
        className
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        {/* Album Art / Cover Thumbnail with rotating disc effect when playing */}
        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-violet-500/30 shrink-0 shadow-lg shadow-violet-950/50">
          {song.thumbnailUrl ? (
            <Image
              src={song.thumbnailUrl}
              alt={song.title}
              fill
              className={cn('object-cover', isPlaying && 'opacity-90')}
              sizes="64px"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-900 to-indigo-950">
              <Disc3 className={cn('w-8 h-8 text-violet-400', isPlaying && 'animate-spin')} />
            </div>
          )}
          {isPlaying && (
            <div className="absolute inset-0 bg-gradient-to-t from-violet-900/60 via-transparent to-transparent flex items-end justify-center pb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            </div>
          )}
        </div>

        {/* Title, Artist, & Requester Metadata */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white tracking-wide truncate">{song.title}</h3>
            {isFixture && (
              <span
                data-testid="fixture-catalog-badge"
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25 shrink-0"
                title="Royalty-free development fixture track"
              >
                Fixture Track
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 font-medium truncate mt-0.5">{song.artist}</p>

          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1 text-violet-300">
              <User className="w-3 h-3 text-violet-400" />
              Requested by {requestedBy.displayName || requestedBy.username}
            </span>
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3 text-slate-500" />
              <span className="capitalize">{song.genre}</span>
            </span>
            <span className="flex items-center gap-1">
              <Globe2 className="w-3 h-3 text-slate-500" />
              <span className="uppercase">{song.language}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Right: Duration pill */}
      <div className="text-right shrink-0 self-end sm:self-center">
        <span className="text-xs font-mono text-slate-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
          {formatMsToTime(song.durationMs)}
        </span>
      </div>
    </div>
  );
}
