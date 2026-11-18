import React from 'react';

/**
 * Procedural Isometric Floor Diamond (64x32)
 */
export function ProceduralFloorTile({
  variant = 'wood',
  isSelected = false,
  isHovered = false,
}: {
  variant?: 'wood' | 'stage' | 'carpet';
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const fillColor =
    variant === 'stage'
      ? '#1e1b4b'
      : variant === 'carpet'
      ? '#2e1065'
      : '#0f172a';

  const strokeColor = isSelected
    ? '#38bdf8'
    : isHovered
    ? '#818cf8'
    : variant === 'stage'
    ? '#312e81'
    : '#1e293b';

  return (
    <svg
      width="64"
      height="32"
      viewBox="0 0 64 32"
      className="pixel-art pointer-events-none select-none"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Base diamond */}
      <polygon
        points="32,1 63,16 32,31 1,16"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected || isHovered ? '1.5' : '1'}
      />
      {/* Subtle isometric tile top lighting */}
      <polyline points="2,16 32,2 62,16" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Diamond center detail */}
      {variant === 'stage' && (
        <polygon points="32,7 48,16 32,25 16,16" fill="none" stroke="#6366f1" strokeWidth="0.75" opacity="0.4" />
      )}
    </svg>
  );
}

/**
 * Procedural Karaoke Stage Platform (Spans 4 cols x 3 rows)
 * Elevated wooden/neon platform with front riser facade
 */
export function ProceduralStagePlatform({ width = 192, height = 112 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 192 112"
      className="pixel-art pointer-events-none select-none"
      style={{ imageRendering: 'pixelated' }}
    >
      <defs>
        <linearGradient id="stageGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      {/* Riser Front Facade (Elevation = 14px) */}
      <polygon points="12,68 96,110 96,124 12,82" fill="#090d16" stroke="#1e293b" />
      <polygon points="96,110 180,68 180,82 96,124" fill="#05070d" stroke="#1e293b" />

      {/* Neon LED Bottom Rim */}
      <polyline points="12,82 96,124 180,82" fill="none" stroke="url(#stageGlow)" strokeWidth="2.5" />

      {/* Platform Top Diamond Surface */}
      <polygon points="96,16 180,58 96,100 12,58" fill="#18132b" stroke="#6366f1" strokeWidth="1.5" />

      {/* Inner Accent Inlay */}
      <polygon points="96,28 160,60 96,92 32,60" fill="#22194d" stroke="#c084fc" strokeWidth="1" opacity="0.8" />

      {/* Center Star Spotlight Icon */}
      <circle cx="96" cy="60" r="10" fill="#4c1d95" stroke="#a855f7" strokeWidth="1.5" />
      <text x="96" y="64" fontSize="10" textAnchor="middle" fill="#facc15" fontWeight="bold">
        ★
      </text>
    </svg>
  );
}

/**
 * Procedural Lounge Velvet Sofa (Footprint: 3 cols x 1 row)
 */
export function ProceduralSofa({ width = 128, height = 80 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 128 80"
      className="pixel-art pointer-events-none select-none"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Sofa Shadow */}
      <ellipse cx="64" cy="68" rx="56" ry="12" fill="rgba(0,0,0,0.5)" />

      {/* Backrest Pillars */}
      <polygon points="8,34 64,6 120,34 120,44 64,16 8,44" fill="#4c1d95" stroke="#6d28d9" strokeWidth="1" />
      <polygon points="14,32 64,8 114,32 114,40 64,16 14,40" fill="#581c87" />

      {/* Plush Cushion Seats (3 sections) */}
      <polygon points="12,42 64,16 116,42 64,68" fill="#6b21a8" stroke="#7e22ce" strokeWidth="1.5" />
      <polygon points="16,44 48,28 64,36 32,52" fill="#7e22ce" stroke="#9333ea" strokeWidth="0.75" />
      <polygon points="48,28 80,12 96,20 64,36" fill="#7e22ce" stroke="#9333ea" strokeWidth="0.75" />

      {/* Front Skirt / Base */}
      <polygon points="12,42 64,68 64,74 12,48" fill="#3b0764" />
      <polygon points="64,68 116,42 116,48 64,74" fill="#2e1065" />

      {/* Left & Right Armrests */}
      <polygon points="6,38 20,31 28,35 14,42" fill="#9333ea" stroke="#a855f7" strokeWidth="0.75" />
      <polygon points="100,35 108,31 122,38 114,42" fill="#9333ea" stroke="#a855f7" strokeWidth="0.75" />
    </svg>
  );
}

