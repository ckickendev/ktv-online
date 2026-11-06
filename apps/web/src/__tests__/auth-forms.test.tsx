import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '../app/(auth)/login/page';
import RegisterPage from '../app/(auth)/register/page';
import { useAuthStore } from '../stores/use-auth-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../lib/api/errors';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/login',
}));

describe('Authentication Forms (Phase 3 & 4)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockSearchParams = new URLSearchParams();
    useAuthStore.getState().resetAuth();
    useAuthStore.setState({ status: 'unauthenticated', isInitialized: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  describe('LoginPage', () => {
    it('renders login form inputs, labels, and submit CTA', () => {
      renderWithProviders(<LoginPage />);

      expect(screen.getByRole('heading', { name: /Welcome Back, Singer/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In to Stage/i })).toBeInTheDocument();
    });

    it('displays client validation errors when submitting empty form', async () => {
      renderWithProviders(<LoginPage />);

      fireEvent.click(screen.getByRole('button', { name: /Sign In to Stage/i }));

      await waitFor(() => {
        expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    });

    it('toggles password visibility between text and password types', () => {
      renderWithProviders(<LoginPage />);

      const passwordInput = screen.getByLabelText(/^Password/i) as HTMLInputElement;
      expect(passwordInput.type).toBe('password');

      const toggleButton = screen.getByLabelText(/Show password/i);
      fireEvent.click(toggleButton);
      expect(passwordInput.type).toBe('text');

      fireEvent.click(screen.getByLabelText(/Hide password/i));
      expect(passwordInput.type).toBe('password');
    });

    it('submits valid credentials and navigates to destination upon success', async () => {
      const loginSpy = vi.spyOn(useAuthStore.getState(), 'login').mockResolvedValue();

      renderWithProviders(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'singer@ktv.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/i), {
        target: { value: 'Secret123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Sign In to Stage/i }));

      await waitFor(() => {
        expect(loginSpy).toHaveBeenCalledWith({
          email: 'singer@ktv.test',
          password: 'Secret123!',
        });
      });

      expect(mockReplace).toHaveBeenCalledWith('/rooms');
    });

    it('respects redirect query parameter after successful login', async () => {
      mockSearchParams = new URLSearchParams('redirect=%2Frooms%2Fvip-lounge');
      vi.spyOn(useAuthStore.getState(), 'login').mockResolvedValue();

      renderWithProviders(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'singer@ktv.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/i), {
        target: { value: 'Secret123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Sign In to Stage/i }));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/rooms/vip-lounge');
      });
    });

    it('displays error alert when login fails with 401 Unauthorized', async () => {
      vi.spyOn(useAuthStore.getState(), 'login').mockRejectedValue(
        new ApiError({ status: 401, message: 'Invalid credentials' })
      );

      renderWithProviders(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'wrong@ktv.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/i), {
        target: { value: 'WrongPass' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Sign In to Stage/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Invalid email or password. Please check your credentials./i)
        ).toBeInTheDocument();
      });
    });

    it('displays error alert when account is suspended with 403 Forbidden', async () => {
      vi.spyOn(useAuthStore.getState(), 'login').mockRejectedValue(
        new ApiError({ status: 403, message: 'Account suspended' })
      );

      renderWithProviders(<LoginPage />);

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'suspended@ktv.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/i), {
        target: { value: 'ValidPass123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Sign In to Stage/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Your account is suspended or inactive. Please contact platform support./i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('RegisterPage', () => {
    it('renders registration form fields and submit button', () => {
      renderWithProviders(<RegisterPage />);

      expect(screen.getByRole('heading', { name: /Claim Your Stage Name/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Stage Name \(Username\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Account/i })).toBeInTheDocument();
    });

    it('validates password mismatch and invalid username format', async () => {
      renderWithProviders(<RegisterPage />);

      fireEvent.change(screen.getByLabelText(/Stage Name \(Username\)/i), {
        target: { value: 'bad username with spaces!' },
      });
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'not-an-email' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/i), {
        target: { value: 'pass1234' },
      });
      fireEvent.change(screen.getByLabelText(/Confirm Password/i), {
        target: { value: 'different1234' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Username can only contain letters, numbers, underscores, and dashes/i)
        ).toBeInTheDocument();
      });
      expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
    });

    it('successfully submits valid registration data and navigates to rooms', async () => {
      const registerSpy = vi.spyOn(useAuthStore.getState(), 'register').mockResolvedValue();

      renderWithProviders(<RegisterPage />);

      fireEvent.change(screen.getByLabelText(/Stage Name \(Username\)/i), {
        target: { value: 'Rockstar_99' },
      });
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'rockstar@ktv.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/i), {
        target: { value: 'SecurePass123!' },
      });
      fireEvent.change(screen.getByLabelText(/Confirm Password/i), {
        target: { value: 'SecurePass123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

      await waitFor(() => {
        expect(registerSpy).toHaveBeenCalledWith(
          {
            username: 'Rockstar_99',
            email: 'rockstar@ktv.test',
            password: 'SecurePass123!',
          },
          true
        );
      });

      expect(mockReplace).toHaveBeenCalledWith('/rooms');
    });

    it('displays error alert when registration receives 409 Conflict', async () => {
      vi.spyOn(useAuthStore.getState(), 'register').mockRejectedValue(
        new ApiError({ status: 409, message: 'Email is already registered' })
      );

      renderWithProviders(<RegisterPage />);

      fireEvent.change(screen.getByLabelText(/Stage Name \(Username\)/i), {
        target: { value: 'TakenUser' },
      });
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'taken@ktv.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/i), {
        target: { value: 'SecurePass123!' },
      });
      fireEvent.change(screen.getByLabelText(/Confirm Password/i), {
        target: { value: 'SecurePass123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

      await waitFor(() => {
        expect(screen.getByText(/Email is already registered/i)).toBeInTheDocument();
      });
    });
  });
});
