import { Response, Request } from 'express';
import mongoose from 'mongoose';
import { ResolvedAudioSourceDto } from '@ktv/contracts';
import { SongModel } from './song.model.js';
import { IKaraokeAudioSourceProvider } from './audio-source.types.js';
import { FixtureAudioSourceProvider } from './fixture-audio.provider.js';
import { logger } from '../../utils/logger.js';

interface ParsedByteRange {
  start: number;
  end: number;
}

/**
 * Parses HTTP Range header according to RFC 7233.
 * Supports standard (bytes=start-end), open-ended (bytes=start-), and suffix (bytes=-N) ranges.
 */
function parseHttpByteRange(rangeHeader: string, totalSize: number): ParsedByteRange | 'invalid' | 'unsatisfiable' | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const rangeSpec = rangeHeader.slice(6).trim();
  // If multiple ranges requested, process the first range
  const firstRange = rangeSpec.split(',')[0]?.trim();
  if (!firstRange) return 'invalid';

  // Suffix range: bytes=-N (last N bytes)
  if (firstRange.startsWith('-')) {
    const suffixLength = parseInt(firstRange.slice(1), 10);
    if (isNaN(suffixLength) || suffixLength <= 0) {
      return 'invalid';
    }
    const start = Math.max(0, totalSize - suffixLength);
    const end = totalSize - 1;
    return { start, end };
  }

  const parts = firstRange.split('-');
  if (parts.length !== 2) return 'invalid';

  const startStr = parts[0]?.trim();
  const endStr = parts[1]?.trim();

  const start = parseInt(startStr || '', 10);
  if (isNaN(start) || start < 0) return 'invalid';

  let end: number;
  if (!endStr) {
    // Open-ended range: bytes=start-
    end = totalSize - 1;
  } else {
    end = parseInt(endStr, 10);
    if (isNaN(end)) return 'invalid';
  }

  if (start > end) {
    return 'invalid';
  }

  if (start >= totalSize) {
    return 'unsatisfiable';
  }

  // Cap end at totalSize - 1
  end = Math.min(end, totalSize - 1);

  return { start, end };
}

export class AudioSourceService {
  private providers = new Map<string, IKaraokeAudioSourceProvider>();

  constructor() {
    this.registerProvider(new FixtureAudioSourceProvider());
  }

  public registerProvider(provider: IKaraokeAudioSourceProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  /**
   * Resolves a streamable audio source for a song by MongoDB ID.
   * Enforces availability check: throws SONG_AUDIO_UNAVAILABLE if track is metadata-only.
   */
  public async resolveAudioSource(songId: string, baseUrl: string = ''): Promise<ResolvedAudioSourceDto> {
    if (!mongoose.isValidObjectId(songId)) {
      throw new Error('SONG_NOT_FOUND');
    }

    const song = await SongModel.findById(songId).exec();
    if (!song) {
      throw new Error('SONG_NOT_FOUND');
    }

    if (song.audioAvailability !== 'audio_available') {
      logger.warn({ songId, title: song.title, audioAvailability: song.audioAvailability }, 'Attempted to resolve audio for metadata-only song');
      throw new Error('SONG_AUDIO_UNAVAILABLE');
    }

    const provider = this.providers.get(song.provider) || this.providers.get('fixture');
    if (!provider) {
      throw new Error('AUDIO_PROVIDER_UNAVAILABLE');
    }

    const resolved = await provider.resolveAudioSource(song, baseUrl);
    if (!resolved) {
      throw new Error('SONG_AUDIO_UNAVAILABLE');
    }

    return resolved;
  }

  /**
   * Handles HTTP audio streaming with support for Range and HEAD requests,
   * suffix ranges, and client disconnect cleanup.
   */
  public async streamAudio(songId: string, req: Request, res: Response): Promise<void> {
    if (!mongoose.isValidObjectId(songId)) {
      res.status(400).json({ code: 'INVALID_SONG_ID', message: 'Invalid song identifier' });
      return;
    }

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    const song = await SongModel.findById(songId).exec();
    if (!song) {
      res.status(404).json({ message: 'Song not found' });
      return;
    }

    if (song.audioAvailability !== 'audio_available') {
      res.status(400).json({ code: 'SONG_AUDIO_UNAVAILABLE', message: 'Audio stream is unavailable for this song' });
      return;
    }

    const provider = this.providers.get(song.provider) || this.providers.get('fixture');
    if (!provider) {
      res.status(503).json({ message: 'Audio provider unavailable' });
      return;
    }

    const result = await provider.getAudioStreamBuffer(song.providerSongId, song.durationMs);
    if (!result) {
      res.status(404).json({ message: 'Audio stream buffer not found' });
      return;
    }

    if (clientDisconnected || res.writableEnded) {
      return;
    }

    const { buffer, mimeType } = result;
    const totalSize = buffer.length;
    const isHeadRequest = req.method === 'HEAD';

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const parsedRange = parseHttpByteRange(rangeHeader, totalSize);

      if (parsedRange === 'invalid' || parsedRange === 'unsatisfiable') {
        res.status(416).set({
          'Content-Range': `bytes */${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        }).end();
        return;
      }

      if (parsedRange) {
        const { start, end } = parsedRange;
        const chunkSize = (end - start) + 1;
        const chunk = buffer.subarray(start, end + 1);

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600, must-revalidate',
        });

        if (isHeadRequest) {
          res.end();
          return;
        }

        res.end(chunk);
        return;
      }
    }

    // Full response (HTTP 200)
    res.writeHead(200, {
      'Content-Length': totalSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    });

    if (isHeadRequest) {
      res.end();
      return;
    }

    res.end(buffer);
  }
}

export const audioSourceService = new AudioSourceService();
