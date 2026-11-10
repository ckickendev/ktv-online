'use client';

import { useState, useMemo, useCallback } from 'react';
import { RoomAtmospherePreset } from '@ktv/contracts';
import {
  ATMOSPHERE_PRESETS,
  DEFAULT_ATMOSPHERE_PRESET,
  getAtmosphereConfig,
  AtmospherePresetConfig,
} from './atmosphere-presets';

export interface UseRoomAtmosphereOptions {
  authoritativePreset?: string | null;
}

export interface UseRoomAtmosphereReturn {
  activePreset: RoomAtmospherePreset;
  activeConfig: AtmospherePresetConfig;
  previewPreset: RoomAtmospherePreset | null;
  isPreviewing: boolean;
  setPreviewPreset: (preset: RoomAtmospherePreset) => void;
  clearPreview: () => void;
  allPresets: AtmospherePresetConfig[];
}

export function useRoomAtmosphere(options: UseRoomAtmosphereOptions = {}): UseRoomAtmosphereReturn {
  const { authoritativePreset } = options;
  const [previewPreset, setPreviewPresetState] = useState<RoomAtmospherePreset | null>(null);

  const effectivePreset: RoomAtmospherePreset = useMemo(() => {
    if (previewPreset) return previewPreset;
    if (authoritativePreset && authoritativePreset in ATMOSPHERE_PRESETS) {
      return authoritativePreset as RoomAtmospherePreset;
    }
    return DEFAULT_ATMOSPHERE_PRESET;
  }, [previewPreset, authoritativePreset]);

  const activeConfig = useMemo(() => {
    return getAtmosphereConfig(effectivePreset);
  }, [effectivePreset]);

  const setPreviewPreset = useCallback((preset: RoomAtmospherePreset) => {
    setPreviewPresetState(preset);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewPresetState(null);
  }, []);

  const allPresets = useMemo(() => {
    return Object.values(ATMOSPHERE_PRESETS);
  }, []);

  return {
    activePreset: effectivePreset,
    activeConfig,
    previewPreset,
    isPreviewing: Boolean(previewPreset),
    setPreviewPreset,
    clearPreview,
    allPresets,
  };
}
