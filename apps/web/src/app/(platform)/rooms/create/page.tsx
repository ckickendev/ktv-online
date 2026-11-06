'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Mic2,
  Users,
  Eye,
  Lock,
  Sparkles,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Music2,
  Radio,
  Crown,
  PartyPopper,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/page-container';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useCreateRoom } from '@/hooks/queries/use-room-mutations';
import { CreateRoomSchema, CreateRoomDto, RoomCategory, RoomType } from '@ktv/contracts';
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

const ROOM_TYPE_OPTIONS: { id: RoomType; label: string; desc: string; icon: typeof Mic2 }[] = [
  { id: 'standard', label: 'Standard Lounge', desc: 'Classic cozy room for friends', icon: Mic2 },
  { id: 'vip', label: 'VIP Studio', desc: 'Premium audio effects & spotlights', icon: Crown },
  { id: 'party', label: 'Party Stage', desc: 'High energy open party lounge', icon: PartyPopper },
];

export default function CreateRoomPage() {
  const router = useRouter();
  const createRoomMutation = useCreateRoom();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateRoomDto>({
    resolver: zodResolver(CreateRoomSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'pop',
      roomType: 'standard',
      visibility: 'public',
      capacity: 10,
    },
  });

  const selectedCategory = watch('category');
  const selectedRoomType = watch('roomType');
  const selectedVisibility = watch('visibility');
  const currentCapacity = watch('capacity');

  const onSubmit = async (data: CreateRoomDto) => {
    setServerError(null);

    try {
      const room = await createRoomMutation.mutateAsync(data);
      router.push(`/rooms/${room.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setServerError(err.message || 'Failed to create room. Please check your inputs.');
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred while creating your room.');
      }
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex-1 py-10 bg-[#090b12] min-h-[calc(100vh-4rem)]">
        <PageContainer>
          {/* Breadcrumb Navigation */}
          <div className="mb-6">
            <Link
              href="/rooms"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Lounges</span>
            </Link>
          </div>

          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Host Your Stage</span>
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                Create a Karaoke Lounge
              </h1>
              <p className="text-sm text-slate-400 mt-1.5">
                Set up your virtual room, choose the music atmosphere, and invite your friends to sing live.
              </p>
            </div>

            {/* Server Error Alert */}
            {serverError && (
              <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-3 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{serverError}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
              {/* Section 1: Basic Information */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-5">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Mic2 className="w-4 h-4 text-violet-400" />
                  <span>Basic Information</span>
                </h2>

                {/* Room Name */}
                <div className="space-y-1.5">
                  <label htmlFor="name" className="block text-xs font-semibold text-slate-300">
                    Lounge Name <span className="text-violet-400">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="e.g. Tokyo Midnight Beats, 90s Pop Singalong"
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
                    Description <span className="text-slate-500 text-[10px]">(Optional)</span>
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    placeholder="Tell guests about your room's vibe, song preferences, or rules..."
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

              {/* Section 2: Mood & Music Genre */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Music2 className="w-4 h-4 text-cyan-400" />
                    <span>Music Mood & Category</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Help other singers discover your lounge by selecting the primary music genre.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
                  {CATEGORY_OPTIONS.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setValue('category', cat.id, { shouldValidate: true })}
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
                {errors.category && (
                  <p className="text-[11px] text-red-400 font-medium pl-1">{errors.category.message}</p>
                )}
              </div>

              {/* Section 3: Room Type & Experience */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <span>Lounge Style</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Select the atmosphere for your virtual room stage.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ROOM_TYPE_OPTIONS.map((type) => {
                    const isSelected = selectedRoomType === type.id;
                    const IconComponent = type.icon;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setValue('roomType', type.id, { shouldValidate: true })}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-lg shadow-cyan-500/15'
                            : 'bg-[#0e121e] border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                        }`}
                      >
                        <IconComponent
                          className={`w-5 h-5 mb-2.5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`}
                        />
                        <div className="text-xs font-bold text-white">{type.label}</div>
                        <div className="text-[11px] text-slate-400 mt-1 leading-snug">{type.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 4: Visibility & Capacity */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-6">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Access & Capacity</span>
                </h2>

                {/* Visibility Toggle */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Room Visibility
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setValue('visibility', 'public', { shouldValidate: true })}
                      className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                        selectedVisibility === 'public'
                          ? 'bg-violet-600/20 border-violet-500 text-white shadow-lg shadow-violet-600/20'
                          : 'bg-[#0e121e] border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                      }`}
                    >
                      <Eye className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-white">Public Lounge</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Discoverable by all singers on the Explore Lounges stage.
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setValue('visibility', 'private', { shouldValidate: true })}
                      className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                        selectedVisibility === 'private'
                          ? 'bg-violet-600/20 border-violet-500 text-white shadow-lg shadow-violet-600/20'
                          : 'bg-[#0e121e] border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                      }`}
                    >
                      <Lock className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-white">Private Lounge</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Hidden from public list. Only users with direct link can join.
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Capacity */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="capacity" className="block text-xs font-semibold text-slate-300">
                      Participant Capacity
                    </label>
                    <span className="text-xs font-bold text-cyan-400 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                      {currentCapacity} Maximum Singers
                    </span>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-2">
                    {[4, 8, 12, 20, 30, 50].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setValue('capacity', preset, { shouldValidate: true })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          currentCapacity === preset
                            ? 'bg-cyan-500 text-black border-cyan-400'
                            : 'bg-[#0e121e] border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <input
                    id="capacity"
                    type="range"
                    min="2"
                    max="50"
                    step="1"
                    {...register('capacity', { valueAsNumber: true })}
                    className="w-full accent-cyan-400 bg-white/10 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                    <span>Min: 2 people</span>
                    <span>Max: 50 people</span>
                  </div>
                  {errors.capacity && (
                    <p className="text-[11px] text-red-400 font-medium pl-1">{errors.capacity.message}</p>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <Link
                  href="/rooms"
                  className="px-5 py-3 rounded-xl border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </Link>

                <button
                  type="submit"
                  disabled={isSubmitting || createRoomMutation.isPending}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting || createRoomMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Lounge...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Create Lounge & Enter Stage</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </PageContainer>
      </div>
    </ProtectedRoute>
  );
}
