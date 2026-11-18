import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { SOCKET_EVENTS } from '@ktv/contracts';

// =========================================================================
// Mock LiveKit Client SDK & Voice API
// =========================================================================

interface MockParticipant {
  identity: string;
  name: string;
  metadata: string;
  isMicrophoneEnabled: boolean;
  isSpeaking: boolean;
  permissions: { canPublish: boolean; canSubscribe: boolean };
  audioTrackPublications: Map<string, { track: { stop: () => void; mute: () => void } }>;
  getTrackPublication: () => { isMuted: boolean; track: { stop: () => void; mute: () => void } };
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
}

interface MockRoomInstance {
  state: string;
  canPlaybackAudio: boolean;
  remoteParticipants: Map<string, MockParticipant>;
  localParticipant: MockParticipant;
  trigger: (event: string, ...args: unknown[]) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startAudio: () => Promise<void>;
}

const {
  mockRooms,
  mockGetVoiceToken,
  mockTrackStop,
  mockSocketListeners,
  mockSocket,
  mockMicFlags,
} = vi.hoisted(() => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const sock = {
    connected: true,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return sock;
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
      return sock;
    }),
    emit: vi.fn(),
  };

  return {
    mockRooms: [] as MockRoomInstance[],
    mockGetVoiceToken: vi.fn(),
    mockTrackStop: vi.fn(),
    mockSocketListeners: listeners,
    mockSocket: sock,
    mockMicFlags: { denyPermission: false },
  };
});

vi.mock('@/lib/socket/socket-client', () => ({
  socketManager: {
    getSocket: () => mockSocket,
    subscribeStatus: (cb: (status: string) => void) => {
      cb('connected');
      return () => {};
    },
  },
}));

vi.mock('../features/voice/api/voice-api', () => ({
  voiceApi: {
    getVoiceToken: mockGetVoiceToken,
  },
}));

vi.mock('livekit-client', () => {
  class MockRoom implements MockRoomInstance {
    public state = 'disconnected';
    public canPlaybackAudio = true;
    public remoteParticipants = new Map<string, MockParticipant>();
    private eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>();

    public localParticipant: MockParticipant = {
      identity: 'user_1_vps_abc',
      name: 'User One',
      metadata: JSON.stringify({ userId: 'user_1', username: 'user1', displayName: 'User One' }),
      isMicrophoneEnabled: false,
      isSpeaking: false,
      permissions: { canPublish: true, canSubscribe: true },
      audioTrackPublications: new Map(),
      getTrackPublication: vi.fn(() => {
        if (!this.localParticipant.isMicrophoneEnabled) {
          return { isMuted: true, track: { stop: mockTrackStop, mute: vi.fn() } };
        }
        return { isMuted: false, track: { stop: mockTrackStop, mute: vi.fn() } };
      }),
      setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
        if (enabled && mockMicFlags.denyPermission) {
          const permErr = new Error('Permission denied');
          permErr.name = 'NotAllowedError';
          throw permErr;
        }
        this.localParticipant.isMicrophoneEnabled = enabled;
        if (enabled) {
          this.localParticipant.audioTrackPublications.set('local_mic', {
            track: { stop: mockTrackStop, mute: vi.fn() },
          });
        }
      }),
    };

    constructor() {
      mockRooms.push(this);
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
      this.eventHandlers.get(event)!.push(cb);
      return this;
    }

    trigger(event: string, ...args: unknown[]) {
      const list = this.eventHandlers.get(event) || [];
      for (const cb of list) cb(...args);
    }

    connect = vi.fn(async () => {
      this.state = 'connected';
      this.trigger('connected');
    });

    disconnect = vi.fn(async () => {
      this.state = 'disconnected';
    });

    startAudio = vi.fn(async () => {
      this.canPlaybackAudio = true;
      this.trigger('audioPlaybackChanged');
    });

    switchActiveDevice = vi.fn(async () => {});
  }

  return {
    Room: MockRoom,
    RoomEvent: {
      Connected: 'connected',
      Reconnecting: 'reconnecting',
      Reconnected: 'reconnected',
      Disconnected: 'disconnected',
      AudioPlaybackStatusChanged: 'audioPlaybackChanged',
      ParticipantConnected: 'participantConnected',
      ParticipantDisconnected: 'participantDisconnected',
      ActiveSpeakersChanged: 'activeSpeakersChanged',
      TrackMuted: 'trackMuted',
      TrackUnmuted: 'trackUnmuted',
      ParticipantPermissionsChanged: 'participantPermissionsChanged',
      TrackSubscribed: 'trackSubscribed',
      TrackUnsubscribed: 'trackUnsubscribed',
    },
    Track: {
      Kind: { Audio: 'audio' },
      Source: { Microphone: 'microphone' },
    },
  };
});

