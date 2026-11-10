/**
 * Karaoke Backing Track Equalizer Service
 * Provides a lightweight, local 3-band parametric/shelving equalizer for HTMLAudioElement backing tracks.
 * Strictly isolated from LiveKit microphone capture and remote voice streams.
 */

export type KaraokeEqPreset = 'flat' | 'bass_boost' | 'vocal_clarity' | 'treble_boost';

export interface EqBandGains {
  lowGain: number;   // dB (lowshelf @ 150 Hz)
  midGain: number;   // dB (peaking @ 1500 Hz, Q = 1.0)
  highGain: number;  // dB (highshelf @ 8000 Hz)
  description: string;
}

export const KARAOKE_EQ_PRESETS: Record<KaraokeEqPreset, EqBandGains> = {
  flat: {
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    description: 'Natural original sound (Bypassed)',
  },
  bass_boost: {
    lowGain: 5,
    midGain: 0,
    highGain: -1,
    description: 'Enriched low-end punch for rhythm tracks',
  },
  vocal_clarity: {
    lowGain: -2,
    midGain: 4,
    highGain: 2,
    description: 'Clear midrange presence to help singing stand out',
  },
  treble_boost: {
    lowGain: -1,
    midGain: 1,
    highGain: 5,
    description: 'Air and sparkle for crisp acoustic tracks',
  },
};

export const STORAGE_EQ_PRESET_KEY = 'ktv_karaoke_eq_preset';

export class KaraokeEqualizerService {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private lowFilter: BiquadFilterNode | null = null;
  private midFilter: BiquadFilterNode | null = null;
  private highFilter: BiquadFilterNode | null = null;
  private connectedElement: HTMLAudioElement | null = null;
  private currentPreset: KaraokeEqPreset = 'flat';
  private isSupported = true;

  public isAvailable(): boolean {
    return this.isSupported && typeof window !== 'undefined' && Boolean(
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    );
  }

  public getPreset(): KaraokeEqPreset {
    return this.currentPreset;
  }

  /**
   * Connects the equalizer filter graph to an HTMLAudioElement.
   * If already connected to this element, applies current preset without rebuilding.
   */
  public connect(audioEl: HTMLAudioElement): boolean {
    if (this.connectedElement === audioEl && this.audioCtx) {
      return true;
    }

    if (!this.isAvailable()) {
      return false;
    }

    try {
      // Clean up any previous element connection
      if (this.connectedElement && this.connectedElement !== audioEl) {
        this.dispose();
      }

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }

      // 1. Low Shelf Filter (150 Hz)
      this.lowFilter = this.audioCtx.createBiquadFilter();
      this.lowFilter.type = 'lowshelf';
      this.lowFilter.frequency.value = 150;

      // 2. Mid Peaking Filter (1500 Hz, Q = 1.0)
      this.midFilter = this.audioCtx.createBiquadFilter();
      this.midFilter.type = 'peaking';
      this.midFilter.frequency.value = 1500;
      this.midFilter.Q.value = 1.0;

      // 3. High Shelf Filter (8000 Hz)
      this.highFilter = this.audioCtx.createBiquadFilter();
      this.highFilter.type = 'highshelf';
      this.highFilter.frequency.value = 8000;

      // Connect source -> low -> mid -> high -> destination
      this.sourceNode = this.audioCtx.createMediaElementSource(audioEl);
      this.sourceNode.connect(this.lowFilter);
      this.lowFilter.connect(this.midFilter);
      this.midFilter.connect(this.highFilter);
      this.highFilter.connect(this.audioCtx.destination);

      this.connectedElement = audioEl;
      this.applyPreset(this.currentPreset);

      return true;
    } catch (err) {
      console.warn('[KaraokeEqualizer] Failed to initialize Web Audio equalizer graph, falling back to direct audio', err);
      this.isSupported = false;
      this.dispose();
      return false;
    }
  }

  /**
   * Apply an equalizer preset without recreating audio nodes.
   */
  public applyPreset(preset: KaraokeEqPreset): void {
    this.currentPreset = preset;
    const gains = KARAOKE_EQ_PRESETS[preset] || KARAOKE_EQ_PRESETS.flat;

    if (this.lowFilter && this.midFilter && this.highFilter) {
      // Smooth parameter ramps over 20ms to prevent clicking/zipper noise
      const now = this.audioCtx?.currentTime ?? 0;
      this.lowFilter.gain.setTargetAtTime(gains.lowGain, now, 0.02);
      this.midFilter.gain.setTargetAtTime(gains.midGain, now, 0.02);
      this.highFilter.gain.setTargetAtTime(gains.highGain, now, 0.02);
    }
  }

  /**
   * Resume AudioContext if suspended by browser autoplay policy.
   */
  public resumeIfSuspended(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  /**
   * Routes the AudioContext destination to a specific output sink if supported.
   */
  public setSinkId(deviceId: string): void {
    if (this.audioCtx && 'setSinkId' in this.audioCtx) {
      (this.audioCtx as unknown as { setSinkId: (id: string) => Promise<void> })
        .setSinkId(deviceId)
        .catch(() => {});
    }
  }

  /**
   * Clean up all Web Audio nodes and close AudioContext.
   */
  public dispose(): void {
    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.lowFilter) {
        this.lowFilter.disconnect();
        this.lowFilter = null;
      }
      if (this.midFilter) {
        this.midFilter.disconnect();
        this.midFilter = null;
      }
      if (this.highFilter) {
        this.highFilter.disconnect();
        this.highFilter = null;
      }
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
    } catch {
      // Silently ignore cleanup errors
    }
    this.connectedElement = null;
  }
}

export const karaokeEqualizer = new KaraokeEqualizerService();
