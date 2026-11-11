'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, Sparkles, Image as ImageIcon, Check, AlertCircle } from 'lucide-react';
import { useUpdateProfile } from '@/hooks/queries/use-user-profile';
import { UserAvatar } from '../shared/user-avatar';
import { cn } from '@/lib/utils';

export const CURATED_AVATARS = [
  {
    id: 'neon-singer',
    label: 'Neon Singer',
    url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'cyber-dj',
    label: 'Cyber DJ',
    url: 'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'disco-diva',
    label: 'Disco Diva',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'rock-legend',
    label: 'Rockstar',
    url: 'https://images.unsplash.com/photo-1520523839898-507125cd53c1?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'vinyl-chill',
    label: 'Vinyl Chill',
    url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'anime-idol',
    label: 'Anime Idol',
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'retro-synth',
    label: 'Retro Synth',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'vocal-legend',
    label: 'Vocal Legend',
    url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
  },
];

export interface ProfileEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialDisplayName?: string | null;
  initialBio?: string | null;
  initialAvatar?: string | null;
  username: string;
}

export function ProfileEditDialog({
  isOpen,
  onClose,
  initialDisplayName,
  initialBio,
  initialAvatar,
  username,
}: ProfileEditDialogProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName || '');
  const [bio, setBio] = useState(initialBio || '');
  const [avatar, setAvatar] = useState<string | null>(initialAvatar || null);
  const [customAvatarInput, setCustomAvatarInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateProfileMutation = useUpdateProfile();

  useEffect(() => {
    if (isOpen) {
      setDisplayName(initialDisplayName || '');
      setBio(initialBio || '');
      setAvatar(initialAvatar || null);
      setCustomAvatarInput(
        initialAvatar && !CURATED_AVATARS.some((p) => p.url === initialAvatar) ? initialAvatar : ''
      );
      setShowCustomInput(
        Boolean(initialAvatar && !CURATED_AVATARS.some((p) => p.url === initialAvatar))
      );
      setValidationError(null);
    }
  }, [isOpen, initialDisplayName, initialBio, initialAvatar]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.length > 0 && trimmedDisplayName.length < 2) {
      setValidationError('Stage Name must be at least 2 characters.');
      return;
    }
    if (trimmedDisplayName.length > 32) {
      setValidationError('Stage Name cannot exceed 32 characters.');
      return;
    }

    const trimmedBio = bio.trim();
    if (trimmedBio.length > 160) {
      setValidationError('Bio cannot exceed 160 characters.');
      return;
    }

    let resolvedAvatar = avatar;
    if (showCustomInput && customAvatarInput.trim()) {
      resolvedAvatar = customAvatarInput.trim();
    }

    if (resolvedAvatar && !resolvedAvatar.startsWith('http://') && !resolvedAvatar.startsWith('https://')) {
      setValidationError('Avatar must be a valid http or https URL.');
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        displayName: trimmedDisplayName.length > 0 ? trimmedDisplayName : null,
        bio: trimmedBio.length > 0 ? trimmedBio : null,
        avatar: resolvedAvatar || null,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile identity';
      setValidationError(message);
    }
  };

  const currentPreviewName = displayName.trim() || username;

  return (
    <div
      data-testid="profile-edit-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        className="w-full max-w-lg bg-[#0e121e] border border-white/10 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 my-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={updateProfileMutation.isPending}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Dialog Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 id="profile-edit-title" className="text-lg font-bold text-white">
              Edit Stage Identity
            </h2>
            <p className="text-xs text-slate-400">
              Customize how you appear across all lounges, stages, and queues.
            </p>
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-4 mb-6">
          <UserAvatar name={currentPreviewName} avatarUrl={avatar} size="lg" status="online" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm truncate">{currentPreviewName}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold">
                Preview
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">@{username}</p>
            <p className="text-xs text-slate-300 line-clamp-1 mt-0.5 italic">
              {bio.trim() || 'No bio provided yet.'}
            </p>
          </div>
        </div>

        {validationError && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2.5 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Stage Name / Display Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="stage-name" className="text-xs font-semibold text-slate-300">
                Stage / Display Name
              </label>
              <span className="text-[10px] text-slate-500">{displayName.length}/32</span>
            </div>
            <input
              id="stage-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={`e.g. ${username} Superstar`}
              maxLength={32}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Leave blank to keep using your username (@{username}).
            </p>
          </div>

          {/* Bio */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="stage-bio" className="text-xs font-semibold text-slate-300">
                Singer Bio
              </label>
              <span
                className={cn(
                  'text-[10px]',
                  bio.length > 150 ? 'text-amber-400 font-semibold' : 'text-slate-500'
                )}
              >
                {bio.length}/160
              </span>
            </div>
            <textarea
              id="stage-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others about your favorite karaoke tracks, favorite vocal genres, or fun trivia..."
              maxLength={160}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-500 transition-colors resize-none"
            />
          </div>

          {/* Avatar Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              Stage Avatar Preset
            </label>

            <div className="grid grid-cols-4 gap-2.5 mb-3">
              {CURATED_AVATARS.map((preset) => {
                const isSelected = avatar === preset.url && !showCustomInput;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setAvatar(preset.url);
                      setShowCustomInput(false);
                    }}
                    className={cn(
                      'p-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all text-center group',
                      isSelected
                        ? 'bg-violet-600/20 border-violet-500 text-white shadow-lg shadow-violet-600/20 ring-1 ring-violet-500'
                        : 'bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.06]'
                    )}
                  >
                    <div className="relative">
                      <UserAvatar name={preset.label} avatarUrl={preset.url} size="md" />
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center text-white ring-2 ring-[#0e121e]">
                          <Check className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-medium truncate w-full">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom URL or Reset Options */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCustomInput(!showCustomInput);
                  if (!showCustomInput && customAvatarInput.trim()) {
                    setAvatar(customAvatarInput.trim());
                  }
                }}
                className={cn(
                  'px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5',
                  showCustomInput
                    ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Custom Image URL</span>
              </button>

              {avatar && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatar(null);
                    setCustomAvatarInput('');
                    setShowCustomInput(false);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-white/10 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors"
                >
                  Reset to Initials
                </button>
              )}
            </div>

            {showCustomInput && (
              <div className="mt-2.5 animate-in fade-in duration-150">
                <input
                  type="url"
                  value={customAvatarInput}
                  onChange={(e) => {
                    setCustomAvatarInput(e.target.value);
                    setAvatar(e.target.value.trim() || null);
                  }}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-violet-500 transition-colors"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Paste a direct link to any PNG, JPG, or SVG image.
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={updateProfileMutation.isPending}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-violet-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {updateProfileMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
