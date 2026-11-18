import { describe, it, expect } from 'vitest';
import {
  worldToScreen,
  worldToScreenSnapped,
  screenToWorld,
  screenToGridCell,
  snapToPixel,
  sortSceneEntities,
  resolveDepthAnchor,
  LAYER_PRIORITIES,
  getCameraTransformCss,
  clampCamera,
  viewportToWorld,
  SceneEntity,
  CameraState,
} from '../features/virtual-room/engine/coordinate-system';

describe('Virtual Room: 2:1 Isometric Coordinate Engine', () => {
  const tileDims = { width: 64, height: 32 };

  it('correctly maps (0, 0, 0) to origin (0, 0)', () => {
    const screen = worldToScreen(0, 0, 0, tileDims);
    expect(screen).toEqual({ x: 0, y: 0 });
  });

  it('correctly calculates 2:1 isometric coordinates for diagonal and orthogonal cells', () => {
    // (1, 0): x = (1 - 0) * 32 = 32, y = (1 + 0) * 16 = 16
    expect(worldToScreen(1, 0, 0, tileDims)).toEqual({ x: 32, y: 16 });

    // (0, 1): x = (0 - 1) * 32 = -32, y = (0 + 1) * 16 = 16
    expect(worldToScreen(0, 1, 0, tileDims)).toEqual({ x: -32, y: 16 });

    // (2, 2): x = (2 - 2) * 32 = 0, y = (2 + 2) * 16 = 64
    expect(worldToScreen(2, 2, 0, tileDims)).toEqual({ x: 0, y: 64 });
  });

  it('accounts for vertical elevation by shifting y upward', () => {
    const withoutElevation = worldToScreen(3, 3, 0, tileDims);
    const withElevation = worldToScreen(3, 3, 20, tileDims);

    expect(withElevation.x).toBe(withoutElevation.x);
    expect(withElevation.y).toBe(withoutElevation.y - 20);
  });

  it('snaps screen coordinates to integer pixels', () => {
    expect(snapToPixel(32.4)).toBe(32);
    expect(snapToPixel(32.7)).toBe(33);

    const snapped = worldToScreenSnapped(1.5, 0.5, 0, tileDims);
    expect(Number.isInteger(snapped.x)).toBe(true);
    expect(Number.isInteger(snapped.y)).toBe(true);
  });

  it('inverts screen coordinates back to world coordinates accurately (roundtrip)', () => {
    const testCases = [
      { col: 0, row: 0 },
      { col: 4, row: 4 },
      { col: 2, row: 7 },
      { col: 11, row: 3 },
      { col: 0, row: 11 },
    ];

    for (const testCase of testCases) {
      const screen = worldToScreen(testCase.col, testCase.row, 0, tileDims);
      const world = screenToWorld(screen.x, screen.y, tileDims);

      expect(Math.round(world.col)).toBe(testCase.col);
      expect(Math.round(world.row)).toBe(testCase.row);
    }
  });

  it('maps fractional screen click to correct grid cell', () => {
    // Center of tile (2, 3):
    // screenX = (2 - 3) * 32 = -32
    // screenY = (2 + 3) * 16 = 80
    const cell = screenToGridCell(-30, 82, tileDims);
    expect(cell).toEqual({ col: 2, row: 3 });
  });
});

