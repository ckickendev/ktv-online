'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteParticipant,
  Participant,
  Track,
} from 'livekit-client';
import { VoiceConnectionState } from '@ktv/contracts';
import { voiceApi } from '../api/voice-api';
import {
  UseVoiceClientOptions,
  UseVoiceClientReturn,
  VoiceParticipantInfo,
  VoiceDevice,
  AudioCapturePreferences,
  MicrophonePermissionState,
} from '../types/voice.types';

const MAX_RECONNECT_ATTEMPTS = 3;
const STORAGE_MIC_KEY = 'ktv_preferred_mic_id';
const STORAGE_VOICE_OUTPUT_KEY = 'ktv_preferred_voice_output_id';
const STORAGE_CAPTURE_PREFS_KEY = 'ktv_audio_capture_prefs';

const DEFAULT_CAPTURE_PREFS: AudioCapturePreferences = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function classifyDeviceError(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  const msg = err instanceof Error ? err.message : String(err);

  if (name === 'NotAllowedError' || msg.includes('Permission denied') || msg.includes('not allowed')) {
    return 'Microphone permission was denied. Please allow microphone permissions in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || msg.includes('not found') || msg.includes('DevicesNotFoundError')) {
    return 'Selected audio device was not found or has been disconnected.';
  }
  if (name === 'NotReadableError' || msg.includes('Could not start') || msg.includes('TrackStartError')) {
    return 'Microphone is currently unavailable. It may be in use by another application or operating system process.';
  }
  if (name === 'OverconstrainedError' || msg.includes('OverconstrainedError')) {
    return 'Audio device constraints (sample rate or channels) could not be satisfied by your hardware.';
  }
  if (name === 'SecurityError') {
    return 'Audio device selection requires a secure HTTPS context.';
  }
  return msg || 'An unexpected audio device error occurred.';
}

