'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Swords, BookOpen, BarChart2, Award } from 'lucide-react';

const tabs = [
  { href: '/today',    icon: Home,       label: 'Сегодня'  },
  { href: '/pre-game', icon: Swords,     label: 'Партия'   },
  { href: '/notebook', icon: BookOpen,   label: 'Тетрадь'  },
  { href: '/progress', icon: BarChart2,  label: 'Прогресс' },
  { href: '/badges',   icon: Award,      label: 'Награды'  },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0D0D0D] border-t border-[#181818] flex z-50"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href === '/today' && pathname === '/');
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] tracking-wide uppercase transition-colors duration-150
              ${active ? 'text-[#EAE8E3]' : 'text-[#2A2A2A] hover:text-[#555]'}`}>
            <Icon size={18} strokeWidth={active ? 1.75 : 1.5} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