describe('Virtual Room: Depth Sorting & Footprint Anchors', () => {
  it('correctly sorts single-tile entities from back to front along view axis', () => {
    const entityFarBack: SceneEntity = {
      id: 'far_back',
      type: 'furniture',
      position: { col: 1, row: 1, elevation: 0 },
    };

    const entityMiddle: SceneEntity = {
      id: 'middle',
      type: 'avatar',
      position: { col: 4, row: 3, elevation: 0 },
    };

    const entityForeground: SceneEntity = {
      id: 'foreground',
      type: 'furniture',
      position: { col: 8, row: 9, elevation: 0 },
    };

    const sorted = sortSceneEntities([entityForeground, entityFarBack, entityMiddle]);
    expect(sorted.map((e) => e.id)).toEqual(['far_back', 'middle', 'foreground']);
  });

  it('resolves multi-tile furniture footprint to its front-most corner anchor', () => {
    const sofa: SceneEntity = {
      id: 'vip_sofa',
      type: 'furniture',
      position: { col: 2, row: 2, elevation: 0 },
      footprint: { widthCols: 3, depthRows: 2 }, // Spans cols 2..4, rows 2..3
    };

    const anchor = resolveDepthAnchor(sofa);
    expect(anchor).toEqual({ col: 4, row: 3, elevation: 0 });
  });

  it('correctly places an avatar behind vs in front of multi-tile sofa', () => {
    const sofa: SceneEntity = {
      id: 'sofa',
      type: 'furniture',
      position: { col: 3, row: 3, elevation: 0 },
      footprint: { widthCols: 2, depthRows: 2 }, // front anchor is (4, 4) -> sum = 8
      layerPriority: LAYER_PRIORITIES.FURNITURE,
    };

    // Avatar standing behind the sofa at (2, 2) -> sum = 4
    const avatarBehind: SceneEntity = {
      id: 'avatar_behind',
      type: 'avatar',
      position: { col: 2, row: 2, elevation: 0 },
      layerPriority: LAYER_PRIORITIES.AVATAR,
    };

    // Avatar standing in front of the sofa at (5, 5) -> sum = 10
    const avatarInFront: SceneEntity = {
      id: 'avatar_in_front',
      type: 'avatar',
      position: { col: 5, row: 5, elevation: 0 },
      layerPriority: LAYER_PRIORITIES.AVATAR,
    };

    const sorted = sortSceneEntities([avatarInFront, sofa, avatarBehind]);
    expect(sorted.map((e) => e.id)).toEqual(['avatar_behind', 'sofa', 'avatar_in_front']);
  });

  it('performs stable deterministic tie-breaking when depth scores are identical', () => {
    const entityA: SceneEntity = {
      id: 'entity_alpha',
      type: 'avatar',
      position: { col: 3, row: 3, elevation: 0 },
      layerPriority: 0,
    };

    const entityB: SceneEntity = {
      id: 'entity_beta',
      type: 'avatar',
      position: { col: 3, row: 3, elevation: 0 },
      layerPriority: 0,
    };

    const sorted1 = sortSceneEntities([entityB, entityA]);
    const sorted2 = sortSceneEntities([entityA, entityB]);

    expect(sorted1.map((e) => e.id)).toEqual(['entity_alpha', 'entity_beta']);
    expect(sorted2.map((e) => e.id)).toEqual(['entity_alpha', 'entity_beta']);
  });
});

describe('Virtual Room: Camera Transformations & Viewport Inversion', () => {
  const camera: CameraState = {
    x: 100,
    y: -50,
    zoom: 1.5,
    minZoom: 0.75,
    maxZoom: 2.5,
    mode: 'default',
  };

  it('generates integer-pixel rounded CSS transform string', () => {
    const transform = getCameraTransformCss({
      ...camera,
      x: 100.4,
      y: -50.8,
    });

    expect(transform).toBe('translate3d(100px, -51px, 0) scale(1.5)');
  });

  it('clamps camera pan and zoom strictly to bounds', () => {
    const bounds = { minX: -200, maxX: 200, minY: -100, maxY: 100 };

    const outOfBoundsCam: CameraState = {
      ...camera,
      x: 500,
      y: -300,
      zoom: 4.0,
    };

    const clamped = clampCamera(outOfBoundsCam, bounds);
    expect(clamped.x).toBe(200);
    expect(clamped.y).toBe(-100);
    expect(clamped.zoom).toBe(2.5);
  });

  it('inverts viewport click coordinates back to logical world coordinates', () => {
    const viewportW = 800;
    const viewportH = 600;
    const tileDims = { width: 64, height: 32 };

    const centeredCam: CameraState = {
      x: 0,
      y: 0,
      zoom: 1.0,
      minZoom: 0.75,
      maxZoom: 2.5,
      mode: 'default',
    };

    // A click exactly in the center of the viewport (400, 300) with (0,0) camera translation
    // corresponds to world coordinate (0, 0)
    const worldAtCenter = viewportToWorld(400, 300, viewportW, viewportH, centeredCam, tileDims);
    expect(Math.round(worldAtCenter.col)).toBe(0);
    expect(Math.round(worldAtCenter.row)).toBe(0);
  });
});
