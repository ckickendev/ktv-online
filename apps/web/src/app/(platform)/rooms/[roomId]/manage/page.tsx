'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Settings,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Lock,
  Users,
  PowerOff,
  Music2,
  ExternalLink,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { LoadingState } from '@/components/shared/loading-state';
import { RoomStatusBadge } from '@/components/shared/room-status-badge';
import { CloseRoomDialog } from '@/components/rooms/close-room-dialog';
import { useRoom } from '@/hooks/queries/use-room';
import { useUpdateRoom, useCloseRoom } from '@/hooks/queries/use-room-mutations';
import { useAuth } from '@/hooks/use-auth';
import { UpdateRoomSchema, UpdateRoomDto, RoomCategory } from '@ktv/contracts';
import { ApiError } from '@/lib/api/errors';

const CATEGORY_OPTIONS: { id: RoomCategory; label: string; icon: string }[] = [
  { id: 'pop', label: 'Pop & Billboard', icon: '🎤' },
  { id: 'anime', label: 'Anime & J-Rock', icon: '⚡' },
  { id: 'rock', label: 'Classic Rock', icon: '🎸' },
  { id: 'ballad', label: 'Ballads & Acoustic', icon: '🎹' },
  { id: 'hiphop', label: 'Hip Hop & Rap', icon: '🎧' },
  { id: 'rnb', label: 'R&B / Soul', icon: '✨' },
  { id: 'all', label: 'Open Mic / Variety', icon: '🌟' },
];

