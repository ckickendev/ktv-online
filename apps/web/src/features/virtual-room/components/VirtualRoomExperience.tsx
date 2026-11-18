'use client';

import React, { useState } from 'react';
import {
  Music2,
  Info,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SceneViewport } from './scene/SceneViewport';
import { RoomScene } from './scene/RoomScene';
import { SceneEntity, VirtualRoomVoiceMap } from '../engine/scene-types';

interface VirtualRoomExperienceProps {
  roomId?: string;
  roomName?: string;
  currentSongTitle?: string | null;
  currentSingerName?: string | null;
  currentSingerId?: string | null;
  isSingerSpeaking?: boolean;
  voiceParticipantsMap?: VirtualRoomVoiceMap;
  atmospherePreset?: string;
  karaokePlayerNode?: React.ReactNode;
  className?: string;
}

export function VirtualRoomExperience({
  roomId: _roomId,
  roomName: _roomName,
  currentSongTitle,
  currentSingerName,
  currentSingerId,
  isSingerSpeaking = false,
  voiceParticipantsMap,
  atmospherePreset = 'midnight_lounge',
  karaokePlayerNode,
  className,
}: VirtualRoomExperienceProps) {
  const [selectedEntity, setSelectedEntity] = useState<SceneEntity | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<{ col: number; row: number } | null>(null);
  const [isLyricsHudExpanded, setIsLyricsHudExpanded] = useState(false);

  const handleTileClick = (col: number, row: number) => {
    setSelectedCoords({ col, row });
    setSelectedEntity(null);
  };

  const handleEntitySelect = (entity: SceneEntity) => {
    setSelectedEntity(entity);
    setSelectedCoords(null);
  };

  return (
    <div
      data-testid="virtual-room-experience"
      className={cn('flex flex-col gap-3 w-full relative', className)}
    >
      {/* 2.5D Isometric Scene Viewport */}
      <div className="relative w-full h-[540px] sm:h-[620px] rounded-3xl overflow-hidden border border-violet-500/30 shadow-2xl bg-[#030408]">
        <SceneViewport>
          <RoomScene
            currentSongTitle={currentSongTitle}
            currentSingerName={currentSingerName}
            currentSingerId={currentSingerId}
            isSingerSpeaking={isSingerSpeaking}
            voiceParticipantsMap={voiceParticipantsMap}
            atmospherePreset={atmospherePreset}
            onTileClick={handleTileClick}
            onEntitySelect={handleEntitySelect}
          />
        </SceneViewport>

        {/* Selected Entity / Tile Status Pill Overlay */}
        {(selectedEntity || selectedCoords) && (
          <div
            data-testid="selection-status-badge"
            className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-xs text-white shadow-xl flex items-center gap-2 animate-in fade-in"
          >
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            {selectedEntity ? (
              <span>
                Selected Entity: <strong className="text-violet-300">{selectedEntity.id}</strong> (
                {selectedEntity.type})
              </span>
            ) : (
              <span>
                Selected Tile: [
                <strong className="text-cyan-300">
                  {selectedCoords?.col}, {selectedCoords?.row}
                </strong>
                ]
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedEntity(null);
                setSelectedCoords(null);
              }}
              className="text-slate-400 hover:text-white ml-1 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Floating Mini Lyrics HUD on Virtual Stage Screen */}
        {karaokePlayerNode && (
          <div
            className={cn(
              'absolute bottom-3 left-3 z-20 transition-all duration-300',
              isLyricsHudExpanded
                ? 'w-[calc(100%-24px)] max-h-[75%] bg-[#080b18]/95 p-3 rounded-2xl border border-violet-500/40 backdrop-blur-xl shadow-2xl'
                : 'max-w-xs'
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wide flex items-center gap-1">
                <Music2 className="w-3 h-3 text-cyan-400" />
                <span>Karaoke HUD</span>
              </span>
              <button
                type="button"
                onClick={() => setIsLyricsHudExpanded(!isLyricsHudExpanded)}
                className="p-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 text-xs transition-colors"
                title={isLyricsHudExpanded ? 'Collapse HUD' : 'Expand Lyrics HUD'}
              >
                {isLyricsHudExpanded ? (
                  <Minimize2 className="w-3 h-3" />
                ) : (
                  <Maximize2 className="w-3 h-3" />
                )}
              </button>
            </div>
            {isLyricsHudExpanded && (
              <div className="overflow-y-auto max-h-[340px] pt-1">
                {karaokePlayerNode}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
