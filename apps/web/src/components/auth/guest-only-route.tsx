'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { LoadingState } from '@/components/shared/loading-state';

interface GuestOnlyRouteProps {
  children: React.ReactNode;
}

function GuestOnlyRouteContent({ children }: GuestOnlyRouteProps) {
  const { status, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isAuthenticated) {
      const redirectParam = searchParams.get('redirect');
      const targetUrl = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';
      router.replace(targetUrl);
    }
  }, [isAuthenticated, searchParams, router]);

  if (status === 'initializing') {
    return (
      <div className="flex-1 flex items-center justify-center py-24 bg-[#090b12]">
        <LoadingState message="Checking session..." />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

export function GuestOnlyRoute({ children }: GuestOnlyRouteProps) {
  return (
    <React.Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-24 bg-[#090b12]">
          <LoadingState message="Checking session..." />
        </div>
      }
    >
      <GuestOnlyRouteContent>{children}</GuestOnlyRouteContent>
    </React.Suspense>
  );
}
