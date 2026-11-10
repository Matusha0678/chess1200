'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TopNav() {
  const pathname = usePathname();

  const homeActive = pathname === '/';
  const openingsActive = pathname === '/openings' || pathname.startsWith('/openings/');

  return (
    <header className="border-b border-[#1E1E1E] bg-[#050505]">
      <div className="max-w-[1650px] mx-auto px-6 md:px-10 h-[64px] flex items-center gap-6">

        <Link href="/" className="flex items-baseline gap-1 no-underline shrink-0 mr-2">
          <span className="text-[22px] font-semibold text-[#F5F5F5]">Chess</span>
          <span className="text-[22px] font-semibold text-[#505050]">1200</span>
        </Link>

        <nav aria-label="Разделы" className="flex items-center">
          {[
            { href: '/',         label: 'Сегодня',  active: homeActive },
            { href: '/openings', label: 'Дебюты',   active: openingsActive },
          ].map(({ href, label, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={[
                'px-3 text-[13px] no-underline transition-colors h-[64px] flex items-center border-b-2',
                active
                  ? 'text-[#F5F5F5] border-white'
                  : 'text-[#606060] border-transparent hover:text-[#A0A0A0]',
              ].join(' ')}
            >
              {label}
            </Link>
          ))}
        </nav>

      </div>
    </header>
  );
}
