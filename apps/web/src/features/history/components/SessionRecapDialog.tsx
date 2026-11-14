'use client';

import React from 'react';
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  Music2,
  Users2,
  Disc3,
  CheckCircle2,
  SkipForward,
  AlertTriangle,
  Radio,
  Lock,
} from 'lucide-react';
import { useSessionRecap } from '../hooks/use-history';
import { formatMsToTime } from '@/features/karaoke/components/CurrentSongPanel';
import { UserAvatar } from '@/components/shared/user-avatar';

interface SessionRecapDialogProps {
  sessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatDurationMinutes(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs <= 0) return 'In progress';
  const mins = Math.round(durationMs / 60000);
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}m`;
}

export function SessionRecapDialog({
  sessionId,
  isOpen,
  onClose,
}: SessionRecapDialogProps) {
  const { data: recap, isLoading, isError, error } = useSessionRecap(sessionId, isOpen);

  if (!isOpen) return null;

  const session = recap?.session;
  const performances = recap?.performances || [];
  const participants = session?.participants || [];

  return (
    <div
      data-testid="session-recap-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        data-testid="session-recap-dialog"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl bg-[#0c101c] border border-violet-500/25 shadow-2xl shadow-violet-950/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-violet-600/20 text-violet-300 border border-violet-500/30">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Karaoke Session Recap
              </h3>
              <p className="text-xs text-slate-400">
                Memories, performances &amp; lounge attendees
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-session-recap-dialog"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close session recap"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Disc3 className="w-8 h-8 animate-spin text-violet-400" />
              <span className="text-xs">Loading session memories...</span>
            </div>
          ) : isError ? (
            <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-white">Could Not Load Session Recap</h4>
              <p className="text-xs text-rose-300/90 mt-1 max-w-sm mx-auto">
                {error instanceof Error ? error.message : 'You may not have permission to view this private session.'}
              </p>
            </div>
          ) : session ? (
            <>
              {/* Session Overview Card */}
              <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden bg-gradient-to-r from-violet-950/30 via-slate-900 to-cyan-950/20">
                <div className="flex items-center gap-2 mb-2">
                  {session.visibility === 'private' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold uppercase tracking-wider">
                      <Lock className="w-3 h-3" />
                      <span>Private Lounge</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
                      <Radio className="w-3 h-3" />
                      <span>Public Lounge</span>
                    </span>
                  )}
                  <span className="text-xs text-slate-400 capitalize">
                    {session.atmospherePreset.replace('_', ' ')}
                  </span>
                </div>

                <h2 className="text-xl font-extrabold text-white">{session.roomName}</h2>
                <p className="text-xs text-slate-300 mt-1">
                  Hosted by <strong className="text-white">{session.hostDisplayName || session.hostUsername}</strong>
                </p>

                <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{new Date(session.startedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-violet-400" />
                    <span>{formatDurationMinutes(session.durationMs)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Music2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{performances.length} Songs Performed</span>
                  </div>
                </div>
              </div>

              {/* Performances List */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Music2 className="w-4 h-4 text-violet-400" />
                    <span>Tonight&apos;s Performances ({performances.length})</span>
                  </h3>
                </div>

                {performances.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-slate-500 text-xs">
                    No songs were performed during this session.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {performances.map((p, index) => {
                      const isCompleted = p.outcome === 'completed';
                      const isSkipped = p.outcome === 'skipped';

                      return (
                        <div
                          key={p.id}
                          className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-5 text-center text-slate-500 font-bold shrink-0">
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <h4 className="font-bold text-white truncate max-w-[220px] sm:max-w-xs">
                                {p.songTitle}
                              </h4>
                              <p className="text-[11px] text-slate-400 truncate">
                                {p.artist} &bull; Sung by{' '}
                                <strong className="text-slate-200">
                                  {p.singerDisplayName || p.singerUsername}
                                </strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-slate-400">
                              {formatMsToTime(p.durationPerformedMs)}
                            </span>
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Completed</span>
                              </span>
                            ) : isSkipped ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-500/20">
                                <SkipForward className="w-3 h-3" />
                                <span>Skipped</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-400 text-[10px] border border-slate-500/20">
                                <span>Interrupted</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* People in the Lounge */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Users2 className="w-4 h-4 text-cyan-400" />
                    <span>People in the Lounge ({participants.length})</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {participants.map((part) => {
                    const didSing = (part.songsPerformedCount || 0) > 0;
                    return (
                      <div
                        key={part.userId}
                        className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={part.displayName || part.username}
                            avatarUrl={part.avatar}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate max-w-[140px]">
                              {part.displayName || part.username}
                            </p>
                            <span className="text-[10px] text-slate-500 capitalize">
                              {part.role}
                            </span>
                          </div>
                        </div>

                        {didSing ? (
                          <span className="px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-300 text-[10px] font-semibold border border-violet-500/25">
                            {part.songsPerformedCount} {part.songsPerformedCount === 1 ? 'song' : 'songs'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">
                            Listener
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-white/[0.01] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs transition-colors min-h-[44px]"
          >
            Close Recap
          </button>
        </div>
      </div>
    </div>
  );
}
