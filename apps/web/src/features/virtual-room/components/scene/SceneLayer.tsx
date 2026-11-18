'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SceneLayerProps {
  id?: string;
  zIndex: number;
  className?: string;
  children: React.ReactNode;
}

export function SceneLayer({ id, zIndex, className, children }: SceneLayerProps) {
  return (
    <div
      id={id}
      style={{ zIndex }}
      className={cn('absolute inset-0 pointer-events-none', className)}
    >
      {children}
    </div>
  );
}
