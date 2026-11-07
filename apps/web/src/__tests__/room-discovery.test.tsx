import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoomDiscoveryPage from '../app/(platform)/rooms/page';
import { roomApi } from '../lib/api/endpoints/rooms';
import { RoomDto } from '@ktv/contracts';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => '/rooms',
  useSearchParams: () => mockSearchParams,
}));

const mockRooms: RoomDto[] = [
  {
    id: 'room-1',
    name: 'Neon Tokyo Beats',
    description: 'Anime hits and J-pop sing-alongs late night',
    ownerId: 'usr-host-1',
    host: {
      id: 'usr-host-1',
      username: 'dj_tokyo',
      avatar: 'https://images.unsplash.com/photo-1.jpg',
    },
    roomType: 'vip',
    visibility: 'public',
    capacity: 10,
    status: 'singing',
    category: 'anime',
    currentParticipantsCount: 4,
    currentSongTitle: 'Gurenge',
    currentSingerName: 'Akira',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'room-2',
    name: 'Acoustic Coffee Lounge',
    description: 'Chill acoustic ballads and relaxing vibes',
    ownerId: 'usr-host-2',
    host: {
      id: 'usr-host-2',
      username: 'acoustic_dan',
      avatar: null,
    },
    roomType: 'standard',
    visibility: 'public',
    capacity: 8,
    status: 'idle',
    category: 'ballad',
    currentParticipantsCount: 2,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'room-3',
    name: 'Full Rock Stadium',
    description: 'Classic rock maxed out room',
    ownerId: 'usr-host-3',
    host: {
      id: 'usr-host-3',
      username: 'rock_god',
    },
    roomType: 'party',
    visibility: 'public',
    capacity: 6,
    status: 'singing',
    category: 'rock',
    currentParticipantsCount: 6,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
];

describe('Room Discovery & Search UI (Sprint 1.4)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockSearchParams = new URLSearchParams();
    mockPush.mockClear();
    mockReplace.mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  it('renders discovery header, navigation CTAs, and loading skeletons initially', () => {
    vi.spyOn(roomApi, 'getRooms').mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<RoomDiscoveryPage />);

    expect(screen.getByText('Discover Your Next Stage')).toBeInTheDocument();
    expect(screen.getByText('Host Your Lounge')).toBeInTheDocument();
    expect(screen.getByText('My Lounges')).toBeInTheDocument();

    const skeletons = screen.getByTestId('loading-skeletons');
    expect(skeletons).toBeInTheDocument();
  });

  it('renders room cards with host info, availability indicators, and participant count', async () => {
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: {
        page: 1,
        limit: 12,
        total: 3,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    await waitFor(() => {
      expect(screen.getByText('Neon Tokyo Beats')).toBeInTheDocument();
      expect(screen.getByText('Acoustic Coffee Lounge')).toBeInTheDocument();
      expect(screen.getByText('Full Rock Stadium')).toBeInTheDocument();
    });

    // Check host attribution
    expect(screen.getByText('dj_tokyo')).toBeInTheDocument();
    expect(screen.getByText('acoustic_dan')).toBeInTheDocument();
    expect(screen.getByText('rock_god')).toBeInTheDocument();

    // Check availability badges: room-1 and room-2 are Available; room-3 is Full (6/6)
    const availableBadges = screen.getAllByText('Available');
    expect(availableBadges.length).toBe(2);
    expect(screen.getByText('Full')).toBeInTheDocument();

    // Check View Lounge links
    const viewLinks = screen.getAllByRole('link', { name: /View Lounge/i });
    expect(viewLinks.length).toBe(3);
    expect(viewLinks[0]).toHaveAttribute('href', '/rooms/room-1');
  });

  it('debounces search input and updates router URL params after 300ms', async () => {
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: { page: 1, limit: 12, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    const searchInput = screen.getByPlaceholderText(/Search rooms, music moods/i);
    fireEvent.change(searchInput, { target: { value: 'tokyo anime' } });

    // Immediately, router.replace should not have been called yet
    expect(mockReplace).not.toHaveBeenCalled();

    // After 350ms, router.replace should be called with debounced search
    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.stringContaining('search=tokyo+anime'),
          expect.anything()
        );
      },
      { timeout: 1000 }
    );
  });

  it('allows clearing search input with clear button', async () => {
    mockSearchParams = new URLSearchParams('search=existing_query');
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: { page: 1, limit: 12, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    const clearButton = screen.getByRole('button', { name: /clear search/i });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    const searchInput = screen.getByPlaceholderText(/Search rooms, music moods/i);
    expect((searchInput as HTMLInputElement).value).toBe('');
  });

  it('updates URL when selecting category pill', async () => {
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: { page: 1, limit: 12, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    const animePill = screen.getByRole('button', { name: 'Anime & J-Rock' });
    fireEvent.click(animePill);

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('category=anime'),
      expect.anything()
    );
  });

  it('handles room style, availability, and status filter dropdowns', async () => {
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: { page: 1, limit: 12, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    // Style filter
    const styleSelect = screen.getByRole('combobox', { name: /filter by style/i });
    fireEvent.change(styleSelect, { target: { value: 'vip' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('roomType=vip'),
      expect.anything()
    );

    // Availability filter
    const availSelect = screen.getByRole('combobox', { name: /filter by availability/i });
    fireEvent.change(availSelect, { target: { value: 'available' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('availability=available'),
      expect.anything()
    );

    // Status filter
    const statusSelect = screen.getByRole('combobox', { name: /filter by status/i });
    fireEvent.change(statusSelect, { target: { value: 'singing' } });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('status=singing'),
      expect.anything()
    );
  });

  it('displays active filter chips and allows individual removal', async () => {
    mockSearchParams = new URLSearchParams('category=pop&roomType=vip');
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: { page: 1, limit: 12, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    expect(screen.getByText('Active filters:')).toBeInTheDocument();
    expect(screen.getByText(/Category: Pop & Billboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Style: VIP Lounge/i)).toBeInTheDocument();

    const removeCategoryBtn = screen.getByRole('button', {
      name: /remove filter category: pop & billboard/i,
    });
    fireEvent.click(removeCategoryBtn);

    expect(mockReplace).toHaveBeenCalled();
  });

  it('clears all filters when clicking "Clear all filters"', async () => {
    mockSearchParams = new URLSearchParams('search=ballad&category=rock');
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: { page: 1, limit: 12, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    const clearAllBtn = screen.getByRole('button', { name: /clear all filters/i });
    fireEvent.click(clearAllBtn);

    expect(mockReplace).toHaveBeenCalledWith('/rooms', expect.anything());
  });

  it('changes sorting when selecting sortBy option', async () => {
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: { page: 1, limit: 12, total: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    const sortSelect = screen.getByRole('combobox', { name: /sort lounges/i });
    fireEvent.change(sortSelect, { target: { value: 'popular' } });

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('sortBy=popular'),
      expect.anything()
    );
  });

  it('renders pagination controls and updates page param on click', async () => {
    mockSearchParams = new URLSearchParams('page=1');
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: mockRooms,
      pagination: {
        page: 1,
        limit: 12,
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: false,
      },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    await waitFor(() => {
      expect(
        screen.getByText((_content, element) => {
          return (
            element?.tagName.toLowerCase() === 'span' &&
            Boolean(element.textContent?.includes('Showing 3 of 25 lounges'))
          );
        })
      ).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /next page/i });
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      expect.anything()
    );
  });

  it('renders empty state when no rooms are returned', async () => {
    vi.spyOn(roomApi, 'getRooms').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    renderWithProviders(<RoomDiscoveryPage />);

    await waitFor(() => {
      expect(screen.getByText('No Lounges Found')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
    });
  });

  it('renders friendly error state with retry action on failure', async () => {
    vi.spyOn(roomApi, 'getRooms').mockRejectedValue(new Error('Network connection timeout'));

    renderWithProviders(<RoomDiscoveryPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Karaoke Lounges')).toBeInTheDocument();
      expect(screen.getByText('Network connection timeout')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
    });
  });
});