/**
 * Procedural VIP Corner Sofa (Footprint: 2 cols x 2 rows)
 */
export function ProceduralVipSofa({ width = 112, height = 80 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 112 80"
      className="pixel-art pointer-events-none select-none"
      style={{ imageRendering: 'pixelated' }}
    >
      <ellipse cx="56" cy="68" rx="48" ry="12" fill="rgba(0,0,0,0.5)" />

      {/* L-Shaped High Backrest */}
      <polygon points="8,32 56,8 104,32 104,42 56,18 8,42" fill="#1e1b4b" stroke="#312e81" strokeWidth="1.5" />

      {/* VIP Gold Trim on Backrest */}
      <polyline points="10,34 56,11 102,34" fill="none" stroke="#f59e0b" strokeWidth="1.5" />

      {/* Corner Deep Cushion */}
      <polygon points="12,40 56,18 100,40 56,62" fill="#3730a3" stroke="#4338ca" strokeWidth="1.5" />

      {/* Base & Facade */}
      <polygon points="12,40 56,62 56,68 12,46" fill="#1e1b4b" />
      <polygon points="56,62 100,40 100,46 56,68" fill="#0f172a" />
    </svg>
  );
}

/**
 * Procedural Neon Glass Coffee Table (Footprint: 2 cols x 1 row)
 */
export function ProceduralCoffeeTable({ width = 96, height = 56 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 96 56"
      className="pixel-art pointer-events-none select-none"
      style={{ imageRendering: 'pixelated' }}
    >
      <ellipse cx="48" cy="48" rx="38" ry="8" fill="rgba(0,0,0,0.4)" />

      {/* Table Legs */}
      <line x1="16" y1="36" x2="16" y2="44" stroke="#475569" strokeWidth="2" />
      <line x1="80" y1="36" x2="80" y2="44" stroke="#475569" strokeWidth="2" />
      <line x1="48" y1="50" x2="48" y2="54" stroke="#475569" strokeWidth="2" />

      {/* Glass Table Top */}
      <polygon points="48,16 84,34 48,52 12,34" fill="rgba(6, 182, 212, 0.3)" stroke="#22d3ee" strokeWidth="1.5" />
      <polygon points="48,20 78,35 48,50 18,35" fill="rgba(34, 211, 238, 0.15)" />

      {/* Cocktail Glasses on Table */}
      {/* Drink 1 (Martini Neon Pink) */}
      <polygon points="38,26 44,26 41,31" fill="#ec4899" />
      <line x1="41" y1="31" x2="41" y2="34" stroke="#f472b6" strokeWidth="1" />
      <circle cx="42" cy="24" r="1.5" fill="#38bdf8" />

      {/* Drink 2 (Lime Soda) */}
      <rect x="52" y="27" width="5" height="7" rx="1" fill="#10b981" stroke="#34d399" strokeWidth="0.5" />
      <line x1="56" y1="24" x2="54" y2="28" stroke="#facc15" strokeWidth="1" />
    </svg>
  );
}

/**
 * Procedural Stage Subwoofer Speaker (Footprint: 1 col x 1 row)
 */
