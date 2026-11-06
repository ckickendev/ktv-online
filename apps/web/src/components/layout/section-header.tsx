import React from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  badge?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

export function SectionHeader({
  badge,
  title,
  description,
  action,
  align = 'left',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8',
        align === 'center' && 'text-center items-center justify-center',
        className
      )}
    >
      <div className={cn(align === 'center' && 'max-w-2xl mx-auto')}>
        {badge && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 mb-3 tracking-wide uppercase">
            {badge}
          </span>
        )}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-2 text-sm text-slate-400">{description}</p>}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
