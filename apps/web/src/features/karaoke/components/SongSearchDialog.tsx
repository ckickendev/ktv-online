'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Play,
  Square,
  History,
  Filter,
  Globe,
  AlertCircle,
  CheckCircle2,
  Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SongDto, SongAvailabilityFilter } from '@ktv/contracts';
import { karaokeApi } from '../api/karaoke-api';
import { queryKeys } from '@/hooks/queries/query-keys';
import { formatMsToTime } from './CurrentSongPanel';

interface SongSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (songId: string, singerId?: string) => Promise<unknown>;
  isAddingSong?: boolean;
  queueLength?: number;
  maxQueueSize?: number;
}

const STORAGE_RECENT_SEARCHES_KEY = 'ktv_song_search_recent';
const MAX_RECENT_SEARCHES = 5;

const GENRE_FILTERS = [
  { id: 'all', label: 'All Genres' },
  { id: 'folk', label: 'Folk' },
  { id: 'ballad', label: 'Ballad' },
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'city_pop', label: 'City Pop' },
  { id: 'anime', label: 'Anime' },
  { id: 'hiphop', label: 'Hip Hop' },
  { id: 'rnb', label: 'R&B' },
];

const LANGUAGE_FILTERS = [
  { id: 'all', label: 'All Languages' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: 'Japanese' },
];

const AVAILABILITY_TABS: { id: SongAvailabilityFilter; label: string; countBadge?: string }[] = [
  { id: 'all', label: 'All Tracks' },
  { id: 'playable', label: 'Playable Backing Tracks' },
  { id: 'metadata_only', label: 'Commercial Metadata' },
];

