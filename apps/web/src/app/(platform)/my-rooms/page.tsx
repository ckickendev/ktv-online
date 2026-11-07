'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Mic2,
  Plus,
  Radio,
  Users,
  Settings,
  Lock,
  Eye,
  ExternalLink,
  PowerOff,
  AlertCircle,
  Sparkles,
  Layers,
  Crown,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { RoomStatusBadge } from '@/components/shared/room-status-badge';
import { LoadingState } from '@/components/shared/loading-state';
import { CloseRoomDialog } from '@/components/rooms/close-room-dialog';
import { useMyRooms } from '@/hooks/queries/use-my-rooms';
import { useJoinedRooms } from '@/hooks/queries/use-room';
import { useCloseRoom } from '@/hooks/queries/use-room-mutations';
import { RoomDto } from '@ktv/contracts';

export default function MyRoomsPage() {
  const [activeTab, setActiveTab] = useState<'hosted' | 'joined'>('hosted');
  const { data, isLoading, isError, error, refetch } = useMyRooms();
  const {
    data: joinedData,
    isLoading: isJoinedLoading,
    isError: isJoinedError,
    error: joinedError,
    refetch: refetchJoined,
  } = useJoinedRooms(undefined, { enabled: activeTab === 'joined' });
  const closeRoomMutation = useCloseRoom();

  const [roomToClose, setRoomToClose] = useState<RoomDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rooms = useMemo(() => data?.items ?? [], [data?.items]);

  const stats = useMemo(() => {
    const total = rooms.length;
    const active = rooms.filter((r) => r.status !== 'closed').length;
    const closed = rooms.filter((r) => r.status === 'closed').length;
    const totalCapacity = rooms.reduce((acc, r) => acc + (r.capacity || 0), 0);
    return { total, active, closed, totalCapacity };
  }, [rooms]);

  const handleConfirmClose = async () => {
    if (!roomToClose) return;
    setActionError(null);

    try {
      await closeRoomMutation.mutateAsync(roomToClose.id);
      setRoomToClose(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Failed to close room. Please try again.');
      }
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex-1 py-10 bg-[#090b12] min-h-[calc(100vh-4rem)]">
        <PageContainer>
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium mb-2.5">
                <Crown className="w-3.5 h-3.5" />
                <span>Host Control Center</span>
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">My Karaoke Lounges</h1>
              <p className="text-sm text-slate-400 mt-1">
                Manage your hosted rooms, configure lounge settings, and review live performance stages.
              </p>
            </div>

            <Link
              href="/rooms/create"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-violet-600/25 transition-all self-start md:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Host New Lounge</span>
            </Link>
          </div>

          {/* Tabs: Lounges I Host vs Lounges I've Joined */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('hosted')}
              data-testid="tab-hosted-rooms"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'hosted'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Lounges I Host ({rooms.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('joined')}
              data-testid="tab-joined-rooms"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'joined'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Lounges I&apos;ve Joined ({joinedData?.pagination.total ?? 0})</span>
            </button>
          </div>

          {/* Action error alert */}
          {actionError && (
            <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-3 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{actionError}</div>
            </div>
          )}

          {activeTab === 'hosted' ? (
            /* HOSTED LOUNGES */
            isLoading ? (
              <div className="py-20 flex items-center justify-center">
                <LoadingState message="Loading your hosted lounges..." />
              </div>
            ) : isError ? (
              <div className="glass-panel p-8 rounded-3xl border border-red-500/20 text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                <h3 className="text-base font-bold text-white">Failed to Load Lounges</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {error instanceof Error ? error.message : 'Could not retrieve your rooms from the server.'}
                </p>
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : rooms.length === 0 ? (
              /* Empty State */
              <div className="glass-panel p-12 rounded-3xl border border-white/10 text-center max-w-xl mx-auto my-12">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-violet-600/30 to-cyan-500/30 border border-violet-500/30 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-violet-600/15">
                  <Mic2 className="w-8 h-8 text-cyan-400" />
                </div>
                <h2 className="text-xl font-extrabold text-white">Your Stage Is Waiting</h2>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  You haven&apos;t created any karaoke lounges yet. Host your first lounge, pick your favorite
                  music category, and invite your friends to start singing live.
                </p>
                <div className="mt-6">
                  <Link
                    href="/rooms/create"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-violet-600/30 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Host Your First Lounge</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* Main Content: Statistics + Room Cards */
              <div className="space-y-8">
                {/* Statistics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Total Lounges</div>
                      <div className="text-lg font-extrabold text-white">{stats.total}</div>
                    </div>
                  </div>

                  <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <Radio className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Active Stages</div>
                      <div className="text-lg font-extrabold text-white">{stats.active}</div>
                    </div>
                  </div>

                  <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-500/10 border border-white/10 flex items-center justify-center shrink-0">
                      <PowerOff className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Closed Lounges</div>
                      <div className="text-lg font-extrabold text-white">{stats.closed}</div>
                    </div>
                  </div>

                  <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Audience Capacity</div>
                      <div className="text-lg font-extrabold text-white">{stats.totalCapacity} Seats</div>
                    </div>
                  </div>
                </div>

                {/* Room Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rooms.map((room) => {
                    const isClosed = room.status === 'closed';
                    const capacityPercent = Math.min(
                      100,
                      Math.round(((room.currentParticipantsCount || 0) / room.capacity) * 100)
                    );

                    return (
                      <div
                        key={room.id}
                        className={`glass-panel rounded-3xl border transition-all flex flex-col justify-between overflow-hidden ${
                          isClosed
                            ? 'border-white/5 opacity-70 bg-[#0a0d16]'
                            : 'border-white/10 hover:border-violet-500/40 hover:shadow-xl hover:shadow-violet-600/10 bg-[#0d111d]'
                        }`}
                      >
                        {/* Top Card Info */}
                        <div className="p-6 space-y-4">
                          {/* Status & Badges */}
                          <div className="flex items-center justify-between gap-2">
                            <RoomStatusBadge status={room.status} />

                            <div className="flex items-center gap-1.5">
                              {/* Visibility Badge */}
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 border ${
                                  room.visibility === 'private'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                }`}
                              >
                                {room.visibility === 'private' ? (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span>Private</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3 h-3" />
                                    <span>Public</span>
                                  </>
                                )}
                              </span>

                              {/* Category Badge */}
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-slate-300 border border-white/10 uppercase">
                                {room.category}
                              </span>
                            </div>
                          </div>

                          {/* Room Name & Description */}
                          <div>
                            <h3 className="text-base font-bold text-white tracking-tight line-clamp-1">
                              {room.name}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-[2rem]">
                              {room.description || 'No description provided for this lounge.'}
                            </p>
                          </div>

                          {/* Capacity meter */}
                          <div className="pt-2 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Live Participants</span>
                              </span>
                              <span className="font-semibold text-white">
                                {room.currentParticipantsCount} / {room.capacity}
                              </span>
                            </div>
                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-violet-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                                style={{ width: `${capacityPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Card Actions Footer */}
                        <div className="p-4 bg-black/20 border-t border-white/5 flex items-center justify-between gap-2">
                          <Link
                            href={`/rooms/${room.id}`}
                            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                              isClosed
                                ? 'bg-white/5 text-slate-400 hover:text-white'
                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20'
                            }`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{isClosed ? 'View Room' : 'Enter Stage'}</span>
                          </Link>

                          <Link
                            href={`/rooms/${room.id}/manage`}
                            className="p-2 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                            title="Manage Lounge Settings"
                            aria-label="Manage Lounge Settings"
                          >
                            <Settings className="w-4 h-4" />
                          </Link>

                          {!isClosed && (
                            <button
                              type="button"
                              onClick={() => setRoomToClose(room)}
                              className="p-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Close Lounge"
                              aria-label="Close Lounge"
                            >
                              <PowerOff className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            /* JOINED LOUNGES */
            isJoinedLoading ? (
              <div className="py-20 flex items-center justify-center">
                <LoadingState message="Loading lounges you've joined..." />
              </div>
            ) : isJoinedError ? (
              <div className="glass-panel p-8 rounded-3xl border border-red-500/20 text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                <h3 className="text-base font-bold text-white">Failed to Load Joined Lounges</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {joinedError instanceof Error ? joinedError.message : 'Could not retrieve your joined lounges.'}
                </p>
                <button
                  onClick={() => refetchJoined()}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : !joinedData || joinedData.items.length === 0 ? (
              <div
                data-testid="joined-rooms-empty"
                className="glass-panel p-12 rounded-3xl border border-white/10 text-center max-w-xl mx-auto my-12"
              >
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-cyan-600/30 to-violet-500/30 border border-cyan-500/30 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-cyan-600/15">
                  <Users className="w-8 h-8 text-cyan-400" />
                </div>
                <h2 className="text-xl font-extrabold text-white">No Joined Lounges</h2>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  You haven&apos;t joined any karaoke lounges yet. Browse live lounges in the lobby and jump
                  into the fun!
                </p>
                <div className="mt-6">
                  <Link
                    href="/rooms"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-600/30 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Explore Lounges</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div data-testid="joined-rooms-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {joinedData.items.map((room) => {
                  const isClosed = room.status === 'closed';
                  return (
                    <div
                      key={room.id}
                      className="glass-panel rounded-3xl border border-white/10 bg-[#0d111d] flex flex-col justify-between overflow-hidden"
                    >
                      <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <RoomStatusBadge status={room.status} />
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-slate-300 border border-white/10 uppercase">
                            {room.category}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-white tracking-tight line-clamp-1">
                            {room.name}
                          </h3>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {room.description || 'No description provided.'}
                          </p>
                        </div>

                        <div className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
                          <span>Host: {room.host?.username ?? 'Lounge Host'}</span>
                          <span className="text-cyan-400 font-semibold">
                            {room.currentParticipantsCount}/{room.capacity}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 bg-black/20 border-t border-white/5">
                        <Link
                          href={`/rooms/${room.id}`}
                          className={`w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                            isClosed
                              ? 'bg-white/5 text-slate-400 hover:text-white'
                              : 'bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-md'
                          }`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{isClosed ? 'View Lounge' : 'Return to Stage'}</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </PageContainer>
      </div>

      {/* Confirmation Dialog */}
      <CloseRoomDialog
        room={roomToClose}
        isOpen={Boolean(roomToClose)}
        isPending={closeRoomMutation.isPending}
        onClose={() => setRoomToClose(null)}
        onConfirm={handleConfirmClose}
      />
    </ProtectedRoute>
  );
}
