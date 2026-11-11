'use client';

import React from 'react';
import Image from 'next/image';
import { Mic, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GiftNewPayload, getGiftDefinition, VisualEffectsIntensity } from '@ktv/contracts';

export interface StageGiftOverlayProps {
  activeGifts: GiftNewPayload[];
  prefersReducedMotion?: boolean;
  visualEffectsIntensity?: VisualEffectsIntensity;
  className?: string;
}

export function StageGiftOverlay({
  activeGifts,
  prefersReducedMotion = false,
  visualEffectsIntensity = 'full',
  className,
}: StageGiftOverlayProps) {
  if (activeGifts.length === 0) return null;

  const latestGift = activeGifts[activeGifts.length - 1];
  const latestGiftDef = latestGift ? getGiftDefinition(latestGift.giftId) : undefined;

  return (
    <div
      className={cn(
        'absolute inset-0 pointer-events-none select-none overflow-hidden z-30',
        className
      )}
      aria-hidden="true"
    >
      {/* Screen reader announcement live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestGift && latestGiftDef
          ? `${latestGift.sender.displayName || latestGift.sender.username} sent ${latestGiftDef.name} to ${latestGift.recipient.displayName || latestGift.recipient.username}!`
          : ''}
      </div>

      {activeGifts.map((gift) => {
        const giftDef = getGiftDefinition(gift.giftId);
        if (!giftDef) return null;

        const senderName = gift.sender.displayName || gift.sender.username;
        const recipientName = gift.recipient.displayName || gift.recipient.username;
        const accentColor = giftDef.accentColor;

        return (
          <div key={gift.id} className="absolute inset-0 flex flex-col items-center">
            {/* Expressive Stage Gift Announcement Banner */}
            <div
              className={cn(
                'mt-3 sm:mt-5 max-w-[92%] sm:max-w-lg px-4 py-2.5 rounded-2xl sm:rounded-3xl border shadow-2xl backdrop-blur-md flex items-center gap-3 sm:gap-4 transition-all',
                prefersReducedMotion ? 'animate-pulse-fade' : 'animate-gift-banner'
              )}
              style={{
                backgroundColor: 'rgba(10, 14, 28, 0.88)',
                borderColor: `${accentColor}77`,
                boxShadow: `0 0 32px ${accentColor}44, 0 12px 24px rgba(0,0,0,0.6)`,
              }}
            >
              {/* Sender Pill */}
              <div className="flex items-center gap-2 min-w-0 shrink">
                <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                  {gift.sender.avatar ? (
                    <Image
                      src={gift.sender.avatar}
                      alt={senderName}
                      fill
                      className="object-cover rounded-xl"
                      sizes="32px"
                      unoptimized
                    />
                  ) : (
                    <span className="text-xs font-bold text-white">
                      {senderName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 hidden xs:block">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                    Sender
                  </span>
                  <span className="text-xs font-bold text-white truncate max-w-[90px] block">
                    {senderName}
                  </span>
                </div>
              </div>

              {/* Gift Centerpiece */}
              <div className="flex flex-col items-center justify-center shrink-0 px-2 sm:px-3 border-x border-white/10">
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl sm:text-3xl filter drop-shadow-md">
                    {giftDef.icon}
                  </span>
                </div>
                <span
                  className="text-[11px] sm:text-xs font-black tracking-wide uppercase truncate max-w-[130px]"
                  style={{ color: accentColor }}
                >
                  {giftDef.name}
                </span>
              </div>

              {/* Recipient Performer Pill */}
              <div className="flex items-center gap-2 min-w-0 shrink">
                <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center overflow-hidden shrink-0">
                  {gift.recipient.avatar ? (
                    <Image
                      src={gift.recipient.avatar}
                      alt={recipientName}
                      fill
                      className="object-cover rounded-xl"
                      sizes="32px"
                      unoptimized
                    />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-violet-300" />
                  )}
                </div>
                <div className="min-w-0 hidden xs:block">
                  <span className="text-[10px] text-violet-300 block uppercase font-semibold">
                    Performer
                  </span>
                  <span className="text-xs font-bold text-white truncate max-w-[90px] block">
                    {recipientName}
                  </span>
                </div>
              </div>
            </div>

            {/* Celebratory Floating Gift Particles Across the Stage */}
            {!prefersReducedMotion && visualEffectsIntensity !== 'minimal' && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(visualEffectsIntensity === 'reduced' ? 2 : 6)].map((_, i) => {
                  const leftPercentage = 15 + ((i * 14 + 7) % 70); // 15% - 85%
                  const delaySec = (i * 0.2).toFixed(2);
                  return (
                    <div
                      key={i}
                      style={{
                        left: `${leftPercentage}%`,
                        bottom: '10px',
                        animationDelay: `${delaySec}s`,
                      }}
                      className="absolute animate-gift-particle flex flex-col items-center"
                    >
                      <span className="text-2xl sm:text-3xl filter drop-shadow-lg">
                        {giftDef.icon}
                      </span>
                      {i % 2 === 0 && (
                        <Sparkles
                          className="w-3.5 h-3.5 animate-spin text-amber-300 mt-1"
                          style={{ color: accentColor }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
