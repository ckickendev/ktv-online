'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Mic,
  Volume2,
  Music2,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  VoiceDevice,
  AudioCapturePreferences,
  MicrophonePermissionState,
} from '../types/voice.types';

export interface AudioDeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Microphone Input
  audioInputDevices: VoiceDevice[];
  activeAudioInputId: string | null;
  onSelectInputDevice: (deviceId: string) => Promise<void>;
  permissionState: MicrophonePermissionState;
  capturePreferences: AudioCapturePreferences;
  onUpdateCapturePreferences: (prefs: Partial<AudioCapturePreferences>) => Promise<void>;
  // Voice Output
  audioOutputDevices: VoiceDevice[];
  activeVoiceOutputId: string | null;
  onSelectVoiceOutputDevice: (deviceId: string) => Promise<void>;
  isOutputSelectionSupported: boolean;
  // Karaoke Backing Track Output
  activeKaraokeOutputId?: string | null;
  onSelectKaraokeOutputDevice?: (deviceId: string) => Promise<void>;
}

export function AudioDeviceSettingsModal({
  isOpen,
  onClose,
  audioInputDevices,
  activeAudioInputId,
  onSelectInputDevice,
  permissionState,
  capturePreferences,
  onUpdateCapturePreferences,
  audioOutputDevices,
  activeVoiceOutputId,
  onSelectVoiceOutputDevice,
  isOutputSelectionSupported,
  activeKaraokeOutputId,
  onSelectKaraokeOutputDevice,
}: AudioDeviceSettingsModalProps) {
  const [localKaraokeOutputId, setLocalKaraokeOutputId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return activeKaraokeOutputId || localStorage.getItem('ktv_karaoke_output_device') || null;
  });

  useEffect(() => {
    if (activeKaraokeOutputId !== undefined) {
      setLocalKaraokeOutputId(activeKaraokeOutputId);
    }
  }, [activeKaraokeOutputId]);

  if (!isOpen) return null;

  const handleKaraokeOutputChange = async (deviceId: string) => {
    setLocalKaraokeOutputId(deviceId);
    if (onSelectKaraokeOutputDevice) {
      await onSelectKaraokeOutputDevice(deviceId);
    } else if (typeof window !== 'undefined') {
      localStorage.setItem('ktv_karaoke_output_device', deviceId);
      window.dispatchEvent(new CustomEvent('ktv_karaoke_sink_changed', { detail: deviceId }));
    }
  };

  return (
    <div
      data-testid="audio-device-settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div
        className="w-full max-w-xl bg-[#0a0d17] border border-violet-500/20 rounded-3xl p-6 shadow-2xl shadow-violet-950/40 relative flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-settings-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 id="audio-settings-title" className="text-base font-bold text-white">
                Audio & Device Settings
              </h2>
              <p className="text-xs text-slate-400">
                Configure microphone capture quality and audio output routing
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-audio-settings-button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SECTION 1: MICROPHONE INPUT */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-violet-400" />
              <span>Microphone Input</span>
            </label>
            <div className="flex items-center gap-1 text-[11px]">
              {permissionState === 'granted' ? (
                <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Permission Granted
                </span>
              ) : permissionState === 'denied' ? (
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

          <select
            data-testid="microphone-device-select"
            value={activeAudioInputId || ''}
            onChange={(e) => onSelectInputDevice(e.target.value)}
            className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer shadow-inner"
          >
            {audioInputDevices.length === 0 ? (
              <option value="">No microphones detected</option>
            ) : (
              audioInputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId} className="bg-slate-900 text-slate-200">
                  {d.label}
                </option>
              ))
            )}
          </select>

          {/* Capture Quality Toggles */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2.5">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Browser Capture Enhancements
            </span>

            {/* Echo Cancellation */}
            <label className="flex items-start justify-between gap-3 cursor-pointer group">
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
                  Acoustic Echo Cancellation (AEC)
                </span>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Prevents room speakers and backing track audio from leaking back into your voice stream.
                </p>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-echo-cancellation"
                checked={capturePreferences.echoCancellation}
                onChange={(e) => onUpdateCapturePreferences({ echoCancellation: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-violet-500 rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Noise Suppression */}
            <label className="flex items-start justify-between gap-3 cursor-pointer group">
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
                  Noise Suppression
                </span>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Filters steady ambient room hums, PC fans, and background noise.
                </p>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-noise-suppression"
                checked={capturePreferences.noiseSuppression}
                onChange={(e) => onUpdateCapturePreferences({ noiseSuppression: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-violet-500 rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Automatic Gain Control */}
            <label className="flex items-start justify-between gap-3 cursor-pointer group">
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
                  Automatic Gain Control (AGC)
                </span>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Automatically balances dynamic singing volume variations to avoid clipping.
                </p>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-auto-gain-control"
                checked={capturePreferences.autoGainControl}
                onChange={(e) => onUpdateCapturePreferences({ autoGainControl: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-violet-500 rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        </div>

        {/* SECTION 2: VOICE OUTPUT */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <span>Voice Lounge Output (Friends' Voices)</span>
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
              onChange={(e) => onSelectVoiceOutputDevice(e.target.value)}
              className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer shadow-inner"
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
                Your browser does not support selective audio output routing (setSinkId). Remote voice will play through your OS default output device.
              </span>
            </div>
          )}
        </div>

        {/* SECTION 3: KARAOKE BACKING TRACK OUTPUT */}
        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Music2 className="w-4 h-4 text-emerald-400" />
              <span>Karaoke Backing Music Output</span>
            </label>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                isOutputSelectionSupported
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-500 bg-slate-800'
              }`}
            >
              {isOutputSelectionSupported ? 'Independent Output' : 'System Output'}
            </span>
          </div>

          {isOutputSelectionSupported ? (
            <select
              data-testid="karaoke-output-device-select"
              value={localKaraokeOutputId || ''}
              onChange={(e) => handleKaraokeOutputChange(e.target.value)}
              className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-inner"
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
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                Karaoke backing track plays through the default system audio output.
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-white/10 flex justify-end">
          <button
            type="button"
            data-testid="save-audio-settings-button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-semibold text-xs shadow-lg shadow-violet-600/25 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
