'use client';

import React, { memo } from 'react';
import { SceneEntity, VirtualRoomVoiceMap, VirtualRoomVoiceState } from '../../engine/scene-types';
import { sortSceneEntities } from '../../engine/depth-sorting';
import { worldToScreenSnapped } from '../../engine/isometric-projection';
import { ASSET_MANIFEST } from '../../assets/asset-manifest';
import {
  ProceduralStagePlatform,
  ProceduralSofa,
  ProceduralVipSofa,
  ProceduralCoffeeTable,
  ProceduralSpeaker,
  ProceduralMicrophoneStand,
  ProceduralChibiAvatar,
} from '../../assets/procedural-sprites';

interface SceneRendererProps {
  entities: SceneEntity[];
  onEntityClick?: (entity: SceneEntity) => void;
  selectedEntityId?: string | null;
  currentSingerName?: string | null;
  currentSingerId?: string | null;
  isSingerSpeaking?: boolean;
  voiceParticipantsMap?: VirtualRoomVoiceMap;
}

export const SceneRenderer = memo(function SceneRenderer({
  entities,
  onEntityClick,
  selectedEntityId,
  currentSingerName,
  currentSingerId,
  isSingerSpeaking = false,
  voiceParticipantsMap,
}: SceneRendererProps) {
  // Sort entities back-to-front by depth anchor
  const sortedEntities = sortSceneEntities(entities);

  return (
    <div
      data-testid="scene-entities-layer"
      className="absolute inset-0 pointer-events-none"
    >
      {sortedEntities.map((entity, index) => {
        const { x, y } = worldToScreenSnapped(
          entity.position.col,
          entity.position.row,
          entity.position.elevation || 0
        );

        const assetDef = entity.assetId ? ASSET_MANIFEST[entity.assetId] : undefined;
        const originX = assetDef?.originX ?? 32;
        const originY = assetDef?.originY ?? 32;

        const isSelected = selectedEntityId === entity.id;
        const targetUserId =
          entity.userId || (entity.assetId === 'chibi_singer' ? currentSingerId || undefined : undefined);
        const voiceState = targetUserId ? voiceParticipantsMap?.get(targetUserId) : undefined;

        return (
          <div
            key={entity.id}
            data-testid={`entity-${entity.id}`}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: `${y}px`,
              // Position entity relative to its contact anchor point
              transform: `translate(-${originX}px, -${originY}px)`,
              zIndex: index + 20, // Strict monotonic z-index matching sort order
            }}
            className="pointer-events-auto transition-transform active:scale-95 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onEntityClick?.(entity);
            }}
          >
            {/* Render the specific procedural asset */}
            {renderEntitySprite(entity, {
              isSelected,
              currentSingerName,
              isSingerSpeaking,
              voiceState,
            })}
          </div>
        );
      })}
    </div>
  );
});

function renderEntitySprite(
  entity: SceneEntity,
  options: {
    isSelected?: boolean;
    currentSingerName?: string | null;
    isSingerSpeaking?: boolean;
    voiceState?: VirtualRoomVoiceState;
  }
) {
  switch (entity.assetId) {
    case 'stage_platform':
      return <ProceduralStagePlatform />;

    case 'sofa_main':
      return <ProceduralSofa />;

    case 'sofa_vip':
      return <ProceduralVipSofa />;

    case 'coffee_table':
      return <ProceduralCoffeeTable />;

    case 'stage_speaker':
      return <ProceduralSpeaker />;

    case 'stage_microphone_stand':
      return <ProceduralMicrophoneStand />;

    case 'chibi_singer':
      return (
        <ProceduralChibiAvatar
          role="singer"
          posture="singing"
          username={entity.displayName || options.currentSingerName || 'Lead Singer'}
          isSpeaking={options.voiceState ? options.voiceState.isSpeaking : options.isSingerSpeaking}
          isMuted={options.voiceState?.isMuted}
          voiceConnectionState={options.voiceState?.connectionState}
        />
      );

    case 'chibi_audience':
      return (
        <ProceduralChibiAvatar
          role="audience"
          posture="sitting"
          username={entity.displayName || 'Lounge Friend'}
          isSpeaking={options.voiceState?.isSpeaking}
          isMuted={options.voiceState?.isMuted}
          voiceConnectionState={options.voiceState?.connectionState}
        />
      );

    default:
      // Fallback entity bounding marker
      return (
        <div className="w-8 h-8 rounded-full bg-violet-500/50 border border-violet-400 flex items-center justify-center text-[10px] text-white">
          ●
        </div>
      );
  }
}