export function SongSearchDialog({
  isOpen,
  onClose,
  onSelectSong,
  isAddingSong = false,
  queueLength = 0,
  maxQueueSize = 50,
}: SongSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [selectedAvailability, setSelectedAvailability] = useState<SongAvailabilityFilter>('all');
  const [addedSongIds, setAddedSongIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recent Searches state
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecentSearches, setShowRecentSearches] = useState(false);

  // Audio preview state
  const [previewingSongId, setPreviewingSongId] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Licensing modal state
  const [licensingSongInfo, setLicensingSongInfo] = useState<SongDto | null>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, MAX_RECENT_SEARCHES));
        }
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, []);

  const saveRecentSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    setRecentSearches((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(STORAGE_RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(STORAGE_RECENT_SEARCHES_KEY);
    } catch {
      // Ignore
    }
  }, []);

  // Stop audio preview cleanly
  const stopAudioPreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.src = '';
      audioPreviewRef.current = null;
    }
    setPreviewingSongId(null);
    setIsPreviewLoading(false);
  }, []);

  // Stop preview whenever dialog closes
  useEffect(() => {
    if (!isOpen) {
      stopAudioPreview();
      setErrorMessage(null);
      setLicensingSongInfo(null);
    }
  }, [isOpen, stopAudioPreview]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopAudioPreview();
    };
  }, [stopAudioPreview]);

  // Debounce search query 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      if (searchQuery.trim().length >= 2) {
        saveRecentSearch(searchQuery);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery, saveRecentSearch]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (licensingSongInfo) {
          setLicensingSongInfo(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, licensingSongInfo]);

  // Query songs matching search & filters
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.karaoke.songs({
      q: debouncedQuery,
      genre: selectedGenre !== 'all' ? selectedGenre : undefined,
      language: selectedLanguage !== 'all' ? selectedLanguage : undefined,
      availability: selectedAvailability !== 'all' ? selectedAvailability : undefined,
    }),
    queryFn: () =>
      karaokeApi.searchSongs({
        q: debouncedQuery.trim(),
        genre: selectedGenre !== 'all' ? selectedGenre : undefined,
        language: selectedLanguage !== 'all' ? selectedLanguage : undefined,
        availability: selectedAvailability !== 'all' ? selectedAvailability : undefined,
        page: 1,
        limit: 40,
      }),
    enabled: isOpen,
    staleTime: 30000,
  });

  const songs: SongDto[] = data?.songs || [];

  // Handle Queueing
  const handleAdd = async (song: SongDto) => {
    setErrorMessage(null);

    if (song.audioAvailability !== 'audio_available') {
      setLicensingSongInfo(song);
      return;
    }

    try {
      await onSelectSong(song.id);
      saveRecentSearch(song.title);
      setAddedSongIds((prev) => new Set(prev).add(song.id));
      setTimeout(() => {
        setAddedSongIds((prev) => {
          const next = new Set(prev);
          next.delete(song.id);
          return next;
        });
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SONG_NOT_PLAYABLE') || msg.includes('audio track')) {
        setErrorMessage('This track cannot be queued because it does not have an authorized karaoke audio stream.');
      } else if (msg.includes('MAX_QUEUE_SIZE_EXCEEDED') || msg.includes('capacity')) {
        setErrorMessage('The room queue is currently full (maximum 50 songs).');
      } else {
        setErrorMessage('Failed to add song to queue. Please try again.');
      }
    }
  };

  // Toggle Audio Preview
  const handleTogglePreview = async (song: SongDto) => {
    if (song.audioAvailability !== 'audio_available') {
      setLicensingSongInfo(song);
      return;
    }

    if (previewingSongId === song.id) {
      stopAudioPreview();
      return;
    }

    stopAudioPreview();
    setPreviewingSongId(song.id);
    setIsPreviewLoading(true);

    try {
      const resolved = await karaokeApi.resolveAudioSource(song.id);
      if (!resolved || !resolved.url) {
        stopAudioPreview();
        return;
      }

      const audio = new Audio(resolved.url);
      audio.volume = 0.7;
      audioPreviewRef.current = audio;

      audio.addEventListener('canplaythrough', () => {
        setIsPreviewLoading(false);
      });

      audio.addEventListener('ended', () => {
        stopAudioPreview();
      });

      audio.addEventListener('error', () => {
        stopAudioPreview();
      });

      await audio.play();

      // Enforce 15-second preview cap to prevent long background playback
      previewTimerRef.current = setTimeout(() => {
        stopAudioPreview();
      }, 15000);
    } catch {
      stopAudioPreview();
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedGenre('all');
    setSelectedLanguage('all');
    setSelectedAvailability('all');
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="song-search-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        data-testid="song-search-dialog"
        className="w-full max-w-3xl max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#0c101c] border border-violet-500/25 shadow-2xl shadow-violet-950/60 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-600/30 to-cyan-500/20 text-violet-300 border border-violet-500/30">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Karaoke Song Catalog
              </h3>
              <p className="text-xs text-slate-400">
                Search backing tracks with synchronized lyrics & explore catalog metadata
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-song-search-dialog"
            onClick={onClose}
            className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close song discovery"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Development Catalog Banner & Queue Position */}
        <div className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-violet-950/40 via-purple-900/20 to-amber-950/30 border-b border-violet-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[11px] leading-relaxed">
              <strong>Catalog Guidance:</strong> Green-badged tracks feature verified karaoke audio and timed lyrics. Commercial entries are metadata-only.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-200 font-medium text-[11px]">
            <span>Next position:</span>
            <strong className="text-white">#{queueLength + 1}</strong>
            <span className="text-slate-400">/ {maxQueueSize}</span>
          </div>
        </div>

        {/* Search Input, Recent History, & Filters Bar */}
        <div className="p-4 sm:p-5 space-y-3.5 border-b border-white/5 bg-black/30">
          {/* Prominent Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              data-testid="song-search-input"
              value={searchQuery}
              onFocus={() => setShowRecentSearches(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowRecentSearches(false);
              }}
              placeholder="Search by song title, artist, or music genre..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-violet-500/70 transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedQuery('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                aria-label="Clear search query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Recent Searches Chips */}
          {recentSearches.length > 0 && !searchQuery && showRecentSearches && (
            <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
              <div className="flex items-center gap-1 text-slate-500">
                <History className="w-3.5 h-3.5" />
                <span>Recent:</span>
              </div>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setSearchQuery(term);
                    setShowRecentSearches(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors text-[11px]"
                >
                  {term}
                </button>
              ))}
              <button
                type="button"
                onClick={clearRecentSearches}
                className="text-[11px] text-slate-500 hover:text-slate-300 ml-auto underline"
              >
                Clear history
              </button>
            </div>
          )}

          {/* Row 1: Availability Segment Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/5 w-fit">
            {AVAILABILITY_TABS.map((tab) => {
              const isSelected = selectedAvailability === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedAvailability(tab.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 min-h-[36px]',
                    isSelected
                      ? tab.id === 'playable'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                        : tab.id === 'metadata_only'
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
                        : 'bg-violet-600 text-white shadow-md shadow-violet-950/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  )}
                >
                  {tab.id === 'playable' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />}
                  {tab.id === 'metadata_only' && <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Row 2: Genre & Language Filter Chips */}
          <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>Genre:</span>
              </span>
              {GENRE_FILTERS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGenre(g.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors min-h-[32px]',
                    selectedGenre === g.id
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 border-l border-white/10 pl-3">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                <span>Lang:</span>
              </span>
              {LANGUAGE_FILTERS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedLanguage(l.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors min-h-[32px]',
                    selectedLanguage === l.id
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="px-5 py-2.5 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-[280px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-violet-400" />
              <span className="text-xs">Searching karaoke catalog...</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
              <h4 className="text-sm font-bold text-white">Failed to Load Song Catalog</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Could not connect to the catalog server. Please check your network connection.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
              >
                Retry Search
              </button>
            </div>
          ) : songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Disc3 className="w-12 h-12 text-slate-600 mb-3" />
              <h4 className="text-sm font-bold text-slate-200">
                {debouncedQuery
                  ? `No songs found for "${debouncedQuery}"`
                  : 'No songs matching the active filters'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                {selectedAvailability === 'playable'
                  ? 'There are currently no playable tracks matching these filters. Try switching to "All Tracks" or clearing genre filters.'
                  : 'Try searching with a different artist, title, or resetting filters.'}
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-violet-600/20"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            songs.map((song) => {
              const isAdded = addedSongIds.has(song.id);
              const isPlayable = song.audioAvailability === 'audio_available';
              const isPreviewing = previewingSongId === song.id;

              return (
                <div
                  key={song.id}
                  data-testid={`song-result-${song.id}`}
                  className="p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all"
                >
                  {/* Left: Thumbnail & Song Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-900 border border-white/10 shrink-0">
                      {song.thumbnailUrl ? (
                        <Image
                          src={song.thumbnailUrl}
                          alt={song.title}
                          fill
                          className="object-cover"
                          sizes="56px"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-violet-950/40">
                          <Music className="w-6 h-6 text-violet-400" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[260px] sm:max-w-xs">
                          {song.title}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{song.artist}</p>

                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 flex-wrap">
                        <span className="capitalize">{song.genre}</span>
                        <span>&bull;</span>
                        <span className="uppercase">{song.language}</span>
                        <span>&bull;</span>
                        <span>{formatMsToTime(song.durationMs)}</span>
                        <span>&bull;</span>

                        {isPlayable ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Karaoke Ready</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400/90 font-medium bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 text-[10px]">
                            <Info className="w-3 h-3" />
                            <span>Metadata Only</span>
                          </span>
                        )}

                        {song.lyricsAvailability === 'timed_available' && (
                          <span className="text-cyan-400 font-medium text-[10px] bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                            Timed Lyrics
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions (Preview & Queue) */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Audio Preview Button (Playable tracks only) */}
                    {isPlayable ? (
                      <button
                        type="button"
                        data-testid={`preview-button-${song.id}`}
                        onClick={() => handleTogglePreview(song)}
                        className={cn(
                          'px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[44px]',
                          isPreviewing
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-md shadow-cyan-950/40'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                        )}
                        title={isPreviewing ? 'Stop preview' : 'Listen to 15s preview'}
                      >
                        {isPreviewLoading && isPreviewing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            <span>Loading...</span>
                          </>
                        ) : isPreviewing ? (
                          <>
                            <Square className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                            <span>Stop (15s)</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 text-slate-300 fill-slate-300" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLicensingSongInfo(song)}
                        className="px-3 py-2 rounded-xl text-[11px] font-medium text-amber-300/80 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors min-h-[44px] flex items-center gap-1"
                        title="View licensing information"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Licensing Info</span>
                      </button>
                    )}

                    {/* Queue Button (Only for playable tracks) */}
                    {isPlayable ? (
                      <button
                        type="button"
                        data-testid={`queue-add-button-${song.id}`}
                        disabled={isAddingSong || isAdded}
                        onClick={() => handleAdd(song)}
                        className={cn(
                          'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[44px]',
                          isAdded
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-violet-600 hover:bg-violet-500 active:scale-95 text-white shadow-md shadow-violet-600/30 disabled:opacity-50'
                        )}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span>Queued</span>
                          </>
                        ) : isAddingSong ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Queue Song</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLicensingSongInfo(song)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed min-h-[44px] flex items-center gap-1.5"
                        title="Commercial playback unavailable"
                      >
                        <span>Not Playable</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>{songs.length} tracks matching criteria</span>
            {previewingSongId && (
              <span className="text-cyan-400 font-medium animate-pulse hidden sm:inline">
                &bull; Playing preview...
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-colors min-h-[44px]"
          >
            Close
          </button>
        </div>
      </div>

      {/* Licensing Information Modal */}
      {licensingSongInfo && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => setLicensingSongInfo(null)}
        >
          <div
            className="w-full max-w-md p-6 rounded-2xl bg-[#0e121e] border border-amber-500/30 shadow-2xl text-left space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
                <Info className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white">Commercial Catalog Notice</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>&ldquo;{licensingSongInfo.title}&rdquo;</strong> by{' '}
              <strong>{licensingSongInfo.artist}</strong> is indexed for song discovery and search demonstration.
            </p>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-400 space-y-1.5">
              <p>
                <strong>License Classification:</strong> Commercial sound recording & composition.
              </p>
              <p>
                <strong>Karaoke Playback:</strong> Direct multi-user karaoke backing playback requires active commercial synchronization licensing agreements (ASCAP/BMI/VCPMC).
              </p>
              <p>
                To maintain copyright compliance, this song cannot be queued for live audio playback in this environment.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setLicensingSongInfo(null)}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors min-h-[44px]"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
