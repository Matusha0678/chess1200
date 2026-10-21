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
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#080808] border-t border-[#1E1E1E] flex z-50"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href === '/today' && pathname === '/');
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] tracking-wide uppercase transition-colors duration-150
              ${active ? 'text-[#EFEFEF]' : 'text-[#3A3A3A] hover:text-[#666]'}`}>
            <Icon size={18} strokeWidth={active ? 1.75 : 1.5} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
