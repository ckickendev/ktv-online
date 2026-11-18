import { RoomVoiceParticipantStateDto, VoiceConnectionState } from '@ktv/contracts';

interface InternalVoiceParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  identities: Set<string>;
  publishedTrackSids: Set<string>;
  isModerationMuted: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  connectionState: VoiceConnectionState;
  updatedAt: string;
}

export interface VoiceParticipantUpdateResult {
  event: 'joined' | 'left' | 'updated';
  participant: RoomVoiceParticipantStateDto;
}

export class VoicePresenceStore {
  // roomId -> Map<userId, InternalVoiceParticipant>
  private rooms = new Map<string, Map<string, InternalVoiceParticipant>>();
  // roomId:userId -> last broadcast timestamp for speaking telemetry throttling
  private lastSpeakingEventAt = new Map<string, number>();

  private toDto(entry: InternalVoiceParticipant): RoomVoiceParticipantStateDto {
    const effectiveMuted = entry.isModerationMuted || entry.isMuted;
    return {
      userId: entry.userId,
      username: entry.username,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
      isConnected: entry.identities.size > 0,
      isMuted: effectiveMuted,
      isSpeaking: effectiveMuted ? false : entry.isSpeaking,
      hasMicTrack: entry.publishedTrackSids.size > 0,
      connectionState: entry.connectionState,
      sessionCount: entry.identities.size,
      updatedAt: entry.updatedAt,
    };
  }

  public getRoomSnapshot(roomId: string): RoomVoiceParticipantStateDto[] {
    const roomMap = this.rooms.get(roomId);
    if (!roomMap) return [];
    return Array.from(roomMap.values()).map((entry) => this.toDto(entry));
  }

  public getParticipant(roomId: string, userId: string): RoomVoiceParticipantStateDto | null {
    const entry = this.rooms.get(roomId)?.get(userId);
    return entry ? this.toDto(entry) : null;
  }

  public markParticipantJoined(params: {
    roomId: string;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    identity: string;
    isModerationMuted?: boolean;
  }): VoiceParticipantUpdateResult {
    const { roomId, userId, username, displayName, avatarUrl, identity, isModerationMuted = false } = params;
    let roomMap = this.rooms.get(roomId);
    if (!roomMap) {
      roomMap = new Map();
      this.rooms.set(roomId, roomMap);
    }

    const now = new Date().toISOString();
    const existing = roomMap.get(userId);

    if (existing) {
      const wasEmpty = existing.identities.size === 0 || (existing.identities.size === 1 && existing.identities.has('pending_webhook'));
      existing.identities.delete('pending_webhook');
      existing.identities.add(identity);
      existing.username = username || existing.username;
      existing.displayName = displayName || existing.displayName;
      if (avatarUrl !== undefined) existing.avatarUrl = avatarUrl;
      existing.isModerationMuted = isModerationMuted;
      if (isModerationMuted) {
        existing.isMuted = true;
        existing.isSpeaking = false;
      }
      existing.connectionState = 'connected';
      existing.updatedAt = now;

      return {
        event: wasEmpty ? 'joined' : 'updated',
        participant: this.toDto(existing),
      };
    }

    const created: InternalVoiceParticipant = {
      userId,
      username,
      displayName,
      avatarUrl,
      identities: new Set([identity]),
      publishedTrackSids: new Set(),
      isModerationMuted,
      isMuted: isModerationMuted,
      isSpeaking: false,
      connectionState: 'connected',
      updatedAt: now,
    };
    roomMap.set(userId, created);

    return {
      event: 'joined',
      participant: this.toDto(created),
    };
  }

  public markParticipantLeft(
    roomId: string,
    userId: string,
    identity?: string
  ): VoiceParticipantUpdateResult | null {
    const roomMap = this.rooms.get(roomId);
    if (!roomMap) return null;

    const entry = roomMap.get(userId);
    if (!entry) return null;

    const now = new Date().toISOString();
    if (identity) {
      entry.identities.delete(identity);
    } else {
      entry.identities.clear();
    }

    if (entry.identities.size === 0) {
      entry.publishedTrackSids.clear();
      entry.isSpeaking = false;
      entry.connectionState = 'disconnected';
      entry.updatedAt = now;
      const dto = this.toDto(entry);
      roomMap.delete(userId);
      if (roomMap.size === 0) {
        this.rooms.delete(roomId);
      }
      this.lastSpeakingEventAt.delete(`${roomId}:${userId}`);
      return {
        event: 'left',
        participant: dto,
      };
    }

    entry.updatedAt = now;
    return {
      event: 'updated',
      participant: this.toDto(entry),
    };
  }

  public markTrackPublished(params: {
    roomId: string;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    identity: string;
    trackSid: string;
    isMuted?: boolean;
  }): VoiceParticipantUpdateResult {
    const { roomId, userId, username, displayName, avatarUrl, identity, trackSid, isMuted } = params;
    let roomMap = this.rooms.get(roomId);
    if (!roomMap) {
      roomMap = new Map();
      this.rooms.set(roomId, roomMap);
    }

    const now = new Date().toISOString();
    let entry = roomMap.get(userId);
    let event: 'joined' | 'updated' = 'updated';

    if (!entry) {
      entry = {
        userId,
        username,
        displayName,
        avatarUrl,
        identities: new Set([identity]),
        publishedTrackSids: new Set([trackSid]),
        isModerationMuted: false,
        isMuted: Boolean(isMuted),
        isSpeaking: false,
        connectionState: 'connected',
        updatedAt: now,
      };
      roomMap.set(userId, entry);
      event = 'joined';
    } else {
      if (entry.identities.size === 0 || (entry.identities.size === 1 && entry.identities.has('pending_webhook'))) {
        event = 'joined';
      }
      entry.identities.delete('pending_webhook');
      entry.identities.add(identity);
      entry.publishedTrackSids.add(trackSid);
      if (typeof isMuted === 'boolean' && !entry.isModerationMuted) {
        entry.isMuted = isMuted;
        if (isMuted) entry.isSpeaking = false;
      }
      entry.connectionState = 'connected';
      entry.updatedAt = now;
    }

    return {
      event,
      participant: this.toDto(entry),
    };
  }

