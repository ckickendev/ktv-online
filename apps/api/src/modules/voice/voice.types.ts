export interface VoiceParticipantMetadata {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  tabId?: string;
  familyId?: string;
  issuedAt?: string;
}

export interface GenerateVoiceTokenOptions {
  roomName: string;
  participantIdentity: string;
  name?: string;
  metadata?: VoiceParticipantMetadata;
  ttlSeconds?: number;
}
