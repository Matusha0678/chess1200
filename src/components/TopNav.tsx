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
    <header className="border-b border-[#1E1E1E] bg-[#050505]">
      <div className="max-w-[1650px] mx-auto px-6 md:px-10 h-[64px] flex items-center justify-between gap-6">

        <Link href="/today" className="flex items-baseline gap-1 no-underline shrink-0">
          <span className="text-[22px] font-semibold text-[#F5F5F5]">Chess</span>
          <span className="text-[22px] font-semibold text-[#505050]">1200</span>
        </Link>

        <nav aria-label="Разделы" className="flex items-center flex-wrap">
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
                  'px-3 text-[13px] no-underline transition-colors h-[64px] flex items-center border-b-2',
                  active
                    ? 'text-[#F5F5F5] border-white'
                    : 'text-[#707070] border-transparent hover:text-[#A0A0A0]',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block text-[13px] text-[#505050] shrink-0">
          {dateCapitalized}
        </div>
      </div>
    </header>
  );
}
