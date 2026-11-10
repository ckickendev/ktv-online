import { RoomAtmospherePreset } from '@ktv/contracts';

export interface AtmospherePresetConfig {
  id: RoomAtmospherePreset;
  name: string;
  tagline: string;
  description: string;
  swatch: {
    primary: string;
    secondary: string;
    glow: string;
  };
  styles: {
    // Page root container
    rootBackground: string;
    // Ambient backdrops and spotlight lighting
    ambientGlow: string;
    stageBackdrop: string;
    stageBorder: string;
    // Sidebar and panels
    panelBackground: string;
    panelBorder: string;
    // Accents and badges
    badgeClass: string;
    accentGradient: string;
  };
}

export const ATMOSPHERE_PRESETS: Record<RoomAtmospherePreset, AtmospherePresetConfig> = {
  midnight_lounge: {
    id: 'midnight_lounge',
    name: 'Midnight Lounge',
    tagline: 'Late-night chill & deep indigo lounge vibe',
    description: 'Deep navy background with subtle indigo ambient glow and relaxed nightlife lighting.',
    swatch: {
      primary: '#6366f1',
      secondary: '#818cf8',
      glow: 'rgba(99, 102, 241, 0.15)',
    },
    styles: {
      rootBackground: 'bg-gradient-to-b from-[#070916] via-[#050711] to-[#030409]',
      ambientGlow: 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.18),transparent_70%)]',
      stageBackdrop: 'from-indigo-950/40 via-[#070914]/90 to-slate-950/90',
      stageBorder: 'border-indigo-500/25 shadow-indigo-950/40',
      panelBackground: 'bg-[#080b18]/85',
      panelBorder: 'border-indigo-500/15',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      accentGradient: 'from-indigo-600 to-violet-600',
    },
  },

  neon_stage: {
    id: 'neon_stage',
    name: 'Neon Stage',
    tagline: 'Electric performance spotlight & neon energy',
    description: 'Dark stage background with vibrant violet, magenta, and cyan neon rims for high-energy sets.',
    swatch: {
      primary: '#ec4899',
      secondary: '#06b6d4',
      glow: 'rgba(236, 72, 153, 0.2)',
    },
    styles: {
      rootBackground: 'bg-gradient-to-b from-[#0d071a] via-[#080512] to-[#04020a]',
      ambientGlow: 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(217,70,239,0.22),transparent_70%)]',
      stageBackdrop: 'from-fuchsia-950/40 via-[#0b0618]/90 to-cyan-950/30',
      stageBorder: 'border-fuchsia-500/30 shadow-fuchsia-950/50',
      panelBackground: 'bg-[#0f071e]/85',
      panelBorder: 'border-fuchsia-500/20',
      badgeClass: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
      accentGradient: 'from-fuchsia-600 to-cyan-500',
    },
  },

  cozy_acoustic: {
    id: 'cozy_acoustic',
    name: 'Cozy Acoustic',
    tagline: 'Warm amber glow & intimate acoustic session',
    description: 'Warm dark surfaces with soft amber illumination for intimate, acoustic, and ballad nights.',
    swatch: {
      primary: '#f59e0b',
      secondary: '#fbbf24',
      glow: 'rgba(245, 158, 11, 0.15)',
    },
    styles: {
      rootBackground: 'bg-gradient-to-b from-[#140e08] via-[#0c0905] to-[#060402]',
      ambientGlow: 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(245,158,11,0.18),transparent_70%)]',
      stageBackdrop: 'from-amber-950/40 via-[#100b06]/90 to-orange-950/30',
      stageBorder: 'border-amber-500/25 shadow-amber-950/40',
      panelBackground: 'bg-[#120c06]/85',
      panelBorder: 'border-amber-500/20',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      accentGradient: 'from-amber-600 to-orange-500',
    },
  },

  minimal_studio: {
    id: 'minimal_studio',
    name: 'Minimal Studio',
    tagline: 'Clean studio slate & undistracted vocal focus',
    description: 'Clean dark slate surfaces with crisp typography and zero distraction from the vocalist.',
    swatch: {
      primary: '#94a3b8',
      secondary: '#cbd5e1',
      glow: 'rgba(148, 163, 184, 0.12)',
    },
    styles: {
      rootBackground: 'bg-gradient-to-b from-[#0b0e14] via-[#07090d] to-[#040507]',
      ambientGlow: 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(148,163,184,0.14),transparent_70%)]',
      stageBackdrop: 'from-slate-900/40 via-[#0a0d12]/90 to-slate-950/90',
      stageBorder: 'border-slate-600/30 shadow-slate-950/50',
      panelBackground: 'bg-[#0d1017]/85',
      panelBorder: 'border-slate-700/25',
      badgeClass: 'bg-slate-700/20 text-slate-300 border-slate-600/30',
      accentGradient: 'from-slate-600 to-slate-400',
    },
  },

  classic_karaoke: {
    id: 'classic_karaoke',
    name: 'Classic Karaoke',
    tagline: 'Vibrant KTV lounge & ruby-tinted karaoke party',
    description: 'Familiar virtual KTV box ambiance with warm ruby highlights and celebratory party lighting.',
    swatch: {
      primary: '#e11d48',
      secondary: '#fb7185',
      glow: 'rgba(225, 29, 72, 0.18)',
    },
    styles: {
      rootBackground: 'bg-gradient-to-b from-[#14060b] via-[#0d0407] to-[#060203]',
      ambientGlow: 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(225,29,72,0.2),transparent_70%)]',
      stageBackdrop: 'from-rose-950/40 via-[#100509]/90 to-purple-950/30',
      stageBorder: 'border-rose-500/25 shadow-rose-950/40',
      panelBackground: 'bg-[#120509]/85',
      panelBorder: 'border-rose-500/20',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      accentGradient: 'from-rose-600 to-pink-500',
    },
  },
};

export const DEFAULT_ATMOSPHERE_PRESET: RoomAtmospherePreset = 'midnight_lounge';

export function getAtmosphereConfig(preset?: string | null): AtmospherePresetConfig {
  if (preset && preset in ATMOSPHERE_PRESETS) {
    return ATMOSPHERE_PRESETS[preset as RoomAtmospherePreset];
  }
  return ATMOSPHERE_PRESETS[DEFAULT_ATMOSPHERE_PRESET];
}