export function ProceduralSpeaker({ width = 48, height = 64 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 64"
      className="pixel-art pointer-events-none select-none"
      style={{ imageRendering: 'pixelated' }}
    >
      <ellipse cx="24" cy="58" rx="18" ry="6" fill="rgba(0,0,0,0.5)" />

      {/* Speaker Cabinet Body */}
      <polygon points="8,24 24,16 40,24 40,54 24,62 8,54" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
      <polygon points="8,24 24,16 40,24 24,32" fill="#1e293b" />

      {/* Front Face Left */}
      <polygon points="8,24 24,32 24,62 8,54" fill="#1e293b" />
      {/* Front Face Right */}
      <polygon points="24,32 40,24 40,54 24,62" fill="#0f172a" />

      {/* Woofer Cone */}
      <circle cx="24" cy="44" r="7" fill="#020617" stroke="#38bdf8" strokeWidth="1.5" />
      <circle cx="24" cy="44" r="2.5" fill="#38bdf8" />

      {/* Tweeter Cone */}
      <circle cx="24" cy="34" r="3" fill="#020617" stroke="#818cf8" strokeWidth="1" />
    </svg>
  );
}

/**
 * Procedural Gold Stage Microphone Stand (Footprint: 1 col x 1 row)
 */
export function ProceduralMicrophoneStand({ width = 32, height = 56 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 56"
      className="pixel-art pointer-events-none select-none"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Round Base */}
      <ellipse cx="16" cy="50" rx="9" ry="4" fill="#1e293b" stroke="#eab308" strokeWidth="1" />

      {/* Vertical Chrome Rod */}
      <line x1="16" y1="50" x2="16" y2="16" stroke="#fbbf24" strokeWidth="1.5" />

      {/* Mic Boom Clip & Capsule */}
      <circle cx="16" cy="14" r="3" fill="#f59e0b" stroke="#fef08a" strokeWidth="1" />
      <line x1="16" y1="12" x2="16" y2="6" stroke="#94a3b8" strokeWidth="1.5" />
      <ellipse cx="16" cy="6" rx="2.5" ry="3.5" fill="#cbd5e1" stroke="#f8fafc" strokeWidth="0.75" />
    </svg>
  );
}

/**
 * Procedural Chibi Avatar Sprite
 * Pixel-art chibi character with customizable role ('singer' | 'audience' | 'host')
 * and posture ('idle' | 'sitting' | 'singing')
 */
