import {
  DEFAULT_TILE_DIMENSIONS,
  ScreenPosition,
  TileDimensions,
} from './scene-types';

/**
 * Snaps a numerical value to integer pixels to avoid subpixel blur in pixel-art rendering.
 */
export function snapToPixel(value: number): number {
  return Math.round(value);
}

/**
 * Converts logical world coordinates (col, row, elevation) into 2:1 isometric screen coordinates.
 *
 * Formula:
 * x = (col - row) * (tileWidth / 2)
 * y = (col + row) * (tileHeight / 2) - elevation
 */
export function worldToScreen(
  col: number,
  row: number,
  elevation = 0,
  tileDimensions: TileDimensions = DEFAULT_TILE_DIMENSIONS
): ScreenPosition {
  const halfWidth = tileDimensions.width / 2;
  const halfHeight = tileDimensions.height / 2;

  const x = (col - row) * halfWidth;
  const y = (col + row) * halfHeight - elevation;

  return { x, y };
}

/**
 * Converts world coordinates into pixel-snapped screen coordinates.
 */
export function worldToScreenSnapped(
  col: number,
  row: number,
  elevation = 0,
  tileDimensions: TileDimensions = DEFAULT_TILE_DIMENSIONS
): ScreenPosition {
  const pos = worldToScreen(col, row, elevation, tileDimensions);
  return {
    x: snapToPixel(pos.x),
    y: snapToPixel(pos.y),
  };
}

/**
 * Converts screen coordinates (relative to the isometric origin (0,0)) back to logical world coordinates.
 *
 * Inverse Formula for 2:1 diamond grid:
 * col = (screenX / tileWidth) + (screenY / tileHeight)
 * row = (screenY / tileHeight) - (screenX / tileWidth)
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  tileDimensions: TileDimensions = DEFAULT_TILE_DIMENSIONS,
  elevation = 0
): { col: number; row: number } {
  // Offset screenY with elevation before inverse projection
  const effectiveY = screenY + elevation;

  const col = screenX / tileDimensions.width + effectiveY / tileDimensions.height;
  const row = effectiveY / tileDimensions.height - screenX / tileDimensions.width;

  return { col, row };
}

/**
 * Converts screen coordinates to the nearest integer grid cell (col, row).
 */
export function screenToGridCell(
  screenX: number,
  screenY: number,
  tileDimensions: TileDimensions = DEFAULT_TILE_DIMENSIONS,
  elevation = 0
): { col: number; row: number } {
  const { col, row } = screenToWorld(screenX, screenY, tileDimensions, elevation);
  return {
    col: Math.floor(col),
    row: Math.floor(row),
  };
}
