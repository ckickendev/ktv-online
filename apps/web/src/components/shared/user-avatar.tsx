import React from 'react';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'singing' | 'idle';
  className?: string;
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 'md',
  status,
  className,
}: UserAvatarProps) {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const statusIndicatorClasses = {
    sm: 'w-2 h-2 -bottom-0.5 -right-0.5',
    md: 'w-2.5 h-2.5 bottom-0 right-0',
    lg: 'w-3 h-3 bottom-0.5 right-0.5',
    xl: 'w-4 h-4 bottom-1 right-1',
  };

  const statusColors = {
    online: 'bg-emerald-500',
    singing: 'bg-violet-500 animate-pulse',
    idle: 'bg-amber-500',
    offline: 'bg-slate-500',
  };

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={cn('relative inline-flex items-center justify-center shrink-0', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden border border-white/10 bg-gradient-to-tr from-violet-600/30 to-cyan-500/30 font-semibold text-white flex items-center justify-center shadow-inner',
          sizeClasses[size]
        )}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span>{initials || '?'}</span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute rounded-full ring-2 ring-[#090b12]',
            statusColors[status],
            statusIndicatorClasses[size]
          )}
        />
      )}
    </div>
  );
}
