'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Mic,
  MicOff,
  Volume2,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Play,
  Square,
  Sparkles,
  Info,
  Check,
  Music2,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  VoiceDevice,
  AudioCapturePreferences,
  MicrophonePermissionState,
} from '../types/voice.types';
import {
  useMicrophoneTester,
} from '../hooks/use-microphone-tester';
import { MicrophoneInputMeter } from './MicrophoneInputMeter';
import {
  KaraokeEqPreset,
  STORAGE_EQ_PRESET_KEY,
} from '@/features/karaoke';

export interface MicrophoneStudioDialogProps {
  isOpen: boolean;
  onClose: () => void;

  // In-room voice integration props (optional; if omitted, studio runs in standalone mode)
  audioInputDevices?: VoiceDevice[];
  activeAudioInputId?: string | null;
  onSelectInputDevice?: (deviceId: string) => Promise<void>;
  permissionState?: MicrophonePermissionState;
  capturePreferences?: AudioCapturePreferences;
  onUpdateCapturePreferences?: (prefs: Partial<AudioCapturePreferences>) => Promise<void>;

  // Voice Output Routing
  audioOutputDevices?: VoiceDevice[];
  activeVoiceOutputId?: string | null;
  onSelectVoiceOutputDevice?: (deviceId: string) => Promise<void>;
  isOutputSelectionSupported?: boolean;

  // Karaoke Backing Track Output & Equalizer
  activeKaraokeOutputId?: string | null;
  onSelectKaraokeOutputDevice?: (deviceId: string) => Promise<void>;
  karaokeEqPreset?: KaraokeEqPreset;
  onSelectKaraokeEqPreset?: (preset: KaraokeEqPreset) => void;

  // Moderation state
  isServerMuted?: boolean;
}

