import { VoiceConnectionState } from '@ktv/contracts';

export interface UseVoiceClientOptions {
  roomId: string;
  enabled?: boolean;
}

export interface VoiceParticipantInfo {
  identity: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
  joinedAt?: string;
}

export interface VoiceDevice {
  deviceId: string;
  label: string;
}

export interface AudioCapturePreferences {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export type MicrophonePermissionState = 'prompt' | 'granted' | 'denied' | 'unknown';

export interface UseVoiceClientReturn {
  connectionState: VoiceConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  errorMessage: string | null;
  participants: VoiceParticipantInfo[];

  // Microphone (Audio Input) Devices
  audioInputDevices: VoiceDevice[];
  activeAudioInputId: string | null;
  permissionState: MicrophonePermissionState;
  capturePreferences: AudioCapturePreferences;

  // Speaker/Headphones (Audio Output) Devices
  audioOutputDevices: VoiceDevice[];
  activeAudioOutputId: string | null;
  isOutputSelectionSupported: boolean;

  // Actions
  joinVoice: () => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  switchAudioInputDevice: (deviceId: string) => Promise<void>;
  switchAudioOutputDevice: (deviceId: string) => Promise<void>;
  updateCapturePreferences: (prefs: Partial<AudioCapturePreferences>) => Promise<void>;
  refreshDevices: () => Promise<void>;

  // Backwards compatibility aliases
  audioDevices: VoiceDevice[];
  activeDeviceId: string | null;
  switchDevice: (deviceId: string) => Promise<void>;
}
