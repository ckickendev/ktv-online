'use client';

import React, { memo, useState, useMemo } from 'react';
import { SceneEntity, VirtualRoomVoiceMap } from '../../engine/scene-types';
import { LAYER_PRIORITIES } from '../../engine/depth-sorting';
import { FloorLayer } from '../environment/FloorLayer';
import { WallLayer } from '../environment/WallLayer';
import { AtmosphereLayer } from '../environment/AtmosphereLayer';
import { SceneRenderer } from './SceneRenderer';

export const DEFAULT_S1_ROOM_ENTITIES: SceneEntity[] = [
  // 1. Raised Karaoke Stage Platform (Footprint 4 cols x 3 rows)
  {
    id: 'stage_platform_1',
    type: 'stage',
    position: { col: 4, row: 1, elevation: 0 },
    footprint: { widthCols: 4, depthRows: 3 },
    layerPriority: LAYER_PRIORITIES.STAGE_ELEMENT,
    assetId: 'stage_platform',
  },
  // 2. Stage Left & Right Sound Monitors / Speakers
  {
    id: 'speaker_left',
    type: 'furniture',
    position: { col: 3, row: 1, elevation: 0 },
    footprint: { widthCols: 1, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.FURNITURE,
    assetId: 'stage_speaker',
  },
  {
    id: 'speaker_right',
    type: 'furniture',
    position: { col: 8, row: 1, elevation: 0 },
    footprint: { widthCols: 1, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.FURNITURE,
    assetId: 'stage_speaker',
  },
  // 3. Stage Microphone Stand on Stage
  {
    id: 'mic_stand_1',
    type: 'furniture',
    position: { col: 5, row: 2, elevation: 14 },
    footprint: { widthCols: 1, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.STAGE_ELEMENT,
    assetId: 'stage_microphone_stand',
  },
  // 4. Lead Singer Chibi Avatar on Stage Platform (elevation = 14px)
  {
    id: 'chibi_singer_1',
    type: 'avatar',
    position: { col: 6, row: 2, elevation: 14 },
    footprint: { widthCols: 1, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.AVATAR,
    assetId: 'chibi_singer',
  },
  // 5. Main Lounge Velvet Sofa (Footprint 3 cols x 1 row)
  {
    id: 'sofa_main_1',
    type: 'furniture',
    position: { col: 4, row: 7, elevation: 0 },
    footprint: { widthCols: 3, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.FURNITURE,
    assetId: 'sofa_main',
  },
  // 6. Glass Coffee Table in front of Main Sofa
  {
    id: 'coffee_table_1',
    type: 'furniture',
    position: { col: 5, row: 6, elevation: 0 },
    footprint: { widthCols: 2, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.FURNITURE,
    assetId: 'coffee_table',
  },
  // 7. Audience Member Sitting on Main Sofa
  {
    id: 'chibi_audience_1',
    type: 'avatar',
    position: { col: 5, row: 7, elevation: 6 },
    footprint: { widthCols: 1, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.AVATAR,
    assetId: 'chibi_audience',
  },
  // 8. VIP Corner Sofa (Footprint 2 cols x 2 rows)
  {
    id: 'sofa_vip_1',
    type: 'furniture',
    position: { col: 8, row: 8, elevation: 0 },
    footprint: { widthCols: 2, depthRows: 2 },
    layerPriority: LAYER_PRIORITIES.FURNITURE,
    assetId: 'sofa_vip',
  },
  // 9. Audience Member in VIP Sofa
  {
    id: 'chibi_vip_audience_2',
    type: 'avatar',
    position: { col: 9, row: 9, elevation: 6 },
    footprint: { widthCols: 1, depthRows: 1 },
    layerPriority: LAYER_PRIORITIES.AVATAR,
    assetId: 'chibi_audience',
  },
];

export function bindVoiceParticipantsToSceneEntities(
  baseEntities: SceneEntity[],
  options: {
    currentSingerId?: string | null;
    voiceParticipantsMap?: VirtualRoomVoiceMap;
  }
): SceneEntity[] {
  const { currentSingerId, voiceParticipantsMap } = options;
  if (!voiceParticipantsMap || voiceParticipantsMap.size === 0) {
    return baseEntities.map((entity) =>
      entity.id === 'chibi_singer_1' && currentSingerId
        ? { ...entity, userId: currentSingerId }
        : entity
    );
  }

  const audienceUserIds = Array.from(voiceParticipantsMap.keys()).filter(
    (uid) => uid !== currentSingerId
  );

  let audienceCursor = 0;

  return baseEntities.map((entity) => {
    if (entity.id === 'chibi_singer_1' && currentSingerId) {
      return { ...entity, userId: currentSingerId };
    }
    if (entity.assetId === 'chibi_audience' && !entity.userId) {
      const assignedUserId = audienceUserIds[audienceCursor];
      if (assignedUserId) {
        audienceCursor += 1;
        return { ...entity, userId: assignedUserId };
      }
    }
    return entity;
  });
}

interface RoomSceneProps {
  entities?: SceneEntity[];
  currentSongTitle?: string | null;
  currentSingerName?: string | null;
  currentSingerId?: string | null;
  isSingerSpeaking?: boolean;
  voiceParticipantsMap?: VirtualRoomVoiceMap;
  atmospherePreset?: string;
  onTileClick?: (col: number, row: number) => void;
  onEntitySelect?: (entity: SceneEntity) => void;
}

export const RoomScene = memo(function RoomScene({
  entities = DEFAULT_S1_ROOM_ENTITIES,
  currentSongTitle,
  currentSingerName,
  currentSingerId,
  isSingerSpeaking = false,
  voiceParticipantsMap,
  atmospherePreset = 'midnight_lounge',
  onTileClick,
  onEntitySelect,
}: RoomSceneProps) {
  const [selectedTile, setSelectedTile] = useState<{ col: number; row: number } | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const boundEntities = useMemo(
    () =>
      bindVoiceParticipantsToSceneEntities(entities, {
        currentSingerId,
        voiceParticipantsMap,
      }),
    [entities, currentSingerId, voiceParticipantsMap]
  );

  const handleTileClick = (col: number, row: number) => {
    setSelectedTile({ col, row });
    setSelectedEntityId(null);
    onTileClick?.(col, row);
  };

  const handleEntityClick = (entity: SceneEntity) => {
    setSelectedEntityId(entity.id);
    setSelectedTile(null);
    onEntitySelect?.(entity);
  };

  return (
    <div
      data-testid="room-scene-container"
      className="relative w-0 h-0 select-none pointer-events-auto"
      style={{
        // Logical origin (0,0) is centered inside this anchor
        position: 'relative',
      }}
    >
      {/* 1. Isometric Floor Layer (12 x 12 grid) */}
      <FloorLayer
        onTileClick={handleTileClick}
        selectedTile={selectedTile}
      />

      {/* 2. Isometric Wall Layer & Stage Screen Frame */}
      <WallLayer
        currentSongTitle={currentSongTitle}
        currentSingerName={currentSingerName}
      />

      {/* 3. Depth-Sorted Scene Entities (Furniture, Stage, Avatars) */}
      <SceneRenderer
        entities={boundEntities}
        onEntityClick={handleEntityClick}
        selectedEntityId={selectedEntityId}
        currentSingerName={currentSingerName}
        currentSingerId={currentSingerId}
        isSingerSpeaking={isSingerSpeaking}
        voiceParticipantsMap={voiceParticipantsMap}
      />

      {/* 4. Ambient Atmosphere & Lighting Overlay */}
      <AtmosphereLayer
        preset={atmospherePreset}
        isStageActive={Boolean(currentSongTitle)}
      />
    </div>
  );
});
