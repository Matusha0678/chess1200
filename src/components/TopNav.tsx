'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Palette } from 'lucide-react';
import { useBoardTheme } from '@/contexts/BoardThemeContext';

export default function TopNav() {
  const pathname = usePathname();
  const { openPanel } = useBoardTheme();

  const homeActive = pathname === '/';
  const openingsActive = pathname === '/openings' || pathname.startsWith('/openings/');

  return (
    <header className="border-b border-[#1E1E1E] bg-[#050505]">
      <div className="max-w-[1650px] mx-auto px-6 md:px-10 h-[64px] flex items-center gap-6">

        {/* Logo — hard navigation so home always loads fresh */}
        <a href="/" className="flex items-baseline gap-1 no-underline shrink-0 mr-2">
          <span className="text-[22px] font-semibold text-[#F5F5F5]">Chess</span>
          <span className="text-[22px] font-semibold text-[#505050]">1200</span>
        </a>

        <nav aria-label="Разделы" className="flex items-center">
          {/* "Сегодня" uses a hard <a> so the dashboard always re-fetches on arrival */}
          <a
            href="/"
            aria-current={homeActive ? 'page' : undefined}
            className={[
              'px-3 text-[13px] no-underline transition-colors h-[64px] flex items-center border-b-2',
              homeActive
                ? 'text-[#F5F5F5] border-white'
                : 'text-[#606060] border-transparent hover:text-[#A0A0A0]',
            ].join(' ')}
          >
            Сегодня
          </a>

          <Link
            href="/openings"
            aria-current={openingsActive ? 'page' : undefined}
            className={[
              'px-3 text-[13px] no-underline transition-colors h-[64px] flex items-center border-b-2',
              openingsActive
                ? 'text-[#F5F5F5] border-white'
                : 'text-[#606060] border-transparent hover:text-[#A0A0A0]',
            ].join(' ')}
          >
            Дебюты
          </Link>
        </nav>

        <div className="ml-auto">
          <button
            onClick={openPanel}
            className="text-[#606060] hover:text-[#F5F5F5] transition-colors p-2 rounded"
            aria-label="Настройки внешнего вида"
            title="Внешний вид"
          >
            <Palette size={18} />
          </button>
        </div>

      </div>
    </header>
  );
}
