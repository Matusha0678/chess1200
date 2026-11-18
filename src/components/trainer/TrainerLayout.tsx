'use client';

import { useState, useEffect } from 'react';

const COLLAPSE_KEY = 'chess1200-trainer-session-collapsed';

export interface TrainerLayoutProps {
  /** Left panel content — if omitted the column is hidden. */
  sessionPanel?: React.ReactNode;
  /** Strip rendered above the board (e.g. opponent player row). */
  topPlayer?: React.ReactNode;
  /** The board itself — rendered inside a flex-square sizer. */
  boardContent: React.ReactNode;
  /** Strip rendered below the board (e.g. user player row). */
  bottomPlayer?: React.ReactNode;
  /** Right panel (task prompt, feedback, buttons). */
  taskPanel: React.ReactNode;
}

/**
 * Full-viewport trainer layout: Session | Board | Task panel.
 * Heights: fills 100vh − topbar. No body scroll while mounted.
 */
export function TrainerLayout({
  sessionPanel,
  topPlayer,
  boardContent,
  bottomPlayer,
  taskPanel,
}: TrainerLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === 'true');
    } catch { /* ignore */ }
  }, []);

  function toggle() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - var(--topbar-h))',
      overflow: 'hidden',
    }}>

      {/* ── Session panel ───────────────────────────────────────────────── */}
      {sessionPanel !== undefined && (
        <div style={{
          width: collapsed ? 56 : 272,
          flexShrink: 0,
          borderRight: '1px solid var(--hairline)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          transition: 'width 0.18s ease',
        }}>
          {/* Collapse toggle */}
          <button
            onClick={toggle}
            aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
            style={{
              position: 'absolute',
              top: 10,
              right: collapsed ? 16 : 10,
              zIndex: 5,
              width: 22,
              height: 22,
              padding: 0,
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              color: 'var(--muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {collapsed ? '›' : '‹'}
          </button>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            visibility: collapsed ? 'hidden' : 'visible',
          }}>
            {sessionPanel}
          </div>
        </div>
      )}

      {/* ── Board column ────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 12px',
        gap: 4,
        overflow: 'hidden',
      }}>
        {topPlayer && (
          <div style={{ width: '100%', maxWidth: 760 }}>{topPlayer}</div>
        )}

        {/* Square sizer — fills remaining height, constrained by width */}
        <div style={{
          flex: '1 1 0',
          minHeight: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            aspectRatio: '1 / 1',
            maxWidth: '100%',
            overflow: 'hidden',
          }}>
            {boardContent}
          </div>
        </div>

        {bottomPlayer && (
          <div style={{ width: '100%', maxWidth: 760 }}>{bottomPlayer}</div>
        )}
      </div>

      {/* ── Task panel ──────────────────────────────────────────────────── */}
      <div style={{
        width: 420,
        flexShrink: 0,
        borderLeft: '1px solid var(--hairline)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {taskPanel}
      </div>
    </div>
  );
}
