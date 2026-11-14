'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  VoiceDevice,
  AudioCapturePreferences,
  MicrophonePermissionState,
} from '../types/voice.types';

export type VocalInputLevelCategory = 'silent' | 'quiet' | 'optimal' | 'peaking';

export interface UseMicrophoneTesterOptions {
  initialDeviceId?: string | null;
  capturePreferences?: AudioCapturePreferences;
  onDeviceChange?: (deviceId: string) => Promise<void> | void;
  onPreferencesChange?: (prefs: AudioCapturePreferences) => Promise<void> | void;
  // If an active media stream track is provided (e.g. from LiveKit), use it directly
  externalTrack?: MediaStreamTrack | null;
}

export interface UseMicrophoneTesterReturn {
  isTesting: boolean;
  audioLevel: number; // 0 to 100
  peakLevel: number; // 0 to 100 with hold
  levelCategory: VocalInputLevelCategory;
  permissionState: MicrophonePermissionState;
  devices: VoiceDevice[];
  activeDeviceId: string | null;
  errorMessage: string | null;
  capturePreferences: AudioCapturePreferences;
  startTesting: () => Promise<void>;
  stopTesting: () => void;
  selectDevice: (deviceId: string) => Promise<void>;
  updateCapturePreferences: (partial: Partial<AudioCapturePreferences>) => void;
  refreshDevices: () => Promise<void>;
}

const STORAGE_MIC_KEY = 'ktv_preferred_mic_id';
const STORAGE_CAPTURE_PREFS_KEY = 'ktv_audio_capture_prefs';

const DEFAULT_CAPTURE_PREFS: AudioCapturePreferences = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function classifyMediaError(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  const msg = err instanceof Error ? err.message : String(err);

  if (name === 'NotAllowedError' || msg.includes('Permission denied') || msg.includes('not allowed')) {
    return 'Microphone permission was denied. Please allow microphone permissions in your browser address bar.';
  }
  if (name === 'NotFoundError' || msg.includes('not found') || msg.includes('DevicesNotFoundError')) {
    return 'Selected audio device was not found or has been disconnected.';
  }
  if (name === 'NotReadableError' || msg.includes('Could not start') || msg.includes('TrackStartError')) {
    return 'Microphone is currently unavailable. It may be in use by another application or OS process.';
  }
  if (name === 'OverconstrainedError') {
    return 'Audio device constraints could not be satisfied by your hardware.';
  }
  if (name === 'SecurityError') {
    return 'Audio capture requires a secure context (HTTPS or localhost).';
  }
  return msg || 'An unexpected audio device error occurred.';
}

