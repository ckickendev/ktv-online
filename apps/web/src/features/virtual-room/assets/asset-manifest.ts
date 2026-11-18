export interface AssetDefinition {
  id: string;
  name: string;
  type: 'floor' | 'wall' | 'furniture' | 'stage' | 'avatar' | 'prop';
  width: number;
  height: number;
  originX: number; // Anchor offset from left in pixels
  originY: number; // Anchor offset from top in pixels (ground intersection point)
  footprintCols: number;
  footprintRows: number;
}

export const ASSET_MANIFEST: Record<string, AssetDefinition> = {
  tile_wood_dark: {
    id: 'tile_wood_dark',
    name: 'Dark Wood Isometric Tile',
    type: 'floor',
    width: 64,
    height: 32,
    originX: 32,
    originY: 16,
    footprintCols: 1,
    footprintRows: 1,
  },
  tile_neon_stage: {
    id: 'tile_neon_stage',
    name: 'Neon Trim Stage Tile',
    type: 'floor',
    width: 64,
    height: 32,
    originX: 32,
    originY: 16,
    footprintCols: 1,
    footprintRows: 1,
  },
  stage_platform: {
    id: 'stage_platform',
    name: 'Karaoke Stage Platform',
    type: 'stage',
    width: 192,
    height: 112,
    originX: 96,
    originY: 96,
    footprintCols: 4,
    footprintRows: 3,
  },
  sofa_main: {
    id: 'sofa_main',
    name: 'Lounge Velvet Sofa',
    type: 'furniture',
    width: 128,
    height: 80,
    originX: 64,
    originY: 64,
    footprintCols: 3,
    footprintRows: 1,
  },
  sofa_vip: {
    id: 'sofa_vip',
    name: 'VIP Corner Sofa',
    type: 'furniture',
    width: 112,
    height: 80,
    originX: 56,
    originY: 64,
    footprintCols: 2,
    footprintRows: 2,
  },
  coffee_table: {
    id: 'coffee_table',
    name: 'Neon Glass Coffee Table',
    type: 'furniture',
    width: 96,
    height: 56,
    originX: 48,
    originY: 44,
    footprintCols: 2,
    footprintRows: 1,
  },
  stage_speaker: {
    id: 'stage_speaker',
    name: 'Subwoofer Stage Speaker',
    type: 'furniture',
    width: 48,
    height: 64,
    originX: 24,
    originY: 52,
    footprintCols: 1,
    footprintRows: 1,
  },
  stage_microphone_stand: {
    id: 'stage_microphone_stand',
    name: 'Gold Stage Mic Stand',
    type: 'prop',
    width: 32,
    height: 56,
    originX: 16,
    originY: 50,
    footprintCols: 1,
    footprintRows: 1,
  },
  chibi_singer: {
    id: 'chibi_singer',
    name: 'Lead Singer Chibi Avatar',
    type: 'avatar',
    width: 48,
    height: 60,
    originX: 24,
    originY: 54,
    footprintCols: 1,
    footprintRows: 1,
  },
  chibi_audience: {
    id: 'chibi_audience',
    name: 'Audience Chibi Avatar',
    type: 'avatar',
    width: 48,
    height: 56,
    originX: 24,
    originY: 50,
    footprintCols: 1,
    footprintRows: 1,
  },
};
