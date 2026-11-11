'use client';

import React from 'react';
import { Crown, AlertTriangle, Loader2 } from 'lucide-react';

export interface TransferHostDialogProps {
  isOpen: boolean;
  targetUsername: string;
  targetDisplayName?: string | null;
  isTransferring: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function TransferHostDialog({
  isOpen,
  targetUsername,
  targetDisplayName,
  isTransferring,
  onConfirm,
  onCancel,
}: TransferHostDialogProps) {
  if (!isOpen) return null;

  const displayName = targetDisplayName || targetUsername;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm();
  };

  return (
    <div
      data-testid="transfer-host-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="bg-[#0e121e] border border-white/10 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-host-title"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Crown className="w-5 h-5 fill-amber-400/30" />
          </div>
          <div>
            <h3 id="transfer-host-title" className="text-base font-bold text-white">
              Transfer Room Host
            </h3>
            <p className="text-xs text-slate-400">Ownership Handover</p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-200 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Are you sure you want to transfer full Lounge Host ownership to{' '}
            <strong>{displayName}</strong> (@{targetUsername})? You will step down to an ordinary member.
          </span>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4 pt-1">
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isTransferring}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-white/5 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isTransferring}
              className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 rounded-xl shadow-lg shadow-amber-600/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isTransferring && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isTransferring ? 'Transferring...' : 'Confirm Transfer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
