import { SceneEntity, WorldPosition } from './scene-types';

export const LAYER_PRIORITIES = {
  BACKGROUND: -100,
  FLOOR: 0,
  BACK_WALL: 10,
  FURNITURE: 30,
  AVATAR: 40,
  STAGE_ELEMENT: 50,
  FRONT_DECORATION: 70,
  EFFECTS: 100,
  ATMOSPHERE: 200,
} as const;

/**
 * Resolves the effective base depth anchor for a scene entity.
 * For multi-tile footprints, the anchor is placed at the front-most tile (max col, max row)
 * where the object intersects the ground plane closest to the viewer.
 */
export function resolveDepthAnchor(entity: SceneEntity): WorldPosition {
  if (entity.depthAnchor) {
    return entity.depthAnchor;
  }

  if (entity.footprint) {
    return {
      col: entity.position.col + Math.max(0, entity.footprint.widthCols - 1),
      row: entity.position.row + Math.max(0, entity.footprint.depthRows - 1),
      elevation: entity.position.elevation,
    };
  }

  return entity.position;
}

/**
 * Calculates a monotonic depth sort key for an entity.
 * In a 2:1 diamond isometric projection, (col + row) represents distance along the camera view axis
 * towards the viewer (higher = closer to viewer, renders in front / on top).
 */
export function calculateDepth(entity: SceneEntity): number {
  const anchor = resolveDepthAnchor(entity);
  const baseSortDistance = anchor.col + anchor.row;

  const layerPriority = entity.layerPriority ?? 0;
  const elevationWeight = (anchor.elevation || 0) * 0.001;

  // Primary ordering is world distance (anchor.col + anchor.row).
  // Layer priority acts as fine-grained offset when entities share the same tile footprint.
  return baseSortDistance * 1000 + layerPriority + elevationWeight;
}

/**
 * Sorts scene entities in deterministic rendering order (back-to-front).
 * Entities with lower depth keys render first (underneath); higher keys render on top.
 * Ties are broken deterministically by entity ID to prevent visual z-fighting.
 */
export function sortSceneEntities<T extends SceneEntity>(entities: T[]): T[] {
  return [...entities].sort((a, b) => {
    const depthA = calculateDepth(a);
    const depthB = calculateDepth(b);

    if (Math.abs(depthA - depthB) > 0.0001) {
      return depthA - depthB;
    }

    // Deterministic tie-breaker
    return a.id.localeCompare(b.id);
  });
}
