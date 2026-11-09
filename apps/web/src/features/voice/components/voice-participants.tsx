'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { Mic, MicOff, Volume2, Radio } from 'lucide-react';
import { VoiceParticipantInfo } from '../types/voice.types';

export interface VoiceParticipantsProps {
  participants: VoiceParticipantInfo[];
  isConnected: boolean;
  className?: string;
}

export function VoiceParticipants({ participants, isConnected, className = '' }: VoiceParticipantsProps) {
  // Group multiple sessions/tabs by authenticated userId
  const groupedParticipants = useMemo(() => {
    const groups = new Map<string, VoiceParticipantInfo[]>();
    for (const p of participants) {
      const existing = groups.get(p.userId);
      if (existing) {
        existing.push(p);
      } else {
        groups.set(p.userId, [p]);
      }
    }

    return Array.from(groups.values()).map((group) => {
      const primary = group[0]!;
      const hasSpeaking = group.some((p) => p.isSpeaking);
      const isAllMuted = group.every((p) => p.isMuted);
      const isLocal = group.some((p) => p.isLocal);

      return {
        userId: primary.userId,
        displayName: primary.displayName,
        username: primary.username,
        avatarUrl: primary.avatarUrl,
        isSpeaking: hasSpeaking,
        isMuted: isAllMuted,
        isLocal,
        sessionCount: group.length,
      };
    });
  }, [participants]);

  if (groupedParticipants.length === 0) {
    return (
      <div className={`p-4 rounded-xl border border-white/5 bg-black/20 text-center ${className}`}>
        <Radio className="w-5 h-5 text-slate-600 mx-auto mb-1.5" />
        <p className="text-xs font-medium text-slate-400">Voice Lounge Idle</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {isConnected
            ? 'You are the first one in voice.'
            : 'No singers currently in voice. Join to speak.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>In Voice ({groupedParticipants.length})</span>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
        {groupedParticipants.map((p) => {
          return (
            <div
              key={p.userId}
              data-testid={`voice-participant-${p.userId}`}
              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                p.isSpeaking
                  ? 'bg-emerald-950/40 border-emerald-500/50 shadow-md shadow-emerald-950/50 ring-1 ring-emerald-500/40'
                  : 'bg-white/5 border-white/5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Avatar with speaking ring */}
                <div className="relative shrink-0">
                  {p.avatarUrl ? (
                    <Image
                      src={p.avatarUrl}
                      alt={p.displayName}
                      width={28}
                      height={28}
                      className={`w-7 h-7 rounded-full object-cover ${
                        p.isSpeaking ? 'ring-2 ring-emerald-400 animate-pulse' : ''
                      }`}
                    />
                  ) : (
                    <div
                      className={`w-7 h-7 rounded-full bg-violet-600/50 flex items-center justify-center text-xs font-bold text-white uppercase ${
                        p.isSpeaking ? 'ring-2 ring-emerald-400 animate-pulse' : ''
                      }`}
                    >
                      {p.displayName.charAt(0) || p.username.charAt(0)}
                    </div>
                  )}

                  {/* Speaking indicator dot */}
                  {p.isSpeaking && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black animate-pulse" />
                  )}
                </div>

                {/* Name & Session Details */}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate flex items-center">
                    <span className="truncate">{p.displayName}</span>
                    {p.isLocal && <span className="text-[10px] text-violet-400 ml-1 shrink-0">(You)</span>}
                    {p.sessionCount > 1 && (
                      <span className="text-[9px] text-slate-500 bg-white/5 px-1 py-0.2 rounded ml-1 shrink-0">
                        {p.sessionCount} tabs
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {p.isSpeaking ? 'Speaking' : p.isMuted ? 'Muted' : 'Listening'}
                  </p>
                </div>
              </div>

              {/* Mic Status Icon */}
              <div className="shrink-0">
                {p.isMuted ? (
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Mic className={`w-3.5 h-3.5 ${p.isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
