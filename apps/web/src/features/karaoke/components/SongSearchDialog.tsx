'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  X,
  Plus,
  Check,
  Disc3,
  Sparkles,
  Info,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SongDto } from '@ktv/contracts';
import { karaokeApi } from '../api/karaoke-api';
import { queryKeys } from '@/hooks/queries/query-keys';
import { formatMsToTime } from './CurrentSongPanel';

interface SongSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (songId: string) => Promise<unknown>;
  isAddingSong?: boolean;
}

const GENRE_FILTERS = [
  { id: 'all', label: 'All Genres' },
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'ballad', label: 'Ballad' },
  { id: 'rnb', label: 'R&B' },
  { id: 'electronic', label: 'Electronic' },
];

export function SongSearchDialog({
  isOpen,
  onClose,
  onSelectSong,
  isAddingSong = false,
}: SongSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [addedSongIds, setAddedSongIds] = useState<Set<string>>(new Set());

  // Debounce search query 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Query songs matching search & filters
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.karaoke.songs({
      q: debouncedQuery,
      genre: selectedGenre !== 'all' ? selectedGenre : undefined,
    }),
    queryFn: () =>
      karaokeApi.searchSongs({
        q: debouncedQuery.trim(),
        genre: selectedGenre !== 'all' ? selectedGenre : undefined,
        page: 1,
        limit: 30,
      }),
    enabled: isOpen,
    staleTime: 30000,
  });

  const songs: SongDto[] = data?.songs || [];

  const handleAdd = async (songId: string) => {
    try {
      await onSelectSong(songId);
      setAddedSongIds((prev) => new Set(prev).add(songId));
      setTimeout(() => {
        setAddedSongIds((prev) => {
          const next = new Set(prev);
          next.delete(songId);
          return next;
        });
      }, 3000);
    } catch {
      // Handled upstream
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="song-search-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        data-testid="song-search-dialog"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-[#0c101c] border border-violet-500/25 shadow-2xl shadow-violet-950/50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Select a Song to Queue</h3>
              <p className="text-xs text-slate-400">Search royalty-free catalog sample tracks</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-song-search-dialog"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Development Catalog Notice Banner */}
        <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-200">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[11px] leading-relaxed">
            <strong>Development Catalog:</strong> Sample tracks provided for room queue and synchronized playback testing. Commercial catalog integration scheduled for future sprint.
          </span>
        </div>

        {/* Search input & genre filters */}
        <div className="p-5 space-y-3 border-b border-white/5 bg-black/20">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              data-testid="song-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by song title or artist..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-violet-500/60 transition-colors"
              autoFocus
            />
          </div>

          {/* Genre filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {GENRE_FILTERS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGenre(g.id)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                  selectedGenre === g.id
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5 min-h-[280px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
              <span className="text-xs">Searching catalog...</span>
            </div>
          ) : isError ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center text-xs text-rose-300">
              Failed to load songs from catalog. Please try again.
            </div>
          ) : songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <Disc3 className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">No songs found</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Try searching with a different title or keyword
              </p>
            </div>
          ) : (
            songs.map((song) => {
              const isAdded = addedSongIds.has(song.id);
              return (
                <div
                  key={song.id}
                  data-testid={`song-result-${song.id}`}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-900 border border-white/10 shrink-0">
                      {song.thumbnailUrl ? (
                        <Image
                          src={song.thumbnailUrl}
                          alt={song.title}
                          fill
                          className="object-cover"
                          sizes="48px"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-violet-950/40">
                          <Disc3 className="w-5 h-5 text-violet-400" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate max-w-[240px] sm:max-w-xs">
                        {song.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{song.artist}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                        <span className="capitalize">{song.genre}</span>
                        <span>&bull;</span>
                        <span className="uppercase">{song.language}</span>
                        <span>&bull;</span>
                        <span>{formatMsToTime(song.durationMs)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`queue-add-button-${song.id}`}
                    disabled={isAddingSong || isAdded}
                    onClick={() => handleAdd(song.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0',
                      isAdded
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-violet-600 hover:bg-violet-500 active:scale-95 text-white shadow-md shadow-violet-600/30'
                    )}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Queued</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Queue</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-xs text-slate-500">
          <span>{songs.length} tracks available</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
