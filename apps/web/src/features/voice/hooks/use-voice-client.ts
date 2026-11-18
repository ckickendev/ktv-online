'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteParticipant,
  Participant,
  Track,
} from 'livekit-client';
import {
  VoiceConnectionState,
  SOCKET_EVENTS,
  VoiceStateSnapshotPayload,
  VoiceParticipantUpdatedPayload,
} from '@ktv/contracts';
import { socketManager } from '@/lib/socket/socket-client';
import { voiceApi } from '../api/voice-api';
import {
  useVoiceStateStore,
  mergeVoiceParticipants,
  buildVirtualRoomVoiceAdapterMap,
} from '../stores/voice-state.store';
import {
  UseVoiceClientOptions,
  UseVoiceClientReturn,
  VoiceParticipantInfo,
  VoiceDevice,
  AudioCapturePreferences,
  MicrophonePermissionState,
} from '../types/voice.types';

const MAX_RECONNECT_ATTEMPTS = 3;
const SPEAKING_EMIT_THROTTLE_MS = 200;
const STORAGE_MIC_KEY = 'ktv_preferred_mic_id';
const STORAGE_VOICE_OUTPUT_KEY = 'ktv_preferred_voice_output_id';
const STORAGE_CAPTURE_PREFS_KEY = 'ktv_audio_capture_prefs';

const DEFAULT_CAPTURE_PREFS: AudioCapturePreferences = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function classifyDeviceError(err: unknown): { message: string; isPermissionDenied: boolean } {
  const name = (err as { name?: string })?.name || '';
  const msg = err instanceof Error ? err.message : String(err);

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    msg.includes('Permission denied') ||
    msg.includes('not allowed')
  ) {
    return {
      message:
        'Microphone permission was denied. Please allow microphone permissions in your browser settings and try again.',
      isPermissionDenied: true,
    };
  }
  if (name === 'NotFoundError' || msg.includes('not found') || msg.includes('DevicesNotFoundError')) {
    return {
      message: 'Selected audio device was not found or has been disconnected.',
      isPermissionDenied: false,
    };
  }
  if (name === 'NotReadableError' || msg.includes('Could not start') || msg.includes('TrackStartError')) {
    return {
      message:
        'Microphone is currently unavailable. It may be in use by another application or operating system process.',
      isPermissionDenied: false,
    };
  }
  if (name === 'OverconstrainedError' || msg.includes('OverconstrainedError')) {
    return {
      message: 'Audio device constraints (sample rate or channels) could not be satisfied by your hardware.',
      isPermissionDenied: false,
    };
  }
  if (name === 'SecurityError') {
    return {
      message: 'Audio device selection requires a secure HTTPS context.',
      isPermissionDenied: false,
    };
  }
  return {
    message: msg || 'An unexpected audio device error occurred.',
    isPermissionDenied: false,
  };
}