export function ProceduralChibiAvatar({
  role = 'singer',
  posture = 'idle',
  direction: _direction = 'front',
  username = 'Player',
  isSpeaking = false,
  isMuted = false,
  voiceConnectionState,
}: {
  role?: 'singer' | 'audience' | 'host';
  posture?: 'idle' | 'sitting' | 'singing';
  direction?: 'front' | 'left' | 'right' | 'back';
  username?: string;
  isSpeaking?: boolean;
  isMuted?: boolean;
  voiceConnectionState?: string;
}) {
  const isSinger = role === 'singer' || posture === 'singing';
  const hairColor = role === 'host' ? '#f59e0b' : isSinger ? '#ec4899' : '#06b6d4';
  const shirtColor = role === 'host' ? '#4f46e5' : isSinger ? '#8b5cf6' : '#059669';
  const effectiveSpeaking = !isMuted && isSpeaking;
  const isVoiceConnected = voiceConnectionState === 'connected';

  return (
    <div
      data-speaking={effectiveSpeaking ? 'true' : 'false'}
      data-muted={isMuted ? 'true' : 'false'}
      data-voice-state={voiceConnectionState || 'idle'}
      className="flex flex-col items-center pointer-events-auto cursor-pointer group"
    >
      {/* Floating Nametag */}
      <div className="mb-0.5 px-1.5 py-0.2 rounded-full bg-black/75 backdrop-blur-xs border border-white/20 text-[9px] font-bold text-white whitespace-nowrap shadow-sm flex items-center gap-1 select-none">
        {isSinger && <span className="text-amber-300">★</span>}
        {isVoiceConnected && !isMuted && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              effectiveSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-emerald-400'
            }`}
          />
        )}
        <span>{username}</span>
        {isMuted && (
          <span className="text-rose-400 text-[8px] font-semibold" title="Microphone muted">
            🔇
          </span>
        )}
      </div>

      {/* Chibi Character Body SVG */}
      <div className="relative">
        {/* Speaking Voice Glow Ripple */}
        {effectiveSpeaking && (
          <span
            data-testid="avatar-speaking-ripple"
            className="absolute -inset-1 rounded-full bg-emerald-400/30 animate-ping pointer-events-none"
          />
        )}

        <svg
          width="48"
          height="56"
          viewBox="0 0 48 56"
          className="pixel-art select-none"
          style={{ imageRendering: 'pixelated' }}
        >
          {/* Ground Contact Shadow */}
          <ellipse cx="24" cy="52" rx="14" ry="4" fill="rgba(0,0,0,0.4)" />

          {/* Chibi Body (Legs & Shoes) */}
          {posture === 'sitting' ? (
            /* Seated Legs tucked */
            <rect x="18" y="44" width="12" height="6" rx="2" fill="#1e1b4b" stroke="#312e81" strokeWidth="0.75" />
          ) : (
            /* Standing Legs */
            <g>
              <rect x="18" y="44" width="4" height="8" rx="1" fill="#1e1b4b" />
              <rect x="26" y="44" width="4" height="8" rx="1" fill="#1e1b4b" />
              {/* Shoes */}
              <rect x="16" y="50" width="6" height="3" rx="1" fill="#f8fafc" />
              <rect x="26" y="50" width="6" height="3" rx="1" fill="#f8fafc" />
            </g>
          )}

          {/* Chibi Torso / Jacket */}
          <rect x="17" y="32" width="14" height="13" rx="2" fill={shirtColor} stroke="#0f172a" strokeWidth="1" />
          {/* Inner Shirt Collar */}
          <polygon points="21,32 24,36 27,32" fill="#ffffff" />

          {/* Chibi Head (Big anime/chibi proportions: ~22px diameter) */}
          <rect x="13" y="14" width="22" height="19" rx="6" fill="#fed7aa" stroke="#0f172a" strokeWidth="1" />

          {/* Cute Eyes */}
          <ellipse cx="18" cy="24" rx="2" ry="3" fill="#0f172a" />
          <circle cx="18.5" cy="23" r="0.8" fill="#ffffff" />
          <ellipse cx="30" cy="24" rx="2" ry="3" fill="#0f172a" />
          <circle cx="30.5" cy="23" r="0.8" fill="#ffffff" />

          {/* Cheerful Blush */}
          <circle cx="15" cy="27" r="1.5" fill="#f43f5e" opacity="0.6" />
          <circle cx="33" cy="27" r="1.5" fill="#f43f5e" opacity="0.6" />

          {/* Singing Mouth vs Smile */}
          {isSinger ? (
            <ellipse cx="24" cy="28" rx="2.5" ry="3.5" fill="#e11d48" stroke="#0f172a" strokeWidth="0.5" />
          ) : (
            <path d="M 22 28 Q 24 30 26 28" fill="none" stroke="#0f172a" strokeWidth="1" />
          )}

          {/* Styled Anime Hair */}
          <path
            d="M 12 20 Q 12 11 24 10 Q 36 11 36 20 Q 33 16 28 16 Q 24 18 20 16 Z"
            fill={hairColor}
            stroke="#0f172a"
            strokeWidth="1"
          />
          {/* Hair Bangs */}
          <polygon points="14,19 18,24 19,17" fill={hairColor} />
          <polygon points="22,17 25,23 27,17" fill={hairColor} />

          {/* Microphone in Hand if Singer */}
          {isSinger && (
            <g transform="translate(32, 28)">
              <rect x="0" y="4" width="3" height="8" rx="1" fill="#475569" />
              <circle cx="1.5" cy="3" r="3" fill="#a855f7" stroke="#c084fc" strokeWidth="0.5" />
              {/* Sound waves from mic */}
              <path d="M 4 0 Q 7 3 4 6" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.8" />
            </g>
          )}

          {/* Headphones if Audience */}
          {!isSinger && (
            <g>
              <rect x="11" y="20" width="3" height="7" rx="1" fill="#3b82f6" />
              <rect x="34" y="20" width="3" height="7" rx="1" fill="#3b82f6" />
              <path d="M 12 21 Q 24 11 36 21" fill="none" stroke="#1d4ed8" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
