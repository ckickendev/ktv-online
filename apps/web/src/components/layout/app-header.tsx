'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic2, Radio, Compass, User, Menu, X, PlusCircle, LogOut, LogIn, UserPlus, Users } from 'lucide-react';
import { UserAvatar } from '../shared/user-avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

export function AppHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, isInitializing, logout } = useAuth();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/rooms', label: 'Explore Lounges', icon: Compass },
    ...(isAuthenticated
      ? [
          { href: '/my-rooms', label: 'My Lounges', icon: Mic2 },
          { href: '/friends', label: 'Friends', icon: Users },
          { href: '/profile', label: 'My Studio', icon: User },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 glass-panel">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 p-0.5 shadow-lg shadow-violet-600/30 group-hover:shadow-violet-600/50 transition-all">
            <div className="w-full h-full bg-[#090b12] rounded-[10px] flex items-center justify-center">
              <Mic2 className="w-5 h-5 text-violet-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-violet-300 bg-clip-text text-transparent">
              KTV ONLINE
            </span>
            <span className="text-[10px] font-medium tracking-wider text-cyan-400 -mt-1 uppercase">
              Virtual Karaoke
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                  isActive
                    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/25 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                {link.icon && <link.icon className="w-4 h-4" />}
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Action Bar */}
        <div className="hidden md:flex items-center gap-3">
          {/* Live indicator pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span className="font-medium">18 Active Lounges</span>
          </div>

          {/* Quick Create Room CTA */}
          <Link
            href="/rooms/create"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-violet-600/25 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Host Lounge</span>
          </Link>

          {/* Auth State Controls */}
          {isInitializing ? (
            <div className="w-24 h-8 rounded-xl bg-white/5 animate-pulse" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2 pl-2">
              <Link
                href="/profile"
                className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-white/5 transition-colors group"
                title="View Profile"
              >
                <UserAvatar
                  name={user?.displayName || user?.username || 'Singer'}
                  avatarUrl={user?.avatar}
                  status="online"
                  size="sm"
                />
                <span className="text-xs font-semibold text-slate-300 group-hover:text-white hidden xl:inline">
                  {user?.displayName || user?.username}
                </span>
              </Link>

              <button
                onClick={() => logout()}
                className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2">
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-600/25 transition-all"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center gap-2">
          {isAuthenticated && (
            <Link href="/profile">
              <UserAvatar
                name={user?.displayName || user?.username || 'Singer'}
                avatarUrl={user?.avatar}
                status="online"
                size="sm"
              />
            </Link>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#090b12]/95 backdrop-blur-xl px-4 py-4 space-y-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                {link.icon && <link.icon className="w-4 h-4" />}
                <span>{link.label}</span>
              </Link>
            );
          })}

          <div className="pt-2 space-y-2 border-t border-white/5">
            <Link
              href="/rooms/create"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Host Lounge</span>
            </Link>

            {isAuthenticated ? (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 text-slate-300 text-xs font-semibold"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
