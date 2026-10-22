'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/today', label: 'Сегодня' },
  { href: '/pre-game', label: 'Партия' },
  { href: '/openings', label: 'Дебюты' },
  { href: '/notebook', label: 'Тетрадь' },
  { href: '/progress', label: 'Прогресс' },
  { href: '/badges', label: 'Награды' },
];

export default function TopNav() {
  const pathname = usePathname();
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateCapitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return (
    <header className="border-b border-[#1F1D19]">
      <div className="max-w-[1320px] mx-auto px-5 py-5 md:px-10 md:py-7 flex flex-wrap items-center justify-between gap-4 md:gap-5">
        <Link href="/today" className="flex items-baseline gap-[10px] no-underline text-[#F3EEE5]">
          <span className="font-cormorant text-[26px] md:text-[30px] font-semibold">Chess</span>
          <span className="font-cormorant text-[26px] md:text-[30px] font-semibold text-[#D6B97E]">1200</span>
        </Link>
        <nav aria-label="Разделы" className="flex flex-wrap gap-1 order-3 md:order-2 w-full md:w-auto">
          {tabs.map(({ href, label }) => {
            const active = pathname === href ||
              (href === '/today' && pathname === '/') ||
              (href !== '/today' && href !== '/' && pathname.startsWith(href + '/'));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'text-[14px] md:text-[15px] font-medium px-[14px] md:px-[18px] py-[10px] md:py-3 rounded-full border no-underline transition-colors',
                  active
                    ? 'text-[#F3EEE5] bg-[#1A1813] border-[#2E2B25]'
                    : 'text-[#B3AC9F] border-transparent hover:text-[#F3EEE5] hover:bg-[#17150F]',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="text-[14px] md:text-[15px] text-[#B3AC9F] order-2 md:order-3">{dateCapitalized}</div>
      </div>
    </header>
  );
}
