'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/stores/use-auth-store';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initializeSession = useAuthStore((s) => s.initializeSession);

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  return <>{children}</>;
}
