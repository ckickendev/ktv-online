'use client';

import React from 'react';
import {
  X,
  Mic2,
  ListMusic,
  Volume2,
  Heart,
  Crown,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface RoomGuideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDismissForever?: () => void;
}

export function RoomGuideDialog({
  isOpen,
  onClose,
  onDismissForever,
}: RoomGuideDialogProps) {
  if (!isOpen) return null;

  const handleGotIt = () => {
    if (onDismissForever) {
      onDismissForever();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-[#0e121e] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-guide-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close guide"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 id="room-guide-title" className="text-base sm:text-lg font-bold text-white">
              Karaoke Lounge Quick Guide
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Everything you need to know to sing, listen, and vibe with the room.
            </p>
          </div>
        </div>

        {/* Scrollable Guide Content */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin scrollbar-thumb-white/10">
          {/* Guide Item 1: Voice */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-300 flex items-center justify-center shrink-0 mt-0.5">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">1. Live Voice Stage</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Connect your voice to hear the lounge live. Audience members are listen-only to
                prevent audio clutter; stage mic permissions are granted automatically when it&apos;s
                your turn to sing!
              </p>
            </div>
          </div>

          {/* Guide Item 2: Song Queue */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 mt-0.5">
              <ListMusic className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">2. Queue Your Favorite Songs</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Open the song queue and click <strong>Add Song</strong> to search our catalog by title
                or artist. Your selected song is added to the shared room queue in order.
              </p>
            </div>
          </div>

          {/* Guide Item 3: Spotlight & Lyrics */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <Mic2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">3. Singer Spotlight &amp; Lyrics</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                When your track begins, the stage spotlight turns to you. Synchronized, timed
                lyrics appear on screen so you never miss a beat.
              </p>
            </div>
          </div>

          {/* Guide Item 4: Cheer & Reactions */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0 mt-0.5">
              <Heart className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">4. Reactions, Cheers &amp; Gifts</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Send floating heart reactions, applause, and virtual gifts to celebrate singers
                currently performing on stage.
              </p>
            </div>
          </div>

          {/* Guide Item 5: Host & Invite */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">5. Host Controls &amp; Invitations</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                The lounge host controls the stage theme, queue management, and can generate
                secure invitation links to invite friends directly.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="pt-5 mt-4 border-t border-white/5 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            You can reopen this guide anytime from the top bar.
          </span>
          <button
            type="button"
            onClick={handleGotIt}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all min-h-[44px]"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Got It! Start Singing</span>
          </button>
        </div>
      </div>
    </div>
  );
}