export function useVoiceClient({ roomId, enabled = true }: UseVoiceClientOptions): UseVoiceClientReturn {
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantInfo[]>([]);

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

  const isOutputSelectionSupported = typeof window !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

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

  const roomRef = useRef<Room | null>(null);
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

  useEffect(() => {
    activeAudioOutputIdRef.current = activeAudioOutputId;
  }, [activeAudioOutputId]);

  useEffect(() => {
    activeAudioInputIdRef.current = activeAudioInputId;
  }, [activeAudioInputId]);

  useEffect(() => {
    capturePreferencesRef.current = capturePreferences;
  }, [capturePreferences]);

  // Initialize unique session tab ID once
  useEffect(() => {
    if (!tabIdRef.current) {
      tabIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).substring(2, 10);
    }
  }, []);

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
      isSpeaking: p.isSpeaking,
      isLocal,
      joinedAt: p.joinedAt?.toISOString(),
    };
  }, []);

  // Update participant list state from current room participants
  const syncParticipants = useCallback((room: Room) => {
    const list: VoiceParticipantInfo[] = [];

    // Local participant
    if (room.localParticipant) {
      list.push(mapParticipant(room.localParticipant, true));
      setIsMuted(!room.localParticipant.isMicrophoneEnabled);
      setIsSpeaking(room.localParticipant.isSpeaking);
    }

    // Remote participants
    room.remoteParticipants.forEach((p) => {
      list.push(mapParticipant(p, false));
    });

    setParticipants(list);
  }, [mapParticipant]);

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

  // Disconnect and clean up room
  const leaveVoice = useCallback(async () => {
    isExplicitLeaveRef.current = true;
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

    if (roomRef.current) {
      try {
        if (roomRef.current.localParticipant) {
          await roomRef.current.localParticipant.setMicrophoneEnabled(false);
          // Explicitly stop all local audio tracks to release microphone hardware
          roomRef.current.localParticipant.audioTrackPublications.forEach((pub) => {
            if (pub.track) {
              pub.track.stop();
            }
          });
        }
        await roomRef.current.disconnect();
      } catch {
        // ignore disconnect error
      }
      roomRef.current = null;
    }

    setConnectionState('idle');
    setParticipants([]);
    setIsMuted(false);
    setIsSpeaking(false);
    setErrorMessage(null);
  }, [cleanupAudioElements]);

  // Schedule proactive token renewal at 80% of TTL with coalescing
  const scheduleTokenRenewal = useCallback((expiresAtStr: string) => {
    if (renewalTimerRef.current) {
      clearTimeout(renewalTimerRef.current);
      renewalTimerRef.current = null;
    }

    const expiresAt = new Date(expiresAtStr).getTime();
    const now = Date.now();
    const duration = expiresAt - now;

    // Renew at 80% of token duration or at least 30s before expiration
    const refreshDelay = Math.max(10000, duration * 0.8);

    renewalTimerRef.current = setTimeout(async () => {
      if (isRenewingRef.current) return; // Coalesce concurrent renewals
      if (!roomRef.current || roomRef.current.state === 'disconnected') return;

      isRenewingRef.current = true;
      try {
        const freshTokenData = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });

        // Maintain latest verified token for supported reconnection
        latestTokenRef.current = freshTokenData.token;

        scheduleTokenRenewal(freshTokenData.expiresAt);
      } catch (err: unknown) {
        // If renewal failed due to revoked session / kick, disconnect gracefully
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (
          errorMsg.includes('403') ||
          errorMsg.includes('401') ||
          errorMsg.includes('KICKED') ||
          errorMsg.includes('REVOKED') ||
          errorMsg.includes('FORBIDDEN')
        ) {
          setConnectionState('unauthorized');
          setErrorMessage('Voice authorization expired or revoked by host.');
          await leaveVoice();
        }
      } finally {
        isRenewingRef.current = false;
      }
    }, refreshDelay);
  }, [roomId, leaveVoice]);

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

      // Verify if current active input was removed
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

      // Verify if current active output was removed
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
        reconnectAttemptsRef.current = 0;
        syncParticipants(room);

        // Refresh devices after connecting to ensure device labels are visible
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
        reconnectAttemptsRef.current = 0;
        syncParticipants(room);

        // Re-verify authorization upon reconnect to prevent bypass if kicked while offline
        try {
          const reauth = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
          if (sessionGenRef.current === currentSessionGen && roomRef.current) {
            latestTokenRef.current = reauth.token;
            scheduleTokenRenewal(reauth.expiresAt);
          }
        } catch {
          if (sessionGenRef.current === currentSessionGen) {
            setConnectionState('unauthorized');
            setErrorMessage('Voice authorization expired or was revoked.');
            await leaveVoice();
          }
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        cleanupAudioElements();
        setParticipants([]);

        if (isExplicitLeaveRef.current) {
          setConnectionState('idle');
          return;
        }

        // Schedule bounded reconnect attempt with backend re-authorization
        if (attemptReconnectRef.current) {
          attemptReconnectRef.current(currentSessionGen);
        }
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
            // Moderation revoked microphone publishing permission
            room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
            setIsMuted(true);
          }
          // If perms?.canPublish === true, participant is now authorized to unmute when desired
        }
        syncParticipants(room);
      });

      // Handle remote audio playback
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

          // Apply active voice output sinkId if supported
          if (isOutputSelectionSupported && activeAudioOutputIdRef.current && 'setSinkId' in HTMLMediaElement.prototype) {
            (audioEl as unknown as { setSinkId: (id: string) => Promise<void> })
              .setSinkId(activeAudioOutputIdRef.current)
              .catch(() => {});
          }

          track.attach(audioEl);
          audioEl.play().catch(() => {
            // Browser autoplay restrictions may require explicit user interaction
          });
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
    [roomId, syncParticipants, scheduleTokenRenewal, cleanupAudioElements, leaveVoice, refreshDevices, isOutputSelectionSupported]
  );

  // Bounded reconnect attempt with exponential backoff and backend authorization
  const attemptReconnect = useCallback(
    (currentSessionGen: number) => {
      if (isExplicitLeaveRef.current) return;

      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionState('failed');
        setErrorMessage('Voice connection lost after multiple retry attempts. Please rejoin manually.');
        leaveVoice();
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
          // Mandatory backend re-authorization before reconnecting
          const tokenData = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
          if (sessionGenRef.current !== currentSessionGen || isExplicitLeaveRef.current) return;

          latestTokenRef.current = tokenData.token;

          // Cleanup old room if present
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
              deviceId: activeAudioInputIdRef.current ? { exact: activeAudioInputIdRef.current } : undefined,
            },
            audioOutput: activeAudioOutputIdRef.current ? { deviceId: activeAudioOutputIdRef.current } : undefined,
          });

          roomRef.current = room;
          bindRoomListeners(room, currentSessionGen, tokenData.expiresAt);

          await room.connect(tokenData.serverUrl, tokenData.token);
          if (sessionGenRef.current !== currentSessionGen || isExplicitLeaveRef.current) {
            room.disconnect().catch(() => {});
            return;
          }

          // Strict permission evaluation: require explicit publish authorization
          const perms = room.localParticipant.permissions;
          const canPublishMic = perms ? perms.canPublish === true : false;
          if (canPublishMic && !isMuted) {
            await room.localParticipant.setMicrophoneEnabled(true, {
              autoGainControl: capturePreferencesRef.current.autoGainControl,
              echoCancellation: capturePreferencesRef.current.echoCancellation,
              noiseSuppression: capturePreferencesRef.current.noiseSuppression,
              deviceId: activeAudioInputIdRef.current ? { exact: activeAudioInputIdRef.current } : undefined,
            });
          } else {
            setIsMuted(true);
          }
          reconnectAttemptsRef.current = 0;
          setConnectionState('connected');
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
            setConnectionState('unauthorized');
            setErrorMessage('Voice authorization expired or was revoked.');
            await leaveVoice();
          } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setConnectionState('failed');
            setErrorMessage('Voice connection lost after multiple retry attempts. Please rejoin manually.');
            await leaveVoice();
          } else {
            attemptReconnect(currentSessionGen);
          }
        }
      }, backoffMs);
    },
    [roomId, isMuted, leaveVoice, cleanupAudioElements, syncParticipants, bindRoomListeners]
  );

  attemptReconnectRef.current = attemptReconnect;

  // Connect and join voice lounge
  const joinVoice = useCallback(async () => {
    if (connectionState === 'connecting' || connectionState === 'connected') return;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    isExplicitLeaveRef.current = false;

    setErrorMessage(null);
    setConnectionState('requesting_permission');

    const currentSessionGen = ++sessionGenRef.current;

    try {
      // 1. Obtain short-lived voice token
      const tokenData = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
      latestTokenRef.current = tokenData.token;

      // Stale callback guard
      if (sessionGenRef.current !== currentSessionGen) return;

      setConnectionState('connecting');

      // 2. Instantiate LiveKit Room with dynamic capture preferences and output device
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: capturePreferencesRef.current.autoGainControl,
          echoCancellation: capturePreferencesRef.current.echoCancellation,
          noiseSuppression: capturePreferencesRef.current.noiseSuppression,
          deviceId: activeAudioInputIdRef.current ? { exact: activeAudioInputIdRef.current } : undefined,
        },
        audioOutput: activeAudioOutputIdRef.current ? { deviceId: activeAudioOutputIdRef.current } : undefined,
      });

      roomRef.current = room;
      bindRoomListeners(room, currentSessionGen, tokenData.expiresAt);

      // 3. Connect to LiveKit server
      await room.connect(tokenData.serverUrl, tokenData.token);

      if (sessionGenRef.current !== currentSessionGen) {
        room.disconnect().catch(() => {});
        return;
      }

      // 4. Enable local microphone audio track with active capture options if explicitly permitted
      const perms = room.localParticipant.permissions;
      const canPublishMic = perms ? perms.canPublish === true : false;
      if (canPublishMic) {
        await room.localParticipant.setMicrophoneEnabled(true, {
          autoGainControl: capturePreferencesRef.current.autoGainControl,
          echoCancellation: capturePreferencesRef.current.echoCancellation,
          noiseSuppression: capturePreferencesRef.current.noiseSuppression,
          deviceId: activeAudioInputIdRef.current ? { exact: activeAudioInputIdRef.current } : undefined,
        });
        setIsMuted(false);
      } else {
        // Listen-only mode: permissions initializing or publishing explicitly restricted
        setIsMuted(true);
      }
      syncParticipants(room);
    } catch (err: unknown) {
      if (sessionGenRef.current !== currentSessionGen) return;

      const errorMsg = err instanceof Error ? err.message : String(err);

      if (errorMsg.includes('VOICE_SERVICE_NOT_CONFIGURED')) {
        setConnectionState('failed');
        setErrorMessage('Voice communication is not currently configured on this server.');
      } else if (errorMsg.includes('FORBIDDEN_KICKED') || errorMsg.includes('removed from this room')) {
        setConnectionState('unauthorized');
        setErrorMessage('You were removed from this room by the host and cannot access voice.');
      } else if (errorMsg.includes('FORBIDDEN_SESSION_REVOKED') || errorMsg.includes('revoked')) {
        setConnectionState('unauthorized');
        setErrorMessage('Your session has been logged out or revoked.');
      } else if (errorMsg.includes('FORBIDDEN_NOT_MEMBER')) {
        setConnectionState('unauthorized');
        setErrorMessage('You must join the room stage before entering voice.');
      } else {
        setConnectionState('failed');
        setErrorMessage(classifyDeviceError(err));
      }

      await leaveVoice();
    }
  }, [roomId, connectionState, syncParticipants, bindRoomListeners, leaveVoice]);

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
      syncParticipants(roomRef.current);
    } catch (err: unknown) {
      setErrorMessage(classifyDeviceError(err));
    }
  }, [isMuted, syncParticipants]);

  // Switch microphone input device
  const switchAudioInputDevice = useCallback(async (deviceId: string) => {
    try {
      setErrorMessage(null);
      setActiveAudioInputId(deviceId);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_MIC_KEY, deviceId);
      }
      if (roomRef.current) {
        await roomRef.current.switchActiveDevice('audioinput', deviceId);
      }
    } catch (err: unknown) {
      setErrorMessage(classifyDeviceError(err));
    }
  }, []);

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
              (el as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId).catch(() => {});
            }
          });
        }
      } catch (err: unknown) {
        setErrorMessage(classifyDeviceError(err));
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
            deviceId: activeAudioInputIdRef.current ? { exact: activeAudioInputIdRef.current } : undefined,
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

  // Cleanup on unmount or when room ID changes / disabled
  useEffect(() => {
    return () => {
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
      if (roomRef.current) {
        if (roomRef.current.localParticipant) {
          roomRef.current.localParticipant.audioTrackPublications.forEach((pub) => {
            if (pub.track) pub.track.stop();
          });
        }
        roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
    };
  }, [roomId, enabled, cleanupAudioElements]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    isConnecting: connectionState === 'connecting' || connectionState === 'requesting_permission',
    isMuted,
    isSpeaking,
    errorMessage,
    participants,

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
