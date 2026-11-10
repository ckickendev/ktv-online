import { ResolvedAudioSourceDto } from '@ktv/contracts';
import { IKaraokeAudioSourceProvider } from './audio-source.types.js';
import { ISongDocument } from './song.types.js';
import { FixtureAudioGenerator } from './fixture-audio.generator.js';

export class FixtureAudioSourceProvider implements IKaraokeAudioSourceProvider {
  public readonly providerName = 'fixture';

  public async resolveAudioSource(
    song: ISongDocument,
    baseUrl: string = ''
  ): Promise<ResolvedAudioSourceDto | null> {
    if (song.audioAvailability !== 'audio_available') {
      return null;
    }

    const songId = (song._id as { toString(): string }).toString();
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const streamUrl = `${cleanBaseUrl}/api/v1/songs/${songId}/audio/stream`;

    return {
      songId,
      provider: this.providerName,
      url: streamUrl,
      mimeType: 'audio/wav',
      availability: 'audio_available',
      licenseClassification: song.licenseClassification || 'public_domain',
      attribution: 'Public Domain / Royalty-Free Development Fixture Audio',
      supportsByteRange: true,
      isPlayable: true,
      durationMs: song.durationMs,
    };
  }

  public async getAudioStreamBuffer(
    providerSongId: string,
    durationMs: number
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    // Generate clean audio buffer based on track signature
    let baseFreq = 220;
    if (providerSongId.includes('grace')) baseFreq = 261.63; // C4
    else if (providerSongId.includes('scarborough')) baseFreq = 293.66; // D4
    else if (providerSongId.includes('synth')) baseFreq = 174.61; // F3
    else if (providerSongId.includes('auld')) baseFreq = 220.0; // A3

    const buffer = FixtureAudioGenerator.generateWavBuffer(
      providerSongId,
      durationMs,
      baseFreq
    );

    return {
      buffer,
      mimeType: 'audio/wav',
    };
  }
}
