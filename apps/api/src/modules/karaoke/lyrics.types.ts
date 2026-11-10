import { SongLyricsDto } from '@ktv/contracts';
import { ISongDocument } from './song.types.js';

export interface ILyricsProvider {
  readonly providerName: string;
  getLyrics(song: ISongDocument): Promise<SongLyricsDto | null>;
}
