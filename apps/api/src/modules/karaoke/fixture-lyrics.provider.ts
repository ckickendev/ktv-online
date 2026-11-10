import { SongLyricsDto, TimedLyricLine } from '@ktv/contracts';
import { ILyricsProvider } from './lyrics.types.js';
import { ISongDocument } from './song.types.js';

export class FixtureLyricsProvider implements ILyricsProvider {
  public readonly providerName = 'fixture';

  private readonly lyricsDatabase: Record<string, TimedLyricLine[]> = {
    fix_auld_lang_syne: [
      { id: 'als-1', startMs: 0, endMs: 5500, text: 'Should auld acquaintance be forgot,' },
      { id: 'als-2', startMs: 5500, endMs: 11000, text: 'And never brought to mind?' },
      { id: 'als-3', startMs: 11000, endMs: 16500, text: 'Should auld acquaintance be forgot,' },
      { id: 'als-4', startMs: 16500, endMs: 22000, text: 'And auld lang syne!' },
      { id: 'als-5', startMs: 22000, endMs: 28000, text: 'For auld lang syne, my dear,' },
      { id: 'als-6', startMs: 28000, endMs: 34000, text: 'For auld lang syne,' },
      { id: 'als-7', startMs: 34000, endMs: 40000, text: "We'll tak a cup o' kindness yet," },
      { id: 'als-8', startMs: 40000, endMs: 49000, text: 'For auld lang syne.' },
    ],
    fix_amazing_grace: [
      { id: 'ag-1', startMs: 0, endMs: 5000, text: 'Amazing grace! How sweet the sound' },
      { id: 'ag-2', startMs: 5000, endMs: 10500, text: 'That saved a wretch like me!' },
      { id: 'ag-3', startMs: 10500, endMs: 16000, text: 'I once was lost, but now am found;' },
      { id: 'ag-4', startMs: 16000, endMs: 21500, text: 'Was blind, but now I see.' },
      { id: 'ag-5', startMs: 21500, endMs: 27000, text: "'Twas grace that taught my heart to fear," },
      { id: 'ag-6', startMs: 27000, endMs: 32500, text: 'And grace my fears relieved;' },
      { id: 'ag-7', startMs: 32500, endMs: 38000, text: 'How precious did that grace appear' },
      { id: 'ag-8', startMs: 38000, endMs: 44000, text: 'The hour I first believed.' },
    ],
    fix_scarborough_fair: [
      { id: 'sf-1', startMs: 0, endMs: 5000, text: 'Are you going to Scarborough Fair?' },
      { id: 'sf-2', startMs: 5000, endMs: 10500, text: 'Parsley, sage, rosemary, and thyme' },
      { id: 'sf-3', startMs: 10500, endMs: 16000, text: 'Remember me to one who lives there' },
      { id: 'sf-4', startMs: 16000, endMs: 21500, text: 'She once was a true love of mine' },
      { id: 'sf-5', startMs: 21500, endMs: 27000, text: 'Tell her to make me a cambric shirt' },
      { id: 'sf-6', startMs: 27000, endMs: 33000, text: 'Parsley, sage, rosemary, and thyme' },
      { id: 'sf-7', startMs: 33000, endMs: 39000, text: 'Without any seams or needle work' },
    ],
    fix_synth_groove: [
      { id: 'sg-1', startMs: 0, endMs: 6500, text: 'Midnight neon in the city lights,' },
      { id: 'sg-2', startMs: 6500, endMs: 13500, text: 'Feel the rhythm through the electric nights.' },
      { id: 'sg-3', startMs: 13500, endMs: 20500, text: 'Echoes calling through the velvet sound,' },
      { id: 'sg-4', startMs: 20500, endMs: 27500, text: 'Lost together till the morning found.' },
      { id: 'sg-5', startMs: 27500, endMs: 34500, text: 'Sing with the bassline, feel the floor,' },
      { id: 'sg-6', startMs: 34500, endMs: 41500, text: 'Turn the volume up and ask for more!' },
      { id: 'sg-7', startMs: 41500, endMs: 50000, text: 'KTV lounge under violet skies,' },
      { id: 'sg-8', startMs: 50000, endMs: 59000, text: 'Stars are shining in your joyful eyes.' },
    ],
  };

  public async getLyrics(song: ISongDocument): Promise<SongLyricsDto | null> {
    const songId = (song._id as { toString(): string }).toString();
    const lines = this.lyricsDatabase[song.providerSongId];

    if (!lines || lines.length === 0) {
      return {
        songId,
        provider: this.providerName,
        lines: [],
        language: song.language || 'en',
        hasTimedLyrics: false,
        attribution: 'No synchronized lyrics available for this track',
      };
    }

    return {
      songId,
      provider: this.providerName,
      lines,
      language: song.language || 'en',
      hasTimedLyrics: true,
      attribution: 'Public Domain / Authorized Lyric Fixture',
    };
  }
}
