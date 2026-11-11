'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBoardTheme } from '@/contexts/BoardThemeContext';

export default function TopNav() {
  const pathname = usePathname();
  const { openPanel } = useBoardTheme();

  const homeActive = pathname === '/';
  const openingsActive = pathname === '/openings' || pathname.startsWith('/openings/');

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'rgba(12,12,11,.92)', backdropFilter: 'blur(12px)',
      borderTop: '2px solid var(--ivory)', borderBottom: '1px solid var(--hairline)',
    }}>
      <div style={{
        maxWidth: 1240, margin: '0 auto', padding: '0 32px',
        minHeight: 66, display: 'flex', alignItems: 'stretch',
        justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
        boxSizing: 'border-box',
      }}>
        {/* Logo */}
        <div style={{ flex: '1 1 0', minWidth: 160, display: 'flex', alignItems: 'center' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, color: 'var(--ivory)' }}>
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
          </a>
        </div>

        {/* Nav */}
        <nav aria-label="Основная навигация" style={{ display: 'flex', gap: 40 }}>
          <a
            href="/"
            aria-current={homeActive ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: -1,
              borderBottom: homeActive ? '2px solid var(--ivory)' : '2px solid transparent',
              fontSize: 14, fontWeight: homeActive ? 600 : 400,
              color: homeActive ? 'var(--ivory)' : 'var(--muted)',
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>01</span>
            Сегодня
          </a>
          <Link
            href="/openings"
            aria-current={openingsActive ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: -1,
              borderBottom: openingsActive ? '2px solid var(--ivory)' : '2px solid transparent',
              fontSize: 14, fontWeight: openingsActive ? 600 : 400,
              color: openingsActive ? 'var(--ivory)' : 'var(--muted)',
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>02</span>
            Дебюты
          </Link>
        </nav>

        {/* Theme button */}
        <div style={{ flex: '1 1 0', minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button
            onClick={openPanel}
            aria-label="Тема оформления"
            style={{
              width: 44, height: 44, border: '1px solid var(--control)',
              background: 'transparent', color: 'var(--ivory)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              flexShrink: 0,
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
    </header>
  );
}
