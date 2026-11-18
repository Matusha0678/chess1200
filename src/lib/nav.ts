export interface NavItem {
  label: string;
  href:  string;
  icon?: string; // svg path(s) or key
}

export interface NavGroup {
  label: string | null;  // null = ungrouped (Сегодня)
  items: NavItem[];
}

// Grouped sidebar for the new layout. URLs point at existing pages only.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Сегодня', href: '/', icon: 'today' },
    ],
  },
  {
    label: 'УЧИТЬСЯ',
    items: [
      { label: 'Дебюты',       href: '/openings',  icon: 'openings' },
      { label: 'Курсы',        href: '/courses',   icon: 'courses'  },
      { label: 'Ловушки',      href: '/traps',     icon: 'traps'    },
      { label: 'Идеи позиций', href: '/plans',     icon: 'plans'    },
    ],
  },
  {
    label: 'ТРЕНИРОВАТЬСЯ',
    items: [
      { label: 'Тактика',          href: '/tactics',       icon: 'zap'       },
      { label: 'Расчёт вслепую',   href: '/blind',         icon: 'eye'       },
      { label: 'Ошибки',           href: '/mistakes',      icon: 'mistakes'  },
      { label: 'Проверка угроз',   href: '/threats',       icon: 'threats'   },
      { label: 'Эндшпили',         href: '/endgames',      icon: 'endgames'  },
      { label: 'Дожми партию',     href: '/convert',       icon: 'target'    },
      { label: 'Жертвы',           href: '/sac',           icon: 'sac'       },
      { label: 'Угадай дебют',     href: '/guess-opening', icon: 'guess'     },
      { label: 'Играть',           href: '/play',          icon: 'play'      },
    ],
  },
  {
    label: 'ПАРТИИ',
    items: [
      { label: 'Мои партии',           href: '/games',      icon: 'games'      },
      { label: 'Дебюты в партиях',     href: '/repertoire', icon: 'repertoire' },
      { label: 'Где я теряю очки',     href: '/stats',      icon: 'stats'      },
      { label: 'Мастера',              href: '/masters',    icon: 'masters'    },
    ],
  },
];

// Flat list used by SearchDialog
export const NAV_FLAT: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

// ── Legacy types (kept so old TopNav/SearchDialog compile until migrated) ──

export interface NavChild { label: string; href: string; }
export interface NavSection {
  num:      string;
  label:    string;
  href:     string;
  children?: NavChild[];
}
// Rebuilt from NAV_GROUPS for SearchDialog backward compat.
export const NAV: NavSection[] = NAV_GROUPS.flatMap((g, gi) =>
  g.items.map((it, ii) => ({
    num:   String(gi * 10 + ii + 1).padStart(2, '0'),
    label: it.label,
    href:  it.href,
  })),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function matchHref(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function sectionActive(pathname: string, item: NavSection): boolean {
  return matchHref(pathname, item.href);
}
