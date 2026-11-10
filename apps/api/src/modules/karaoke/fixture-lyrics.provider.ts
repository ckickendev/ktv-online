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
      {
        id: 'sg-1',
        startMs: 0,
        endMs: 6500,
        text: 'Midnight neon in the city lights,',
        words: [
          { id: 'sg-1-w1', startMs: 0, endMs: 1200, text: 'Midnight' },
          { id: 'sg-1-w2', startMs: 1200, endMs: 2200, text: 'neon' },
          { id: 'sg-1-w3', startMs: 2200, endMs: 2700, text: 'in' },
          { id: 'sg-1-w4', startMs: 2700, endMs: 3200, text: 'the' },
          { id: 'sg-1-w5', startMs: 3200, endMs: 4500, text: 'city' },
          { id: 'sg-1-w6', startMs: 4500, endMs: 6500, text: 'lights,' },
        ],
      },
      {
        id: 'sg-2',
        startMs: 6500,
        endMs: 13500,
        text: 'Feel the rhythm through the electric nights.',
        words: [
          { id: 'sg-2-w1', startMs: 6500, endMs: 7600, text: 'Feel' },
          { id: 'sg-2-w2', startMs: 7600, endMs: 8200, text: 'the' },
          { id: 'sg-2-w3', startMs: 8200, endMs: 9500, text: 'rhythm' },
          { id: 'sg-2-w4', startMs: 9500, endMs: 10400, text: 'through' },
          { id: 'sg-2-w5', startMs: 10400, endMs: 11000, text: 'the' },
          { id: 'sg-2-w6', startMs: 11000, endMs: 12300, text: 'electric' },
          { id: 'sg-2-w7', startMs: 12300, endMs: 13500, text: 'nights.' },
        ],
      },
      {
        id: 'sg-3',
        startMs: 13500,
        endMs: 20500,
        text: 'Echoes calling through the velvet sound,',
        words: [
          { id: 'sg-3-w1', startMs: 13500, endMs: 14800, text: 'Echoes' },
          { id: 'sg-3-w2', startMs: 14800, endMs: 16200, text: 'calling' },
          { id: 'sg-3-w3', startMs: 16200, endMs: 17200, text: 'through' },
          { id: 'sg-3-w4', startMs: 17200, endMs: 17800, text: 'the' },
          { id: 'sg-3-w5', startMs: 17800, endMs: 19100, text: 'velvet' },
          { id: 'sg-3-w6', startMs: 19100, endMs: 20500, text: 'sound,' },
        ],
      },
      {
        id: 'sg-4',
        startMs: 20500,
        endMs: 27500,
        text: 'Lost together till the morning found.',
        words: [
          { id: 'sg-4-w1', startMs: 20500, endMs: 21600, text: 'Lost' },
          { id: 'sg-4-w2', startMs: 21600, endMs: 23200, text: 'together' },
          { id: 'sg-4-w3', startMs: 23200, endMs: 24000, text: 'till' },
          { id: 'sg-4-w4', startMs: 24000, endMs: 24600, text: 'the' },
          { id: 'sg-4-w5', startMs: 24600, endMs: 26000, text: 'morning' },
          { id: 'sg-4-w6', startMs: 26000, endMs: 27500, text: 'found.' },
        ],
      },
      {
        id: 'sg-5',
        startMs: 27500,
        endMs: 34500,
        text: 'Sing with the bassline, feel the floor,',
        words: [
          { id: 'sg-5-w1', startMs: 27500, endMs: 28600, text: 'Sing' },
          { id: 'sg-5-w2', startMs: 28600, endMs: 29300, text: 'with' },
          { id: 'sg-5-w3', startMs: 29300, endMs: 29900, text: 'the' },
          { id: 'sg-5-w4', startMs: 29900, endMs: 31600, text: 'bassline,' },
          { id: 'sg-5-w5', startMs: 31600, endMs: 32800, text: 'feel' },
          { id: 'sg-5-w6', startMs: 32800, endMs: 33400, text: 'the' },
          { id: 'sg-5-w7', startMs: 33400, endMs: 34500, text: 'floor,' },
        ],
      },
      {
        id: 'sg-6',
        startMs: 34500,
        endMs: 41500,
        text: 'Turn the volume up and ask for more!',
        words: [
          { id: 'sg-6-w1', startMs: 34500, endMs: 35500, text: 'Turn' },
          { id: 'sg-6-w2', startMs: 35500, endMs: 36100, text: 'the' },
          { id: 'sg-6-w3', startMs: 36100, endMs: 37400, text: 'volume' },
          { id: 'sg-6-w4', startMs: 37400, endMs: 38200, text: 'up' },
          { id: 'sg-6-w5', startMs: 38200, endMs: 38800, text: 'and' },
          { id: 'sg-6-w6', startMs: 38800, endMs: 39800, text: 'ask' },
          { id: 'sg-6-w7', startMs: 39800, endMs: 40400, text: 'for' },
          { id: 'sg-6-w8', startMs: 40400, endMs: 41500, text: 'more!' },
        ],
      },
      {
        id: 'sg-7',
        startMs: 41500,
        endMs: 50000,
        text: 'KTV lounge under violet skies,',
        words: [
          { id: 'sg-7-w1', startMs: 41500, endMs: 43200, text: 'KTV' },
          { id: 'sg-7-w2', startMs: 43200, endMs: 44600, text: 'lounge' },
          { id: 'sg-7-w3', startMs: 44600, endMs: 45800, text: 'under' },
          { id: 'sg-7-w4', startMs: 45800, endMs: 47500, text: 'violet' },
          { id: 'sg-7-w5', startMs: 47500, endMs: 50000, text: 'skies,' },
        ],
      },
      {
        id: 'sg-8',
        startMs: 50000,
        endMs: 59000,
        text: 'Stars are shining in your joyful eyes.',
        words: [
          { id: 'sg-8-w1', startMs: 50000, endMs: 51400, text: 'Stars' },
          { id: 'sg-8-w2', startMs: 51400, endMs: 52200, text: 'are' },
          { id: 'sg-8-w3', startMs: 52200, endMs: 53800, text: 'shining' },
          { id: 'sg-8-w4', startMs: 53800, endMs: 54600, text: 'in' },
          { id: 'sg-8-w5', startMs: 54600, endMs: 55400, text: 'your' },
          { id: 'sg-8-w6', startMs: 55400, endMs: 57000, text: 'joyful' },
          { id: 'sg-8-w7', startMs: 57000, endMs: 59000, text: 'eyes.' },
        ],
      },
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
