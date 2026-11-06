'use client';

import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { RoomDto } from '@ktv/contracts';

interface CloseRoomDialogProps {
  room: RoomDto | null;
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CloseRoomDialog({
  room,
  isOpen,
  isPending,
  onClose,
  onConfirm,
}: CloseRoomDialogProps) {
  if (!isOpen || !room) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[#0e121e] border border-white/10 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-dialog-title"
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
          <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 id="close-dialog-title" className="text-base font-bold text-white">
              Close &ldquo;{room.name}&rdquo;?
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">This action will end the live lounge session.</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-200 mb-6 leading-relaxed">
          Closing this lounge prevents new singers from entering the room. Current participants will see that the stage has concluded.
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Keep Lounge Open
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Closing Stage...</span>
              </>
            ) : (
              <span>Confirm & Close</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
