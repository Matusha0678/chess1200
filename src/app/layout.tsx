import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, Playfair_Display } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import { BoardThemeProvider } from '@/contexts/BoardThemeContext';
import ThemePanel from '@/components/ThemePanel';
import SearchDialog from '@/components/SearchDialog';
import { HotkeysDialog } from '@/components/HotkeysDialog';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const interTight = Inter_Tight({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Chess 1200',
  description: 'Тренажёр дебютов с интервальным повторением',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Chess 1200' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0F0F11',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${interTight.variable} ${playfair.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}` }} />
      </head>
      <body>
        <BoardThemeProvider>
          <AppShell>{children}</AppShell>
          <ThemePanel />
          <SearchDialog />
          <HotkeysDialog />
        </BoardThemeProvider>
      </body>
    </html>
  );
}
