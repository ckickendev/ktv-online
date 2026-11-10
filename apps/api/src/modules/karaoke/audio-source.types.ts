import { ResolvedAudioSourceDto } from '@ktv/contracts';
import { ISongDocument } from './song.types.js';

export interface IKaraokeAudioSourceProvider {
  readonly providerName: string;
  resolveAudioSource(song: ISongDocument, baseUrl?: string): Promise<ResolvedAudioSourceDto | null>;
  getAudioStreamBuffer(providerSongId: string, durationMs: number): Promise<{ buffer: Buffer; mimeType: string } | null>;
}
