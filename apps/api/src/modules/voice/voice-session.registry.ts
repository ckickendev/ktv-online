export interface ActiveVoiceSession {
  identity: string;
  participantSessionId: string;
  userId: string;
  roomId: string;
  familyId?: string;
  tabHint?: string;
  createdAt: Date;
  lastRenewedAt: Date;
}

export class VoiceSessionRegistry {
  // identity -> ActiveVoiceSession
  private sessions = new Map<string, ActiveVoiceSession>();
  // familyId -> Set<identity>
  private byFamily = new Map<string, Set<string>>();
  // roomId -> Set<identity>
  private byRoom = new Map<string, Set<string>>();
  // userId -> Set<identity>
  private byUser = new Map<string, Set<string>>();

  public register(session: ActiveVoiceSession): void {
    this.sessions.set(session.identity, session);

    if (session.familyId) {
      let set = this.byFamily.get(session.familyId);
      if (!set) {
        set = new Set();
        this.byFamily.set(session.familyId, set);
      }
      set.add(session.identity);
    }

    let roomSet = this.byRoom.get(session.roomId);
    if (!roomSet) {
      roomSet = new Set();
      this.byRoom.set(session.roomId, roomSet);
    }
    roomSet.add(session.identity);

    let userSet = this.byUser.get(session.userId);
    if (!userSet) {
      userSet = new Set();
      this.byUser.set(session.userId, userSet);
    }
    userSet.add(session.identity);
  }

  public unregister(identity: string): ActiveVoiceSession | null {
    const session = this.sessions.get(identity);
    if (!session) return null;

    this.sessions.delete(identity);

    if (session.familyId) {
      const set = this.byFamily.get(session.familyId);
      if (set) {
        set.delete(identity);
        if (set.size === 0) this.byFamily.delete(session.familyId);
      }
    }

    const roomSet = this.byRoom.get(session.roomId);
    if (roomSet) {
      roomSet.delete(identity);
      if (roomSet.size === 0) this.byRoom.delete(session.roomId);
    }

    const userSet = this.byUser.get(session.userId);
    if (userSet) {
      userSet.delete(identity);
      if (userSet.size === 0) this.byUser.delete(session.userId);
    }

    return session;
  }

  public getByFamily(familyId: string): ActiveVoiceSession[] {
    const identities = this.byFamily.get(familyId);
    if (!identities) return [];
    const list: ActiveVoiceSession[] = [];
    for (const id of identities) {
      const s = this.sessions.get(id);
      if (s) list.push(s);
    }
    return list;
  }

  public getByUser(userId: string): ActiveVoiceSession[] {
    const identities = this.byUser.get(userId);
    if (!identities) return [];
    const list: ActiveVoiceSession[] = [];
    for (const id of identities) {
      const s = this.sessions.get(id);
      if (s) list.push(s);
    }
    return list;
  }

  public getByRoom(roomId: string): ActiveVoiceSession[] {
    const identities = this.byRoom.get(roomId);
    if (!identities) return [];
    const list: ActiveVoiceSession[] = [];
    for (const id of identities) {
      const s = this.sessions.get(id);
      if (s) list.push(s);
    }
    return list;
  }

  public getByUserAndRoom(roomId: string, userId: string): ActiveVoiceSession[] {
    const roomSet = this.byRoom.get(roomId);
    if (!roomSet) return [];
    const list: ActiveVoiceSession[] = [];
    for (const id of roomSet) {
      const s = this.sessions.get(id);
      if (s && s.userId === userId) list.push(s);
    }
    return list;
  }

  public findExistingSession(roomId: string, userId: string, tabHint?: string): ActiveVoiceSession | null {
    if (!tabHint) return null;
    const roomSessions = this.getByUserAndRoom(roomId, userId);
    return roomSessions.find((s) => s.tabHint === tabHint) || null;
  }

  public clearRoom(roomId: string): void {
    const identities = this.byRoom.get(roomId);
    if (identities) {
      for (const id of Array.from(identities)) {
        this.unregister(id);
      }
      this.byRoom.delete(roomId);
    }
  }

  public clear(): void {
    this.sessions.clear();
    this.byFamily.clear();
    this.byRoom.clear();
    this.byUser.clear();
  }
}

export const voiceSessionRegistry = new VoiceSessionRegistry();
