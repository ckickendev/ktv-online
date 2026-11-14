'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import {
  useUserPreferences,
  useUpdateUserPreferences,
} from './queries/use-user-preferences';

const GUEST_STORAGE_KEY_WELCOME = 'ktv_ftue_welcome_dismissed_guest';
const GUEST_STORAGE_KEY_GUIDE = 'ktv_ftue_room_guide_dismissed_guest';

export interface UseOnboardingReturn {
  hasCompletedOnboarding: boolean;
  hasDismissedRoomGuide: boolean;
  showWelcome: boolean;
  showRoomGuide: boolean;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
  dismissRoomGuide: () => Promise<void>;
  reopenRoomGuide: () => void;
  resetOnboarding: () => void;
}

export function useOnboarding(): UseOnboardingReturn {
  const { isAuthenticated, user, isInitializing } = useAuth();
  const { preferences, isLoading: isPreferencesLoading } = useUserPreferences();
  const updatePreferencesMutation = useUpdateUserPreferences();

  const [guestWelcomeDismissed, setGuestWelcomeDismissed] = useState<boolean>(false);
  const [guestGuideDismissed, setGuestGuideDismissed] = useState<boolean>(false);
  const [localGuideOpenOverride, setLocalGuideOpenOverride] = useState<boolean | null>(null);

  // Sync guest storage on mount / auth change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isAuthenticated) {
      setGuestWelcomeDismissed(
        localStorage.getItem(GUEST_STORAGE_KEY_WELCOME) === 'true'
      );
      setGuestGuideDismissed(
        localStorage.getItem(GUEST_STORAGE_KEY_GUIDE) === 'true'
      );
    }
  }, [isAuthenticated, user?.id]);

  const hasCompletedOnboarding = isAuthenticated
    ? Boolean(preferences?.hasCompletedOnboarding)
    : guestWelcomeDismissed;

  const hasDismissedRoomGuide = isAuthenticated
    ? Boolean(preferences?.hasDismissedRoomGuide)
    : guestGuideDismissed;

  const completeOnboarding = useCallback(async () => {
    if (isAuthenticated) {
      try {
        await updatePreferencesMutation.mutateAsync({
          hasCompletedOnboarding: true,
        });
      } catch {
        // Fallback to client-side storage if network fails
      }
    } else if (typeof window !== 'undefined') {
      localStorage.setItem(GUEST_STORAGE_KEY_WELCOME, 'true');
      setGuestWelcomeDismissed(true);
    }
  }, [isAuthenticated, updatePreferencesMutation]);

  const dismissRoomGuide = useCallback(async () => {
    setLocalGuideOpenOverride(false);
    if (isAuthenticated) {
      try {
        await updatePreferencesMutation.mutateAsync({
          hasDismissedRoomGuide: true,
        });
      } catch {
        // Fallback to client-side storage if network fails
      }
    } else if (typeof window !== 'undefined') {
      localStorage.setItem(GUEST_STORAGE_KEY_GUIDE, 'true');
      setGuestGuideDismissed(true);
    }
  }, [isAuthenticated, updatePreferencesMutation]);

  const reopenRoomGuide = useCallback(() => {
    setLocalGuideOpenOverride(true);
  }, []);

  const resetOnboarding = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(GUEST_STORAGE_KEY_WELCOME);
      localStorage.removeItem(GUEST_STORAGE_KEY_GUIDE);
      setGuestWelcomeDismissed(false);
      setGuestGuideDismissed(false);
      setLocalGuideOpenOverride(null);
    }
  }, []);

  const isLoading = isInitializing || (isAuthenticated && isPreferencesLoading);

  const showWelcome = !isLoading && !hasCompletedOnboarding;
  const showRoomGuide =
    localGuideOpenOverride !== null
      ? localGuideOpenOverride
      : !isLoading && !hasDismissedRoomGuide;

  return {
    hasCompletedOnboarding,
    hasDismissedRoomGuide,
    showWelcome,
    showRoomGuide,
    isLoading,
    completeOnboarding,
    dismissRoomGuide,
    reopenRoomGuide,
    resetOnboarding,
  };
}
