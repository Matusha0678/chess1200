export interface NavChild {
  label: string;
  href: string;
}

export interface NavSection {
  num: string;
  label: string;
  href: string;
  children?: NavChild[];
}

// Add a new page by appending to the relevant children array (or as a top-level item).
// The TopNav reads this list at render time — no other file needs changing.
export const NAV: NavSection[] = [
  { num: '01', label: 'Сегодня',    href: '/' },
  { num: '02', label: 'Дебюты',     href: '/openings' },
  { num: '03', label: 'Курсы',      href: '/courses' },
  {
    num: '04', label: 'Партии', href: '/games',
    children: [
      { label: 'Список партий', href: '/games' },
      { label: 'Анализ',        href: '/games/analyze' },
      { label: 'Банк ошибок',   href: '/mistakes' },
    ],
  },
  {
    num: '05', label: 'Тренировка', href: '/threats',
    children: [
      { label: 'Угрозы',   href: '/threats' },
      { label: 'Эндшпили', href: '/endgames' },
      { label: 'Планы',    href: '/plans' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function matchHref(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function sectionActive(pathname: string, item: NavSection): boolean {
  if (matchHref(pathname, item.href)) return true;
  return item.children?.some(c => matchHref(pathname, c.href)) ?? false;
}
