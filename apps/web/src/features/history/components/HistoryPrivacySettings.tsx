'use client';

import React from 'react';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { useUserPreferences, useUpdateUserPreferences } from '@/hooks/queries/use-user-preferences';

export function HistoryPrivacySettings() {
  const { preferences, isLoading } = useUserPreferences();
  const updateMutation = useUpdateUserPreferences();

  const isHistoryPublic = preferences?.isHistoryPublic ?? false;
  const isSessionsPublic = preferences?.isSessionsPublic ?? false;

  const handleToggleHistory = async () => {
    try {
      await updateMutation.mutateAsync({
        isHistoryPublic: !isHistoryPublic,
      });
    } catch {
      // Handled upstream
    }
  };

  const handleToggleSessions = async () => {
    try {
      await updateMutation.mutateAsync({
        isSessionsPublic: !isSessionsPublic,
      });
    } catch {
      // Handled upstream
    }
  };

  if (isLoading) {
    return <div className="p-6 rounded-2xl glass-panel border border-white/5 animate-pulse h-40" />;
  }

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          History &amp; Privacy Controls
        </h3>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Control who can view your past performances and sessions. Private lounge details are always restricted strictly to session attendees.
      </p>

      <div className="space-y-3 pt-2">
        {/* Toggle 1: Song History Visibility */}
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              {isHistoryPublic ? (
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Public Song History</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Allow visitors to see your performed songs on your profile. (Default: Private)
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleHistory}
            disabled={updateMutation.isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none min-h-[44px] items-center ${
              isHistoryPublic ? 'bg-violet-600' : 'bg-slate-700'
            }`}
            role="switch"
            aria-checked={isHistoryPublic}
            aria-label="Toggle Public Song History"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                isHistoryPublic ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Toggle 2: Session Participation Visibility */}
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              {isSessionsPublic ? (
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Public Session Participation</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Allow visitors to see public karaoke lounges you joined. (Default: Private)
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleSessions}
            disabled={updateMutation.isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none min-h-[44px] items-center ${
              isSessionsPublic ? 'bg-violet-600' : 'bg-slate-700'
            }`}
            role="switch"
            aria-checked={isSessionsPublic}
            aria-label="Toggle Public Session Participation"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                isSessionsPublic ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
