import { Document, Types } from 'mongoose';
import { PerformanceOutcome } from '@ktv/contracts';

export interface ISessionParticipantSubdoc {
  userId: Types.ObjectId;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: 'host' | 'moderator' | 'member';
  joinedAt: Date;
  leftAt: Date | null;
  songsPerformedCount: number;
}

export interface IKaraokeSession {
  roomId: Types.ObjectId;
  roomName: string;
  hostId: Types.ObjectId;
  hostUsername: string;
  hostDisplayName: string | null;
  visibility: 'public' | 'private';
  roomType: string;
  atmospherePreset: string;
  startedAt: Date;
  endedAt: Date | null;
  status: 'active' | 'completed';
  endedReason?: 'host_closed' | 'room_abandoned' | 'manual' | null;
  totalSongsPlayed: number;
  totalParticipantsCount: number;
  durationMs: number | null;
  participants: ISessionParticipantSubdoc[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IKaraokeSessionDocument extends IKaraokeSession, Document {}

export interface IKaraokePerformance {
  sessionId: Types.ObjectId;
  roomId: Types.ObjectId;
  queueItemId: Types.ObjectId;
  songId: Types.ObjectId;
  songTitle: string;
  artist: string;
  thumbnailUrl: string | null;
  genre: string;
  language: string;
  durationMs: number;
  singerId: Types.ObjectId;
  singerUsername: string;
  singerDisplayName: string | null;
  singerAvatar: string | null;
  requestedById: Types.ObjectId;
  roomName: string;
  startedAt: Date;
  completedAt: Date | null;
  durationPerformedMs: number;
  outcome: PerformanceOutcome;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKaraokePerformanceDocument extends IKaraokePerformance, Document {}
