'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  X,
  Gift,
  Sparkles,
  Mic,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GiftId,
  GIFT_CATALOG,
  GiftDefinition,
  RoomQueueRequesterDto,
} from '@ktv/contracts';

export interface GiftSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentPerformer: RoomQueueRequesterDto | null;
  currentSongTitle?: string;
  isCurrentSinger: boolean;
  isSending: boolean;
  sendError: string | null;
  onSendGift: (giftId: GiftId, recipientUserId?: string) => Promise<{ success: boolean; error?: string }>;
  onClearError: () => void;
}

export function GiftSelectorDialog({
  isOpen,
  onClose,
  currentPerformer,
  currentSongTitle,
  isCurrentSinger,
  isSending,
  sendError,
  onSendGift,
  onClearError,
}: GiftSelectorDialogProps) {
  const [selectedGiftId, setSelectedGiftId] = useState<GiftId>('rose');
  const [isSuccess, setIsSuccess] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setSelectedGiftId('rose');
      setIsSuccess(false);
      onClearError();
    }
  }, [isOpen, onClearError]);

  if (!isOpen) return null;

  const performerName =
    currentPerformer?.displayName || currentPerformer?.username || 'Current Performer';
  const performerAvatar = currentPerformer?.avatar;
  const canSend = Boolean(currentPerformer && !isCurrentSinger && !isSending);

  const handleSend = async () => {
    if (!canSend) return;
    const res = await onSendGift(selectedGiftId, currentPerformer?.id);
    if (res.success) {
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1400);
    }
  };

  const selectedGift: GiftDefinition | undefined = GIFT_CATALOG.find(
    (g) => g.id === selectedGiftId
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-dialog-title"
        className="relative w-full sm:max-w-xl bg-[#0c1020] border border-white/15 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10 max-h-[85vh] sm:max-h-[90vh] pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-600/30 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 id="gift-dialog-title" className="text-base font-bold text-white flex items-center gap-2">
                <span>Applaud with a Gift</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  100% Free
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Shared visual appreciation for the performer on stage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Close dialog"
            aria-label="Close gift dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Performer Recipient Banner */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center overflow-hidden shrink-0">
                {performerAvatar ? (
                  <Image
                    src={performerAvatar}
                    alt={performerName}
                    fill
                    className="object-cover rounded-xl"
                    sizes="40px"
                    unoptimized
                  />
                ) : (
                  <Mic className="w-5 h-5 text-violet-300" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Recipient:</span>
                  <span className="text-sm font-bold text-white truncate">
                    {performerName}
                  </span>
                  {currentPerformer && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      Performer
                    </span>
                  )}
                </div>
                {currentSongTitle ? (
                  <p className="text-xs text-slate-300 truncate mt-0.5">
                    Singing &ldquo;{currentSongTitle}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Stage is currently between performances
                  </p>
                )}
              </div>
            </div>

            {/* Free Gift Badge */}
            <div className="hidden xs:flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Complimentary</span>
            </div>
          </div>

          {/* Validation Warning Callouts */}
          {isCurrentSinger ? (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                You are currently performing in the spotlight! Audience members can send gifts to you.
              </span>
            </div>
          ) : !currentPerformer ? (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-white/10 text-slate-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-slate-400" />
              <span>
                No performer is currently live on stage. Gifts will be enabled as soon as the next song begins.
              </span>
            </div>
          ) : null}

          {/* Error Banner */}
          {sendError && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{sendError}</span>
            </div>
          )}

          {/* Gift Catalog Cards Grid */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Choose Appreciation Gift
            </label>
            <div
              role="radiogroup"
              aria-label="Appreciation gifts"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
            >
              {GIFT_CATALOG.map((gift) => {
                const isSelected = selectedGiftId === gift.id;
                return (
                  <button
                    key={gift.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setSelectedGiftId(gift.id);
                      onClearError();
                    }}
                    className={cn(
                      'relative p-3 rounded-2xl border text-left flex flex-col justify-between transition-all min-h-[96px] cursor-pointer group',
                      isSelected
                        ? 'bg-white/10 shadow-lg scale-[1.02]'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/10'
                    )}
                    style={{
                      borderColor: isSelected ? gift.accentColor : undefined,
                      boxShadow: isSelected
                        ? `0 0 16px ${gift.accentColor}33`
                        : undefined,
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-2xl sm:text-3xl filter drop-shadow-sm group-hover:scale-110 transition-transform">
                        {gift.icon}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300">
                        Free
                      </span>
                    </div>
                    <div className="mt-2 min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {gift.name}
                      </div>
                      <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                        {gift.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-black/40 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 min-w-0">
            {selectedGift && (
              <span className="truncate block">
                Selected: <strong className="text-white">{selectedGift.name}</strong>
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            className={cn(
              'px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm shadow-xl transition-all flex items-center gap-2 shrink-0',
              canSend
                ? 'bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-400 hover:to-violet-500 text-white shadow-pink-500/25 active:scale-95'
                : 'bg-white/10 text-slate-500 cursor-not-allowed'
            )}
          >
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-in zoom-in" />
                <span>Gift Sent!</span>
              </>
            ) : isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Delivering...</span>
              </>
            ) : (
              <>
                <Gift className="w-4 h-4" />
                <span>Send to {performerName}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
