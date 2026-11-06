'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { LoadingState } from '@/components/shared/loading-state';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { status, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const redirectTarget = pathname ? encodeURIComponent(pathname) : '';
      const loginUrl = redirectTarget ? `/login?redirect=${redirectTarget}` : '/login';
      router.replace(loginUrl);
    }
  }, [status, pathname, router]);

  if (status === 'initializing') {
    return (
      fallback ?? (
        <div className="flex-1 flex items-center justify-center py-24 bg-[#090b12]">
          <LoadingState message="Verifying authentication session..." />
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
