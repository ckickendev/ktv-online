import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppHeader } from '@/components/layout/app-header';
import { AppFooter } from '@/components/layout/app-footer';
import { AppQueryProvider } from '@/providers/query-provider';
import { AuthInitializer } from '@/components/auth/auth-initializer';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'KTV Online – Your Virtual Hangout. Your Karaoke Night.',
  description:
    'Modern Social Entertainment Platform featuring virtual karaoke lounges, synchronized lyrics, real-time voice chat, and social music experiences.',
  keywords: ['karaoke', 'virtual hangout', 'voice chat', 'synchronized music', 'social singing'],
  authors: [{ name: 'KTV Online Team' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-[#090b12] text-slate-100 antialiased selection:bg-violet-600 selection:text-white">
        <AppQueryProvider>
          <AuthInitializer>
            <AppHeader />
            <main className="flex-1 flex flex-col">{children}</main>
            <AppFooter />
          </AuthInitializer>
        </AppQueryProvider>
      </body>
    </html>
  );
}
