'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Sword, BookOpen, TrendingUp, Trophy } from 'lucide-react';

const tabs = [
  { href: '/today',    icon: Home,       label: 'Сегодня'   },
  { href: '/pre-game', icon: Sword,      label: 'Партия'    },
  { href: '/notebook', icon: BookOpen,   label: 'Тетрадь'   },
  { href: '/progress', icon: TrendingUp, label: 'Прогресс'  },
  { href: '/badges',   icon: Trophy,     label: 'Награды'   },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex z-50">
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href === '/today' && pathname === '/');
        return (
          <Link key={href} href={href} className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors ${active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
