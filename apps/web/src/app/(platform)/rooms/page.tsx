'use client';

import React, { useState, useEffect, useTransition, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Search,
  SlidersHorizontal,
  Plus,
  Music2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Users,
  Compass,
  Loader2,
  Sparkles,
  Radio,
  Clock,
  Sparkle,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { RoomCard } from '@/components/shared/room-card';
import { RoomCardSkeleton } from '@/components/shared/room-card-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { RoomPreviewDialog } from '@/components/rooms/room-preview-dialog';
import { useRooms } from '@/hooks/queries/use-rooms';
import { useJoinRoom } from '@/hooks/queries/use-room';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/queries/use-user-preferences';
import {
  RoomDto,
  RoomCategory,
  RoomStatus,
  RoomType,
  RoomAvailability,
  RoomSortBy,
  RoomAtmospherePreset,
} from '@ktv/contracts';

const CATEGORIES: { id: RoomCategory; label: string }[] = [
  { id: 'all', label: 'All Lounges' },
  { id: 'pop', label: 'Pop & Billboard' },
  { id: 'anime', label: 'Anime & J-Rock' },
  { id: 'rock', label: 'Classic Rock' },
  { id: 'ballad', label: 'Ballads & Acoustic' },
  { id: 'hiphop', label: 'Hip-Hop & Rap' },
  { id: 'rnb', label: 'R&B / Soul' },
];

const ATMOSPHERE_OPTIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Atmosphere Vibes' },
  { id: 'neon_stage', label: 'Tokyo Neon Stage' },
  { id: 'midnight_lounge', label: 'Midnight Cyberpunk' },
  { id: 'cozy_acoustic', label: 'Cozy Acoustic' },
  { id: 'classic_karaoke', label: 'Classic Disco' },
  { id: 'minimal_studio', label: 'Midnight Jazz' },
];

const ROOM_STYLES: { id: string; label: string }[] = [
  { id: 'all', label: 'All Styles' },
  { id: 'standard', label: 'Standard' },
  { id: 'vip', label: 'VIP Lounge' },
  { id: 'party', label: 'Party Stage' },
];

const AVAILABILITY_OPTIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Availability' },
  { id: 'available', label: 'Available Only' },
  { id: 'full', label: 'Full Rooms' },
];

const STATUS_OPTIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Statuses' },
  { id: 'singing', label: 'Singing Now' },
  { id: 'idle', label: 'Queue Open (Idle)' },
  { id: 'paused', label: 'Intermission' },
];

const SORT_OPTIONS: { id: RoomSortBy; label: string }[] = [
  { id: 'newest', label: 'Newest First' },
  { id: 'popular', label: 'Most Popular' },
  { id: 'oldest', label: 'Oldest First' },
];

function RoomDiscoveryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const { isAuthenticated } = useAuth();
  const { preferences: userPreferences } = useUserPreferences();
  const joinMutation = useJoinRoom();

  // Preview & Joining State
  const [previewRoom, setPreviewRoom] = useState<RoomDto | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Read URL parameters
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = (searchParams.get('category') as RoomCategory) || 'all';
  const initialRoomType = searchParams.get('roomType') || 'all';
  const initialStatus = searchParams.get('status') || 'all';
  const initialAvailability = (searchParams.get('availability') as RoomAvailability) || 'all';
  const initialAtmosphere = searchParams.get('atmospherePreset') || 'all';
  const initialSortBy = (searchParams.get('sortBy') as RoomSortBy) || 'newest';
  const initialPage = Math.max(1, Number(searchParams.get('page')) || 1);

  // Local state for debounced search input
  const [searchInput, setSearchInput] = useState(initialSearch);

  // Sync search input if URL changes externally (e.g. browser back/forward)
  useEffect(() => {
    setSearchInput(initialSearch);
  }, [initialSearch]);

  // User personalized top genre match for quick discovery
  const userTopGenreCategory = useMemo(() => {
    if (!userPreferences?.preferredGenres?.length) return null;
    const genreMap: Record<string, RoomCategory> = {
      pop: 'pop',
      ballad: 'ballad',
      rock: 'rock',
      rap: 'hiphop',
      rnb: 'rnb',
      anime: 'anime',
    };
    for (const g of userPreferences.preferredGenres) {
      if (genreMap[g]) return genreMap[g];
    }
    return null;
  }, [userPreferences?.preferredGenres]);

  // URL State Updater Helper
  const updateUrlParams = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      startTransition(() => {
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, pathname, router]
  );

  // Debounced search sync to URL (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchInput.trim() !== initialSearch) {
        updateUrlParams({
          search: searchInput.trim() || undefined,
          page: 1, // Reset page when search term changes
        });
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchInput, initialSearch, updateUrlParams]);

  // Filter handlers
  const handleCategoryChange = (category: RoomCategory) => {
    updateUrlParams({ category: category === 'all' ? undefined : category, page: 1 });
  };

  const handleRoomTypeChange = (roomType: string) => {
    updateUrlParams({ roomType: roomType === 'all' ? undefined : (roomType as RoomType), page: 1 });
  };

  const handleAvailabilityChange = (availability: string) => {
    updateUrlParams({
      availability: availability === 'all' ? undefined : (availability as RoomAvailability),
      page: 1,
    });
  };

  const handleStatusChange = (status: string) => {
    updateUrlParams({ status: status === 'all' ? undefined : (status as RoomStatus), page: 1 });
  };

  const handleAtmosphereChange = (atmospherePreset: string) => {
    updateUrlParams({
      atmospherePreset: atmospherePreset === 'all' ? undefined : atmospherePreset,
      page: 1,
    });
  };

  const handleSortChange = (sortBy: RoomSortBy) => {
    updateUrlParams({ sortBy: sortBy === 'newest' ? undefined : sortBy, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    updateUrlParams({ page: newPage });
  };

  const handleClearAllFilters = () => {
    setSearchInput('');
    setJoinError(null);
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  // Preview Handlers
  const handleOpenPreview = useCallback((room: RoomDto) => {
    setJoinError(null);
    setPreviewRoom(room);
    setIsPreviewOpen(true);
  }, []);

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  // Quick Join Handler (Authoritative join mutation with error feedback)
  const handleQuickJoin = useCallback(
    async (room: RoomDto) => {
      setJoinError(null);
      if (!isAuthenticated) {
        router.push(`/login?redirect=/rooms/${room.id}`);
        return;
      }

      setJoiningRoomId(room.id);
      try {
        await joinMutation.mutateAsync(room.id);
        router.push(`/rooms/${room.id}`);
      } catch (err: unknown) {
        let message = 'Unable to join lounge. Please try again.';
        if (err && typeof err === 'object') {
          const apiErr = err as { message?: string; status?: number; error?: string };
          if (apiErr.status === 409 || apiErr.message?.includes('capacity') || apiErr.error === 'ROOM_FULL') {
            message = 'This lounge is currently at maximum capacity.';
          } else if (apiErr.status === 400 || apiErr.message?.includes('closed') || apiErr.error === 'ROOM_CLOSED') {
            message = 'This lounge is closed and is no longer accepting new singers.';
          } else if (apiErr.status === 403 || apiErr.message?.includes('removed') || apiErr.error === 'FORBIDDEN_KICKED') {
            message = 'You were removed from this lounge by the host and cannot rejoin.';
          } else if (apiErr.status === 403 || apiErr.message?.includes('private') || apiErr.error === 'PRIVATE_ROOM') {
            message = 'This lounge is private. Only invited guests may enter.';
          } else if (apiErr.message) {
            message = apiErr.message;
          }
        }
        setJoinError(message);
        setJoiningRoomId(null);
      }
    },
    [isAuthenticated, joinMutation, router]
  );

  // Active query parameters for API call
  const queryFilters = useMemo(
    () => ({
      search: initialSearch.trim() || undefined,
      category: initialCategory === 'all' ? undefined : initialCategory,
      roomType: initialRoomType === 'all' ? undefined : (initialRoomType as RoomType),
      status: initialStatus === 'all' ? undefined : (initialStatus as RoomStatus),
      availability: initialAvailability === 'all' ? undefined : initialAvailability,
      atmospherePreset:
        initialAtmosphere === 'all'
          ? undefined
          : (initialAtmosphere as RoomAtmospherePreset),
      sortBy: initialSortBy,
      page: initialPage,
      limit: 12,
    }),
    [
      initialSearch,
      initialCategory,
      initialRoomType,
      initialStatus,
      initialAvailability,
      initialAtmosphere,
      initialSortBy,
      initialPage,
    ]
  );

  // TanStack Query
  const { data, isLoading, isFetching, isError, error, refetch } = useRooms(queryFilters);

  const rooms = data?.items ?? [];
  const pagination = data?.pagination;
  const totalRooms = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  // Active filter chip indicators
  const activeFilters = useMemo(() => {
    const list: { key: string; label: string; onRemove: () => void }[] = [];

    if (initialSearch) {
      list.push({
        key: 'search',
        label: `Search: "${initialSearch}"`,
        onRemove: () => {
          setSearchInput('');
          updateUrlParams({ search: undefined, page: 1 });
        },
      });
    }

    if (initialCategory !== 'all') {
      const cat = CATEGORIES.find((c) => c.id === initialCategory);
      list.push({
        key: 'category',
        label: `Category: ${cat?.label || initialCategory}`,
        onRemove: () => updateUrlParams({ category: undefined, page: 1 }),
      });
    }

    if (initialRoomType !== 'all') {
      const st = ROOM_STYLES.find((s) => s.id === initialRoomType);
      list.push({
        key: 'roomType',
        label: `Style: ${st?.label || initialRoomType}`,
        onRemove: () => updateUrlParams({ roomType: undefined, page: 1 }),
      });
    }

    if (initialAvailability !== 'all') {
      const av = AVAILABILITY_OPTIONS.find((a) => a.id === initialAvailability);
      list.push({
        key: 'availability',
        label: av?.label || initialAvailability,
        onRemove: () => updateUrlParams({ availability: undefined, page: 1 }),
      });
    }

    if (initialStatus !== 'all') {
      const st = STATUS_OPTIONS.find((s) => s.id === initialStatus);
      list.push({
        key: 'status',
        label: `Status: ${st?.label || initialStatus}`,
        onRemove: () => updateUrlParams({ status: undefined, page: 1 }),
      });
    }

    if (initialAtmosphere !== 'all') {
      const at = ATMOSPHERE_OPTIONS.find((a) => a.id === initialAtmosphere);
      list.push({
        key: 'atmosphere',
        label: `Vibe: ${at?.label || initialAtmosphere}`,
        onRemove: () => updateUrlParams({ atmospherePreset: undefined, page: 1 }),
      });
    }

    return list;
  }, [
    initialSearch,
    initialCategory,
    initialRoomType,
    initialAvailability,
    initialStatus,
    initialAtmosphere,
    updateUrlParams,
  ]);

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className="flex-1 py-8">
      <PageContainer>
        {/* Discovery Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-3">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Social Karaoke Lounge Lobby</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Discover Your Next Stage
            </h1>
            <p className="text-sm sm:text-base text-slate-400 mt-2 max-w-xl">
              Preview live lounges, find your people, and step into the spotlight.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/my-rooms"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-medium text-xs sm:text-sm transition-all"
            >
              <Users className="w-4 h-4 text-violet-400" />
              <span>My Lounges</span>
            </Link>

            <Link
              href="/rooms/create"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-lg shadow-violet-600/20 group"
            >
              <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
              <span>Host Your Lounge</span>
            </Link>
          </div>
        </div>

        {/* Search Bar & Global Filter Bar */}
        <div className="glass-panel p-4 rounded-2xl mb-6 border border-white/5 space-y-4 shadow-xl">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Prominent Search Input */}
            <div className="relative w-full md:flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search lounges, music moods, or singer rooms..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#090c15] border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
              {isFetching && (
                <div className="absolute right-9 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                </div>
              )}
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sorting Dropdown */}
            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
              <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                aria-label="Sort Lounges"
                value={initialSortBy}
                onChange={(e) => handleSortChange(e.target.value as RoomSortBy)}
                className="w-full md:w-auto bg-[#090c15] border border-white/10 text-xs text-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Secondary Filter Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-medium">Filters:</span>
              </div>

              {/* Room Style Filter */}
              <select
                aria-label="Filter by Style"
                value={initialRoomType}
                onChange={(e) => handleRoomTypeChange(e.target.value)}
                className="bg-[#090c15] border border-white/10 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                {ROOM_STYLES.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Availability Filter */}
              <select
                aria-label="Filter by Availability"
                value={initialAvailability}
                onChange={(e) => handleAvailabilityChange(e.target.value)}
                className="bg-[#090c15] border border-white/10 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                aria-label="Filter by Status"
                value={initialStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="bg-[#090c15] border border-white/10 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Atmosphere Preset Filter */}
              <select
                aria-label="Filter by Atmosphere"
                value={initialAtmosphere}
                onChange={(e) => handleAtmosphereChange(e.target.value)}
                className="bg-[#090c15] border border-white/10 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
              >
                {ATMOSPHERE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearAllFilters}
                className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors ml-auto sm:ml-0"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Quick Discovery Category Presets & Category Navigation Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
          {/* Quick Preset: For You */}
          {userTopGenreCategory && (
            <button
              onClick={() => handleCategoryChange(userTopGenreCategory)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                initialCategory === userTopGenreCategory
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-violet-500 shadow-md shadow-violet-600/30'
                  : 'bg-violet-950/40 text-violet-300 hover:text-white border-violet-500/30 hover:border-violet-500/50'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>For You</span>
            </button>
          )}

          {/* Quick Preset: Singing Now */}
          <button
            onClick={() => handleStatusChange(initialStatus === 'singing' ? 'all' : 'singing')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              initialStatus === 'singing'
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30'
                : 'bg-white/5 text-slate-400 hover:text-white border-white/5 hover:border-white/15'
            }`}
          >
            <Radio className="w-3 h-3 text-rose-400" />
            <span>Singing Now</span>
          </button>

          {/* Quick Preset: Open Slots */}
          <button
            onClick={() =>
              handleAvailabilityChange(initialAvailability === 'available' ? 'all' : 'available')
            }
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              initialAvailability === 'available'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                : 'bg-white/5 text-slate-400 hover:text-white border-white/5 hover:border-white/15'
            }`}
          >
            <Sparkle className="w-3 h-3 text-emerald-400" />
            <span>Open Slots</span>
          </button>

          {/* Quick Preset: Recently Created */}
          <button
            onClick={() => handleSortChange(initialSortBy === 'newest' ? 'popular' : 'newest')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
              initialSortBy === 'newest'
                ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/30'
                : 'bg-white/5 text-slate-400 hover:text-white border-white/5 hover:border-white/15'
            }`}
          >
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Recently Created</span>
          </button>

          <div className="w-[1px] h-4 bg-white/10 shrink-0 mx-1" />

          {/* Genre Category Pills */}
          {CATEGORIES.map((cat) => {
            const isSelected = initialCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/30'
                    : 'bg-white/5 text-slate-400 hover:text-white border-white/5 hover:border-white/15'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-xs text-slate-400">Active filters:</span>
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium"
              >
                <span>{f.label}</span>
                <button
                  onClick={f.onRemove}
                  aria-label={`Remove filter ${f.label}`}
                  className="hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Global Join Error Alert */}
        {joinError && (
          <div
            data-testid="discovery-join-error-banner"
            className="p-3.5 mb-6 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{joinError}</span>
            </div>
            <button
              onClick={() => setJoinError(null)}
              className="p-1 hover:bg-rose-500/20 rounded-lg text-rose-300 hover:text-white transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Results Count Summary */}
        {!isLoading && !isError && rooms.length > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-400 mb-4 px-1">
            <span>
              Showing <strong className="text-slate-200">{rooms.length}</strong> of{' '}
              <strong className="text-slate-200">{totalRooms}</strong> {totalRooms === 1 ? 'lounge' : 'lounges'}
            </span>
            <span>
              Page <strong className="text-slate-200">{initialPage}</strong> of{' '}
              <strong className="text-slate-200">{totalPages}</strong>
            </span>
          </div>
        )}

        {/* Rooms Grid / States */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="loading-skeletons">
            {Array.from({ length: 6 }).map((_, i) => (
              <RoomCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Failed to Load Karaoke Lounges"
            description={
              error instanceof Error
                ? error.message
                : 'Could not connect to the backend API server. Please check your network connection.'
            }
            action={{
              label: 'Retry Connection',
              onClick: () => refetch(),
            }}
          />
        ) : rooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onPreview={handleOpenPreview}
                onQuickJoin={handleQuickJoin}
                isJoining={joiningRoomId === room.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Music2}
            title="No Lounges Found"
            description="We couldn't find any rooms matching your search and filter criteria. Try adjusting your filters or hosting your own lounge."
            action={{
              label: 'Reset Filters',
              onClick: handleClearAllFilters,
            }}
          />
        )}

        {/* Pagination Controls */}
        {!isLoading && !isError && totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <button
              onClick={() => handlePageChange(initialPage - 1)}
              disabled={initialPage <= 1}
              aria-label="Previous Page"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 disabled:pointer-events-none border border-white/10 text-xs font-medium transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const isCurrent = p === initialPage;
                return (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`w-8 h-8 rounded-xl text-xs font-semibold flex items-center justify-center transition-all ${
                      isCurrent
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => handlePageChange(initialPage + 1)}
              disabled={initialPage >= totalPages}
              aria-label="Next Page"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 disabled:pointer-events-none border border-white/10 text-xs font-medium transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Room Preview Modal Dialog */}
        <RoomPreviewDialog
          room={previewRoom}
          isOpen={isPreviewOpen}
          onClose={handleClosePreview}
          onJoin={handleQuickJoin}
          isJoining={previewRoom ? joiningRoomId === previewRoom.id : false}
          isAuthenticated={isAuthenticated}
          joinError={joinError}
        />
      </PageContainer>
    </div>
  );
}

function DiscoveryLoadingFallback() {
  return (
    <div className="flex-1 py-8">
      <PageContainer>
        <div className="h-20 bg-white/5 rounded-2xl animate-pulse mb-8" />
        <div className="h-24 bg-white/5 rounded-2xl animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      </PageContainer>
    </div>
  );
}

export default function RoomDiscoveryPage() {
  return (
    <Suspense fallback={<DiscoveryLoadingFallback />}>
      <RoomDiscoveryContent />
    </Suspense>
  );
}
