'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Music, User, Flame, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppSidebar() {
  const pathname = usePathname();

  const links = [
    { href: '/rooms', label: 'All Lounges', icon: Compass },
    { href: '/rooms?category=pop', label: 'Trending Pop', icon: Flame },
    { href: '/rooms?category=anime', label: 'Anime & J-Rock', icon: Music },
    { href: '/profile', label: 'My Studio', icon: User },
  ];

  return (
    <aside className="w-64 border-r border-white/5 bg-[#090b12] p-4 flex flex-col justify-between hidden lg:flex shrink-0">
      <div className="space-y-6">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3">
            Discovery
          </span>
          <nav className="mt-2 space-y-1">
            {links.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-violet-600/15 text-violet-300 font-semibold border border-violet-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon className="w-4 h-4 text-violet-400" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Lounge Tip Card */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-b from-violet-950/40 to-transparent border border-violet-500/15">
          <div className="flex items-center gap-2 text-violet-400 mb-1.5">
            <Mic className="w-4 h-4" />
            <span className="text-xs font-semibold text-white">Karaoke Tip</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Headphones prevent echo feedback during real-time voice chat sessions.
          </p>
        </div>
      </div>

      <div className="text-[11px] text-slate-600 px-3">
        KTV Online v0.1.0 &bull; Sprint 0
      </div>
    </aside>
  );
}
