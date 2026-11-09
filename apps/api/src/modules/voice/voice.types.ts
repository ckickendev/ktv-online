export interface VoiceParticipantMetadata {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface VoicePrivateSessionMapping {
  identity: string;
  participantSessionId: string;
  userId: string;
  roomId: string;
  familyId: string;
  tabHint?: string;
  createdAt: Date;
  lastRenewedAt: Date;
}

export interface GenerateVoiceTokenOptions {
  roomName: string;
  participantIdentity: string;
  name?: string;
  metadata?: VoiceParticipantMetadata;
  ttlSeconds?: number;
}
