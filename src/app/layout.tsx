import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import BottomNav from '@/components/BottomNav';

const geist = Geist({ subsets: ['latin'] });

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
  themeColor: '#080808',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}` }} />
      </head>
      <body className={`${geist.className} bg-[#080808] text-[#EFEFEF] min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))]`}>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
