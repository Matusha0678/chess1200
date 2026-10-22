'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/today',    label: 'Сегодня' },
  { href: '/pre-game', label: 'Партия' },
  { href: '/openings', label: 'Дебюты' },
  { href: '/notebook', label: 'Тетрадь' },
  { href: '/progress', label: 'Прогресс' },
  { href: '/badges',   label: 'Награды' },
];

export default function TopNav() {
  const pathname = usePathname();
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateCapitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return (
    <header className="border-b border-[#1F1D19]">
      <div className="max-w-[1600px] mx-auto px-5 md:px-10 py-4 flex flex-wrap items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/today" className="flex items-baseline gap-2 no-underline">
          <span className="font-cormorant text-[26px] font-semibold text-[#F3EEE5]">Chess</span>
          <span className="font-cormorant text-[26px] font-semibold text-[#D6B97E]">1200</span>
        </Link>

        {/* Nav pills */}
        <nav aria-label="Разделы" className="flex flex-wrap gap-[2px] order-3 md:order-2 w-full md:w-auto">
          {tabs.map(({ href, label }) => {
            const active =
              pathname === href ||
              (href === '/today' && pathname === '/') ||
              (href !== '/today' && href !== '/' && pathname.startsWith(href + '/'));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex items-center h-10 px-4 text-[14px] font-medium rounded-full border no-underline transition-colors',
                  active
                    ? 'bg-[#1A1813] border-[#2E2B25] text-[#F3EEE5]'
                    : 'border-transparent text-[#B3AC9F] hover:bg-[#17150F] hover:text-[#F3EEE5]',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Date */}
        <div className="hidden sm:block text-[14px] text-[#B3AC9F] order-2 md:order-3">
          {dateCapitalized}
        </div>

      </div>
    </header>
  );
}