export default function RoomManagePage() {
  const params = useParams();
  const roomId = params?.roomId as string;

  const { user } = useAuth();
  const { data: room, isLoading, isError, error } = useRoom(roomId);
  const updateRoomMutation = useUpdateRoom();
  const closeRoomMutation = useCloseRoom();

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateRoomDto>({
    resolver: zodResolver(UpdateRoomSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'pop',
      visibility: 'public',
      capacity: 10,
    },
  });

  // Populate form when room data is fetched
  useEffect(() => {
    if (room) {
      reset({
        name: room.name,
        description: room.description || '',
        category: room.category,
        visibility: room.visibility,
        capacity: room.capacity,
      });
    }
  }, [room, reset]);

  const selectedCategory = watch('category');
  const selectedVisibility = watch('visibility');
  const currentCapacity = watch('capacity');

  const isOwner = Boolean(user && room && room.ownerId === user.id);
  const isClosed = room?.status === 'closed';
  const minAllowedCapacity = Math.max(2, room?.currentParticipantsCount || 2);

  const onSubmit = async (data: UpdateRoomDto) => {
    setServerError(null);
    setSuccessMessage(null);

    // Client-side guard for capacity
    if (data.capacity !== undefined && room && data.capacity < room.currentParticipantsCount) {
      setServerError(
        `Capacity cannot be reduced below the current participant count (${room.currentParticipantsCount}).`
      );
      return;
    }

    try {
      await updateRoomMutation.mutateAsync({ roomId, data });
      setSuccessMessage('Lounge settings updated successfully!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setServerError(err.message || 'Failed to update room settings.');
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred while saving changes.');
      }
    }
  };

  const handleConfirmClose = async () => {
    if (!room) return;
    setServerError(null);

    try {
      await closeRoomMutation.mutateAsync(room.id);
      setShowCloseDialog(false);
      setSuccessMessage('Lounge has been closed.');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Failed to close room.');
      }
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex-1 py-10 bg-[#090b12] min-h-[calc(100vh-4rem)]">
        <PageContainer>
          {/* Top Navigation */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/my-rooms"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Back to My Lounges</span>
            </Link>

            {room && (
              <Link
                href={`/rooms/${room.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <span>Go to Live Stage</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="py-20 flex items-center justify-center">
              <LoadingState message="Loading lounge configuration..." />
            </div>
          ) : isError || !room ? (
            <div className="glass-panel p-8 rounded-3xl border border-red-500/20 text-center space-y-4 max-w-md mx-auto">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
              <h2 className="text-base font-bold text-white">Lounge Not Found</h2>
              <p className="text-xs text-slate-400">
                {error instanceof Error ? error.message : 'The requested lounge could not be loaded.'}
              </p>
              <Link
                href="/my-rooms"
                className="inline-block px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
              >
                Back to My Lounges
              </Link>
            </div>
          ) : !isOwner ? (
            /* Forbidden: Not Owner State */
            <div className="glass-panel p-10 rounded-3xl border border-amber-500/20 text-center max-w-md mx-auto my-12 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-7 h-7 text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Host Access Required</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                You are not the designated host of &ldquo;{room.name}&rdquo;. Only the lounge owner can
                edit room configuration or conclude the stage session.
              </p>
              <div className="pt-2">
                <Link
                  href="/rooms"
                  className="inline-block px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md transition-all"
                >
                  Explore Public Lounges
                </Link>
              </div>
            </div>
          ) : (
            /* Main Management Interface */
            <div className="max-w-3xl mx-auto space-y-8">
              {/* Header Title */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-semibold uppercase">
                      Lounge Management
                    </span>
                    <RoomStatusBadge status={room.status} />
                  </div>
                  <h1 className="text-3xl font-extrabold text-white tracking-tight">{room.name}</h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Created on {new Date(room.createdAt).toLocaleDateString()} • {room.currentParticipantsCount} Live Singer{room.currentParticipantsCount === 1 ? '' : 's'}
                  </p>
                </div>

                <Link
                  href={`/rooms/${room.id}`}
                  className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Enter Stage</span>
                </Link>
              </div>

              {/* Status Warning if Closed */}
              {isClosed && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Lounge Session Concluded:</strong> This room is marked as closed and no longer
                    accepts new singers or audience members.
                  </div>
                </div>
              )}

              {/* Success Notification */}
              {successMessage && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="font-semibold">{successMessage}</div>
                </div>
              )}

              {/* Server Error Alert */}
              {serverError && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-3 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="font-medium">{serverError}</div>
                </div>
              )}

              {/* Settings Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
                {/* General Settings */}
                <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-5">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 text-violet-400" />
                    <span>Lounge Information</span>
                  </h2>

                  {/* Room Name */}
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="block text-xs font-semibold text-slate-300">
                      Lounge Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      {...register('name')}
                      className={`w-full px-4 py-2.5 rounded-xl bg-[#0e121e] border text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                        errors.name
                          ? 'border-red-500/60 focus:border-red-500'
                          : 'border-white/10 focus:border-violet-500'
                      }`}
                    />
                    {errors.name && (
                      <p className="text-[11px] text-red-400 font-medium pl-1">{errors.name.message}</p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label htmlFor="description" className="block text-xs font-semibold text-slate-300">
                      Description
                    </label>
                    <textarea
                      id="description"
                      rows={3}
                      {...register('description')}
                      className={`w-full px-4 py-2.5 rounded-xl bg-[#0e121e] border text-xs text-white placeholder-slate-500 focus:outline-none transition-colors resize-none ${
                        errors.description
                          ? 'border-red-500/60 focus:border-red-500'
                          : 'border-white/10 focus:border-violet-500'
                      }`}
                    />
                    {errors.description && (
                      <p className="text-[11px] text-red-400 font-medium pl-1">
                        {errors.description.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Mood & Category */}
                <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Music2 className="w-4 h-4 text-cyan-400" />
                    <span>Music Category</span>
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setValue('category', cat.id, { shouldDirty: true })}
                          className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 ${
                            isSelected
                              ? 'bg-violet-600/20 border-violet-500 text-white shadow-lg shadow-violet-600/20'
                              : 'bg-[#0e121e] border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                          }`}
                        >
                          <span className="text-xl">{cat.icon}</span>
                          <span className="text-xs font-semibold">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Access & Capacity */}
                <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-6">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>Visibility & Capacity</span>
                  </h2>

                  {/* Visibility */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      Visibility Mode
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setValue('visibility', 'public', { shouldDirty: true })}
                        className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          selectedVisibility === 'public'
                            ? 'bg-violet-600/20 border-violet-500 text-white'
                            : 'bg-[#0e121e] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Eye className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-white">Public Stage</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Listed in Explore Lounges directory.
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setValue('visibility', 'private', { shouldDirty: true })}
                        className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          selectedVisibility === 'private'
                            ? 'bg-violet-600/20 border-violet-500 text-white'
                            : 'bg-[#0e121e] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Lock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-white">Private Stage</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Direct invite link only.
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Capacity */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="capacity" className="block text-xs font-semibold text-slate-300">
                        Total Capacity
                      </label>
                      <span className="text-xs font-bold text-cyan-400 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                        {currentCapacity} Max Singers
                      </span>
                    </div>

                    <input
                      id="capacity"
                      type="range"
                      min={minAllowedCapacity}
                      max="50"
                      step="1"
                      {...register('capacity', { valueAsNumber: true })}
                      className="w-full accent-cyan-400 bg-white/10 h-2 rounded-lg cursor-pointer"
                    />

                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>
                        Min allowed: {minAllowedCapacity} (currently {room.currentParticipantsCount} active)
                      </span>
                      <span>Max: 50</span>
                    </div>
                    {errors.capacity && (
                      <p className="text-[11px] text-red-400 font-medium pl-1">
                        {errors.capacity.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || updateRoomMutation.isPending || !isDirty}
                    className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-violet-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmitting || updateRoomMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </form>

              {/* Danger Zone */}
              <div className="p-6 rounded-3xl bg-red-950/20 border border-red-500/20 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-red-300 flex items-center gap-2">
                    <PowerOff className="w-4 h-4 text-red-400" />
                    <span>Danger Zone</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Conclude your live karaoke room session. Once closed, new singers cannot enter this stage.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-slate-400">
                    Status:{' '}
                    <span className="font-semibold text-white capitalize">{room.status}</span>
                  </div>

                  {!isClosed ? (
                    <button
                      type="button"
                      onClick={() => setShowCloseDialog(true)}
                      className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-600/20 transition-all flex items-center gap-2"
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      <span>Close Lounge</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                      Lounge Already Closed
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </PageContainer>
      </div>

      {/* Close Confirmation Modal */}
      <CloseRoomDialog
        room={room ?? null}
        isOpen={showCloseDialog}
        isPending={closeRoomMutation.isPending}
        onClose={() => setShowCloseDialog(false)}
        onConfirm={handleConfirmClose}
      />
    </ProtectedRoute>
  );
}
