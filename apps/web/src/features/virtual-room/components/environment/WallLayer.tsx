'use client';

import React, { memo } from 'react';
import { LAYER_PRIORITIES } from '../../engine/depth-sorting';

interface WallLayerProps {
  currentSongTitle?: string | null;
  currentSingerName?: string | null;
}

export const WallLayer = memo(function WallLayer({
  currentSongTitle,
  currentSingerName,
}: WallLayerProps) {
  // Height of back isometric walls in logical pixels
  const wallHeight = 140;

  return (
    <div
      data-testid="wall-layer"
      className="absolute inset-0 pointer-events-none select-none"
      style={{ zIndex: LAYER_PRIORITIES.BACK_WALL }}
    >
      <svg
        className="absolute overflow-visible pointer-events-none"
        style={{
          left: '0px',
          top: '0px',
        }}
      >
        <defs>
          {/* Wall Gradients */}
          <linearGradient id="wallLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#080b18" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          <linearGradient id="wallRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0b0e20" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>

          <linearGradient id="neonStrip" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>

        {/* ======================================================== */}
        {/* BACK-RIGHT WALL: Runs from (0,0) down-left to (-384, 192) */}
        {/* ======================================================== */}
        <polygon
          points={`0,0 -384,192 -384,${192 - wallHeight} 0,-${wallHeight}`}
          fill="url(#wallLeftGrad)"
          stroke="#1e293b"
          strokeWidth="1"
        />
        {/* Neon Light Strip on Top Edge */}
        <line
          x1="-384"
          y1={192 - wallHeight}
          x2="0"
          y2={-wallHeight}
          stroke="#38bdf8"
          strokeWidth="2"
          opacity="0.8"
        />
        {/* Neon Baseboard Strip */}
        <line
          x1="-384"
          y1="192"
          x2="0"
          y2="0"
          stroke="#6366f1"
          strokeWidth="1.5"
          opacity="0.6"
        />

        {/* Acoustic Vertical Wood Slats along Back-Right Wall */}
        {[-320, -256, -192, -128, -64].map((x) => {
          // Calculate corresponding floor y along y = -0.5 * x
          const baseY = -0.5 * x;
          return (
            <line
              key={`slat_r_${x}`}
              x1={x}
              y1={baseY}
              x2={x}
              y2={baseY - wallHeight + 15}
              stroke="#1e293b"
              strokeWidth="2"
              opacity="0.5"
            />
          );
        })}

        {/* ======================================================= */}
        {/* BACK-LEFT WALL: Runs from (0,0) down-right to (384, 192) */}
        {/* ======================================================= */}
        <polygon
          points={`0,0 384,192 384,${192 - wallHeight} 0,-${wallHeight}`}
          fill="url(#wallRightGrad)"
          stroke="#1e293b"
          strokeWidth="1"
        />
        {/* Neon Light Strip on Top Edge */}
        <line
          x1="0"
          y1={-wallHeight}
          x2="384"
          y2={192 - wallHeight}
          stroke="url(#neonStrip)"
          strokeWidth="2.5"
        />
        {/* Neon Baseboard Strip */}
        <line
          x1="0"
          y1="0"
          x2="384"
          y2="192"
          stroke="#a855f7"
          strokeWidth="1.5"
          opacity="0.6"
        />

        {/* Corner Vertical Pillar */}
        <line
          x1="0"
          y1="0"
          x2="0"
          y2={-wallHeight}
          stroke="#475569"
          strokeWidth="2.5"
        />

        {/* ======================================================= */}
        {/* WALL-MOUNTED STAGE SCREEN FRAME (Behind Stage: col 3..8) */}
        {/* ======================================================= */}
        <g transform="translate(40, -110)">
          {/* Screen Outer Bezel */}
          <polygon
            points="0,0 160,80 160,10 0,-70"
            fill="#030408"
            stroke="#c084fc"
            strokeWidth="2"
          />
          {/* Screen Inner Display Surface */}
          <polygon
            points="6,-2 154,72 154,16 6,-58"
            fill="#090d16"
            stroke="#38bdf8"
            strokeWidth="1"
          />

          {/* Screen Text Billboard Projection */}
          <g transform="translate(30, 0)">
            <text
              x="30"
              y="-10"
              fill="#f43f5e"
              fontSize="10"
              fontWeight="bold"
              letterSpacing="2"
            >
              ★ KTV STAGE ★
            </text>
            <text
              x="10"
              y="10"
              fill="#38bdf8"
              fontSize="8"
              fontWeight="medium"
            >
              {currentSongTitle ? `♪ ${currentSongTitle}` : 'Waiting for Song...'}
            </text>
            {currentSingerName && (
              <text x="10" y="24" fill="#a855f7" fontSize="7">
                {`Singer: ${currentSingerName}`}
              </text>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
});