export function useVoiceClient({
  roomId,
  enabled = true,
  currentUserId = null,
}: UseVoiceClientOptions): UseVoiceClientReturn {
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveKitParticipants, setLiveKitParticipants] = useState<VoiceParticipantInfo[]>([]);

  const socketVoicePresence = useVoiceStateStore((s) => s.socketVoicePresence);
  const setStoreRoomId = useVoiceStateStore((s) => s.setRoomId);
  const setStoreConnectionState = useVoiceStateStore((s) => s.setConnectionState);
  const setStoreIsAudioBlocked = useVoiceStateStore((s) => s.setIsAudioBlocked);
  const setStoreErrorMessage = useVoiceStateStore((s) => s.setErrorMessage);
  const setStoreLiveKitParticipants = useVoiceStateStore((s) => s.setLiveKitParticipants);
  const applyVoiceSnapshot = useVoiceStateStore((s) => s.applyVoiceSnapshot);
  const applyVoiceParticipantUpdate = useVoiceStateStore((s) => s.applyVoiceParticipantUpdate);

  // Audio Input Devices (Microphone)
  const [audioInputDevices, setAudioInputDevices] = useState<VoiceDevice[]>([]);
  const [activeAudioInputId, setActiveAudioInputId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_MIC_KEY);
  });
  const [permissionState, setPermissionState] = useState<MicrophonePermissionState>('unknown');

  // Audio Output Devices (Voice Speaker)
  const [audioOutputDevices, setAudioOutputDevices] = useState<VoiceDevice[]>([]);
  const [activeAudioOutputId, setActiveAudioOutputId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_VOICE_OUTPUT_KEY);
  });

  const isOutputSelectionSupported =
    typeof window !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  // Capture Quality Preferences (AEC, Noise Suppression, AGC)
  const [capturePreferences, setCapturePreferences] = useState<AudioCapturePreferences>(() => {
    if (typeof window === 'undefined') return DEFAULT_CAPTURE_PREFS;
    try {
      const saved = localStorage.getItem(STORAGE_CAPTURE_PREFS_KEY);
      return saved ? { ...DEFAULT_CAPTURE_PREFS, ...JSON.parse(saved) } : DEFAULT_CAPTURE_PREFS;
    } catch {
      return DEFAULT_CAPTURE_PREFS;
    }
  });

  // LiveKit Room stays strictly outside Zustand
  const roomRef = useRef<Room | null>(null);
  const isJoiningRef = useRef<boolean>(false);
  const renewalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRenewingRef = useRef<boolean>(false);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const tabIdRef = useRef<string>('');
  const sessionGenRef = useRef<number>(0);
  const latestTokenRef = useRef<string | null>(null);
  const isExplicitLeaveRef = useRef<boolean>(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  const activeAudioOutputIdRef = useRef<string | null>(activeAudioOutputId);
  const activeAudioInputIdRef = useRef<string | null>(activeAudioInputId);
  const capturePreferencesRef = useRef<AudioCapturePreferences>(capturePreferences);
  const lastSpeakingTelemetryRef = useRef<{
    isSpeaking: boolean;
    isMuted: boolean;
    lastTrueAt: number;
  }>({
    isSpeaking: false,
    isMuted: false,
    lastTrueAt: 0,
  });

  useEffect(() => {
    activeAudioOutputIdRef.current = activeAudioOutputId;
  }, [activeAudioOutputId]);

  useEffect(() => {
    activeAudioInputIdRef.current = activeAudioInputId;
  }, [activeAudioInputId]);

  useEffect(() => {
    capturePreferencesRef.current = capturePreferences;
  }, [capturePreferences]);

  // Synchronize serializable state to Zustand store
  useEffect(() => {
    setStoreRoomId(roomId || null);
  }, [roomId, setStoreRoomId]);

  useEffect(() => {
    setStoreConnectionState(connectionState);
  }, [connectionState, setStoreConnectionState]);

  useEffect(() => {
    setStoreIsAudioBlocked(isAudioBlocked);
  }, [isAudioBlocked, setStoreIsAudioBlocked]);

  useEffect(() => {
    setStoreErrorMessage(errorMessage);
  }, [errorMessage, setStoreErrorMessage]);

  useEffect(() => {
    setStoreLiveKitParticipants(liveKitParticipants);
  }, [liveKitParticipants, setStoreLiveKitParticipants]);

  // Initialize unique session tab ID once
  useEffect(() => {
    if (!tabIdRef.current) {
      tabIdRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).substring(2, 10);
    }
  }, []);

  // Throttled Socket.IO speaking/mute telemetry emitter (non-authoritative hint)
  const emitSpeakingTelemetry = useCallback(
    (nextSpeaking: boolean, nextMuted: boolean, force = false) => {
      if (!roomId) return;
      const socket = socketManager.getSocket();
      if (!socket?.connected) return;

      const effectiveSpeaking = nextMuted ? false : nextSpeaking;
      const prev = lastSpeakingTelemetryRef.current;
      const now = Date.now();

      if (!force) {
        if (prev.isSpeaking === effectiveSpeaking && prev.isMuted === nextMuted) {
          return;
        }
        // Throttle rapid speaking re-triggers within window; allow initial onset and immediate stop/mute
        if (effectiveSpeaking && now - prev.lastTrueAt < SPEAKING_EMIT_THROTTLE_MS) {
          return;
        }
      }

      lastSpeakingTelemetryRef.current = {
        isSpeaking: effectiveSpeaking,
        isMuted: nextMuted,
        lastTrueAt: effectiveSpeaking ? now : prev.lastTrueAt,
      };

      socket.emit(SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE, {
        roomId,
        isSpeaking: effectiveSpeaking,
        isMuted: nextMuted,
      });
    },
    [roomId]
  );

  // Subscribe to Socket.IO room-wide voice presence (works even when user has NOT joined LiveKit voice)
  useEffect(() => {
    if (!roomId) return;

    let boundSocket = socketManager.getSocket();

    const handleSnapshot = (payload: VoiceStateSnapshotPayload) => {
      if (!payload || payload.roomId !== roomId) return;
      applyVoiceSnapshot(roomId, payload.participants || []);
    };

    const handleParticipantEvent = (payload: VoiceParticipantUpdatedPayload) => {
      if (!payload || payload.roomId !== roomId) return;
      applyVoiceParticipantUpdate(payload);
    };

    const attach = () => {
      const s = socketManager.getSocket();
      if (!s) return;
      if (boundSocket && boundSocket !== s) {
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, handleSnapshot);
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_JOINED, handleParticipantEvent);
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_LEFT, handleParticipantEvent);
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_UPDATED, handleParticipantEvent);
      }
      boundSocket = s;
      s.off(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, handleSnapshot);
      s.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_JOINED, handleParticipantEvent);
      s.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_LEFT, handleParticipantEvent);
      s.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_UPDATED, handleParticipantEvent);

      s.on(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, handleSnapshot);
      s.on(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_JOINED, handleParticipantEvent);
      s.on(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_LEFT, handleParticipantEvent);
      s.on(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_UPDATED, handleParticipantEvent);

      if (s.connected) {
        s.emit(SOCKET_EVENTS.CLIENT.VOICE_STATE_REQUEST, { roomId });
      }
    };

    attach();

    const unsubscribeStatus = socketManager.subscribeStatus((status) => {
      if (status === 'connected') {
        attach();
      }
    });

    return () => {
      unsubscribeStatus();
      if (boundSocket) {
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, handleSnapshot);
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_JOINED, handleParticipantEvent);
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_LEFT, handleParticipantEvent);
        boundSocket.off(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_UPDATED, handleParticipantEvent);
      }
    };
  }, [roomId, applyVoiceSnapshot, applyVoiceParticipantUpdate]);

  // Helper to extract participant info from LiveKit participant
  const mapParticipant = useCallback((p: Participant, isLocal: boolean): VoiceParticipantInfo => {
    let metadataObj: { userId?: string; username?: string; displayName?: string; avatarUrl?: string } = {};
    if (p.metadata) {
      try {
        metadataObj = JSON.parse(p.metadata);
      } catch {
        // ignore parse error
      }
    }

    const userId = metadataObj.userId || p.identity.split('_')[0] || p.identity;
    const username = metadataObj.username || p.name || 'Member';
    const displayName = metadataObj.displayName || p.name || username;
    const avatarUrl = metadataObj.avatarUrl;

    const micPub = p.getTrackPublication(Track.Source.Microphone);
    const micMuted = micPub ? micPub.isMuted : !p.isMicrophoneEnabled;

    return {
      identity: p.identity,
      userId,
      username,
      displayName,
      avatarUrl,
      isMuted: micMuted,
      isSpeaking: micMuted ? false : p.isSpeaking,
      isLocal,
      joinedAt: p.joinedAt?.toISOString(),
    };
  }, []);

  // Update participant list state from current LiveKit room participants
  const syncParticipants = useCallback(
    (room: Room) => {
      const list: VoiceParticipantInfo[] = [];

      if (room.localParticipant) {
        const localMapped = mapParticipant(room.localParticipant, true);
        list.push(localMapped);
        setIsMuted(localMapped.isMuted);
        setIsSpeaking(localMapped.isSpeaking);
        emitSpeakingTelemetry(localMapped.isSpeaking, localMapped.isMuted);
      }

      room.remoteParticipants.forEach((p) => {
        list.push(mapParticipant(p, false));
      });

      setLiveKitParticipants(list);
    },
    [mapParticipant, emitSpeakingTelemetry]
  );

  // Clean up all attached remote audio elements
  const cleanupAudioElements = useCallback(() => {
    audioElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        // ignore cleanup error
      }
    });
    audioElementsRef.current.clear();
  }, []);

  // Shared teardown helper that preserves error state when requested
  const teardownRoomConnection = useCallback(
    async (options: { preserveError?: boolean; targetState?: VoiceConnectionState } = {}) => {
      const { preserveError = false, targetState = 'idle' } = options;

      isJoiningRef.current = false;
      latestTokenRef.current = null;
      reconnectAttemptsRef.current = 0;

      // Invalidate current room session generation
      sessionGenRef.current += 1;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (renewalTimerRef.current) {
        clearTimeout(renewalTimerRef.current);
        renewalTimerRef.current = null;
      }
      isRenewingRef.current = false;

      cleanupAudioElements();

      const activeRoom = roomRef.current;
      roomRef.current = null;

      if (activeRoom) {
        try {
          if (activeRoom.localParticipant) {
            // Stop all local audio tracks to release microphone hardware immediately
            activeRoom.localParticipant.audioTrackPublications.forEach((pub) => {
              if (pub.track) {
                pub.track.stop();
              }
            });
            await activeRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          }
          await activeRoom.disconnect();
        } catch {
          // ignore disconnect error
        }
      }

      emitSpeakingTelemetry(false, true, true);

      setConnectionState(targetState);
      setLiveKitParticipants([]);
      setIsMuted(false);
      setIsSpeaking(false);
      setIsAudioBlocked(false);
      if (!preserveError) {
        setErrorMessage(null);
      }
    },
    [cleanupAudioElements, emitSpeakingTelemetry]
  );

  // Explicit user disconnect from voice lounge (preserves KTV room membership)
  const leaveVoice = useCallback(async () => {
    isExplicitLeaveRef.current = true;
    await teardownRoomConnection({ preserveError: false, targetState: 'idle' });
  }, [teardownRoomConnection]);

  // Schedule proactive token renewal at 80% of TTL with coalescing
  const scheduleTokenRenewal = useCallback(
    (expiresAtStr: string) => {
      if (renewalTimerRef.current) {
        clearTimeout(renewalTimerRef.current);
        renewalTimerRef.current = null;
      }

      const expiresAt = new Date(expiresAtStr).getTime();
      const now = Date.now();
      const duration = expiresAt - now;

      // Renew at 80% of token duration or at least 10s
      const refreshDelay = Math.max(10000, duration * 0.8);

      renewalTimerRef.current = setTimeout(async () => {
        if (isRenewingRef.current) return;
        if (!roomRef.current || roomRef.current.state === 'disconnected') return;

        isRenewingRef.current = true;
        try {
          const freshTokenData = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
          latestTokenRef.current = freshTokenData.token;
          scheduleTokenRenewal(freshTokenData.expiresAt);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (
            errorMsg.includes('403') ||
            errorMsg.includes('401') ||
            errorMsg.includes('KICKED') ||
            errorMsg.includes('REVOKED') ||
            errorMsg.includes('FORBIDDEN')
          ) {
            isExplicitLeaveRef.current = true;
            setErrorMessage('Voice authorization expired or revoked by host.');
            await teardownRoomConnection({ preserveError: true, targetState: 'unauthorized' });
          }
        } finally {
          isRenewingRef.current = false;
        }
      }, refreshDelay);
    },
    [roomId, teardownRoomConnection]
  );

  // Enumerate input and output devices and track permission status
  const refreshDevices = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) {
      return;
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setPermissionState(perm.state as MicrophonePermissionState);
          perm.onchange = () => {
            setPermissionState(perm.state as MicrophonePermissionState);
          };
        } catch {
          // Unsupported query permission in some browsers
        }
      }

      const rawDevices = await navigator.mediaDevices.enumerateDevices();

      const inputs: VoiceDevice[] = rawDevices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`,
        }));

      const outputs: VoiceDevice[] = rawDevices
        .filter((d) => d.kind === 'audiooutput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker/Headphones ${index + 1}`,
        }));

      setAudioInputDevices(inputs);
      setAudioOutputDevices(outputs);

      setActiveAudioInputId((current) => {
        if (current && inputs.some((d) => d.deviceId === current)) {
          return current;
        }
        const fallback = inputs[0]?.deviceId || null;
        if (current && fallback && current !== fallback && roomRef.current) {
          roomRef.current.switchActiveDevice('audioinput', fallback).catch(() => {});
          setErrorMessage('Active microphone was disconnected. Switched to available microphone.');
        }
        return fallback;
      });

      setActiveAudioOutputId((current) => {
        if (current && outputs.some((d) => d.deviceId === current)) {
          return current;
        }
        return outputs[0]?.deviceId || null;
      });
    } catch {
      // ignore enumeration errors
    }
  }, []);

  // Monitor device changes (plug/unplug)
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

  const attemptReconnectRef = useRef<((currentSessionGen: number) => void) | null>(null);

  // Bind Room event listeners with generation fencing and bounded reconnect
  const bindRoomListeners = useCallback(
    (room: Room, currentSessionGen: number, expiresAtStr: string) => {
      room.on(RoomEvent.Connected, async () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        setConnectionState('connected');
        setIsAudioBlocked(!room.canPlaybackAudio);
        reconnectAttemptsRef.current = 0;
        syncParticipants(room);

        refreshDevices();
        scheduleTokenRenewal(expiresAtStr);
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        setConnectionState('reconnecting');
      });

      room.on(RoomEvent.Reconnected, async () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        setConnectionState('connected');
        setIsAudioBlocked(!room.canPlaybackAudio);
        reconnectAttemptsRef.current = 0;
        syncParticipants(room);

        // Re-verify authorization upon reconnect
        try {
          const reauth = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
          if (sessionGenRef.current === currentSessionGen && roomRef.current) {
            latestTokenRef.current = reauth.token;
            scheduleTokenRenewal(reauth.expiresAt);
          }
        } catch {
          if (sessionGenRef.current === currentSessionGen) {
            isExplicitLeaveRef.current = true;
            setErrorMessage('Voice authorization expired or was revoked.');
            await teardownRoomConnection({ preserveError: true, targetState: 'unauthorized' });
          }
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        cleanupAudioElements();
        setLiveKitParticipants([]);
        setIsAudioBlocked(false);

        if (isExplicitLeaveRef.current) {
          setConnectionState('idle');
          return;
        }

        if (attemptReconnectRef.current) {
          attemptReconnectRef.current(currentSessionGen);
        }
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        setIsAudioBlocked(!room.canPlaybackAudio);
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        if (sessionGenRef.current === currentSessionGen) syncParticipants(room);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        if (sessionGenRef.current !== currentSessionGen) return;
        const el = audioElementsRef.current.get(participant.identity);
        if (el) {
          el.pause();
          el.srcObject = null;
          el.remove();
          audioElementsRef.current.delete(participant.identity);
        }
        syncParticipants(room);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, () => {
        if (sessionGenRef.current === currentSessionGen) syncParticipants(room);
      });

      room.on(RoomEvent.TrackMuted, () => {
        if (sessionGenRef.current === currentSessionGen) syncParticipants(room);
      });

      room.on(RoomEvent.TrackUnmuted, () => {
        if (sessionGenRef.current === currentSessionGen) syncParticipants(room);
      });

      // Synchronize dynamic LiveKit participant permission updates (e.g. host mute/unmute)
      room.on(RoomEvent.ParticipantPermissionsChanged, (_prevPermissions, participant) => {
        if (sessionGenRef.current !== currentSessionGen) return;
        if (participant === room.localParticipant) {
          const perms = room.localParticipant.permissions;
          if (perms?.canPublish === false) {
            room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
            setIsMuted(true);
            setIsSpeaking(false);
          }
        }
        syncParticipants(room);
      });

      // Handle remote audio playback & autoplay block detection
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (sessionGenRef.current !== currentSessionGen) return;
        if (track.kind === Track.Kind.Audio) {
          let audioEl = audioElementsRef.current.get(participant.identity);
          if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.autoplay = true;
            audioEl.setAttribute('data-participant-identity', participant.identity);
            document.body.appendChild(audioEl);
            audioElementsRef.current.set(participant.identity, audioEl);
          }

          if (
            isOutputSelectionSupported &&
            activeAudioOutputIdRef.current &&
            'setSinkId' in HTMLMediaElement.prototype
          ) {
            (audioEl as unknown as { setSinkId: (id: string) => Promise<void> })
              .setSinkId(activeAudioOutputIdRef.current)
              .catch(() => {});
          }

          track.attach(audioEl);
          const playPromise = audioEl.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
              if (sessionGenRef.current === currentSessionGen) {
                setIsAudioBlocked(true);
              }
            });
          }
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (sessionGenRef.current !== currentSessionGen) return;
        const audioEl = audioElementsRef.current.get(participant.identity);
        if (audioEl) {
          track.detach(audioEl);
        }
      });
    },
    [
      roomId,
      syncParticipants,
      scheduleTokenRenewal,
      cleanupAudioElements,
      teardownRoomConnection,
      refreshDevices,
      isOutputSelectionSupported,
    ]
  );

  // Bounded reconnect attempt with exponential backoff and backend re-authorization
  const attemptReconnect = useCallback(
    (currentSessionGen: number) => {
      if (isExplicitLeaveRef.current) return;

      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        isExplicitLeaveRef.current = true;
        setErrorMessage('Voice connection lost after multiple retry attempts. Please rejoin manually.');
        teardownRoomConnection({ preserveError: true, targetState: 'failed' });
        return;
      }

      reconnectAttemptsRef.current += 1;
      setConnectionState('reconnecting');

      const backoffMs = Math.min(10000, 1000 * Math.pow(2, reconnectAttemptsRef.current));

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = setTimeout(async () => {
        if (sessionGenRef.current !== currentSessionGen || isExplicitLeaveRef.current) return;

        try {
          const tokenData = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
          if (sessionGenRef.current !== currentSessionGen || isExplicitLeaveRef.current) return;

          latestTokenRef.current = tokenData.token;

          if (roomRef.current) {
            try {
              if (roomRef.current.localParticipant) {
                roomRef.current.localParticipant.audioTrackPublications.forEach((pub) => {
                  if (pub.track) pub.track.stop();
                });
              }
              await roomRef.current.disconnect();
            } catch {
              // ignore
            }
            roomRef.current = null;
          }

          cleanupAudioElements();

          const room = new Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
              autoGainControl: capturePreferencesRef.current.autoGainControl,
              echoCancellation: capturePreferencesRef.current.echoCancellation,
              noiseSuppression: capturePreferencesRef.current.noiseSuppression,
              deviceId: activeAudioInputIdRef.current
                ? { exact: activeAudioInputIdRef.current }
                : undefined,
            },
            audioOutput: activeAudioOutputIdRef.current
              ? { deviceId: activeAudioOutputIdRef.current }
              : undefined,
          });

          roomRef.current = room;
          bindRoomListeners(room, currentSessionGen, tokenData.expiresAt);

          await room.connect(tokenData.serverUrl, tokenData.token);
          if (sessionGenRef.current !== currentSessionGen || isExplicitLeaveRef.current) {
            room.disconnect().catch(() => {});
            return;
          }

          const perms = room.localParticipant.permissions;
          const canPublishMic = perms ? perms.canPublish === true : false;
          if (canPublishMic && !isMuted) {
            await room.localParticipant.setMicrophoneEnabled(true, {
              autoGainControl: capturePreferencesRef.current.autoGainControl,
              echoCancellation: capturePreferencesRef.current.echoCancellation,
              noiseSuppression: capturePreferencesRef.current.noiseSuppression,
              deviceId: activeAudioInputIdRef.current
                ? { exact: activeAudioInputIdRef.current }
                : undefined,
            });
          } else {
            setIsMuted(true);
          }
          reconnectAttemptsRef.current = 0;
          setConnectionState('connected');
          setIsAudioBlocked(!room.canPlaybackAudio);
          syncParticipants(room);
        } catch (err: unknown) {
          if (sessionGenRef.current !== currentSessionGen || isExplicitLeaveRef.current) return;

          const errorMsg = err instanceof Error ? err.message : String(err);
          if (
            errorMsg.includes('403') ||
            errorMsg.includes('401') ||
            errorMsg.includes('KICKED') ||
            errorMsg.includes('REVOKED') ||
            errorMsg.includes('FORBIDDEN')
          ) {
            isExplicitLeaveRef.current = true;
            setErrorMessage('Voice authorization expired or was revoked.');
            await teardownRoomConnection({ preserveError: true, targetState: 'unauthorized' });
          } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            isExplicitLeaveRef.current = true;
            setErrorMessage('Voice connection lost after multiple retry attempts. Please rejoin manually.');
            await teardownRoomConnection({ preserveError: true, targetState: 'failed' });
          } else {
            attemptReconnect(currentSessionGen);
          }
        }
      }, backoffMs);
    },
    [roomId, isMuted, teardownRoomConnection, cleanupAudioElements, syncParticipants, bindRoomListeners]
  );

  attemptReconnectRef.current = attemptReconnect;

  // Connect and join voice lounge with strict single-Room guard
  const joinVoice = useCallback(async () => {
    if (!enabled || !roomId) return;
    if (
      isJoiningRef.current ||
      roomRef.current ||
      connectionState === 'connecting' ||
      connectionState === 'connected' ||
      connectionState === 'requesting_permission'
    ) {
      return;
    }

    isJoiningRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    isExplicitLeaveRef.current = false;

    setErrorMessage(null);
    setIsAudioBlocked(false);
    setConnectionState('requesting_permission');

    const currentSessionGen = ++sessionGenRef.current;

    try {
      // 1. Obtain short-lived voice token
      const tokenData = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
      latestTokenRef.current = tokenData.token;

      if (sessionGenRef.current !== currentSessionGen) {
        isJoiningRef.current = false;
        return;
      }

      setConnectionState('connecting');

      // 2. Instantiate single LiveKit Room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: capturePreferencesRef.current.autoGainControl,
          echoCancellation: capturePreferencesRef.current.echoCancellation,
          noiseSuppression: capturePreferencesRef.current.noiseSuppression,
          deviceId: activeAudioInputIdRef.current
            ? { exact: activeAudioInputIdRef.current }
            : undefined,
        },
        audioOutput: activeAudioOutputIdRef.current
          ? { deviceId: activeAudioOutputIdRef.current }
          : undefined,
      });

      roomRef.current = room;
      bindRoomListeners(room, currentSessionGen, tokenData.expiresAt);

      // 3. Connect to LiveKit server
      await room.connect(tokenData.serverUrl, tokenData.token);

      if (sessionGenRef.current !== currentSessionGen) {
        room.disconnect().catch(() => {});
        isJoiningRef.current = false;
        return;
      }

      // 4. Enable local microphone audio track if explicitly permitted
      const perms = room.localParticipant.permissions;
      const canPublishMic = perms ? perms.canPublish === true : false;
      if (canPublishMic) {
        await room.localParticipant.setMicrophoneEnabled(true, {
          autoGainControl: capturePreferencesRef.current.autoGainControl,
          echoCancellation: capturePreferencesRef.current.echoCancellation,
          noiseSuppression: capturePreferencesRef.current.noiseSuppression,
          deviceId: activeAudioInputIdRef.current
            ? { exact: activeAudioInputIdRef.current }
            : undefined,
        });
        setPermissionState('granted');
        setIsMuted(false);
      } else {
        setIsMuted(true);
      }

      isJoiningRef.current = false;
      setConnectionState('connected');
      setIsAudioBlocked(!room.canPlaybackAudio);
      syncParticipants(room);
    } catch (err: unknown) {
      isJoiningRef.current = false;
      if (sessionGenRef.current !== currentSessionGen) return;

      const errorMsg = err instanceof Error ? err.message : String(err);
      let targetState: VoiceConnectionState = 'failed';
      let displayError: string;

      if (errorMsg.includes('VOICE_SERVICE_NOT_CONFIGURED')) {
        displayError = 'Voice communication is not currently configured on this server.';
      } else if (errorMsg.includes('FORBIDDEN_KICKED') || errorMsg.includes('removed from this room')) {
        targetState = 'unauthorized';
        displayError = 'You were removed from this room by the host and cannot access voice.';
      } else if (errorMsg.includes('FORBIDDEN_SESSION_REVOKED') || errorMsg.includes('revoked')) {
        targetState = 'unauthorized';
        displayError = 'Your session has been logged out or revoked.';
      } else if (errorMsg.includes('FORBIDDEN_NOT_MEMBER')) {
        targetState = 'unauthorized';
        displayError = 'You must join the room stage before entering voice.';
      } else {
        const classified = classifyDeviceError(err);
        displayError = classified.message;
        if (classified.isPermissionDenied) {
          setPermissionState('denied');
        }
      }

      isExplicitLeaveRef.current = true;
      setErrorMessage(displayError);
      await teardownRoomConnection({ preserveError: true, targetState });
    }
  }, [enabled, roomId, connectionState, syncParticipants, bindRoomListeners, teardownRoomConnection]);

  // Explicit audio playback unlock for browser autoplay restrictions
  const unlockAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setIsAudioBlocked(!room.canPlaybackAudio);
      audioElementsRef.current.forEach((el) => {
        el.play().catch(() => {});
      });
    } catch (err) {
      setErrorMessage(classifyDeviceError(err).message);
    }
  }, []);

  // Toggle local microphone mute
  const toggleMute = useCallback(async () => {
    if (!roomRef.current || !roomRef.current.localParticipant) return;

    const perms = roomRef.current.localParticipant.permissions;
    if (!perms) {
      setErrorMessage('Voice permissions are still initializing. Please wait a moment.');
      return;
    }

    if (perms.canPublish === false) {
      setErrorMessage('Your microphone has been muted by room moderation.');
      return;
    }

    try {
      const targetState = !isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!targetState);
      setIsMuted(targetState);
      if (targetState) {
        setIsSpeaking(false);
      }
      emitSpeakingTelemetry(targetState ? false : isSpeaking, targetState, true);
      syncParticipants(roomRef.current);
    } catch (err: unknown) {
      setErrorMessage(classifyDeviceError(err).message);
    }
  }, [isMuted, isSpeaking, emitSpeakingTelemetry, syncParticipants]);

  // Switch microphone input device
  const switchAudioInputDevice = useCallback(
    async (deviceId: string) => {
      try {
        setErrorMessage(null);
        setActiveAudioInputId(deviceId);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_MIC_KEY, deviceId);
        }
        if (roomRef.current) {
          await roomRef.current.switchActiveDevice('audioinput', deviceId);

          const perms = roomRef.current.localParticipant?.permissions;
          const canPublish = perms ? perms.canPublish !== false : false;
          if (!canPublish || isMuted) {
            const micPub = roomRef.current.localParticipant?.getTrackPublication(
              Track.Source.Microphone
            );
            if (micPub?.track && !micPub.isMuted) {
              await micPub.track.mute();
            }
          }
        }
      } catch (err: unknown) {
        setErrorMessage(classifyDeviceError(err).message);
      }
    },
    [isMuted]
  );

  // Switch voice speaker output device
  const switchAudioOutputDevice = useCallback(
    async (deviceId: string) => {
      try {
        setErrorMessage(null);
        setActiveAudioOutputId(deviceId);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_VOICE_OUTPUT_KEY, deviceId);
        }
        if (isOutputSelectionSupported) {
          if (roomRef.current) {
            await roomRef.current.switchActiveDevice('audiooutput', deviceId).catch(() => {});
          }
          audioElementsRef.current.forEach((el) => {
            if ('setSinkId' in HTMLMediaElement.prototype) {
              (el as unknown as { setSinkId: (id: string) => Promise<void> })
                .setSinkId(deviceId)
                .catch(() => {});
            }
          });
        }
      } catch (err: unknown) {
        setErrorMessage(classifyDeviceError(err).message);
      }
    },
    [isOutputSelectionSupported]
  );

  // Update capture quality preferences dynamically
  const updateCapturePreferences = useCallback(
    async (partial: Partial<AudioCapturePreferences>) => {
      setCapturePreferences((prev) => {
        const updated = { ...prev, ...partial };
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_CAPTURE_PREFS_KEY, JSON.stringify(updated));
        }
        if (roomRef.current?.localParticipant && !isMuted) {
          const captureOptions = {
            autoGainControl: updated.autoGainControl,
            echoCancellation: updated.echoCancellation,
            noiseSuppression: updated.noiseSuppression,
            deviceId: activeAudioInputIdRef.current
              ? { exact: activeAudioInputIdRef.current }
              : undefined,
          };
          roomRef.current.localParticipant
            .setMicrophoneEnabled(true, captureOptions)
            .catch(() => {});
        }
        return updated;
      });
    },
    [isMuted]
  );

  // Clean up and reset React state immediately when `enabled` becomes false
  useEffect(() => {
    if (!enabled) {
      isExplicitLeaveRef.current = true;
      teardownRoomConnection({ preserveError: false, targetState: 'idle' });
    }
  }, [enabled, teardownRoomConnection]);

  // Cleanup on unmount or roomId change
  useEffect(() => {
    return () => {
      isExplicitLeaveRef.current = true;
      teardownRoomConnection({ preserveError: false, targetState: 'idle' });
    };
  }, [roomId, teardownRoomConnection]);

  const isConnected = connectionState === 'connected';

  const participants = useMemo(
    () => mergeVoiceParticipants(liveKitParticipants, socketVoicePresence, isConnected),
    [liveKitParticipants, socketVoicePresence, isConnected]
  );

  const voiceAdapterMap = useMemo(
    () =>
      buildVirtualRoomVoiceAdapterMap({
        liveKitParticipants,
        socketVoicePresence,
        localUserId: currentUserId,
        localConnectionState: connectionState,
        isLiveKitConnected: isConnected,
      }),
    [liveKitParticipants, socketVoicePresence, currentUserId, connectionState, isConnected]
  );

  return {
    connectionState,
    isConnected,
    isConnecting: connectionState === 'connecting' || connectionState === 'requesting_permission',
    isMuted,
    isSpeaking,
    isAudioBlocked,
    errorMessage,
    participants,
    voiceAdapterMap,

    // Microphone (Audio Input) Devices
    audioInputDevices,
    activeAudioInputId,
    permissionState,
    capturePreferences,

    // Speaker/Headphones (Audio Output) Devices
    audioOutputDevices,
    activeAudioOutputId,
    isOutputSelectionSupported,

    // Actions
    joinVoice,
    leaveVoice,
    toggleMute,
    unlockAudio,
    switchAudioInputDevice,
    switchAudioOutputDevice,
    updateCapturePreferences,
    refreshDevices,

    // Backwards compatibility aliases
    audioDevices: audioInputDevices,
    activeDeviceId: activeAudioInputId,
    switchDevice: switchAudioInputDevice,
  };
}