import { useVoiceClient } from '../features/voice/hooks/use-voice-client';
import { VoiceControls } from '../features/voice/components/voice-controls';
import {
  useVoiceStateStore,
  buildVirtualRoomVoiceAdapterMap,
} from '../features/voice/stores/voice-state.store';
import {
  DEFAULT_S1_ROOM_ENTITIES,
  bindVoiceParticipantsToSceneEntities,
} from '../features/virtual-room/components/scene/RoomScene';
import { SceneRenderer } from '../features/virtual-room/components/scene/SceneRenderer';

function triggerSocketEvent(event: string, payload: unknown) {
  const cbs = mockSocketListeners[event] || [];
  for (const cb of cbs) cb(payload);
}

describe('S2 Frontend Voice Infrastructure & Virtual Room Adapter Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRooms.length = 0;
    mockMicFlags.denyPermission = false;
    for (const k of Object.keys(mockSocketListeners)) delete mockSocketListeners[k];
    useVoiceStateStore.getState().reset();
    useVoiceStateStore.getState().setRoomId(null);

    mockGetVoiceToken.mockResolvedValue({
      serverUrl: 'wss://test-ktv.livekit.cloud',
      token: 'mock_jwt_token',
      roomName: 'ktv_room_room_1',
      participantIdentity: 'user_1_vps_abc',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

    Object.defineProperty(global.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(async () => [
          { kind: 'audioinput', deviceId: 'mic-1', label: 'Default Mic' },
          { kind: 'audiooutput', deviceId: 'spk-1', label: 'Default Speaker' },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  it('connects cleanly, prevents duplicate Room instances on rapid joinVoice calls, and stops mic tracks on leaveVoice', async () => {
    const { result } = renderHook(() =>
      useVoiceClient({ roomId: 'room_1', enabled: true, currentUserId: 'user_1' })
    );

    await act(async () => {
      // Rapid concurrent double invocation
      await Promise.all([result.current.joinVoice(), result.current.joinVoice()]);
    });

    expect(mockRooms.length).toBe(1);
    expect(mockGetVoiceToken).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionState).toBe('connected');
    expect(result.current.participants.length).toBe(1);
    expect(result.current.participants[0]?.userId).toBe('user_1');

    // Leave voice must stop all local tracks and disconnect without errors
    await act(async () => {
      await result.current.leaveVoice();
    });

    expect(mockTrackStop).toHaveBeenCalled();
    expect(mockRooms[0]!.disconnect).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionState).toBe('idle');
    expect(result.current.participants).toEqual([]);
  });

  it('preserves microphone permission denial error state instead of wiping it in cleanup', async () => {
    mockMicFlags.denyPermission = true;

    const { result } = renderHook(() =>
      useVoiceClient({ roomId: 'room_1', enabled: true, currentUserId: 'user_1' })
    );

    await act(async () => {
      await result.current.joinVoice();
    });

    expect(result.current.connectionState).toBe('failed');
    expect(result.current.permissionState).toBe('denied');
    expect(result.current.errorMessage).toContain('Microphone permission was denied');
  });

  it('cleans up Room, stops tracks, and resets React state when enabled becomes false', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useVoiceClient({ roomId: 'room_1', enabled, currentUserId: 'user_1' }),
      { initialProps: { enabled: true } }
    );

    await act(async () => {
      await result.current.joinVoice();
    });

    expect(result.current.isConnected).toBe(true);

    // Disable hook (e.g. kicked or room closed)
    await act(async () => {
      rerender({ enabled: false });
    });

    expect(mockTrackStop).toHaveBeenCalled();
    expect(mockRooms[0]!.disconnect).toHaveBeenCalled();
    expect(result.current.connectionState).toBe('idle');
    expect(result.current.isConnected).toBe(false);
    expect(result.current.participants).toEqual([]);
  });

  it('handles browser remote audio autoplay blocking and explicit unlockAudio()', async () => {
    const { result } = renderHook(() =>
      useVoiceClient({ roomId: 'room_1', enabled: true, currentUserId: 'user_1' })
    );

    await act(async () => {
      await result.current.joinVoice();
    });

    const room = mockRooms[0]!;
    act(() => {
      room.canPlaybackAudio = false;
      room.trigger('audioPlaybackChanged');
    });

    expect(result.current.isAudioBlocked).toBe(true);

    render(
      <VoiceControls
        variant="bar"
        connectionState={result.current.connectionState}
        isConnected={result.current.isConnected}
        isConnecting={false}
        isMuted={false}
        isSpeaking={true}
        isAudioBlocked={result.current.isAudioBlocked}
        errorMessage={null}
        isRoomMember={true}
        onJoinVoice={result.current.joinVoice}
        onLeaveVoice={result.current.leaveVoice}
        onToggleMute={result.current.toggleMute}
        onUnlockAudio={result.current.unlockAudio}
      />
    );

    // Active unmuted state should render Mic icon (not MicOff) and Enable Audio button
    const muteBtn = screen.getByTestId('voice-mute-toggle');
    expect(muteBtn.querySelector('svg.lucide-mic')).toBeTruthy();
    expect(muteBtn.querySelector('svg.lucide-mic-off')).toBeNull();

    const unlockBtn = screen.getByTestId('voice-unlock-audio-button');
    await act(async () => {
      fireEvent.click(unlockBtn);
    });

    expect(room.startAudio).toHaveBeenCalled();
    expect(result.current.isAudioBlocked).toBe(false);
  });

  it('synchronizes room-wide voice presence via Socket.IO for non-voice room members and emits throttled speaking updates', async () => {
    const { result } = renderHook(() =>
      useVoiceClient({ roomId: 'room_1', enabled: true, currentUserId: 'user_1' })
    );

    // Non-voice member receives Socket.IO snapshot
    act(() => {
      triggerSocketEvent(SOCKET_EVENTS.SERVER.VOICE_STATE_SNAPSHOT, {
        roomId: 'room_1',
        participants: [
          {
            userId: 'user_2',
            username: 'singer2',
            displayName: 'Singer Two',
            isConnected: true,
            isMuted: false,
            isSpeaking: true,
            hasMicTrack: true,
            connectionState: 'connected',
            sessionCount: 1,
            updatedAt: new Date().toISOString(),
          },
        ],
      });
    });

    expect(result.current.isConnected).toBe(false); // Local user not in voice
    expect(result.current.participants.length).toBe(1);
    expect(result.current.participants[0]?.userId).toBe('user_2');
    expect(result.current.participants[0]?.isSpeaking).toBe(true);
    expect(result.current.voiceAdapterMap.get('user_2')).toEqual({
      userId: 'user_2',
      isSpeaking: true,
      isMuted: false,
      connectionState: 'connected',
    });

    // Participant leaves via Socket.IO
    act(() => {
      triggerSocketEvent(SOCKET_EVENTS.SERVER.VOICE_PARTICIPANT_LEFT, {
        roomId: 'room_1',
        event: 'left',
        timestamp: new Date().toISOString(),
        participant: {
          userId: 'user_2',
          username: 'singer2',
          displayName: 'Singer Two',
          isConnected: false,
          isMuted: false,
          isSpeaking: false,
          hasMicTrack: false,
          connectionState: 'disconnected',
          sessionCount: 0,
          updatedAt: new Date().toISOString(),
        },
      });
    });

    expect(result.current.participants).toEqual([]);
    expect(result.current.voiceAdapterMap.has('user_2')).toBe(false);

    // Join voice and trigger ActiveSpeakersChanged -> emits throttled voice:speaking:update
    await act(async () => {
      await result.current.joinVoice();
    });

    const room = mockRooms[0]!;
    mockSocket.emit.mockClear();

    // Initial speaking onset emits immediately
    act(() => {
      room.localParticipant.isSpeaking = true;
      room.trigger('activeSpeakersChanged');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.CLIENT.VOICE_SPEAKING_UPDATE,
      expect.objectContaining({
        roomId: 'room_1',
        isSpeaking: true,
        isMuted: false,
      })
    );

    // Stop speaking emits immediately, then rapid re-start within 200ms is throttled
    act(() => {
      room.localParticipant.isSpeaking = false;
      room.trigger('activeSpeakersChanged');
    });
    mockSocket.emit.mockClear();

    act(() => {
      room.localParticipant.isSpeaking = true;
      room.trigger('activeSpeakersChanged');
    });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('maps serializable voice adapter state to S1 Virtual Room procedural avatars without livekit-client in scene renderer', () => {
    const adapterMap = buildVirtualRoomVoiceAdapterMap({
      liveKitParticipants: [
        {
          identity: 'u1_vps_1',
          userId: 'user_singer',
          username: 'singer',
          displayName: 'Lead Singer',
          isMuted: false,
          isSpeaking: true,
          isLocal: true,
        },
      ],
      socketVoicePresence: {
        user_guest: {
          userId: 'user_guest',
          username: 'guest',
          displayName: 'Guest',
          isConnected: true,
          isMuted: true,
          isSpeaking: false,
          hasMicTrack: true,
          connectionState: 'connected',
          sessionCount: 1,
          updatedAt: new Date().toISOString(),
        },
      },
      localUserId: 'user_singer',
      localConnectionState: 'connected',
      isLiveKitConnected: true,
    });

    expect(adapterMap.get('user_singer')).toEqual({
      userId: 'user_singer',
      isSpeaking: true,
      isMuted: false,
      connectionState: 'connected',
    });
    expect(adapterMap.get('user_guest')).toEqual({
      userId: 'user_guest',
      isSpeaking: false,
      isMuted: true,
      connectionState: 'connected',
    });

    const boundEntities = bindVoiceParticipantsToSceneEntities(DEFAULT_S1_ROOM_ENTITIES, {
      currentSingerId: 'user_singer',
      voiceParticipantsMap: adapterMap,
    });

    render(
      <SceneRenderer
        entities={boundEntities}
        currentSingerId="user_singer"
        currentSingerName="Lead Singer"
        voiceParticipantsMap={adapterMap}
      />
    );

    const singerEntity = screen.getByTestId('entity-chibi_singer_1');
    const singerAvatar = singerEntity.querySelector('[data-speaking="true"]');
    expect(singerAvatar).toBeTruthy();
    expect(singerEntity.querySelector('[data-testid="avatar-speaking-ripple"]')).toBeTruthy();

    const guestEntity = screen.getByTestId('entity-chibi_audience_1');
    const guestAvatar = guestEntity.querySelector('[data-muted="true"]');
    expect(guestAvatar).toBeTruthy();
    expect(guestEntity.querySelector('[data-testid="avatar-speaking-ripple"]')).toBeNull();
  });
});
