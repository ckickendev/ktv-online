'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Check,
  Loader2,
  Save,
  RotateCcw,
  Eye,
  Users,
  CheckCircle2,
  AlertCircle,
  Globe,
  Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MUSIC_GENRES,
  MUSIC_LANGUAGES,
  PARTICIPATION_STYLES,
  LYRICS_FONT_SIZES,
  VISUAL_EFFECTS_INTENSITIES,
  GENRE_METADATA,
  LANGUAGE_METADATA,
  MusicGenre,
  MusicLanguage,
  ParticipationStyle,
  LyricsFontSize,
  VisualEffectsIntensity,
} from '@ktv/contracts';
import {
  useUserPreferences,
  useUpdateUserPreferences,
} from '@/hooks/queries/use-user-preferences';

export function PersonalPreferencesCard() {
  const { preferences, isLoading } = useUserPreferences();
  const updateMutation = useUpdateUserPreferences();

  const [genres, setGenres] = useState<MusicGenre[]>(preferences.preferredGenres);
  const [languages, setLanguages] = useState<MusicLanguage[]>(preferences.preferredLanguages);
  const [participationStyle, setParticipationStyle] = useState<ParticipationStyle>(
    preferences.participationStyle
  );
  const [lyricsFontSize, setLyricsFontSize] = useState<LyricsFontSize>(
    preferences.lyricsFontSize
  );
  const [visualIntensity, setVisualIntensity] = useState<VisualEffectsIntensity>(
    preferences.visualEffectsIntensity
  );
  const [showReactions, setShowReactions] = useState<boolean>(preferences.showReactions);
  const [showGifts, setShowGifts] = useState<boolean>(preferences.showGifts);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync state whenever server preferences update
  useEffect(() => {
    if (preferences) {
      setGenres(preferences.preferredGenres);
      setLanguages(preferences.preferredLanguages);
      setParticipationStyle(preferences.participationStyle);
      setLyricsFontSize(preferences.lyricsFontSize);
      setVisualIntensity(preferences.visualEffectsIntensity);
      setShowReactions(preferences.showReactions);
      setShowGifts(preferences.showGifts);
    }
  }, [preferences]);

  const toggleGenre = (genre: MusicGenre) => {
    setGenres((prev) => {
      if (prev.includes(genre)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((g) => g !== genre);
      }
      return [...prev, genre];
    });
    setSaveSuccess(false);
  };

  const toggleLanguage = (lang: MusicLanguage) => {
    setLanguages((prev) => {
      if (prev.includes(lang)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((l) => l !== lang);
      }
      return [...prev, lang];
    });
    setSaveSuccess(false);
  };

  const handleReset = () => {
    setGenres(preferences.preferredGenres);
    setLanguages(preferences.preferredLanguages);
    setParticipationStyle(preferences.participationStyle);
    setLyricsFontSize(preferences.lyricsFontSize);
    setVisualIntensity(preferences.visualEffectsIntensity);
    setShowReactions(preferences.showReactions);
    setShowGifts(preferences.showGifts);
    setSaveSuccess(false);
    setSaveError(null);
  };

  const hasChanges =
    JSON.stringify(genres) !== JSON.stringify(preferences.preferredGenres) ||
    JSON.stringify(languages) !== JSON.stringify(preferences.preferredLanguages) ||
    participationStyle !== preferences.participationStyle ||
    lyricsFontSize !== preferences.lyricsFontSize ||
    visualIntensity !== preferences.visualEffectsIntensity ||
    showReactions !== preferences.showReactions ||
    showGifts !== preferences.showGifts;

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateMutation.mutateAsync({
        preferredGenres: genres,
        preferredLanguages: languages,
        participationStyle,
        lyricsFontSize,
        visualEffectsIntensity: visualIntensity,
        showReactions,
        showGifts,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save preferences');
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 flex items-center justify-center min-h-[300px]">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          <span>Loading your personalized karaoke preferences...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden mb-8">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-cyan-500/10 via-violet-600/10 to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Personal Karaoke Preferences</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Custom Experience
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Customize your music taste, room discovery filters, and stage viewing comfort
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {hasChanges && (
            <button
              type="button"
              onClick={handleReset}
              disabled={updateMutation.isPending}
              className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges}
            className={cn(
              'px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md',
              hasChanges
                ? 'bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-violet-600/30 active:scale-95'
                : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
            )}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Saving...</span>
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-6 flex items-center gap-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Main Settings Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
        {/* Left Column: Music Taste & Languages */}
        <div className="space-y-6">
          {/* 1. Preferred Music Genres */}
          <div>
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2">
              <Music className="w-3.5 h-3.5 text-violet-400" />
              <span>Favorite Genres &amp; Repertoire</span>
            </label>
            <p className="text-[11px] text-slate-400 mb-3">
              Used to personalize your public lounge discovery and highlight matching rooms.
            </p>
            <div className="flex flex-wrap gap-2">
              {MUSIC_GENRES.map((genre) => {
                const meta = GENRE_METADATA[genre];
                const isSelected = genres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border',
                      isSelected
                        ? 'bg-violet-600/30 border-violet-500/50 text-white shadow-sm shadow-violet-600/20'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    )}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                    {isSelected && <Check className="w-3 h-3 text-violet-400 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Preferred Music Languages */}
          <div>
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>Singing Languages</span>
            </label>
            <p className="text-[11px] text-slate-400 mb-3">
              Choose the languages you enjoy singing or listening to in rooms.
            </p>
            <div className="flex flex-wrap gap-2">
              {MUSIC_LANGUAGES.map((lang) => {
                const meta = LANGUAGE_METADATA[lang];
                const isSelected = languages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border',
                      isSelected
                        ? 'bg-cyan-600/30 border-cyan-500/50 text-white shadow-sm shadow-cyan-600/20'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    )}
                  >
                    <span>{meta.flag}</span>
                    <span>{meta.label}</span>
                    {isSelected && <Check className="w-3 h-3 text-cyan-400 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Lounge Participation Style */}
          <div>
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>Participation Style</span>
            </label>
            <p className="text-[11px] text-slate-400 mb-3">
              Helps indicate whether you usually prefer to grab the mic or enjoy the show.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PARTICIPATION_STYLES.map((style) => {
                const isSelected = participationStyle === style;
                const labels: Record<ParticipationStyle, { title: string; desc: string }> = {
                  singing: { title: 'Mostly Singing', desc: 'On stage performer' },
                  audience: { title: 'Mostly Audience', desc: 'Cheering & Gifting' },
                  both: { title: 'Balanced Mix', desc: 'Sing & cheer equally' },
                };
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      setParticipationStyle(style);
                      setSaveSuccess(false);
                    }}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-all',
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/40 text-white'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    )}
                  >
                    <div className="text-xs font-bold text-white">{labels[style].title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{labels[style].desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Personal Stage Viewing & Comfort */}
        <div className="space-y-6 lg:border-l lg:border-white/10 lg:pl-8">
          <div>
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-2">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Personal Stage &amp; Lyrics Viewing</span>
            </label>
            <p className="text-[11px] text-slate-400 mb-3">
              These settings adjust only your personal viewer screen and never affect other room participants or lyrics synchronization.
            </p>

            {/* Lyrics Font Size */}
            <div className="space-y-2 mb-5">
              <span className="text-xs font-medium text-slate-300 block">Lyrics Font Size</span>
              <div className="grid grid-cols-3 gap-2">
                {LYRICS_FONT_SIZES.map((size) => {
                  const isSelected = lyricsFontSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setLyricsFontSize(size);
                        setSaveSuccess(false);
                      }}
                      className={cn(
                        'py-2 rounded-xl text-xs font-semibold capitalize border transition-all text-center',
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                      )}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visual Effects Intensity */}
            <div className="space-y-2 mb-5">
              <span className="text-xs font-medium text-slate-300 block">
                Visual Effects &amp; Animations
              </span>
              <div className="grid grid-cols-3 gap-2">
                {VISUAL_EFFECTS_INTENSITIES.map((intensity) => {
                  const isSelected = visualIntensity === intensity;
                  const labels: Record<VisualEffectsIntensity, string> = {
                    full: 'Full Effects',
                    reduced: 'Reduced Motion',
                    minimal: 'Minimal Stage',
                  };
                  return (
                    <button
                      key={intensity}
                      type="button"
                      onClick={() => {
                        setVisualIntensity(intensity);
                        setSaveSuccess(false);
                      }}
                      className={cn(
                        'py-2 rounded-xl text-xs font-semibold border transition-all text-center',
                        isSelected
                          ? 'bg-violet-600/30 border-violet-500/50 text-white'
                          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                      )}
                    >
                      {labels[intensity]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toggles for Audience Interactions */}
            <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Audience Cheers &amp; Reactions</span>
                  <span className="text-[10px] text-slate-400 block">
                    Show floating applause, hearts, and stage cheers
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showReactions}
                  onClick={() => {
                    setShowReactions(!showReactions);
                    setSaveSuccess(false);
                  }}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative p-0.5',
                    showReactions ? 'bg-violet-600' : 'bg-slate-700'
                  )}
                >
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full bg-white block transition-transform shadow-md',
                      showReactions ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-3">
                <div>
                  <span className="text-xs font-bold text-white block">Virtual Stage Gifts</span>
                  <span className="text-[10px] text-slate-400 block">
                    Show celebratory gift banners and star/rose effects
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showGifts}
                  onClick={() => {
                    setShowGifts(!showGifts);
                    setSaveSuccess(false);
                  }}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative p-0.5',
                    showGifts ? 'bg-pink-600' : 'bg-slate-700'
                  )}
                >
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full bg-white block transition-transform shadow-md',
                      showGifts ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