export function MicrophoneStudioDialog({
  isOpen,
  onClose,
  audioInputDevices,
  activeAudioInputId,
  onSelectInputDevice,
  permissionState: externalPermissionState,
  capturePreferences: externalCapturePrefs,
  onUpdateCapturePreferences,
  audioOutputDevices = [],
  activeVoiceOutputId,
  onSelectVoiceOutputDevice,
  isOutputSelectionSupported = false,
  activeKaraokeOutputId,
  onSelectKaraokeOutputDevice,
  karaokeEqPreset,
  onSelectKaraokeEqPreset,
  isServerMuted = false,
}: MicrophoneStudioDialogProps) {
  const [activeTab, setActiveTab] = useState<'mic' | 'processing' | 'output'>('mic');

  const tester = useMicrophoneTester({
    initialDeviceId: activeAudioInputId,
    capturePreferences: externalCapturePrefs,
    onDeviceChange: async (deviceId) => {
      if (onSelectInputDevice) {
        await onSelectInputDevice(deviceId);
      }
    },
    onPreferencesChange: async (prefs) => {
      if (onUpdateCapturePreferences) {
        await onUpdateCapturePreferences(prefs);
      }
    },
  });

  // Local output devices & EQ states
  const [localKaraokeOutputId, setLocalKaraokeOutputId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return activeKaraokeOutputId || localStorage.getItem('ktv_karaoke_output_device') || null;
  });

  const [localEqPreset, setLocalEqPreset] = useState<KaraokeEqPreset>(() => {
    if (typeof window === 'undefined') return 'flat';
    return (
      karaokeEqPreset ||
      (localStorage.getItem(STORAGE_EQ_PRESET_KEY) as KaraokeEqPreset) ||
      'flat'
    );
  });

  useEffect(() => {
    if (activeKaraokeOutputId !== undefined) {
      setLocalKaraokeOutputId(activeKaraokeOutputId);
    }
  }, [activeKaraokeOutputId]);

  useEffect(() => {
    if (karaokeEqPreset !== undefined) {
      setLocalEqPreset(karaokeEqPreset);
    }
  }, [karaokeEqPreset]);

  // When dialog opens, auto-start microphone test if permission granted or ready
  useEffect(() => {
    if (isOpen) {
      tester.refreshDevices();
    } else {
      tester.stopTesting();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const effectiveInputs = audioInputDevices && audioInputDevices.length > 0 ? audioInputDevices : tester.devices;
  const effectiveActiveInput = activeAudioInputId !== undefined ? activeAudioInputId : tester.activeDeviceId;
  const effectivePermission = externalPermissionState || tester.permissionState;
  const effectiveCapturePrefs = externalCapturePrefs || tester.capturePreferences;

  const handleDeviceChange = async (deviceId: string) => {
    await tester.selectDevice(deviceId);
    if (onSelectInputDevice) {
      await onSelectInputDevice(deviceId);
    }
  };

  const handleToggleCapturePref = async (key: keyof AudioCapturePreferences, value: boolean) => {
    const updated = { [key]: value };
    tester.updateCapturePreferences(updated);
    if (onUpdateCapturePreferences) {
      await onUpdateCapturePreferences(updated);
    }
  };

  const handleKaraokeOutputChange = async (deviceId: string) => {
    setLocalKaraokeOutputId(deviceId);
    if (onSelectKaraokeOutputDevice) {
      await onSelectKaraokeOutputDevice(deviceId);
    } else if (typeof window !== 'undefined') {
      localStorage.setItem('ktv_karaoke_output_device', deviceId);
      window.dispatchEvent(new CustomEvent('ktv_karaoke_sink_changed', { detail: deviceId }));
    }
  };

  const handleEqPresetChange = (preset: KaraokeEqPreset) => {
    setLocalEqPreset(preset);
    if (onSelectKaraokeEqPreset) {
      onSelectKaraokeEqPreset(preset);
    } else if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_EQ_PRESET_KEY, preset);
      window.dispatchEvent(new CustomEvent('ktv_karaoke_eq_changed', { detail: { preset } }));
    }
  };

  return (
    <div
      data-testid="microphone-studio-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div
        className="w-full max-w-xl bg-[#090c15] border border-violet-500/20 rounded-3xl shadow-2xl shadow-violet-950/50 flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600/30 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 shadow-md shadow-violet-950/40">
              <Mic className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="studio-dialog-title" className="text-base font-bold text-white tracking-wide">
                  Singer Studio
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300">
                  Microphone &amp; Vocal Setup
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Verify voice input level, test microphone, and tune vocal processing
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-studio-button"
            onClick={onClose}
            className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Muted Warning Banner (if moderated in room) */}
        {isServerMuted && (
          <div className="bg-rose-950/60 border-b border-rose-500/30 px-5 py-2.5 flex items-center gap-2.5 text-xs text-rose-300">
            <MicOff className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Room Moderation Active:</strong> Your microphone is currently muted by room hosts.
              Local testing operates privately, but your voice is not published to the lounge.
            </span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-white/5 bg-black/20">
          <button
            type="button"
            onClick={() => setActiveTab('mic')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[40px] ${
              activeTab === 'mic'
                ? 'bg-[#0f1422] text-white border-t border-x border-white/10 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-violet-400" />
            <span>Mic Input &amp; Test</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('processing')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[40px] ${
              activeTab === 'processing'
                ? 'bg-[#0f1422] text-white border-t border-x border-white/10 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Vocal Processing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('output')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[40px] ${
              activeTab === 'output'
                ? 'bg-[#0f1422] text-white border-t border-x border-white/10 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Output &amp; Equalizer</span>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#0f1422]/60">
          {/* TAB 1: MICROPHONE INPUT & TEST */}
          {activeTab === 'mic' && (
            <div className="space-y-4">
              {/* Device Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-violet-400" />
                    <span>Select Microphone</span>
                  </label>

                  {/* Permission Badge */}
                  <div className="flex items-center gap-1 text-[11px]">
                    {effectivePermission === 'granted' ? (
                      <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        <ShieldCheck className="w-3 h-3" />
                        Permission Granted
                      </span>
                    ) : effectivePermission === 'denied' ? (
                      <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                        <ShieldAlert className="w-3 h-3" />
                        Permission Denied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        <AlertTriangle className="w-3 h-3" />
                        Permission Prompt
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    data-testid="microphone-device-select"
                    value={effectiveActiveInput || ''}
                    onChange={(e) => handleDeviceChange(e.target.value)}
                    className="flex-1 bg-slate-900/95 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer shadow-inner min-h-[44px]"
                  >
                    {effectiveInputs.length === 0 ? (
                      <option value="">No microphones detected</option>
                    ) : (
                      effectiveInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId} className="bg-slate-900 text-slate-200">
                          {d.label}
                        </option>
                      ))
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => tester.refreshDevices()}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                    title="Refresh device list"
                  >
                    <RefreshCw className="w-4 h-4 text-violet-400" />
                  </button>
                </div>
              </div>

              {/* Error Banner */}
              {tester.errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{tester.errorMessage}</span>
                </div>
              )}

              {/* Live Input Meter */}
              <MicrophoneInputMeter
                level={tester.audioLevel}
                peakLevel={tester.peakLevel}
                category={tester.levelCategory}
                isTesting={tester.isTesting}
              />

              {/* Test Action Trigger */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div>
                  <h4 className="text-xs font-semibold text-white">Interactive Microphone Test</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tests voice capture privately on your machine without broadcasting or recording audio.
                  </p>
                </div>

                {!tester.isTesting ? (
                  <button
                    type="button"
                    data-testid="start-mic-test-button"
                    onClick={() => tester.startTesting()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/30 transition-all min-h-[44px]"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Test Microphone</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="stop-mic-test-button"
                    onClick={() => tester.stopTesting()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/30 transition-all min-h-[44px]"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop Test</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VOCAL PROCESSING (AEC, NOISE SUPPRESSION, AGC) */}
          {activeTab === 'processing' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-xs text-violet-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  Browser capture enhancements optimize vocal quality for karaoke. If you sing with
                  headphones, turning off Noise Suppression may provide richer vocal dynamics. If using
                  speakers, keep Echo Cancellation ON.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4">
                {/* Acoustic Echo Cancellation */}
                <label className="flex items-start justify-between gap-3 cursor-pointer group">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors block">
                      Acoustic Echo Cancellation (AEC)
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Prevents backing track music and friends&apos; voices coming out of your speakers from leaking back into your microphone.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    data-testid="toggle-echo-cancellation"
                    checked={effectiveCapturePrefs.echoCancellation}
                    onChange={(e) => handleToggleCapturePref('echoCancellation', e.target.checked)}
                    className="w-5 h-5 mt-0.5 accent-violet-500 rounded cursor-pointer shrink-0"
                  />
                </label>

                <div className="border-t border-white/5" />

                {/* Noise Suppression */}
                <label className="flex items-start justify-between gap-3 cursor-pointer group">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors block">
                      Noise Suppression
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Filters steady background noise such as PC fans, air conditioners, and ambient room hum.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    data-testid="toggle-noise-suppression"
                    checked={effectiveCapturePrefs.noiseSuppression}
                    onChange={(e) => handleToggleCapturePref('noiseSuppression', e.target.checked)}
                    className="w-5 h-5 mt-0.5 accent-violet-500 rounded cursor-pointer shrink-0"
                  />
                </label>

                <div className="border-t border-white/5" />

                {/* Automatic Gain Control */}
                <label className="flex items-start justify-between gap-3 cursor-pointer group">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors block">
                      Automatic Gain Control (AGC)
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Automatically balances volume swings between soft verses and loud chorus singing.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    data-testid="toggle-auto-gain-control"
                    checked={effectiveCapturePrefs.autoGainControl}
                    onChange={(e) => handleToggleCapturePref('autoGainControl', e.target.checked)}
                    className="w-5 h-5 mt-0.5 accent-violet-500 rounded cursor-pointer shrink-0"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: OUTPUT ROUTING & EQUALIZER */}
          {activeTab === 'output' && (
            <div className="space-y-5">
              {/* Voice Output (Lounge Voice) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                    <span>Voice Output (Friends&apos; Voices)</span>
                  </label>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      isOutputSelectionSupported
                        ? 'text-cyan-400 bg-cyan-500/10'
                        : 'text-amber-400 bg-amber-500/10'
                    }`}
                  >
                    {isOutputSelectionSupported ? 'Custom Sink Supported' : 'System Default Sink'}
                  </span>
                </div>

                {isOutputSelectionSupported ? (
                  <select
                    data-testid="voice-output-device-select"
                    value={activeVoiceOutputId || ''}
                    onChange={(e) => onSelectVoiceOutputDevice && onSelectVoiceOutputDevice(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer shadow-inner min-h-[44px]"
                  >
                    {audioOutputDevices.length === 0 ? (
                      <option value="">Default System Speaker</option>
                    ) : (
                      audioOutputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId} className="bg-slate-900 text-slate-200">
                          {d.label}
                        </option>
                      ))
                    )}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-400 flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Your browser uses system default output. Connect headphones or select your device in OS settings.
                    </span>
                  </div>
                )}
              </div>

              {/* Karaoke Backing Track Output */}
              <div className="space-y-2 pt-3 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Music2 className="w-4 h-4 text-amber-400" />
                    <span>Karaoke Backing Music Output</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Independent Audio Route</span>
                </div>

                {isOutputSelectionSupported ? (
                  <select
                    data-testid="karaoke-music-output-select"
                    value={localKaraokeOutputId || ''}
                    onChange={(e) => handleKaraokeOutputChange(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer shadow-inner min-h-[44px]"
                  >
                    <option value="">Same as System Output</option>
                    {audioOutputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-slate-900 text-slate-200">
                        {d.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-400 flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Backing track plays through default system output.</span>
                  </div>
                )}
              </div>

              {/* Karaoke Equalizer Preset */}
              <div className="space-y-2 pt-3 border-t border-white/5">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-violet-400" />
                  <span>Karaoke Vocal &amp; Music EQ Preset</span>
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'flat', label: 'Flat (Original)', desc: 'Unmodified balance' },
                    { id: 'vocal_boost', label: 'Vocal Boost', desc: 'Prominent mid frequencies' },
                    { id: 'bass_boost', label: 'Bass Boost', desc: 'Enhanced kick & bass' },
                    { id: 'party', label: 'Party Loud', desc: 'Bright highs & heavy low' },
                  ].map((preset) => {
                    const isSelected = localEqPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        data-testid={`eq-preset-${preset.id}`}
                        onClick={() => handleEqPresetChange(preset.id as KaraokeEqPreset)}
                        className={`p-2.5 rounded-xl border text-left transition-all min-h-[56px] flex flex-col justify-between ${
                          isSelected
                            ? 'bg-violet-600/20 border-violet-500/50 text-white shadow-sm shadow-violet-950/40 ring-1 ring-violet-500/40'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-semibold">{preset.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-violet-400" />}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1">{preset.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Studio Engine Ready</span>
          </div>

          <button
            type="button"
            data-testid="studio-done-button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/20 transition-all min-h-[44px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
