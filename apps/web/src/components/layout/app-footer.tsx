import React from 'react';
import Link from 'next/link';
import { Mic2, Heart, Github } from 'lucide-react';

export function AppFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#07080e] text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand info */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-white">
                <Mic2 className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm tracking-tight text-white">KTV ONLINE</span>
            </div>
            <p className="text-slate-400 max-w-sm text-xs leading-relaxed">
              Your Virtual Hangout. Your Karaoke Night. Connect with friends in private lounges or
              discover public stages with synchronized lyrics and crystal-clear voice chat.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sprint 0 Architecture Foundation Active</span>
            </div>
          </div>

          {/* Platform Navigation */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Platform
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/rooms" className="hover:text-violet-400 transition-colors">
                  Explore Lounges
                </Link>
              </li>
              <li>
                <Link href="/profile" className="hover:text-violet-400 transition-colors">
                  User Studio
                </Link>
              </li>
              <li>
                <span className="text-slate-600 cursor-not-allowed">
                  Audio Engine (Sprint 3)
                </span>
              </li>
              <li>
                <span className="text-slate-600 cursor-not-allowed">
                  3D Avatars (Sprint 4)
                </span>
              </li>
            </ul>
          </div>

          {/* Architecture & Tech */}
          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Monorepo Specs
            </h4>
            <ul className="space-y-2 text-slate-400">
              <li>Next.js 15 App Router</li>
              <li>Node.js 22 + Express API</li>
              <li>MongoDB &amp; Mongoose</li>
              <li>Tailwind CSS v4 &amp; Zustand</li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-[11px]">
            &copy; {new Date().getFullYear()} KTV Online Platform. Built with care for virtual entertainment.
          </p>
          <div className="flex items-center gap-4 text-slate-500 text-[11px]">
            <span className="flex items-center gap-1">
              Made with <Heart className="w-3 h-3 text-rose-500 fill-rose-500" /> for music lovers
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <Github className="w-3.5 h-3.5" /> Open Monorepo
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