export function useMicrophoneTester({
  initialDeviceId,
  capturePreferences: initialPrefs,
  onDeviceChange,
  onPreferencesChange,
  externalTrack,
}: UseMicrophoneTesterOptions = {}): UseMicrophoneTesterReturn {
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [levelCategory, setLevelCategory] = useState<VocalInputLevelCategory>('silent');
  const [permissionState, setPermissionState] = useState<MicrophonePermissionState>('unknown');
  const [devices, setDevices] = useState<VoiceDevice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(() => {
    if (initialDeviceId !== undefined) return initialDeviceId;
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_MIC_KEY);
  });

  const [capturePreferences, setCapturePreferences] = useState<AudioCapturePreferences>(() => {
    if (initialPrefs) return initialPrefs;
    if (typeof window === 'undefined') return DEFAULT_CAPTURE_PREFS;
    try {
      const saved = localStorage.getItem(STORAGE_CAPTURE_PREFS_KEY);
      return saved ? { ...DEFAULT_CAPTURE_PREFS, ...JSON.parse(saved) } : DEFAULT_CAPTURE_PREFS;
    } catch {
      return DEFAULT_CAPTURE_PREFS;
    }
  });

  // Audio nodes and animation refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const peakHoldTimerRef = useRef<number>(0);
  const currentPeakRef = useRef<number>(0);

  // Sync external initialDeviceId if passed
  useEffect(() => {
    if (initialDeviceId !== undefined) {
      setActiveDeviceId(initialDeviceId);
    }
  }, [initialDeviceId]);

  // Sync external preferences if passed
  useEffect(() => {
    if (initialPrefs) {
      setCapturePreferences(initialPrefs);
    }
  }, [initialPrefs]);

  // Query microphone devices and permission
  const refreshDevices = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) return;

    try {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setPermissionState(perm.state as MicrophonePermissionState);
          perm.onchange = () => {
            setPermissionState(perm.state as MicrophonePermissionState);
          };
        } catch {
          // Unsupported in some browsers
        }
      }

      const rawDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = rawDevices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`,
        }));

      setDevices(audioInputs);

      // Verify if active device is still connected
      setActiveDeviceId((current) => {
        if (current && audioInputs.some((d) => d.deviceId === current)) {
          return current;
        }
        return audioInputs[0]?.deviceId || null;
      });
    } catch (err: unknown) {
      setErrorMessage(classifyMediaError(err));
    }
  }, []);

  // Listen for device changes (plug / unplug)
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) return;

    refreshDevices();

    const handleDeviceChange = () => {
      refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  // Teardown Web Audio analysis nodes and private test streams
  const stopTesting = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }

    if (analyserNodeRef.current) {
      try {
        analyserNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserNodeRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    // Stop private test media stream tracks (NEVER stop external tracks)
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      mediaStreamRef.current = null;
    }

    setIsTesting(false);
    setAudioLevel(0);
    setPeakLevel(0);
    setLevelCategory('silent');
  }, []);

  // Start real-time audio level monitoring
  const startTesting = useCallback(async () => {
    stopTesting();
    setErrorMessage(null);

    try {
      let stream: MediaStream;

      if (externalTrack && externalTrack.readyState === 'live') {
        // Reuse external LiveKit track without creating a redundant hardware track
        stream = new MediaStream([externalTrack]);
      } else {
        // Standalone private capture stream
        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: activeDeviceId ? { exact: activeDeviceId } : undefined,
            echoCancellation: capturePreferences.echoCancellation,
            noiseSuppression: capturePreferences.noiseSuppression,
            autoGainControl: capturePreferences.autoGainControl,
          },
          video: false,
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;
        setPermissionState('granted');
        refreshDevices();
      }

      // Initialize Web Audio pipeline
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      analyserNodeRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      // NOTE: DO NOT connect analyser to audioCtx.destination! Avoid feedback loop.
      sourceNodeRef.current = source;

      setIsTesting(true);

      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);

      let smoothedLevel = 0;

      const tick = () => {
        if (!analyserNodeRef.current) return;

        analyserNodeRef.current.getByteTimeDomainData(dataArray);

        // Calculate Root Mean Square (RMS)
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i] ?? 128;
          const normalized = (val - 128) / 128; // -1.0 to 1.0
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        // Scale RMS to 0..100 with vocal sensitivity curve
        const rawPercent = Math.min(100, Math.round(rms * 160));
        smoothedLevel = 0.65 * smoothedLevel + 0.35 * rawPercent;
        const currentLevel = Math.round(smoothedLevel);

        // Peak Hold logic
        const now = Date.now();
        if (currentLevel >= currentPeakRef.current) {
          currentPeakRef.current = currentLevel;
          peakHoldTimerRef.current = now + 900; // Hold peak for 900ms
        } else if (now > peakHoldTimerRef.current) {
          currentPeakRef.current = Math.max(0, currentPeakRef.current - 2);
        }

        setAudioLevel(currentLevel);
        setPeakLevel(currentPeakRef.current);

        // Categorize vocal input
        if (currentLevel < 2) {
          setLevelCategory('silent');
        } else if (currentLevel < 15) {
          setLevelCategory('quiet');
        } else if (currentLevel <= 75) {
          setLevelCategory('optimal');
        } else {
          setLevelCategory('peaking');
        }

        animationFrameRef.current = requestAnimationFrame(tick);
      };

      animationFrameRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const msg = classifyMediaError(err);
      setErrorMessage(msg);
      if (msg.includes('denied')) {
        setPermissionState('denied');
      }
      stopTesting();
    }
  }, [activeDeviceId, capturePreferences, externalTrack, refreshDevices, stopTesting]);

  // Select audio input device
  const selectDevice = useCallback(
    async (deviceId: string) => {
      setActiveDeviceId(deviceId);
      setErrorMessage(null);

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_MIC_KEY, deviceId);
      }

      if (onDeviceChange) {
        await onDeviceChange(deviceId);
      }

      // If testing is active, restart test on the new device
      if (isTesting) {
        startTesting();
      }
    },
    [isTesting, onDeviceChange, startTesting]
  );

  // Update capture preferences
  const updateCapturePreferences = useCallback(
    (partial: Partial<AudioCapturePreferences>) => {
      setCapturePreferences((prev) => {
        const next = { ...prev, ...partial };
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_CAPTURE_PREFS_KEY, JSON.stringify(next));
        }
        if (onPreferencesChange) {
          onPreferencesChange(next);
        }
        return next;
      });

      // If testing is active, restart test with updated constraints
      if (isTesting) {
        setTimeout(() => startTesting(), 50);
      }
    },
    [isTesting, onPreferencesChange, startTesting]
  );

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopTesting();
    };
  }, [stopTesting]);

  return {
    isTesting,
    audioLevel,
    peakLevel,
    levelCategory,
    permissionState,
    devices,
    activeDeviceId,
    errorMessage,
    capturePreferences,
    startTesting,
    stopTesting,
    selectDevice,
    updateCapturePreferences,
    refreshDevices,
  };
}
