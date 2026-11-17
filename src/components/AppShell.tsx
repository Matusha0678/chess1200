'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { NAV_GROUPS, matchHref } from '@/lib/nav';
import { NavIcon } from './NavIcon';

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { openPanel, openSearch } = useBoardTheme();
  return (
    <header className="app-topbar">
      <Link href="/" className="app-logo">
        <span className="app-logo-mark" aria-hidden="true">♚</span>
        <span className="app-logo-text">
          Chess <span style={{ fontWeight: 500, color: 'var(--muted)' }}>1200</span>
        </span>
      </Link>

      <div className="app-topbar-actions">
        <button className="app-search-btn" onClick={openSearch} aria-label="Поиск">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <span>Поиск</span>
          <kbd className="app-search-kbd">⌘K</kbd>
        </button>

        <button className="app-icon-btn" onClick={openPanel} aria-label="Настройки темы">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3a9 9 0 100 18c1.1 0 1.5-.8 1.2-1.6-.4-1 .3-2 1.4-2H16a5 5 0 005-5c0-5-4-9.4-9-9.4z"/>
            <circle cx="7.5" cy="11" r="1"/>
            <circle cx="10.5" cy="7.5" r="1"/>
            <circle cx="15" cy="7.5" r="1"/>
          </svg>
        </button>

        <button className="app-menu-btn" onClick={onMenuClick} aria-label="Меню">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="7"  x2="21" y2="7" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="17" x2="21" y2="17" />
          </svg>
          Меню
        </button>
      </div>
    </header>
  );
}

// ── Chevron ───────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <path d="M9 18l6-6-6-6"/>
    </svg>
  );
}

// ── SidebarItems ──────────────────────────────────────────────────────────────

const COLLAPSED_KEY = 'chess1200-nav-collapsed';

function SidebarItems({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();

  // Which group contains the active page
  const activeGroupIdx = NAV_GROUPS.findIndex(g =>
    g.label !== null && g.items.some(item => matchHref(pathname, item.href))
  );

  // collapsed state: set of group labels that are collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  // On mount: load from localStorage; ensure active group is open
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[];
      const set = new Set(stored);
      // Always open the active group
      if (activeGroupIdx >= 0 && NAV_GROUPS[activeGroupIdx].label) {
        set.delete(NAV_GROUPS[activeGroupIdx].label!);
      }
      setCollapsed(set);
    } catch { /* ignore */ }
  }, [activeGroupIdx]);

  function toggleGroup(label: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <nav className="app-sidebar-nav" aria-label="Основная навигация">
      {NAV_GROUPS.map((group, gi) => {
        if (group.label === null) {
          // Ungrouped (Сегодня)
          return (
            <div key={gi} className="app-sidebar-group">
              <ul>
                {group.items.map(item => {
                  const active = matchHref(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNav}
                        className={`app-sidebar-link app-sidebar-link-icon ${active ? 'app-sidebar-link-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <NavIcon iconKey={item.icon} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }

        const isOpen = !collapsed.has(group.label);
        const hasActive = group.items.some(item => matchHref(pathname, item.href));

        return (
          <div key={gi} className="app-sidebar-group">
            <button
              className={`app-sidebar-group-btn ${hasActive ? 'app-sidebar-group-btn-active' : ''}`}
              onClick={() => toggleGroup(group.label!)}
              aria-expanded={isOpen}
            >
              <span>{group.label}</span>
              <Chevron open={isOpen} />
            </button>

            {isOpen && (
              <ul>
                {group.items.map(item => {
                  const active = matchHref(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNav}
                        className={`app-sidebar-link app-sidebar-link-icon ${active ? 'app-sidebar-link-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <NavIcon iconKey={item.icon} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── Mobile bottom bar ─────────────────────────────────────────────────────────

const BOTTOM_NAV = [
  { href: '/',             icon: 'today',    label: 'Сегодня' },
  { href: '/openings',     icon: 'openings', label: 'Дебюты' },
  { href: '/mistakes',     icon: 'mistakes', label: 'Ошибки' },
  { href: '/games',        icon: 'games',    label: 'Партии' },
];

function MobileBottomBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="app-bottom-bar" aria-label="Нижняя навигация">
      {BOTTOM_NAV.map(item => {
        const active = matchHref(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`app-bottom-item ${active ? 'app-bottom-item-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <NavIcon iconKey={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button className="app-bottom-item" onClick={onMoreClick} aria-label="Ещё">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
        <span>Ещё</span>
      </button>
    </nav>
  );
}

// ── Full component ────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile sidebar on route change
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMobileOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      <TopBar onMenuClick={() => setMobileOpen(true)} />

      {/* Desktop shell */}
      <div className="app-shell">
        <aside className="app-sidebar">
          <SidebarItems />
        </aside>
        <main className="app-main">{children}</main>
      </div>

      {/* Mobile bottom bar */}
      <MobileBottomBar onMoreClick={() => setMobileOpen(true)} />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="app-sidebar-overlay" role="dialog" aria-modal="true" aria-label="Меню">
          <div className="app-sidebar-overlay-head">
            <Link href="/" className="app-logo" onClick={() => setMobileOpen(false)}>
              <span className="app-logo-mark" aria-hidden="true">♚</span>
              <span className="app-logo-text">
                Chess <span style={{ fontWeight: 500, color: 'var(--muted)' }}>1200</span>
              </span>
            </Link>
            <button
              className="app-icon-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="Закрыть меню"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6"  x2="6"  y2="18"/>
                <line x1="6"  y1="6"  x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div style={{ padding: '12px 0 40px' }}>
            <SidebarItems onNav={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
