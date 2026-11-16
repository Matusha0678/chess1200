'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useBoardTheme } from '@/contexts/BoardThemeContext';
import { NAV, matchHref, sectionActive } from '@/lib/nav';

// ── Sub-components ────────────────────────────────────────────────────────────

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
      style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : undefined }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TopNav() {
  const pathname = usePathname();
  const { openPanel } = useBoardTheme();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const headerRef = useRef<HTMLElement>(null);

  // Close both menus when the route changes (derived state from pathname — no effect needed)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (openMenu !== null) setOpenMenu(null);
    if (mobileOpen) setMobileOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!headerRef.current?.contains(e.target as Node)) {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpenMenu(null); setMobileOpen(false); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const NUM: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)',
  };

  return (
    <header
      ref={headerRef}
      style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--header-bg)', backdropFilter: 'blur(12px)',
        borderTop: '2px solid var(--ivory)', borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div style={{
        maxWidth: 1600, margin: '0 auto', padding: '0 48px',
        minHeight: 66, display: 'flex', alignItems: 'stretch',
        justifyContent: 'space-between', gap: 24,
        boxSizing: 'border-box',
      }}>

        {/* ── Logo ── */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, color: 'var(--ivory)', flexShrink: 0 }}>
            <span aria-hidden="true" style={{
              width: 32, height: 32, borderRadius: 4, background: 'var(--ivory)',
              color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','DejaVu Sans',sans-serif",
              fontSize: 22, lineHeight: 1, flexShrink: 0,
            }}>♚</span>
            <span style={{
              fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)",
              fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em',
            }}>
              Chess{' '}
              <span style={{ fontWeight: 500, color: 'var(--muted)' }}>1200</span>
            </span>
          </Link>
        </div>

        {/* ── Desktop nav (hidden <900px via CSS) ── */}
        <nav
          className="topnav-desktop"
          aria-label="Основная навигация"
          style={{ gap: 36, alignItems: 'stretch' }}
        >
          {NAV.map(item => {
            const active = sectionActive(pathname, item);

            if (!item.children) {
              return (
                <Link
                  key={item.num}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: -1,
                    borderBottom: active ? '2px solid var(--ivory)' : '2px solid transparent',
                    fontSize: 14, fontWeight: active ? 600 : 400,
                    color: active ? 'var(--ivory)' : 'var(--muted)',
                  }}
                >
                  <span style={NUM}>{item.num}</span>
                  {item.label}
                </Link>
              );
            }

            const isOpen = openMenu === item.num;
            return (
              <div key={item.num} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
                <button
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  onClick={() => setOpenMenu(isOpen ? null : item.num)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: -1,
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: active ? '2px solid var(--ivory)' : '2px solid transparent',
                    background: 'transparent', padding: 0, margin: 0,
                    fontSize: 14, fontWeight: active ? 600 : 400,
                    color: active ? 'var(--ivory)' : 'var(--muted)',
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  <span style={NUM}>{item.num}</span>
                  {item.label}
                  <ChevronDown open={isOpen} />
                </button>

                {isOpen && (
                  <div
                    role="menu"
                    style={{
                      position: 'absolute', top: '100%', left: 0,
                      minWidth: 180,
                      background: 'var(--bg)',
                      borderLeft: '1px solid var(--hairline)',
                      borderRight: '1px solid var(--hairline)',
                      borderBottom: '1px solid var(--hairline)',
                      zIndex: 20,
                      paddingTop: 4, paddingBottom: 4,
                    }}
                  >
                    {item.children.map(child => {
                      const childActive = matchHref(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          role="menuitem"
                          aria-current={childActive ? 'page' : undefined}
                          className="nav-dd-item"
                          style={{
                            display: 'block',
                            padding: '10px 20px',
                            fontSize: 14,
                            color: childActive ? 'var(--ivory)' : 'var(--muted)',
                            fontWeight: childActive ? 600 : 400,
                            borderLeft: childActive ? '2px solid var(--ivory)' : '2px solid transparent',
                          }}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Right: mobile toggle + theme button ── */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>

          {/* Mobile "Меню" button — hidden ≥900px via CSS */}
          <button
            className="topnav-mobile"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-label="Меню"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 40, padding: '0 14px',
              background: 'transparent',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: 'none',
              border: '1px solid var(--control)',
              color: 'var(--ivory)', fontSize: 13, fontFamily: 'inherit',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            Меню
            <ChevronDown open={mobileOpen} />
          </button>

          {/* Theme button */}
          <button
            onClick={openPanel}
            aria-label="Тема оформления"
            style={{
              width: 44, height: 44, border: '1px solid var(--control)',
              background: 'transparent', color: 'var(--ivory)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3a9 9 0 100 18c1.1 0 1.5-.8 1.2-1.6-.4-1 .3-2 1.4-2H16a5 5 0 005-5c0-5-4-9.4-9-9.4z"/>
              <circle cx="7.5" cy="11" r="1"/>
              <circle cx="10.5" cy="7.5" r="1"/>
              <circle cx="15" cy="7.5" r="1"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown — hidden ≥900px via CSS ── */}
      {mobileOpen && (
        <div
          className="topnav-mobile"
          style={{
            display: 'block',
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'var(--bg)',
            borderBottom: '1px solid var(--hairline)',
            zIndex: 20,
            maxHeight: 'calc(100vh - 66px)',
            overflowY: 'auto',
          }}
        >
          {NAV.map(item => {
            if (item.children) {
              return (
                <div key={item.num}>
                  <div style={{
                    padding: '10px 24px 5px',
                    fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'var(--muted)', fontWeight: 600,
                  }}>
                    {item.num} {item.label}
                  </div>
                  {item.children.map(child => {
                    const childActive = matchHref(pathname, child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        style={{
                          display: 'block',
                          padding: '12px 24px 12px 36px',
                          fontSize: 14,
                          color: childActive ? 'var(--ivory)' : 'var(--muted)',
                          fontWeight: childActive ? 600 : 400,
                          borderLeft: childActive ? '3px solid var(--ivory)' : '3px solid transparent',
                          borderBottom: '1px solid var(--hairline)',
                        }}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              );
            }

            const active = matchHref(pathname, item.href);
            return (
              <Link
                key={item.num}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 24px',
                  fontSize: 14, fontWeight: active ? 600 : 400,
                  color: active ? 'var(--ivory)' : 'var(--muted)',
                  borderLeft: active ? '3px solid var(--ivory)' : '3px solid transparent',
                  borderBottom: '1px solid var(--hairline)',
                }}
              >
                <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)' }}>{item.num}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
