'use client';

import React, { useState } from 'react';
import { UserX, AlertTriangle } from 'lucide-react';

export interface KickMemberDialogProps {
  isOpen: boolean;
  targetUsername: string;
  isKicking: boolean;
  onConfirm: (reason?: string) => Promise<void>;
  onCancel: () => void;
}

export function KickMemberDialog({
  isOpen,
  targetUsername,
  isKicking,
  onConfirm,
  onCancel,
}: KickMemberDialogProps) {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(reason.trim() || undefined);
    setReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
            <UserX className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Remove Member</h3>
            <p className="text-xs text-slate-400">Host Moderation Action</p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Are you sure you want to remove <strong>{targetUsername}</strong> from the lounge? Their active socket session will be revoked immediately.
          </span>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Disruptive behavior, spam"
              maxLength={200}
              disabled={isKicking}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500 disabled:opacity-50"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isKicking}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isKicking}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isKicking ? 'Removing...' : 'Remove Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
