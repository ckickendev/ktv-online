import { CameraBounds, CameraState, DEFAULT_TILE_DIMENSIONS, TileDimensions } from './scene-types';
import { screenToWorld } from './isometric-projection';

/**
 * Generates the CSS transform string for the world layer container.
 * Uses integer pixel rounding on the translation components to prevent sprite blur.
 */
export function getCameraTransformCss(camera: CameraState): string {
  const roundedX = Math.round(camera.x);
  const roundedY = Math.round(camera.y);
  return `translate3d(${roundedX}px, ${roundedY}px, 0) scale(${camera.zoom})`;
}

/**
 * Clamps camera pan and zoom within defined safety boundaries.
 */
export function clampCamera(
  camera: CameraState,
  bounds: CameraBounds
): CameraState {
  const clampedZoom = Math.min(
    camera.maxZoom,
    Math.max(camera.minZoom, camera.zoom)
  );

  const clampedX = Math.min(bounds.maxX, Math.max(bounds.minX, camera.x));
  const clampedY = Math.min(bounds.maxY, Math.max(bounds.minY, camera.y));

  return {
    ...camera,
    zoom: clampedZoom,
    x: clampedX,
    y: clampedY,
  };
}

/**
 * Converts a client viewport coordinate (e.g. mouse click relative to viewport DOM element)
 * into world coordinates (col, row), accounting for camera pan, zoom, and viewport center offset.
 */
export function viewportToWorld(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
  camera: CameraState,
  tileDimensions: TileDimensions = DEFAULT_TILE_DIMENSIONS,
  elevation = 0
): { col: number; row: number } {
  // 1. Calculate offset from viewport center
  const centerOffsetX = clientX - viewportWidth / 2;
  const centerOffsetY = clientY - viewportHeight / 2;

  // 2. Reverse camera translation
  const unshiftedX = centerOffsetX - camera.x;
  const unshiftedY = centerOffsetY - camera.y;

  // 3. Reverse camera zoom scaling
  const screenX = unshiftedX / camera.zoom;
  const screenY = unshiftedY / camera.zoom;

  // 4. Reverse isometric projection to world coordinates
  return screenToWorld(screenX, screenY, tileDimensions, elevation);
}
