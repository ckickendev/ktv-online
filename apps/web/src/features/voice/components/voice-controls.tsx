'use client';

import React from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Radio,
  AlertCircle,
  Loader2,
  Settings2,
} from 'lucide-react';
import { VoiceConnectionState } from '@ktv/contracts';
import { VoiceDevice } from '../types/voice.types';

export interface VoiceControlsProps {
  connectionState: VoiceConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  errorMessage: string | null;
  audioDevices: VoiceDevice[];
  activeDeviceId: string | null;
  isRoomMember: boolean;
  onJoinVoice: () => Promise<void>;
  onLeaveVoice: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onSwitchDevice: (deviceId: string) => Promise<void>;
}

export function VoiceControls({
  connectionState,
  isConnected,
  isConnecting,
  isMuted,
  isSpeaking,
  errorMessage,
  audioDevices,
  activeDeviceId,
  isRoomMember,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onSwitchDevice,
}: VoiceControlsProps) {
  return (
    <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-3">
      {errorMessage && (
        <div
          data-testid="voice-error-banner"
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Voice Status & Connect/Disconnect Actions */}
        <div className="flex items-center gap-3">
          {!isConnected ? (
            <button
              type="button"
              data-testid="join-voice-button"
              onClick={onJoinVoice}
              disabled={isConnecting || !isRoomMember}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-semibold shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {connectionState === 'requesting_permission'
                      ? 'Requesting Mic...'
                      : 'Connecting Voice...'}
                  </span>
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4" />
                  <span>Join Voice</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {/* Mic Toggle Button */}
              <button
                type="button"
                data-testid="voice-mute-toggle"
                onClick={onToggleMute}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md ${
                  isMuted
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                    : isSpeaking
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-white ring-2 ring-emerald-400/50 shadow-emerald-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isMuted ? 'Muted' : isSpeaking ? 'Speaking...' : 'Mic Active'}</span>
              </button>

              {/* Leave Voice Button */}
              <button
                type="button"
                data-testid="leave-voice-button"
                onClick={onLeaveVoice}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 text-xs font-medium transition-colors"
                title="Disconnect from voice lounge"
              >
                <PhoneOff className="w-4 h-4" />
                <span className="hidden sm:inline">Leave Voice</span>
              </button>
            </div>
          )}

          {/* Connection State Badge */}
          <div className="flex items-center gap-1.5 text-xs">
            {connectionState === 'connected' && (
              <span
                data-testid="voice-status-connected"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Voice Live
              </span>
            )}
            {connectionState === 'reconnecting' && (
              <span
                data-testid="voice-status-reconnecting"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"
              >
                <Loader2 className="w-3 h-3 animate-spin text-amber-300" />
                Reconnecting...
              </span>
            )}
            {connectionState === 'connecting' && (
              <span
                data-testid="voice-status-connecting"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
              >
                <Loader2 className="w-3 h-3 animate-spin text-cyan-300" />
                Connecting...
              </span>
            )}
            {connectionState === 'requesting_permission' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/20">
                <Radio className="w-3 h-3 animate-pulse text-violet-300" />
                Requesting Mic...
              </span>
            )}
            {connectionState === 'idle' && (
              <span className="text-[11px] text-slate-500">
                {isRoomMember ? 'Voice available — click Join Voice to speak' : 'Join room to enter voice'}
              </span>
            )}
          </div>
        </div>

        {/* Right: Audio Input Device Selector */}
        {isConnected && audioDevices.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Settings2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <select
              value={activeDeviceId || ''}
              onChange={(e) => onSwitchDevice(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none focus:border-violet-500 cursor-pointer max-w-[180px] truncate"
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId} className="bg-slate-900 text-slate-200">
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
