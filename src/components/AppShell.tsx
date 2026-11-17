'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { NAV_GROUPS, matchHref } from '@/lib/nav';

// ── TopBar: logo (left), search + theme + mobile menu (right) ────────────────

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

// ── Sidebar: grouped nav list ────────────────────────────────────────────────

function SidebarItems({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="app-sidebar-nav" aria-label="Основная навигация">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="app-sidebar-group">
          {group.label && <div className="app-sidebar-label">{group.label}</div>}
          <ul>
            {group.items.map(item => {
              const active = matchHref(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNav}
                    className={`app-sidebar-link ${active ? 'app-sidebar-link-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ── Full component ───────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile sidebar on route change — derived from pathname, not an effect
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  // Escape to close
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMobileOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Lock body scroll when mobile sidebar is open
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
