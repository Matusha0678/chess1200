'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/today',    piece: '♟', label: 'Сегодня'  },
  { href: '/pre-game', piece: '♞', label: 'Партия'   },
  { href: '/notebook', piece: '♝', label: 'Тетрадь'  },
  { href: '/progress', piece: '♜', label: 'Прогресс' },
  { href: '/badges',   piece: '♛', label: 'Награды'  },
];

export default function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[72px] flex-col items-center py-10 bg-[#0A0A0A] border-r border-[#181818] z-50">
      <span
        className="mb-auto text-[9px] font-semibold tracking-[0.35em] uppercase text-[#EAE8E3]"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
        Chess 1200
      </span>
      <nav className="flex flex-col gap-1.5 mb-10">
        {nav.map(({ href, piece, label }) => {
          const active = pathname === href || (href === '/today' && pathname === '/');
          return (
            <Link key={href} href={href}
              className={`w-11 h-11 flex flex-col items-center justify-center rounded-sm transition-colors gap-1
                ${active ? 'bg-[#1A1A1A]' : 'hover:bg-[#141414]'}`}
              title={label}>
              <span className={`text-[22px] leading-none select-none ${active ? 'text-[#EAE8E3]' : 'text-[#2A2A2A]'}`}>
                {piece}
              </span>
              <span className={`w-1 h-1 rounded-full bg-[#C9A96E] transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
