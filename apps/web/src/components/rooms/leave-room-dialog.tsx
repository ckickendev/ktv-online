'use client';

import React from 'react';
import { LogOut, Loader2, X } from 'lucide-react';

interface LeaveRoomDialogProps {
  roomName: string;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LeaveRoomDialog({
  roomName,
  isOpen,
  isPending,
  onClose,
  onConfirm,
}: LeaveRoomDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="leave-room-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md bg-[#0e121e] border border-white/10 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-dialog-title"
      >
        {/* Close icon button */}
        <button
          onClick={onClose}
          disabled={isPending}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 id="leave-dialog-title" className="text-base font-bold text-white">
              Leave &ldquo;{roomName}&rdquo;?
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              You will exit the stage and release your lounge slot.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300 mb-6 leading-relaxed">
          Leaving will release your spot for other singers. You can re-join at any time as long as the lounge has available capacity.
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-leave-button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-all shadow-lg shadow-amber-600/20 disabled:opacity-50"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isPending ? 'Leaving...' : 'Leave Lounge'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
