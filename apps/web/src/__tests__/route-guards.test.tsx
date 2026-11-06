import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '../components/auth/protected-route';
import { GuestOnlyRoute } from '../components/auth/guest-only-route';
import { useAuthStore } from '../stores/use-auth-store';

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = '/profile';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Route Guards (Phase 5)', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams();
    mockPathname = '/profile';
    useAuthStore.getState().resetAuth();
  });

  describe('ProtectedRoute', () => {
    it('renders loading state and does not redirect while initializing', () => {
      useAuthStore.setState({ status: 'initializing', isAuthenticated: false });

      renderWithClient(
        <ProtectedRoute>
          <div>Sensitive Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText(/Verifying authentication session.../i)).toBeInTheDocument();
      expect(screen.queryByText(/Sensitive Protected Content/i)).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('redirects to /login preserving current target when unauthenticated', () => {
      mockPathname = '/profile/studio';
      useAuthStore.setState({ status: 'unauthenticated', isAuthenticated: false, isInitialized: true });

      renderWithClient(
        <ProtectedRoute>
          <div>Sensitive Protected Content</div>
        </ProtectedRoute>
      );

      expect(mockReplace).toHaveBeenCalledWith('/login?redirect=%2Fprofile%2Fstudio');
      expect(screen.queryByText(/Sensitive Protected Content/i)).not.toBeInTheDocument();
    });

    it('renders protected children when user is authenticated', () => {
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        isInitialized: true,
        user: { id: 'u1', username: 'Alex', role: 'user' },
      });

      renderWithClient(
        <ProtectedRoute>
          <div>Sensitive Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText(/Sensitive Protected Content/i)).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('GuestOnlyRoute', () => {
    it('renders loading state while initializing and does not redirect', () => {
      useAuthStore.setState({ status: 'initializing', isAuthenticated: false });

      renderWithClient(
        <GuestOnlyRoute>
          <div>Guest Login Form</div>
        </GuestOnlyRoute>
      );

      expect(screen.getByText(/Checking session.../i)).toBeInTheDocument();
      expect(screen.queryByText(/Guest Login Form/i)).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('redirects authenticated user to destination or home', () => {
      mockSearchParams = new URLSearchParams('redirect=%2Frooms%2Fstage-1');
      useAuthStore.setState({
        status: 'authenticated',
        isAuthenticated: true,
        isInitialized: true,
        user: { id: 'u1', username: 'Alex', role: 'user' },
      });

      renderWithClient(
        <GuestOnlyRoute>
          <div>Guest Login Form</div>
        </GuestOnlyRoute>
      );

      expect(mockReplace).toHaveBeenCalledWith('/rooms/stage-1');
      expect(screen.queryByText(/Guest Login Form/i)).not.toBeInTheDocument();
    });

    it('renders guest children when unauthenticated', () => {
      useAuthStore.setState({
        status: 'unauthenticated',
        isAuthenticated: false,
        isInitialized: true,
      });

      renderWithClient(
        <GuestOnlyRoute>
          <div>Guest Login Form</div>
        </GuestOnlyRoute>
      );

      expect(screen.getByText(/Guest Login Form/i)).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
