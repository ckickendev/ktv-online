import React from 'react';
import { LucideIcon, Disc3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = Disc3,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'glass-panel rounded-2xl p-10 flex flex-col items-center justify-center text-center max-w-md mx-auto my-8 border border-white/10',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mb-4 text-violet-400">
        <Icon className="w-7 h-7" />
      </div>

      <h3 className="text-lg font-semibold text-white mb-1.5">{title}</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">{description}</p>

      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-colors shadow-lg shadow-violet-600/20"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
