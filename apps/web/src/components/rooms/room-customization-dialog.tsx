'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Sparkles,
  Check,
  AlertCircle,
  Loader2,
  Paintbrush,
  Eye,
} from 'lucide-react';
import { RoomSnapshotDto, RoomAtmospherePreset, UpdateRoomDto } from '@ktv/contracts';
import {
  ATMOSPHERE_PRESETS,
  DEFAULT_ATMOSPHERE_PRESET,
  AtmospherePresetConfig,
} from '@/features/rooms/atmosphere/atmosphere-presets';
import { cn } from '@/lib/utils';

export interface RoomCustomizationDialogProps {
  room: RoomSnapshotDto | null;
  stateVersion?: number;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: UpdateRoomDto) => Promise<unknown>;
  onPreviewPreset: (preset: RoomAtmospherePreset) => void;
  onResetPreview: () => void;
}

export function RoomCustomizationDialog({
  room,
  stateVersion,
  isOpen,
  isSaving,
  onClose,
  onSave,
  onPreviewPreset,
  onResetPreview,
}: RoomCustomizationDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState<RoomAtmospherePreset>(
    (room?.atmospherePreset as RoomAtmospherePreset) || DEFAULT_ATMOSPHERE_PRESET
  );
  const [name, setName] = useState(room?.name || '');
  const [description, setDescription] = useState(room?.description || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state whenever room changes or dialog opens
  useEffect(() => {
    if (room && isOpen) {
      setSelectedPreset((room.atmospherePreset as RoomAtmospherePreset) || DEFAULT_ATMOSPHERE_PRESET);
      setName(room.name || '');
      setDescription(room.description || '');
      setErrorMessage(null);
      setSaveSuccess(false);
    }
  }, [room, isOpen]);

  const handleCancel = useCallback(() => {
    onResetPreview();
    onClose();
  }, [onResetPreview, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        handleCancel();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, handleCancel]);

  const handleSelectPreset = (preset: RoomAtmospherePreset) => {
    setSelectedPreset(preset);
    onPreviewPreset(preset);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setErrorMessage('Room name must be at least 2 characters.');
      return;
    }
    if (trimmedName.length > 60) {
      setErrorMessage('Room name cannot exceed 60 characters.');
      return;
    }

    try {
      await onSave({
        name: trimmedName,
        description: description.trim() || null,
        atmospherePreset: selectedPreset,
        expectedStateVersion: stateVersion ?? room.stateVersion,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update lounge atmosphere.';
      setErrorMessage(msg);
    }
  };

  const presetsList: AtmospherePresetConfig[] = Object.values(ATMOSPHERE_PRESETS);

  return (
    <div
      data-testid="room-customization-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        data-testid="room-customization-dialog"
        className="w-full max-w-xl bg-[#0c101c] border border-violet-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customization-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-violet-500/30 flex items-center justify-center text-violet-300 shadow-md">
              <Paintbrush className="w-5 h-5" />
            </div>
            <div>
              <h2 id="customization-dialog-title" className="text-base font-bold text-white tracking-wide">
                Customize Lounge Atmosphere
              </h2>
              <p className="text-xs text-slate-400">Host settings & live visual preset</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
            aria-label="Close customization dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Preview Notification Pill */}
        <div className="mt-3 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-between text-xs text-violet-300 shrink-0">
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-violet-400" />
            <span>Clicking a preset previews it live behind this dialog.</span>
          </div>
          <span className="text-[10px] uppercase font-semibold text-violet-400/80">Host Only</span>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
          {/* Error / Success Notice */}
          {errorMessage && (
            <div
              data-testid="customization-error"
              className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div
              data-testid="customization-success"
              className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2"
            >
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Lounge atmosphere updated successfully!</span>
            </div>
          )}

          {/* Atmosphere Preset Selection Grid */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block uppercase tracking-wider">
              Atmosphere Presets
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {presetsList.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`preset-option-${preset.id}`}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={cn(
                      'p-3 rounded-2xl border text-left transition-all flex items-start gap-3 relative group',
                      isSelected
                        ? 'bg-white/10 border-violet-400 shadow-md shadow-violet-950/40 ring-1 ring-violet-400/50'
                        : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/5 text-slate-400'
                    )}
                  >
                    {/* Swatch Indicator */}
                    <div
                      className="w-8 h-8 rounded-xl shrink-0 border flex items-center justify-center shadow-inner"
                      style={{
                        background: `linear-gradient(135deg, ${preset.swatch.primary}, ${preset.swatch.secondary})`,
                        borderColor: preset.swatch.primary,
                      }}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={cn('text-xs font-bold truncate', isSelected ? 'text-white' : 'text-slate-200')}>
                          {preset.name}
                        </span>
                        {isSelected && (
                          <span className="text-[9px] font-bold uppercase text-violet-300 px-1.5 py-0.2 rounded-full bg-violet-500/20">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {preset.tagline}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Room Name */}
          <div className="space-y-1.5">
            <label htmlFor="room-custom-name" className="text-xs font-semibold text-slate-300 block">
              Lounge Name
            </label>
            <input
              id="room-custom-name"
              type="text"
              data-testid="customization-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-violet-500/60 transition-colors"
            />
            <span className="text-[10px] text-slate-500 block text-right">
              {name.length}/60
            </span>
          </div>

          {/* Room Description */}
          <div className="space-y-1.5">
            <label htmlFor="room-custom-desc" className="text-xs font-semibold text-slate-300 block">
              Lounge Description <span className="text-slate-500 text-[10px] font-normal">(optional)</span>
            </label>
            <textarea
              id="room-custom-desc"
              data-testid="customization-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={250}
              rows={2}
              placeholder="Tell guests what to expect in your lounge..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-violet-500/60 transition-colors resize-none"
            />
            <span className="text-[10px] text-slate-500 block text-right">
              {description.length}/250
            </span>
          </div>

          {/* Footer Submit / Cancel Actions */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium border border-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              data-testid="save-customization-button"
              disabled={isSaving || saveSuccess}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-violet-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Atmosphere...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Atmosphere Saved</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Apply Atmosphere</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
