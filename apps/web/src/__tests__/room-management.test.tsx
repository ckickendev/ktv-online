import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreateRoomPage from '../app/(platform)/rooms/create/page';
import MyRoomsPage from '../app/(platform)/my-rooms/page';
import RoomManagePage from '../app/(platform)/rooms/[roomId]/manage/page';
import { roomApi } from '../lib/api/endpoints/rooms';
import { authApi } from '../lib/api/endpoints/auth';
import { useAuthStore } from '../stores/use-auth-store';
import { tokenStore } from '../lib/api/token-store';
import { queryKeys } from '../hooks/queries/query-keys';
import { RoomDto } from '@ktv/contracts';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockParams = { roomId: 'room-123' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  useParams: () => mockParams,
  usePathname: () => '/my-rooms',
  useSearchParams: () => new URLSearchParams(),
}));

const defaultUser = { id: 'usr-owner-1', username: 'TestHost', role: 'user' };

describe('Room Creation & Management UI (Sprint 1.3)', () => {
  let queryClient: QueryClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    tokenStore.setAccessToken('valid_test_token');
    useAuthStore.setState({
      status: 'authenticated',
      isAuthenticated: true,
      isInitialized: true,
      user: defaultUser,
    });
    queryClient.setQueryData(queryKeys.auth.currentUser(), defaultUser);

    mockPush.mockClear();
    mockReplace.mockClear();
    mockParams = { roomId: 'room-123' };
    vi.clearAllMocks();
    vi.spyOn(authApi, 'getMe').mockResolvedValue(defaultUser);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    queryClient.clear();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  describe('roomApi Endpoints', () => {
    it('getMyRooms sends GET request to /rooms/my-rooms with pagination params', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            items: [],
            pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          },
        }),
      });

      await roomApi.getMyRooms({ page: 2, limit: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rooms/my-rooms?page=2&limit=10'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('updateRoom sends PATCH request to /rooms/:id with updated payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'room-123', name: 'Updated Lounge' },
        }),
      });

      await roomApi.updateRoom('room-123', { name: 'Updated Lounge', capacity: 15 });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rooms/room-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Lounge', capacity: 15 }),
        })
      );
    });

    it('closeRoom sends POST request to /rooms/:id/close', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'room-123', status: 'closed' },
        }),
      });

      await roomApi.closeRoom('room-123');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rooms/room-123/close'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('CreateRoomPage (/rooms/create)', () => {
    it('renders room creation form and validates minimum room name', async () => {
      renderWithProviders(<CreateRoomPage />);

      expect(screen.getByRole('heading', { name: /Create a Karaoke Lounge/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Lounge Name/i)).toBeInTheDocument();

      // Submit without name
      fireEvent.click(screen.getByRole('button', { name: /Create Lounge & Enter Stage/i }));

      await waitFor(() => {
        expect(screen.getByText(/Room name must be at least 2 characters/i)).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('successfully creates room and navigates to the live room stage', async () => {
      const mockCreatedRoom = {
        id: 'new-room-888',
        name: 'Neo Shibuya Lounge',
        roomType: 'vip',
        category: 'anime',
        visibility: 'public',
        capacity: 10,
        status: 'idle',
        currentParticipantsCount: 1,
        ownerId: 'usr-owner-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: mockCreatedRoom,
        }),
      });

      renderWithProviders(<CreateRoomPage />);

      fireEvent.change(screen.getByLabelText(/Lounge Name/i), {
        target: { value: 'Neo Shibuya Lounge' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Create Lounge & Enter Stage/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/rooms/new-room-888');
      });
    });
  });

  describe('MyRoomsPage (/my-rooms)', () => {
    it('displays empty state when user has no hosted lounges', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          },
        }),
      });

      renderWithProviders(<MyRoomsPage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Your Stage Is Waiting/i })).toBeInTheDocument();
      });
      expect(screen.getByRole('link', { name: /Host Your First Lounge/i })).toBeInTheDocument();
    });

    it('renders room cards and calculates statistics accurately', async () => {
      const mockRooms: RoomDto[] = [
        {
          id: 'r1',
          name: 'Midnight Pop Lounge',
          ownerId: 'usr-owner-1',
          roomType: 'standard',
          visibility: 'public',
          capacity: 10,
          currentParticipantsCount: 4,
          status: 'singing',
          category: 'pop',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'r2',
          name: 'Private Studio Session',
          ownerId: 'usr-owner-1',
          roomType: 'vip',
          visibility: 'private',
          capacity: 6,
          currentParticipantsCount: 1,
          status: 'closed',
          category: 'rock',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            items: mockRooms,
            pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNextPage: false, hasPrevPage: false },
          },
        }),
      });

      renderWithProviders(<MyRoomsPage />);

      await waitFor(() => {
        expect(screen.getByText('Midnight Pop Lounge')).toBeInTheDocument();
        expect(screen.getByText('Private Studio Session')).toBeInTheDocument();
      });

      // Verify statistics
      expect(screen.getByText('2')).toBeInTheDocument(); // Total lounges
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1); // Active stages
      expect(screen.getByText('16 Seats')).toBeInTheDocument(); // 10 + 6
    });

    it('opens confirmation modal and closes room when confirmed', async () => {
      const mockRooms: RoomDto[] = [
        {
          id: 'room-to-close',
          name: 'Active Stage To Conclude',
          ownerId: 'usr-owner-1',
          roomType: 'standard',
          visibility: 'public',
          capacity: 12,
          currentParticipantsCount: 2,
          status: 'idle',
          category: 'pop',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/users/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: defaultUser,
            }),
          });
        }
        if (url.includes('/my-rooms')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: {
                items: mockRooms,
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
              },
            }),
          });
        }
        if (url.endsWith('/close') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: { ...mockRooms[0], status: 'closed' },
            }),
          });
        }
        return Promise.reject(new Error(`Unknown endpoint: ${url}`));
      });

      renderWithProviders(<MyRoomsPage />);

      await waitFor(() => {
        expect(screen.getByText('Active Stage To Conclude')).toBeInTheDocument();
      });

      // Click Close button on card
      fireEvent.click(screen.getByRole('button', { name: /Close Lounge/i }));

      // Modal appears
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Close “Active Stage To Conclude”\?/i })).toBeInTheDocument();
      });

      // Confirm closure
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Close/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rooms/room-to-close/close'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });

  describe('RoomManagePage (/rooms/[roomId]/manage)', () => {
    it('displays Forbidden state when user is not the owner', async () => {
      const mockRoom: RoomDto = {
        id: 'room-123',
        name: 'Someone Else Room',
        ownerId: 'other-user-999', // Different owner
        roomType: 'standard',
        visibility: 'public',
        capacity: 10,
        currentParticipantsCount: 1,
        status: 'idle',
        category: 'pop',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: mockRoom,
        }),
      });

      renderWithProviders(<RoomManagePage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Host Access Required/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument();
    });

    it('loads existing room values and allows owner to update settings', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        isInitialized: true,
        user: defaultUser,
      });
      queryClient.setQueryData(queryKeys.auth.currentUser(), defaultUser);

      const mockRoom: RoomDto = {
        id: 'room-123',
        name: 'Original Stage Title',
        description: 'Original description text',
        ownerId: 'usr-owner-1', // Matches logged in user
        roomType: 'vip',
        visibility: 'public',
        capacity: 10,
        currentParticipantsCount: 2,
        status: 'idle',
        category: 'pop',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/users/me') || url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: defaultUser,
            }),
          });
        }
        if (options?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: { ...mockRoom, name: 'Saved Updated Title' },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: mockRoom,
          }),
        });
      });

      renderWithProviders(<RoomManagePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Original Stage Title')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Original description text')).toBeInTheDocument();
      });

      // Modify room name
      fireEvent.change(screen.getByDisplayValue('Original Stage Title'), {
        target: { value: 'Saved Updated Title' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/Lounge settings updated successfully!/i)).toBeInTheDocument();
      });
    });
  });
});
