'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PlaybackStateDto } from '@ktv/contracts';
import { karaokeApi } from '../api/karaoke-api';
import { clockSyncService } from '../services/clock-sync.service';

export interface UseKaraokeAudioOptions {
  playback: PlaybackStateDto | undefined;
  currentPositionMs: number;
  enabled?: boolean;
}

export type AudioExecutionState =
  | 'idle'
  | 'resolving_source'
  | 'loading'
  | 'waiting_for_user_interaction'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'reconnecting'
  | 'failed';

export interface UseKaraokeAudioReturn {
  audioElement: HTMLAudioElement | null;
  executionState: AudioExecutionState;
  isPlaying: boolean;
  isBuffering: boolean;
  isAutoplayBlocked: boolean;
  audioError: string | null;
  volume: number;
  isMuted: boolean;
  isAudioAvailable: boolean;
  driftMs: number;
  unlockAutoplay: () => Promise<void>;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  retryAudioLoad: () => void;
  outputDeviceId: string | null;
  isOutputSelectionSupported: boolean;
  setOutputDevice: (deviceId: string) => Promise<void>;
}

const STORAGE_VOLUME_KEY = 'ktv_karaoke_volume';
const STORAGE_MUTED_KEY = 'ktv_karaoke_muted';
const STORAGE_OUTPUT_DEVICE_KEY = 'ktv_karaoke_output_device';

export const AUDIO_RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 500,
  BACKOFF_FACTOR: 2,
  JITTER_MS: 150,
} as const;

