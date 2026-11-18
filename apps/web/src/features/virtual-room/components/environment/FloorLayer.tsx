'use client';

import React, { memo } from 'react';
import { ROOM_GRID } from '../../engine/coordinate-system';
import { worldToScreenSnapped } from '../../engine/isometric-projection';
import { ProceduralFloorTile } from '../../assets/procedural-sprites';

interface FloorLayerProps {
  onTileClick?: (col: number, row: number) => void;
  selectedTile?: { col: number; row: number } | null;
  hoveredTile?: { col: number; row: number } | null;
}

export const FloorLayer = memo(function FloorLayer({
  onTileClick,
  selectedTile,
  hoveredTile,
}: FloorLayerProps) {
  const tiles: React.ReactNode[] = [];

  for (let col = 0; col < ROOM_GRID.COLS; col++) {
    for (let row = 0; row < ROOM_GRID.ROWS; row++) {
      // Screen position for the tile origin (top vertex of diamond)
      const { x, y } = worldToScreenSnapped(col, row, 0);

      // Determine aesthetic tile variant by zone
      const isStageZone = col >= 4 && col <= 7 && row >= 1 && row <= 3;
      const isVipZone = col >= 8 && row >= 8;
      const variant = isStageZone ? 'stage' : isVipZone ? 'carpet' : 'wood';

      const isSelected = selectedTile?.col === col && selectedTile?.row === row;
      const isHovered = hoveredTile?.col === col && hoveredTile?.row === row;

      tiles.push(
        <div
          key={`floor_${col}_${row}`}
          style={{
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: '64px',
            height: '32px',
            transform: 'translate(-50%, 0)', // Center tile horizontally on isometric coordinate
          }}
          className="cursor-pointer transition-transform hover:brightness-125"
          onClick={() => onTileClick?.(col, row)}
          title={`Tile (${col}, ${row})`}
        >
          <ProceduralFloorTile
            variant={variant}
            isSelected={isSelected}
            isHovered={isHovered}
          />
        </div>
      );
    }
  }

  return (
    <div
      data-testid="floor-layer"
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 0 }}
    >
      {tiles}
    </div>
  );
});