  public markTrackUnpublished(
    roomId: string,
    userId: string,
    trackSid?: string
  ): VoiceParticipantUpdateResult | null {
    const entry = this.rooms.get(roomId)?.get(userId);
    if (!entry) return null;

    if (trackSid) {
      entry.publishedTrackSids.delete(trackSid);
    } else {
      entry.publishedTrackSids.clear();
    }

    if (entry.publishedTrackSids.size === 0) {
      entry.isSpeaking = false;
    }
    entry.updatedAt = new Date().toISOString();

    return {
      event: 'updated',
      participant: this.toDto(entry),
    };
  }

  public setModerationMute(
    roomId: string,
    userId: string,
    isMuted: boolean
  ): VoiceParticipantUpdateResult | null {
    const entry = this.rooms.get(roomId)?.get(userId);
    if (!entry) return null;

    entry.isModerationMuted = isMuted;
    entry.isMuted = isMuted;
    if (isMuted) {
      entry.isSpeaking = false;
    }
    entry.updatedAt = new Date().toISOString();

    return {
      event: 'updated',
      participant: this.toDto(entry),
    };
  }

  /**
   * Updates non-authoritative speaking/mute telemetry for an existing voice session.
   * Enforces server-side throttle and moderation-mute invariants.
   */
  public updateSpeakingState(params: {
    roomId: string;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isSpeaking: boolean;
    isMuted?: boolean;
    isModerationMuted?: boolean;
    hasActiveVoiceSession: boolean;
    throttleMs?: number;
  }): { allowed: boolean; result: VoiceParticipantUpdateResult | null } {
    const {
      roomId,
      userId,
      username,
      displayName,
      avatarUrl,
      isSpeaking,
      isMuted,
      isModerationMuted = false,
      hasActiveVoiceSession,
      throttleMs = 150,
    } = params;

    let roomMap = this.rooms.get(roomId);
    let entry = roomMap?.get(userId);

    // Do not fabricate a voice participant if user has neither webhook presence nor an issued voice session
    if (!entry) {
      if (!hasActiveVoiceSession) {
        return { allowed: false, result: null };
      }
      if (!roomMap) {
        roomMap = new Map();
        this.rooms.set(roomId, roomMap);
      }
      entry = {
        userId,
        username,
        displayName,
        avatarUrl,
        identities: new Set(['pending_webhook']),
        publishedTrackSids: new Set(),
        isModerationMuted,
        isMuted: isModerationMuted || Boolean(isMuted),
        isSpeaking: false,
        connectionState: 'connected',
        updatedAt: new Date().toISOString(),
      };
      roomMap.set(userId, entry);
    }

    const effectiveModMuted = isModerationMuted || entry.isModerationMuted;
    entry.isModerationMuted = effectiveModMuted;

    const nextMuted = effectiveModMuted ? true : typeof isMuted === 'boolean' ? isMuted : entry.isMuted;
    const nextSpeaking = nextMuted ? false : isSpeaking;

    const stateChanged = entry.isSpeaking !== nextSpeaking || entry.isMuted !== nextMuted;
    const key = `${roomId}:${userId}`;
    const nowMs = Date.now();
    const lastMs = this.lastSpeakingEventAt.get(key) || 0;

    if (!stateChanged || (nowMs - lastMs < throttleMs && nextSpeaking === entry.isSpeaking && nextMuted === entry.isMuted)) {
      return { allowed: false, result: null };
    }

    // Also rate-limit rapid flipping within throttle window unless stopping speaking / muting
    if (nowMs - lastMs < throttleMs && nextSpeaking) {
      return { allowed: false, result: null };
    }

    this.lastSpeakingEventAt.set(key, nowMs);
    entry.isMuted = nextMuted;
    entry.isSpeaking = nextSpeaking;
    entry.updatedAt = new Date().toISOString();

    return {
      allowed: true,
      result: {
        event: 'updated',
        participant: this.toDto(entry),
      },
    };
  }

  public removeUserFromAllRooms(userId: string): Array<{ roomId: string; result: VoiceParticipantUpdateResult }> {
    const removed: Array<{ roomId: string; result: VoiceParticipantUpdateResult }> = [];
    for (const roomId of Array.from(this.rooms.keys())) {
      const res = this.markParticipantLeft(roomId, userId);
      if (res) {
        removed.push({ roomId, result: res });
      }
    }
    return removed;
  }

  public clearRoom(roomId: string): VoiceParticipantUpdateResult[] {
    const roomMap = this.rooms.get(roomId);
    if (!roomMap) return [];

    const now = new Date().toISOString();
    const leftEvents: VoiceParticipantUpdateResult[] = [];
    for (const entry of roomMap.values()) {
      entry.identities.clear();
      entry.publishedTrackSids.clear();
      entry.isSpeaking = false;
      entry.connectionState = 'disconnected';
      entry.updatedAt = now;
      leftEvents.push({
        event: 'left',
        participant: this.toDto(entry),
      });
      this.lastSpeakingEventAt.delete(`${roomId}:${entry.userId}`);
    }

    this.rooms.delete(roomId);
    return leftEvents;
  }

  public clear(): void {
    this.rooms.clear();
    this.lastSpeakingEventAt.clear();
  }
}

export const voicePresenceStore = new VoicePresenceStore();
