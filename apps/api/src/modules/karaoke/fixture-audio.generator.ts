/**
 * Generates pure PCM stereo WAV audio buffers for authorized development fixtures.
 * Completely self-contained, royalty-free, and licensing-compliant.
 * Provides deterministic duration and harmonic backing music for testing.
 */
export class FixtureAudioGenerator {
  private static readonly SAMPLE_RATE = 44100;
  private static readonly CHANNELS = 2;
  private static readonly BITS_PER_SAMPLE = 16;
  private static readonly cache = new Map<string, Buffer>();

  /**
   * Generates or retrieves from memory cache a 44.1kHz 16-bit stereo WAV buffer.
   * Synthesizes a pleasant melodic progression matching track style and duration.
   */
  public static generateWavBuffer(
    fixtureId: string,
    durationMs: number,
    baseFreq: number = 220
  ): Buffer {
    const cacheKey = `${fixtureId}_${durationMs}_${baseFreq}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const sampleRate = this.SAMPLE_RATE;
    const channels = this.CHANNELS;
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    const dataSize = numSamples * channels * (this.BITS_PER_SAMPLE / 8);
    const buffer = Buffer.alloc(44 + dataSize);

    // Write WAV RIFF header
    buffer.write('RIFF', 0); // ChunkID
    buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize
    buffer.write('WAVE', 8); // Format
    buffer.write('fmt ', 12); // Subchunk1ID
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(channels, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(sampleRate * channels * 2, 28); // ByteRate
    buffer.writeUInt16LE(channels * 2, 32); // BlockAlign
    buffer.writeUInt16LE(this.BITS_PER_SAMPLE, 34); // BitsPerSample
    buffer.write('data', 36); // Subchunk2ID
    buffer.writeUInt32LE(dataSize, 40); // Subchunk2Size

    // Scale frequencies based on pentatonic/major scale
    // Root, Major 2nd, Major 3rd, 5th, 6th, Octave
    const scale = [1.0, 1.125, 1.25, 1.5, 1.667, 2.0];
    const bpm = 100;
    const beatDurationSamples = Math.floor((60 / bpm) * sampleRate);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const beatIndex = Math.floor(i / beatDurationSamples);
      const noteRatio = scale[beatIndex % scale.length] || 1.0;
      const noteFreq = baseFreq * noteRatio;

      // Bass note (1 octave below root)
      const bassFreq = (baseFreq / 2) * (beatIndex % 2 === 0 ? 1.0 : 1.5);
      const bassEnv = Math.exp(-((i % (beatDurationSamples * 2)) / sampleRate) * 1.5);
      const bassWave = Math.sin(2 * Math.PI * bassFreq * t) * 0.3 * bassEnv;

      // Melodic voice (soft sine with slight harmonic overtone)
      const noteTime = (i % beatDurationSamples) / sampleRate;
      const noteEnv = Math.exp(-noteTime * 2.5);
      const melWave =
        (Math.sin(2 * Math.PI * noteFreq * t) * 0.35 +
          Math.sin(2 * Math.PI * (noteFreq * 2) * t) * 0.1) *
        noteEnv;

      // Ambient pad / chord shimmer
      const chordFreq1 = baseFreq * 1.0;
      const chordFreq2 = baseFreq * 1.25;
      const chordFreq3 = baseFreq * 1.5;
      const padWave =
        (Math.sin(2 * Math.PI * chordFreq1 * t) +
          Math.sin(2 * Math.PI * chordFreq2 * t) +
          Math.sin(2 * Math.PI * chordFreq3 * t)) *
        0.06;

      // Soft kick/hi-hat click on beats
      const clickTime = (i % beatDurationSamples) / sampleRate;
      const kick = clickTime < 0.05 ? Math.sin(2 * Math.PI * 80 * clickTime) * (1 - clickTime / 0.05) * 0.25 : 0;

      // Mix channels (left and right with slight stereo separation)
      const leftSample = Math.max(-1, Math.min(1, melWave * 0.7 + padWave + bassWave * 0.5 + kick));
      const rightSample = Math.max(-1, Math.min(1, melWave * 0.5 + padWave + bassWave * 0.7 + kick));

      const intLeft = Math.floor(leftSample * 32767);
      const intRight = Math.floor(rightSample * 32767);

      buffer.writeInt16LE(intLeft, offset);
      buffer.writeInt16LE(intRight, offset + 2);
      offset += 4;
    }

    this.cache.set(cacheKey, buffer);
    return buffer;
  }
}
