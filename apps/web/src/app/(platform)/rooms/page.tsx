'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal, Info, Plus, Music2, AlertCircle } from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { RoomCard } from '@/components/shared/room-card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingState } from '@/components/shared/loading-state';
import { useRooms } from '@/hooks/queries/use-rooms';
import { RoomCategory, RoomStatus } from '@ktv/contracts';

const CATEGORIES: { id: RoomCategory; label: string }[] = [
  { id: 'all', label: 'All Lounges' },
  { id: 'pop', label: 'Pop & Billboard' },
  { id: 'anime', label: 'Anime & J-Rock' },
  { id: 'rock', label: 'Classic Rock' },
  { id: 'ballad', label: 'Ballads & Acoustic' },
  { id: 'rnb', label: 'R&B / Soul' },
];

export default function RoomDiscoveryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<RoomCategory>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const { data, isLoading, isError, error, refetch } = useRooms({
    category: selectedCategory === 'all' ? undefined : selectedCategory,
    status: selectedStatus === 'all' ? undefined : (selectedStatus as RoomStatus),
    search: searchQuery.trim() || undefined,
  });

  const rooms = useMemo(() => data?.items ?? [], [data?.items]);

  const totalSingers = useMemo(() => {
    return rooms.reduce((acc, r) => acc + (r.currentParticipantsCount || 0), 0);
  }, [rooms]);

  return (
    <div className="flex-1 py-8">
      <PageContainer>
        {/* API Status Notice Banner */}
        <div className="mb-8 p-4 rounded-2xl bg-violet-950/30 border border-violet-500/20 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-violet-300">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Realtime API Connected:</strong> Lounges are synchronized with the Express backend
              and MongoDB via TanStack Query.
            </span>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20">
            {totalSingers} Live Singers
          </span>
        </div>

        {/* Page Title & Host CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span>Karaoke Lounges</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-slate-300 font-medium">
                {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Find an open stage, join with friends, or listen to trending live performers.
            </p>
          </div>

          <Link
            href="/rooms/create"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-all shadow-lg shadow-violet-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Host New Lounge</span>
          </Link>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="glass-panel p-4 rounded-2xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/5">
          {/* Search Input */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by room name, track, or artist..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0e121e] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-[#0e121e] border border-white/10 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All Statuses</option>
              <option value="singing">Singing Now</option>
              <option value="idle">Queue Open (Idle)</option>
              <option value="paused">Intermission</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/25'
                    : 'bg-white/5 text-slate-400 hover:text-white border-white/5 hover:border-white/15'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Rooms Grid / States */}
        {isLoading ? (
          <LoadingState message="Connecting to API and loading lounges..." />
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Failed to Load Lounges"
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
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Music2}
            title="No Lounges Found"
            description="We couldn't find any rooms matching your search query and filters. Try adjusting your filters or hosting a new lounge."
            action={{
              label: 'Reset Filters',
              onClick: () => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedStatus('all');
              },
            }}
          />
        )}
      </PageContainer>
    </div>
  );
}
