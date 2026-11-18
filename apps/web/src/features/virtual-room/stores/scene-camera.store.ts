import { create } from 'zustand';
import {
  CameraBounds,
  CameraState,
  DEFAULT_CAMERA_CONFIG,
} from '../engine/scene-types';
import { clampCamera } from '../engine/camera-transform';

export const DEFAULT_CAMERA_BOUNDS: CameraBounds = {
  minX: -600,
  maxX: 600,
  minY: -450,
  maxY: 450,
};

interface SceneCameraStore extends CameraState {
  bounds: CameraBounds;
  isDragging: boolean;
  setPan: (x: number, y: number) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (delta: number, focalPoint?: { x: number; y: number }) => void;
  resetCamera: () => void;
  setMode: (mode: 'default' | 'focus' | 'follow', targetEntityId?: string) => void;
  setIsDragging: (isDragging: boolean) => void;
  setBounds: (bounds: CameraBounds) => void;
}

const INITIAL_CAMERA_STATE: CameraState = {
  x: 0,
  y: -20, // Slightly offset so stage and floor are balanced
  zoom: DEFAULT_CAMERA_CONFIG.defaultZoom,
  minZoom: DEFAULT_CAMERA_CONFIG.minZoom,
  maxZoom: DEFAULT_CAMERA_CONFIG.maxZoom,
  mode: 'default',
  targetEntityId: undefined,
};

export const useSceneCameraStore = create<SceneCameraStore>((set) => ({
  ...INITIAL_CAMERA_STATE,
  bounds: DEFAULT_CAMERA_BOUNDS,
  isDragging: false,

  setPan: (x, y) =>
    set((state) => {
      const clamped = clampCamera({ ...state, x, y }, state.bounds);
      return { x: clamped.x, y: clamped.y };
    }),

  panBy: (deltaX, deltaY) =>
    set((state) => {
      const nextX = state.x + deltaX;
      const nextY = state.y + deltaY;
      const clamped = clampCamera({ ...state, x: nextX, y: nextY }, state.bounds);
      return { x: clamped.x, y: clamped.y };
    }),

  setZoom: (zoom) =>
    set((state) => {
      const clamped = clampCamera({ ...state, zoom }, state.bounds);
      return { zoom: clamped.zoom };
    }),

  zoomBy: (delta) =>
    set((state) => {
      const nextZoom = state.zoom + delta;
      const clamped = clampCamera({ ...state, zoom: nextZoom }, state.bounds);
      return { zoom: clamped.zoom };
    }),

  resetCamera: () =>
    set(() => ({
      ...INITIAL_CAMERA_STATE,
    })),

  setMode: (mode, targetEntityId) =>
    set((state) => {
      if (mode === 'focus') {
        // Center directly on stage (elevation offset upwards)
        return {
          ...state,
          mode,
          x: 0,
          y: 40,
          zoom: Math.min(state.maxZoom, 1.4),
        };
      }
      return {
        ...state,
        mode,
        targetEntityId,
      };
    }),

  setIsDragging: (isDragging) => set({ isDragging }),
  setBounds: (bounds) => set({ bounds }),
}));
