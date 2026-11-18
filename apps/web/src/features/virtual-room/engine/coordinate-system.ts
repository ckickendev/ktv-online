import {
  DEFAULT_TILE_DIMENSIONS,
  ScreenPosition,
  TileDimensions,
} from './scene-types';
import { worldToScreen } from './isometric-projection';

export const ROOM_GRID = {
  COLS: 12,
  ROWS: 12,
} as const;

/**
 * Checks whether a given (col, row) is within the room grid boundaries.
 */
export function isWithinGrid(
  col: number,
  row: number,
  maxCols = ROOM_GRID.COLS,
  maxRows = ROOM_GRID.ROWS
): boolean {
  return col >= 0 && col < maxCols && row >= 0 && row < maxRows;
}

/**
 * Gets the center point of an isometric floor tile in screen coordinates.
 */
export function getTileCenter(
  col: number,
  row: number,
  elevation = 0,
  tileDimensions: TileDimensions = DEFAULT_TILE_DIMENSIONS
): ScreenPosition {
  const pos = worldToScreen(col, row, elevation, tileDimensions);
  return {
    x: pos.x,
    y: pos.y + tileDimensions.height / 2,
  };
}

// Re-export all sub-modules for clean imports
export * from './scene-types';
export * from './isometric-projection';
export * from './depth-sorting';
export * from './camera-transform';