export const PLAYBACK_SYNC_CONFIG = {
  DRIFT_TOLERANCE_MS: 250,
  DRIFT_NUDGE_MAX_MS: 1500,
  DRIFT_HARD_SEEK_MS: 1500,
  RATE_FASTER: 1.04,
  RATE_SLOWER: 0.96,
  RATE_NORMAL: 1.0,
  MIN_SEEK_COOLDOWN_MS: 2000,
  SEEK_ALIGN_TOLERANCE_SEC: 0.4,
  DRIFT_CHECK_INTERVAL_MS: 400,
} as const;

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
  const [executionState, setExecutionState] = useState<AudioExecutionState>('idle');
  const [currentDriftMs, setCurrentDriftMs] = useState(0);

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

  const isOutputSelectionSupported = typeof window !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const [outputDeviceId, setOutputDeviceId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_OUTPUT_DEVICE_KEY);
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadGenerationRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentSongIdRef = useRef<string | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const isBufferingRef = useRef<boolean>(false);
  const lastPlaybackVersionRef = useRef<number>(0);
  const lastHardSeekAtRef = useRef<number>(0);
  const isTabVisibleRef = useRef<boolean>(true);

  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);

  const playbackStatus = playback?.status || 'idle';
  const playbackVersion = playback?.playbackVersion || 0;
  const currentSongId = playback?.currentItem?.song?.id || null;
  const currentPositionMsRef = useRef<number>(currentPositionMs);
  const playbackRef = useRef<PlaybackStateDto | undefined>(playback);

  useEffect(() => {
    currentPositionMsRef.current = currentPositionMs;
  }, [currentPositionMs]);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

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

  // Tab visibility change listener: prevent seek queuing and manage rate
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      isTabVisibleRef.current = visible;

      const audio = audioRef.current;
      if (!audio) return;

      if (!visible) {
        // Tab backgrounded: reset any active tempo nudge to prevent pitch shift
        if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        }
      } else {
        // Tab foregrounded: trigger clock sync and evaluate if realign seek is needed
        clockSyncService.sampleSocket().catch(() => {});
        if (playbackStatus === 'playing' && audio.readyState >= 3 && !audio.paused) {
          const audioMs = audio.currentTime * 1000;
          const drift = Math.abs(audioMs - currentPositionMsRef.current);
          if (drift > PLAYBACK_SYNC_CONFIG.DRIFT_HARD_SEEK_MS) {
            audio.currentTime = currentPositionMsRef.current / 1000;
            audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
            lastHardSeekAtRef.current = Date.now();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [playbackStatus]);

  // Initialize native HTMLAudioElement once
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.volume = volumeRef.current;
      audio.muted = isMutedRef.current;

      const initialSink = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_OUTPUT_DEVICE_KEY) : null;
      if (initialSink && 'setSinkId' in HTMLMediaElement.prototype) {
        (audio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(initialSink).catch(() => {});
      }

      audio.addEventListener('play', () => {
        setIsPlaying(true);
        isPlayingRef.current = true;
        setIsAutoplayBlocked(false);
        setExecutionState('playing');
      });

      audio.addEventListener('pause', () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        }
        setExecutionState((prev) => (prev === 'buffering' ? prev : 'paused'));
      });

      audio.addEventListener('waiting', () => {
        setIsBuffering(true);
        isBufferingRef.current = true;
        setExecutionState('buffering');
        // Shield buffering from drift correction rate shifts
        if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        }
      });

      audio.addEventListener('playing', () => {
        setIsBuffering(false);
        isBufferingRef.current = false;
        setExecutionState('playing');
      });

      audio.addEventListener('canplay', () => {
        setIsBuffering(false);
        isBufferingRef.current = false;

        // If server is playing, synchronize currentTime with authoritative anchor
        const currentPb = playbackRef.current;
        if (currentPb?.status === 'playing' && currentPb.anchorStartedAt) {
          const anchorTime = new Date(currentPb.anchorStartedAt).getTime();
          const baseMs = currentPb.positionMs;
          const durationMs = currentPb.currentItem?.song?.durationMs || 300000;
          const serverNow = clockSyncService.now();
          const elapsed = Math.max(0, serverNow - anchorTime);
          const targetSec = Math.min(durationMs, baseMs + elapsed) / 1000;

          if (Math.abs(audio.currentTime - targetSec) > PLAYBACK_SYNC_CONFIG.SEEK_ALIGN_TOLERANCE_SEC) {
            audio.currentTime = targetSec;
          }
        }
      });

      audio.addEventListener('error', () => {
        const err = audio.error;
        const msg = err ? `AUDIO_ELEMENT_ERROR_${err.code}` : 'AUDIO_PLAYBACK_ERROR';
        setAudioError(msg);
        setIsBuffering(false);
        isBufferingRef.current = false;
        setExecutionState('failed');
        if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        }
      });

      // Browser playback reached end: reset local audio; server scheduler remains sole authority
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        }
        setExecutionState('paused');
      });

      audioRef.current = audio;
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
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

  // Audio source resolution with generation fencing and exponential backoff retry
  const resolveAudioForCurrentItem = useCallback(
    async (songId: string, generation: number, attempt: number = 1) => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      if (loadGenerationRef.current !== generation) {
        return;
      }

      try {
        setAudioError(null);
        setIsBuffering(true);
        isBufferingRef.current = true;
        if (attempt === 1) {
          setExecutionState('resolving_source');
        } else {
          setExecutionState('reconnecting');
        }

        const resolved = await karaokeApi.resolveAudioSource(songId);

        // Discard if generation changed during async fetch
        if (loadGenerationRef.current !== generation) {
          return;
        }

        if (!resolved || resolved.availability !== 'audio_available' || !resolved.url) {
          setIsAudioAvailable(false);
          setAudioError('SONG_AUDIO_UNAVAILABLE');
          setIsBuffering(false);
          isBufferingRef.current = false;
          setExecutionState('failed');
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current.load();
          }
          return;
        }

        setIsAudioAvailable(true);
        setExecutionState('loading');
        if (audioRef.current) {
          // Only re-set src if changed to avoid redundant network fetch
          if (audioRef.current.src !== resolved.url) {
            audioRef.current.src = resolved.url;
            audioRef.current.load();
          }
        }
      } catch (err: unknown) {
        if (loadGenerationRef.current !== generation) return;

        const msg = err instanceof Error ? err.message : String(err);
        const isPermanent =
          msg.includes('SONG_AUDIO_UNAVAILABLE') ||
          msg.includes('SONG_NOT_FOUND') ||
          msg.includes('400') ||
          msg.includes('404');

        if (isPermanent) {
          setIsAudioAvailable(!msg.includes('SONG_AUDIO_UNAVAILABLE'));
          setAudioError(msg.includes('SONG_AUDIO_UNAVAILABLE') ? 'SONG_AUDIO_UNAVAILABLE' : 'SONG_NOT_FOUND');
          setIsBuffering(false);
          isBufferingRef.current = false;
          setExecutionState('failed');
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current.load();
          }
          return;
        }

        // Transient failure: retry with exponential backoff & jitter
        if (attempt < AUDIO_RETRY_CONFIG.MAX_ATTEMPTS) {
          setExecutionState('reconnecting');
          const delay =
            AUDIO_RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(AUDIO_RETRY_CONFIG.BACKOFF_FACTOR, attempt - 1) +
            Math.random() * AUDIO_RETRY_CONFIG.JITTER_MS;

          retryTimeoutRef.current = setTimeout(() => {
            if (loadGenerationRef.current === generation) {
              resolveAudioForCurrentItem(songId, generation, attempt + 1);
            }
          }, delay);
        } else {
          setAudioError('SONG_AUDIO_RESOLUTION_FAILED');
          setIsBuffering(false);
          isBufferingRef.current = false;
          setExecutionState('failed');
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current.load();
          }
        }
      }
    },
    []
  );

  // Song switching effect: detect when currentQueueItemId or songId changes
  useEffect(() => {
    if (!enabled) return;

    if (!currentSongId || playbackStatus === 'idle' || playbackStatus === 'ended') {
      currentSongIdRef.current = null;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
      setIsPlaying(false);
      setIsBuffering(false);
      isBufferingRef.current = false;
      setAudioError(null);
      setIsAudioAvailable(true);
      setExecutionState('idle');
      return;
    }

    if (currentSongIdRef.current !== currentSongId) {
      currentSongIdRef.current = currentSongId;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      loadGenerationRef.current += 1;
      const gen = loadGenerationRef.current;
      resolveAudioForCurrentItem(currentSongId, gen, 1);
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
      // Realign paused position
      const targetSec = currentPositionMs / 1000;
      if (Math.abs(audio.currentTime - targetSec) > PLAYBACK_SYNC_CONFIG.SEEK_ALIGN_TOLERANCE_SEC) {
        audio.currentTime = targetSec;
      }
      if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
        audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
      }
      setExecutionState('paused');
      return;
    }

    if (playbackStatus === 'idle' || playbackStatus === 'ended') {
      if (!audio.paused) {
        audio.pause();
      }
      if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
        audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
      }
      setExecutionState('idle');
      return;
    }

    if (playbackStatus === 'playing') {
      // Version jump or seek detected from server
      if (lastPlaybackVersionRef.current !== playbackVersion) {
        lastPlaybackVersionRef.current = playbackVersion;
        const targetSec = currentPositionMs / 1000;
        if (Math.abs(audio.currentTime - targetSec) > PLAYBACK_SYNC_CONFIG.SEEK_ALIGN_TOLERANCE_SEC) {
          audio.currentTime = targetSec;
          lastHardSeekAtRef.current = Date.now();
        }
      }

      // If audio is paused, attempt to start playback
      if (audio.paused && !isBufferingRef.current) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: Error) => {
            if (err.name === 'AbortError') {
              // Benign abort caused by track change or pause while play promise was settling
              return;
            }
            if (err.name === 'NotAllowedError') {
              setIsAutoplayBlocked(true);
              setExecutionState('waiting_for_user_interaction');
            } else {
              setAudioError('PLAYBACK_START_FAILED');
              setExecutionState('failed');
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
      // Invariant: Do not perform drift correction if tab is hidden, audio is paused, buffering, or lacks future data
      if (!isTabVisibleRef.current || audio.paused || isBufferingRef.current || audio.readyState < 3) {
        if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        }
        return;
      }

      const audioMs = audio.currentTime * 1000;
      const targetMs = currentPositionMsRef.current;
      const driftDelta = audioMs - targetMs;
      const absDrift = Math.abs(driftDelta);

      setCurrentDriftMs(Math.round(driftDelta));

      if (absDrift < PLAYBACK_SYNC_CONFIG.DRIFT_TOLERANCE_MS) {
        // Tier 1: Drift is within acceptable deadband (<250ms) -> normal playback rate
        if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
        }
      } else if (absDrift <= PLAYBACK_SYNC_CONFIG.DRIFT_NUDGE_MAX_MS) {
        // Tier 2: Moderate drift (250ms - 1500ms) -> subtle tempo adjustment
        if (driftDelta < 0) {
          // Audio lagging behind server anchor -> speed up slightly
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_FASTER;
        } else {
          // Audio leading ahead of server anchor -> slow down slightly
          audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_SLOWER;
        }
      } else {
        // Tier 3: Large drift (>1500ms) -> execute hard seek respecting cooldown
        const now = Date.now();
        if (now - lastHardSeekAtRef.current < PLAYBACK_SYNC_CONFIG.MIN_SEEK_COOLDOWN_MS) {
          // Enforce cooldown: avoid seek thrashing, keep rate normal
          if (audio.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
            audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
          }
          return;
        }

        lastHardSeekAtRef.current = now;
        audio.currentTime = targetMs / 1000;
        audio.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
      }
    };

    const interval = setInterval(checkDrift, PLAYBACK_SYNC_CONFIG.DRIFT_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (audioRef.current && audioRef.current.playbackRate !== PLAYBACK_SYNC_CONFIG.RATE_NORMAL) {
        audioRef.current.playbackRate = PLAYBACK_SYNC_CONFIG.RATE_NORMAL;
      }
    };
  }, [enabled, playbackStatus, isAudioAvailable]);

  // Explicit user gesture unlock for browser autoplay policy
  const unlockAutoplay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      const targetSec = currentPositionMsRef.current / 1000;
      audio.currentTime = targetSec;
      await audio.play();
      setIsAutoplayBlocked(false);
      setExecutionState('playing');
    } catch (err: unknown) {
      const error = err as Error;
      if (error?.name === 'AbortError') return;
      setIsAutoplayBlocked(true);
      setExecutionState('waiting_for_user_interaction');
    }
  }, []);

  // Retry loading current track audio
  const retryAudioLoad = useCallback(() => {
    if (currentSongIdRef.current) {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      loadGenerationRef.current += 1;
      resolveAudioForCurrentItem(currentSongIdRef.current, loadGenerationRef.current, 1);
    }
  }, [resolveAudioForCurrentItem]);

  // Synchronize backing track output device changes across components
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSinkChange = (e: Event) => {
      const customEvent = e as CustomEvent<string | { deviceId: string }>;
      const devId = typeof customEvent.detail === 'string' ? customEvent.detail : customEvent.detail?.deviceId;
      if (devId && audioRef.current && 'setSinkId' in HTMLMediaElement.prototype) {
        setOutputDeviceId(devId);
        (audioRef.current as unknown as { setSinkId: (id: string) => Promise<void> })
          .setSinkId(devId)
          .catch(() => {});
      }
    };

    window.addEventListener('ktv_karaoke_sink_changed', handleSinkChange);
    return () => {
      window.removeEventListener('ktv_karaoke_sink_changed', handleSinkChange);
    };
  }, []);

  const setOutputDevice = useCallback(async (deviceId: string) => {
    setOutputDeviceId(deviceId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_OUTPUT_DEVICE_KEY, deviceId);
      window.dispatchEvent(new CustomEvent('ktv_karaoke_sink_changed', { detail: deviceId }));
    }
    if (audioRef.current && 'setSinkId' in HTMLMediaElement.prototype) {
      try {
        await (audioRef.current as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      } catch {
        // Silently handle browser sink errors
      }
    }
  }, []);

  return {
    audioElement: audioRef.current,
    executionState,
    isPlaying,
    isBuffering,
    isAutoplayBlocked,
    audioError,
    volume,
    isMuted,
    isAudioAvailable,
    driftMs: currentDriftMs,
    unlockAutoplay,
    setVolume,
    toggleMute,
    retryAudioLoad,
    outputDeviceId,
    isOutputSelectionSupported,
    setOutputDevice,
  };
}
