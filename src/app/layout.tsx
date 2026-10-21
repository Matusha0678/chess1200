import type { Metadata, Viewport } from 'next';
import { Manrope, Cormorant_Garamond } from 'next/font/google';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import SideNav from '@/components/SideNav';

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Chess 1200',
  description: 'Твой путь к рейтингу 1200',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Chess 1200' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0D0D0D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}` }} />
      </head>
      <body className={`${manrope.variable} ${cormorant.variable} bg-[#0D0D0D] text-[#EAE8E3] min-h-screen md:ml-[72px] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0`}>
        <SideNav />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
