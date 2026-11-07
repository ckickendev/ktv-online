import React from 'react';
import { cn } from '@/lib/utils';

export function RoomCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'glass-card rounded-2xl p-5 flex flex-col justify-between border border-white/5 bg-[#0e121e]/80 animate-pulse min-h-[290px]',
        className
      )}
    >
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 rounded-md bg-white/10" />
            <div className="h-5 w-12 rounded-md bg-white/10" />
          </div>
          <div className="h-5 w-24 rounded-full bg-white/10" />
        </div>

        {/* Title */}
        <div className="h-6 w-3/4 rounded-lg bg-white/15 mb-2.5" />

        {/* Host Skeleton */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-full bg-white/15 shrink-0" />
          <div className="h-3.5 w-28 rounded bg-white/10" />
        </div>

        {/* Description */}
        <div className="space-y-1.5 mb-4">
          <div className="h-3 w-full rounded bg-white/10" />
          <div className="h-3 w-4/5 rounded bg-white/10" />
        </div>

        {/* Track Preview Skeleton */}
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 mb-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/10 shrink-0" />
          <div className="space-y-1 flex-1">
            <div className="h-3 w-32 rounded bg-white/15" />
            <div className="h-2.5 w-20 rounded bg-white/10" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 rounded bg-white/10" />
          <div className="h-4 w-20 rounded-full bg-white/10" />
        </div>
        <div className="h-8 w-24 rounded-lg bg-white/15" />
      </div>
    </div>
  );
}
