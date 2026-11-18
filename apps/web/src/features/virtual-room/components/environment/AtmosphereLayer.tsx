'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { LAYER_PRIORITIES } from '../../engine/depth-sorting';

interface AtmosphereLayerProps {
  preset?: string;
  isStageActive?: boolean;
}

export const AtmosphereLayer = memo(function AtmosphereLayer({
  preset = 'midnight_lounge',
  isStageActive = false,
}: AtmosphereLayerProps) {
  return (
    <div
      data-testid="atmosphere-layer"
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
      style={{ zIndex: LAYER_PRIORITIES.ATMOSPHERE }}
    >
      {/* Central Ambient Room Glow */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-3xl opacity-30 transition-all duration-700 pointer-events-none',
          preset === 'neon_stage'
            ? 'bg-gradient-to-tr from-fuchsia-600 via-pink-600 to-cyan-500'
            : preset === 'cozy_acoustic'
            ? 'bg-gradient-to-tr from-amber-600 via-orange-600 to-yellow-500'
            : 'bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-600'
        )}
      />

      {/* Stage Spotlight Glow Cone */}
      {isStageActive && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-cyan-400/15 rounded-full blur-2xl animate-pulse pointer-events-none" />
      )}

      {/* Subtle Viewport Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(3,4,8,0.75)_100%)] pointer-events-none" />
    </div>
  );
});
