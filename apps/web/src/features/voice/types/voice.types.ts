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

export interface UseVoiceClientReturn {
  connectionState: VoiceConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  errorMessage: string | null;
  participants: VoiceParticipantInfo[];
  audioDevices: VoiceDevice[];
  activeDeviceId: string | null;
  joinVoice: () => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  switchDevice: (deviceId: string) => Promise<void>;
}
