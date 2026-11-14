import { z } from 'zod';

export const MUSIC_GENRES = [
  'pop',
  'ballad',
  'rock',
  'rap',
  'rnb',
  'edm',
  'acoustic',
  'traditional',
  'anime',
] as const;
export type MusicGenre = (typeof MUSIC_GENRES)[number];
export const MusicGenreSchema = z.enum(MUSIC_GENRES);

export const MUSIC_LANGUAGES = ['vi', 'en', 'ko', 'ja', 'zh'] as const;
export type MusicLanguage = (typeof MUSIC_LANGUAGES)[number];
export const MusicLanguageSchema = z.enum(MUSIC_LANGUAGES);

export const PARTICIPATION_STYLES = ['singing', 'audience', 'both'] as const;
export type ParticipationStyle = (typeof PARTICIPATION_STYLES)[number];
export const ParticipationStyleSchema = z.enum(PARTICIPATION_STYLES);

export const LYRICS_FONT_SIZES = ['compact', 'normal', 'large'] as const;
export type LyricsFontSize = (typeof LYRICS_FONT_SIZES)[number];
export const LyricsFontSizeSchema = z.enum(LYRICS_FONT_SIZES);

export const VISUAL_EFFECTS_INTENSITIES = ['full', 'reduced', 'minimal'] as const;
export type VisualEffectsIntensity = (typeof VISUAL_EFFECTS_INTENSITIES)[number];
export const VisualEffectsIntensitySchema = z.enum(VISUAL_EFFECTS_INTENSITIES);

export const GENRE_METADATA: Record<MusicGenre, { label: string; icon: string }> = {
  pop: { label: 'Pop & Billboard', icon: '🎤' },
  ballad: { label: 'Ballad & Acoustic', icon: '🎸' },
  rock: { label: 'Classic Rock', icon: '⚡' },
  rap: { label: 'Rap & Hip-Hop', icon: '🎧' },
  rnb: { label: 'R&B / Soul', icon: '🎷' },
  edm: { label: 'EDM & Dance', icon: '🔥' },
  acoustic: { label: 'Acoustic / Unplugged', icon: '☕' },
  traditional: { label: 'Traditional / Folk', icon: '🏮' },
  anime: { label: 'Anime & J-Rock', icon: '🎌' },
};

export const LANGUAGE_METADATA: Record<MusicLanguage, { label: string; flag: string }> = {
  vi: { label: 'Vietnamese', flag: '🇻🇳' },
  en: { label: 'English', flag: '🇺🇸' },
  ko: { label: 'Korean', flag: '🇰🇷' },
  ja: { label: 'Japanese', flag: '🇯🇵' },
  zh: { label: 'Chinese', flag: '🇨🇳' },
};

export const UserPreferencesDtoSchema = z.object({
  preferredGenres: z.array(MusicGenreSchema).default(['pop']),
  preferredLanguages: z.array(MusicLanguageSchema).default(['vi', 'en']),
  participationStyle: ParticipationStyleSchema.default('both'),
  lyricsFontSize: LyricsFontSizeSchema.default('normal'),
  visualEffectsIntensity: VisualEffectsIntensitySchema.default('full'),
  showReactions: z.boolean().default(true),
  showGifts: z.boolean().default(true),
  hasCompletedOnboarding: z.boolean().default(false),
  hasDismissedRoomGuide: z.boolean().default(false),
  isHistoryPublic: z.boolean().default(false),
  isSessionsPublic: z.boolean().default(false),
});
export type UserPreferencesDto = z.infer<typeof UserPreferencesDtoSchema>;

export const UpdateUserPreferencesSchema = z.object({
  preferredGenres: z.array(MusicGenreSchema).max(10).optional(),
  preferredLanguages: z.array(MusicLanguageSchema).max(10).optional(),
  participationStyle: ParticipationStyleSchema.optional(),
  lyricsFontSize: LyricsFontSizeSchema.optional(),
  visualEffectsIntensity: VisualEffectsIntensitySchema.optional(),
  showReactions: z.boolean().optional(),
  showGifts: z.boolean().optional(),
  hasCompletedOnboarding: z.boolean().optional(),
  hasDismissedRoomGuide: z.boolean().optional(),
  isHistoryPublic: z.boolean().optional(),
  isSessionsPublic: z.boolean().optional(),
});
export type UpdateUserPreferencesDto = z.infer<typeof UpdateUserPreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferencesDto = {
  preferredGenres: ['pop'],
  preferredLanguages: ['vi', 'en'],
  participationStyle: 'both',
  lyricsFontSize: 'normal',
  visualEffectsIntensity: 'full',
  showReactions: true,
  showGifts: true,
  hasCompletedOnboarding: false,
  hasDismissedRoomGuide: false,
  isHistoryPublic: false,
  isSessionsPublic: false,
};
