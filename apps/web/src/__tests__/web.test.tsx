import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomStatusBadge } from '../components/shared/room-status-badge';
import { UserAvatar } from '../components/shared/user-avatar';
import { RoomCard } from '../components/shared/room-card';
import { EmptyState } from '../components/shared/empty-state';
import { RoomDto } from '@ktv/contracts';

describe('Frontend Component Tests', () => {
  it('renders RoomStatusBadge correctly for singing state', () => {
    render(<RoomStatusBadge status="singing" />);
    expect(screen.getByText('Singing Now')).toBeInTheDocument();
  });

  it('renders UserAvatar with initials when no avatarUrl is provided', () => {
    render(<UserAvatar name="Taylor Swift" status="online" />);
    expect(screen.getByText('TS')).toBeInTheDocument();
  });

  it('renders RoomCard with title, category, and action link', () => {
    const mockRoom: RoomDto = {
      id: 'test-1',
      name: 'Cyberpunk Karaoke Lounge',
      description: 'Futuristic vibes',
      ownerId: 'u1',
      roomType: 'vip',
      visibility: 'public',
      capacity: 10,
      status: 'singing',
      currentParticipantsCount: 4,
      category: 'anime',
      currentSongTitle: 'Cruel Angel Thesis',
      currentSingerName: 'Asuka',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(<RoomCard room={mockRoom} />);
    expect(screen.getByText('Cyberpunk Karaoke Lounge')).toBeInTheDocument();
    expect(screen.getByText('anime')).toBeInTheDocument();
    expect(screen.getByText('Cruel Angel Thesis')).toBeInTheDocument();
    expect(screen.getByText('View Lounge')).toBeInTheDocument();
  });

  it('renders EmptyState with title and action button', () => {
    render(
      <EmptyState
        title="No Rooms Found"
        description="Try searching for something else"
        action={{ label: 'Reset', onClick: () => {} }}
      />
    );

    expect(screen.getByText('No Rooms Found')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });
});
