import type { VoiceConnectionState } from '@ktv/contracts';

export interface VirtualRoomVoiceState {
  userId: string;
  isSpeaking: boolean;
  isMuted: boolean;
  connectionState: VoiceConnectionState;
}

export type VirtualRoomVoiceMap = Map<string, VirtualRoomVoiceState>;

export interface WorldPosition {
  col: number;
  row: number;
  elevation: number;
}

export interface ScreenPosition {
  x: number;
  y: number;
}

export interface TileDimensions {
  width: number;
  height: number;
}

export const DEFAULT_TILE_DIMENSIONS: TileDimensions = {
  width: 64,
  height: 32,
};

export interface SceneEntityFootprint {
  widthCols: number;
  depthRows: number;
}

export type SceneEntityType =
  | 'floor'
  | 'wall'
  | 'furniture'
  | 'stage'
  | 'avatar'
  | 'seat'
  | 'effect';

export interface SceneEntity {
  id: string;
  type: SceneEntityType;
  position: WorldPosition;
  footprint?: SceneEntityFootprint;
  depthAnchor?: WorldPosition;
  layerPriority?: number;
  assetId?: string;
  zIndex?: number;
  userId?: string;
  displayName?: string;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  mode: 'default' | 'focus' | 'follow';
  targetEntityId?: string;
}

export const DEFAULT_CAMERA_CONFIG = {
  defaultZoom: 1,
  minZoom: 0.75,
  maxZoom: 2.5,
} as const;

export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
