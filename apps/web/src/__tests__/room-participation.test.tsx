import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoomDetailPage from '../app/(platform)/rooms/[roomId]/page';
import MyRoomsPage from '../app/(platform)/my-rooms/page';
import { RoomMemberList } from '../components/shared/room-member-list';
import { roomApi } from '../lib/api/endpoints/rooms';
import { authApi } from '../lib/api/endpoints/auth';
import { useAuthStore } from '../stores/use-auth-store';
import { queryKeys } from '../hooks/queries/query-keys';
import { RoomDto, RoomMembershipDto } from '@ktv/contracts';
import { tokenStore } from '../lib/api/token-store';
import { getQueryClient } from '../providers/query-provider';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ roomId: 'room-1' }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => '/rooms/room-1',
  useSearchParams: () => new URLSearchParams(),
}));

const mockHostUser = {
  id: 'usr-host-1',
  username: 'host_karaoke',
  email: 'host@example.com',
  role: 'user' as const,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockMemberUser = {
  id: 'usr-member-1',
  username: 'singing_star',
  email: 'star@example.com',
  role: 'user' as const,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockRoom: RoomDto = {
  id: 'room-1',
  name: 'Neon Tokyo Lounge',
  description: 'Late night singing and chill beats',
  ownerId: 'usr-host-1',
  host: {
    id: 'usr-host-1',
    username: 'host_karaoke',
    avatar: null,
  },
  roomType: 'vip',
  visibility: 'public',
  capacity: 10,
  status: 'idle',
  category: 'pop',
  currentParticipantsCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockMembersList: RoomMembershipDto[] = [
  {
    id: 'mem-1',
    roomId: 'room-1',
    userId: 'usr-host-1',
    user: {
      id: 'usr-host-1',
      username: 'host_karaoke',
      avatar: null,
    },
    role: 'host',
    status: 'active',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'mem-2',
    roomId: 'room-1',
    userId: 'usr-member-1',
    user: {
      id: 'usr-member-1',
      username: 'singing_star',
      avatar: null,
    },
    role: 'member',
    status: 'active',
    joinedAt: '2026-01-01T00:05:00.000Z',
  },
];

describe('Room Participation & Membership Experience', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    vi.spyOn(roomApi, 'getRoomById').mockResolvedValue(mockRoom);
    vi.spyOn(roomApi, 'getMembers').mockResolvedValue(mockMembersList);
    vi.spyOn(roomApi, 'getMyMembership').mockResolvedValue({ isMember: false });
    vi.spyOn(roomApi, 'joinRoom').mockResolvedValue({
      id: 'mem-new',
      roomId: 'room-1',
      userId: 'usr-member-1',
      role: 'member',
      status: 'active',
      joinedAt: '2026-01-01T00:10:00.000Z',
    });
    vi.spyOn(roomApi, 'leaveRoom').mockResolvedValue(null);
    vi.spyOn(roomApi, 'getMyRooms').mockResolvedValue({
      items: [mockRoom],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
    vi.spyOn(roomApi, 'getJoinedRooms').mockResolvedValue({
      items: [mockRoom],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    useAuthStore.setState({
      status: 'unauthenticated',
      isAuthenticated: false,
      user: null,
      isInitialized: true,
      isNetworkError: false,
    });
    tokenStore.clearAccessToken();
  });

  function renderWithClient(ui: React.ReactElement) {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    );
  }

  describe('3.4 RoomMemberList Component', () => {
    it('renders member roster with usernames, host indicator, and (You) badge', async () => {
      renderWithClient(
        <RoomMemberList roomId="room-1" currentUserId="usr-member-1" />
      );

      await waitFor(() => {
        expect(screen.getByText('host_karaoke')).toBeInTheDocument();
        expect(screen.getByText('singing_star')).toBeInTheDocument();
      });

      // Host badge check
      expect(screen.getByTestId('host-badge')).toBeInTheDocument();

      // (You) indicator check
      expect(screen.getByText('(You)')).toBeInTheDocument();

      // Count badge check
      expect(screen.getByTestId('member-count-badge')).toHaveTextContent('2');
    });

    it('renders empty state when room has no active members', async () => {
      vi.spyOn(roomApi, 'getMembers').mockResolvedValueOnce([]);

      renderWithClient(<RoomMemberList roomId="room-1" />);

      await waitFor(() => {
        expect(screen.getByTestId('member-list-empty')).toBeInTheDocument();
        expect(
          screen.getByText('No members currently in lounge')
        ).toBeInTheDocument();
      });
    });

    it('renders error state and retries on failure', async () => {
      vi.spyOn(roomApi, 'getMembers')
        .mockRejectedValueOnce(new Error('Network error loading roster'))
        .mockResolvedValueOnce(mockMembersList);

      renderWithClient(<RoomMemberList roomId="room-1" />);

      await waitFor(() => {
        expect(screen.getByTestId('member-list-error')).toBeInTheDocument();
        expect(
          screen.getByText('Network error loading roster')
        ).toBeInTheDocument();
      });

      // Click try again
      fireEvent.click(screen.getByText('Try again'));

      await waitFor(() => {
        expect(screen.getByText('host_karaoke')).toBeInTheDocument();
      });
    });

    it('refreshes member list when manual refresh button is clicked', async () => {
      const getMembersSpy = vi.spyOn(roomApi, 'getMembers');

      renderWithClient(<RoomMemberList roomId="room-1" />);

      await waitFor(() => {
        expect(screen.getByText('host_karaoke')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('refresh-members-button'));

      await waitFor(() => {
        expect(getMembersSpy).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('3.1 - 3.3 Room Detail / Lounge Lobby', () => {
    it('redirects unauthenticated user to login with return URL when clicking sign in', async () => {
      useAuthStore.setState({
        status: 'unauthenticated',
        isAuthenticated: false,
        user: null,
      });

      renderWithClient(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Neon Tokyo Lounge')).toBeInTheDocument();
      });

      const loginButton = screen.getByTestId('join-login-button');
      expect(loginButton).toBeInTheDocument();
      expect(loginButton.getAttribute('href')).toBe('/login?redirect=/rooms/room-1');
    });

    it('displays Join Lounge CTA for authenticated non-members and triggers join mutation', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        user: mockMemberUser,
      });
      tokenStore.setAccessToken('valid-token');
      vi.spyOn(roomApi, 'getMyMembership').mockResolvedValueOnce({ isMember: false });

      renderWithClient(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('join-room-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('join-room-button'));

      await waitFor(() => {
        expect(roomApi.joinRoom).toHaveBeenCalledWith('room-1');
      });
    });

    it('disables join when room is full', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        user: mockMemberUser,
      });
      tokenStore.setAccessToken('valid-token');

      vi.spyOn(roomApi, 'getRoomById').mockResolvedValueOnce({
        ...mockRoom,
        capacity: 5,
        currentParticipantsCount: 5,
      });
      vi.spyOn(roomApi, 'getMyMembership').mockResolvedValueOnce({ isMember: false });

      renderWithClient(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('room-full-notice')).toBeInTheDocument();
        expect(screen.getByTestId('join-room-button-disabled')).toBeDisabled();
      });
    });

    it('disables join when room is closed', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        user: mockMemberUser,
      });
      tokenStore.setAccessToken('valid-token');

      vi.spyOn(roomApi, 'getRoomById').mockResolvedValueOnce({
        ...mockRoom,
        status: 'closed',
      });
      vi.spyOn(roomApi, 'getMyMembership').mockResolvedValueOnce({ isMember: false });

      renderWithClient(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('room-closed-notice')).toBeInTheDocument();
      });
    });

    it('renders active member state with leave lounge action', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        user: mockMemberUser,
      });
      tokenStore.setAccessToken('valid-token');

      vi.spyOn(roomApi, 'getMyMembership').mockResolvedValueOnce({
        isMember: true,
        role: 'member',
        membership: mockMembersList[1],
      });

      renderWithClient(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('leave-room-button')).toBeInTheDocument();
      });

      // Click Leave Lounge -> opens dialog
      fireEvent.click(screen.getByTestId('leave-room-button'));

      await waitFor(() => {
        expect(screen.getByTestId('leave-room-dialog-backdrop')).toBeInTheDocument();
      });

      // Confirm Leave
      fireEvent.click(screen.getByTestId('confirm-leave-button'));

      await waitFor(() => {
        expect(roomApi.leaveRoom).toHaveBeenCalledWith('room-1');
      });
    });

    it('renders host indicators and settings button for lounge host', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        user: mockHostUser,
      });
      tokenStore.setAccessToken('valid-token');

      vi.spyOn(roomApi, 'getMyMembership').mockResolvedValueOnce({
        isMember: true,
        role: 'host',
        membership: mockMembersList[0],
      });

      renderWithClient(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('host-status-indicator')).toBeInTheDocument();
      });

      // Host cannot leave active room; no leave button is rendered for host
      expect(screen.queryByTestId('leave-room-button')).not.toBeInTheDocument();
      expect(screen.getByTitle('Manage Lounge')).toBeInTheDocument();
    });

    it('displays error alert when join mutation fails', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        user: mockMemberUser,
      });
      tokenStore.setAccessToken('valid-token');

      vi.spyOn(roomApi, 'getMyMembership').mockResolvedValueOnce({ isMember: false });
      vi.spyOn(roomApi, 'joinRoom').mockRejectedValueOnce(
        new Error('This karaoke lounge is private')
      );

      renderWithClient(<RoomDetailPage />);

      await waitFor(() => {
        expect(screen.getByTestId('join-room-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('join-room-button'));

      await waitFor(() => {
        expect(screen.getByTestId('join-error-alert')).toBeInTheDocument();
        expect(screen.getByText('This karaoke lounge is private')).toBeInTheDocument();
      });
    });
  });

  describe('3.5 My Participation in MyRoomsPage', () => {
    it('switches to Lounges I have Joined tab and renders joined rooms', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        isInitialized: true,
        user: mockMemberUser,
      });
      tokenStore.setAccessToken('valid-token');
      queryClient.setQueryData(queryKeys.auth.currentUser(), mockMemberUser);

      renderWithClient(<MyRoomsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('tab-joined-rooms')).toBeInTheDocument();
      });

      // Click on joined rooms tab
      fireEvent.click(screen.getByTestId('tab-joined-rooms'));

      await waitFor(() => {
        expect(roomApi.getJoinedRooms).toHaveBeenCalled();
        expect(screen.getByTestId('joined-rooms-grid')).toBeInTheDocument();
      });
    });
  });

  describe('Session Expiration and Logout Safety', () => {
    it('clears query cache on logout to prevent private room data leakage', async () => {
      vi.spyOn(authApi, 'logout').mockResolvedValueOnce(null);
      const qc = getQueryClient();
      qc.setQueryData(['rooms', 'detail', 'room-private-1'], { id: 'room-private-1' });

      expect(qc.getQueryData(['rooms', 'detail', 'room-private-1'])).toBeDefined();

      // Trigger logout
      await useAuthStore.getState().logout();

      // Query cache must be cleared
      expect(qc.getQueryData(['rooms', 'detail', 'room-private-1'])).toBeUndefined();
    });
  });
});
