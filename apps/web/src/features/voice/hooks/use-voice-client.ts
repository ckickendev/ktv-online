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
} from '../types/voice.types';

export function useVoiceClient({ roomId, enabled = true }: UseVoiceClientOptions): UseVoiceClientReturn {
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<VoiceDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const renewalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRenewingRef = useRef<boolean>(false);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const tabIdRef = useRef<string>('');
  const sessionGenRef = useRef<number>(0);
  const latestTokenRef = useRef<string | null>(null);
  const isExplicitLeaveRef = useRef<boolean>(false);

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

    // Invalidate current room session generation
    sessionGenRef.current += 1;

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

  // Connect and join voice lounge
  const joinVoice = useCallback(async () => {
    if (connectionState === 'connecting' || connectionState === 'connected') return;

    setErrorMessage(null);
    setConnectionState('requesting_permission');

    const currentSessionGen = ++sessionGenRef.current;

    try {
      // 1. Obtain short-lived voice token
      const tokenData = await voiceApi.getVoiceToken(roomId, { tabId: tabIdRef.current });
      latestTokenRef.current = tokenData.token;
      isExplicitLeaveRef.current = false;

      // Stale callback guard
      if (sessionGenRef.current !== currentSessionGen) return;

      setConnectionState('connecting');

      // 2. Instantiate LiveKit Room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      roomRef.current = room;

      // 3. Register Room event listeners fenced by session generation
      room.on(RoomEvent.Connected, async () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        setConnectionState('connected');
        syncParticipants(room);

        // Fetch available audio devices
        try {
          const devices = await Room.getLocalDevices('audioinput');
          if (sessionGenRef.current === currentSessionGen) {
            setAudioDevices(
              devices.map((d) => ({
                deviceId: d.deviceId,
                label: d.label || `Microphone (${d.deviceId.slice(0, 5)})`,
              }))
            );
          }
        } catch {
          // ignore device enum errors
        }

        // Schedule proactive token renewal
        scheduleTokenRenewal(tokenData.expiresAt);
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        setConnectionState('reconnecting');
      });

      room.on(RoomEvent.Reconnected, async () => {
        if (sessionGenRef.current !== currentSessionGen) return;
        setConnectionState('connected');
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
        setConnectionState('disconnected');
        setParticipants([]);
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        if (sessionGenRef.current === currentSessionGen) syncParticipants(room);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        if (sessionGenRef.current !== currentSessionGen) return;
        // Clean up attached audio element for leaving participant
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

      // 4. Connect to LiveKit server
      await room.connect(tokenData.serverUrl, tokenData.token);

      if (sessionGenRef.current !== currentSessionGen) {
        room.disconnect().catch(() => {});
        return;
      }

      // 5. Enable local microphone audio track
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
      syncParticipants(room);
    } catch (err: unknown) {
      if (sessionGenRef.current !== currentSessionGen) return;

      const errorMsg = err instanceof Error ? err.message : String(err);

      if (errorMsg.includes('NotAllowedError') || errorMsg.includes('Permission denied')) {
        setConnectionState('failed');
        setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser and try again.');
      } else if (errorMsg.includes('VOICE_SERVICE_NOT_CONFIGURED')) {
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
        setErrorMessage(errorMsg || 'Failed to connect to voice lounge.');
      }

      await leaveVoice();
    }
  }, [roomId, connectionState, syncParticipants, cleanupAudioElements, scheduleTokenRenewal, leaveVoice]);

  // Toggle local microphone mute
  const toggleMute = useCallback(async () => {
    if (!roomRef.current || !roomRef.current.localParticipant) return;

    try {
      const targetState = !isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!targetState);
      setIsMuted(targetState);
      syncParticipants(roomRef.current);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to toggle microphone');
    }
  }, [isMuted, syncParticipants]);

  // Switch microphone input device
  const switchDevice = useCallback(async (deviceId: string) => {
    if (!roomRef.current) return;

    try {
      await roomRef.current.switchActiveDevice('audioinput', deviceId);
      setActiveDeviceId(deviceId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to switch audio input device');
    }
  }, []);

  // Cleanup on unmount or when room ID changes / disabled
  useEffect(() => {
    return () => {
      sessionGenRef.current += 1;
      if (renewalTimerRef.current) {
        clearTimeout(renewalTimerRef.current);
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
    audioDevices,
    activeDeviceId,
    joinVoice,
    leaveVoice,
    toggleMute,
    switchDevice,
  };
}
