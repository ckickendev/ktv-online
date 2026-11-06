'use client';

import React from 'react';
import { useRooms } from '@/hooks/queries/use-rooms';
import { RoomCard } from '@/components/shared/room-card';
import { MOCK_ROOMS } from './mock-rooms';

export function FeaturedRooms() {
  const { data, isLoading } = useRooms({ limit: 3 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-64 rounded-2xl bg-white/5 border border-white/5 animate-pulse flex flex-col p-5 justify-between"
          >
            <div className="space-y-3">
              <div className="h-4 bg-white/10 rounded w-1/3" />
              <div className="h-6 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/10 rounded w-full" />
            </div>
            <div className="h-8 bg-white/10 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  // Use live rooms from API if available; otherwise graceful fallback for landing page preview
  const roomsToDisplay = data?.items && data.items.length > 0 ? data.items.slice(0, 3) : MOCK_ROOMS.slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {roomsToDisplay.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
    </div>
  );
}
