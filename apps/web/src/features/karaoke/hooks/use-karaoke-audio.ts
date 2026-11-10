'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PlaybackStateDto } from '@ktv/contracts';
import { karaokeApi } from '../api/karaoke-api';

export interface UseKaraokeAudioOptions {
  playback: PlaybackStateDto | undefined;
  currentPositionMs: number;
  enabled?: boolean;
}

export interface UseKaraokeAudioReturn {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  isBuffering: boolean;
  isAutoplayBlocked: boolean;
  audioError: string | null;
  volume: number;
  isMuted: boolean;
  isAudioAvailable: boolean;
  unlockAutoplay: () => Promise<void>;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  retryAudioLoad: () => void;
}

const STORAGE_VOLUME_KEY = 'ktv_karaoke_volume';
const STORAGE_MUTED_KEY = 'ktv_karaoke_muted';

const DRIFT_TOLERANCE_MS = 300;
const DRIFT_SEEK_THRESHOLD_MS = 1500;

export function useKaraokeAudio({
  playback,
  currentPositionMs,
  enabled = true,
}: UseKaraokeAudioOptions): UseKaraokeAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAudioAvailable, setIsAudioAvailable] = useState(true);

  // Volume state persisted in localStorage
  const [volume, setVolumeState] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.8;
    const saved = localStorage.getItem(STORAGE_VOLUME_KEY);
    return saved !== null ? Math.max(0, Math.min(1, parseFloat(saved))) : 0.8;
  });

  const [isMuted, setIsMutedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_MUTED_KEY) === 'true';
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadGenerationRef = useRef<number>(0);
  const currentSongIdRef = useRef<string | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const lastPlaybackVersionRef = useRef<number>(0);

  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);

  // Keep volume and mute refs synchronized
  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Initialize native HTMLAudioElement once
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.volume = volumeRef.current;
      audio.muted = isMutedRef.current;

      audio.addEventListener('play', () => {
        setIsPlaying(true);
        isPlayingRef.current = true;
        setIsAutoplayBlocked(false);
      });

      audio.addEventListener('pause', () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
      });

      audio.addEventListener('waiting', () => {
        setIsBuffering(true);
      });

      audio.addEventListener('playing', () => {
        setIsBuffering(false);
      });

      audio.addEventListener('canplay', () => {
        setIsBuffering(false);
      });

      audio.addEventListener('error', () => {
        const err = audio.error;
        const msg = err ? `AUDIO_ELEMENT_ERROR_${err.code}` : 'AUDIO_PLAYBACK_ERROR';
        setAudioError(msg);
        setIsBuffering(false);
      });

      // Browser playback reached end: server remains authoritative for track completion
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
      });

      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Update volume and mute settings on audio element
  const setVolume = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolumeState(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_VOLUME_KEY, clamped.toString());
    }
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMutedState((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_MUTED_KEY, next ? 'true' : 'false');
      }
      if (audioRef.current) {
        audioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  // Audio source resolution with generation fencing
  const resolveAudioForCurrentItem = useCallback(async (songId: string, generation: number) => {
    try {
      setAudioError(null);
      setIsBuffering(true);

      const resolved = await karaokeApi.resolveAudioSource(songId);

      // Discard if generation changed during async fetch
      if (loadGenerationRef.current !== generation) {
        return;
      }

      if (!resolved || resolved.availability !== 'audio_available' || !resolved.url) {
        setIsAudioAvailable(false);
        setAudioError('SONG_AUDIO_UNAVAILABLE');
        setIsBuffering(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
        }
        return;
      }

      setIsAudioAvailable(true);
      if (audioRef.current) {
        // Only re-set src if changed to avoid unnecessary reloads
        if (audioRef.current.src !== resolved.url) {
          audioRef.current.src = resolved.url;
          audioRef.current.load();
        }
      }
    } catch (err: unknown) {
      if (loadGenerationRef.current !== generation) return;

      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SONG_AUDIO_UNAVAILABLE')) {
        setIsAudioAvailable(false);
        setAudioError('SONG_AUDIO_UNAVAILABLE');
      } else {
        setAudioError('SONG_AUDIO_RESOLUTION_FAILED');
      }
      setIsBuffering(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    }
  }, []);

  // Song switching effect: detect when currentQueueItemId or songId changes
  const currentSongId = playback?.currentItem?.song?.id || null;
  const playbackStatus = playback?.status || 'idle';
  const playbackVersion = playback?.playbackVersion || 0;

  useEffect(() => {
    if (!enabled) return;

    if (!currentSongId || playbackStatus === 'idle' || playbackStatus === 'ended') {
      currentSongIdRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setIsPlaying(false);
      setIsBuffering(false);
      setAudioError(null);
      setIsAudioAvailable(true);
      return;
    }

    if (currentSongIdRef.current !== currentSongId) {
      currentSongIdRef.current = currentSongId;
      loadGenerationRef.current += 1;
      const gen = loadGenerationRef.current;
      resolveAudioForCurrentItem(currentSongId, gen);
    }
  }, [enabled, currentSongId, playbackStatus, resolveAudioForCurrentItem]);

  // Server state alignment: play, pause, seek, stop
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !enabled || !isAudioAvailable) return;

    if (playbackStatus === 'paused') {
      if (!audio.paused) {
        audio.pause();
      }
      // Sync paused position
      const targetSec = currentPositionMs / 1000;
      if (Math.abs(audio.currentTime - targetSec) > 0.5) {
        audio.currentTime = targetSec;
      }
      audio.playbackRate = 1.0;
      return;
    }

    if (playbackStatus === 'idle' || playbackStatus === 'ended') {
      if (!audio.paused) {
        audio.pause();
      }
      audio.playbackRate = 1.0;
      return;
    }

    if (playbackStatus === 'playing') {
      // Version jump or seek detected from server
      if (lastPlaybackVersionRef.current !== playbackVersion) {
        lastPlaybackVersionRef.current = playbackVersion;
        const targetSec = currentPositionMs / 1000;
        if (Math.abs(audio.currentTime - targetSec) > 0.5) {
          audio.currentTime = targetSec;
        }
      }

      // If audio is paused, attempt to play
      if (audio.paused) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: Error) => {
            if (err.name === 'NotAllowedError') {
              setIsAutoplayBlocked(true);
            } else {
              setAudioError('PLAYBACK_START_FAILED');
            }
          });
        }
      }
    }
  }, [enabled, playbackStatus, playbackVersion, currentPositionMs, isAudioAvailable]);

  // Drift Correction Engine: continuously compares local audio clock with server anchor
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !enabled || playbackStatus !== 'playing' || !isAudioAvailable) {
      return;
    }

    const checkDrift = () => {
      if (audio.paused || audio.readyState < 2) return;

      const audioMs = audio.currentTime * 1000;
      const driftMs = Math.abs(audioMs - currentPositionMs);

      if (driftMs < DRIFT_TOLERANCE_MS) {
        // Drift is within acceptable tolerance: normal playback rate
        if (audio.playbackRate !== 1.0) {
          audio.playbackRate = 1.0;
        }
      } else if (driftMs <= DRIFT_SEEK_THRESHOLD_MS) {
        // Moderate drift: subtle tempo nudge to gracefully catch up or ease back
        if (audioMs < currentPositionMs) {
          // Audio lagging behind server anchor
          audio.playbackRate = 1.04;
        } else {
          // Audio slightly ahead of server anchor
          audio.playbackRate = 0.96;
        }
      } else {
        // Large drift (>1.5s): hard seek directly to authoritative server position
        audio.currentTime = currentPositionMs / 1000;
        audio.playbackRate = 1.0;
      }
    };

    const interval = setInterval(checkDrift, 500);
    return () => clearInterval(interval);
  }, [enabled, playbackStatus, currentPositionMs, isAudioAvailable]);

  // Explicit user gesture unlock for browser autoplay policy
  const unlockAutoplay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      const targetSec = currentPositionMs / 1000;
      audio.currentTime = targetSec;
      await audio.play();
      setIsAutoplayBlocked(false);
    } catch {
      setIsAutoplayBlocked(true);
    }
  }, [currentPositionMs]);

  // Retry loading current track audio
  const retryAudioLoad = useCallback(() => {
    if (currentSongIdRef.current) {
      loadGenerationRef.current += 1;
      resolveAudioForCurrentItem(currentSongIdRef.current, loadGenerationRef.current);
    }
  }, [resolveAudioForCurrentItem]);

  return {
    audioElement: audioRef.current,
    isPlaying,
    isBuffering,
    isAutoplayBlocked,
    audioError,
    volume,
    isMuted,
    isAudioAvailable,
    unlockAutoplay,
    setVolume,
    toggleMute,
    retryAudioLoad,
  };
}
