'use client';

export interface StatCell {
  value: number | string;
  label: string;
  color: string;
  href?: string;
}

interface SessionPanelProps {
  title?: string;
  rightNote?: React.ReactNode;
  header?: React.ReactNode;
  stats: StatCell[];
  controls?: React.ReactNode;
  listLabel?: React.ReactNode;
  listRight?: React.ReactNode;
  list: React.ReactNode;
  footer?: React.ReactNode;
  prepBlock?: React.ReactNode;
}

export function SessionPanel({
  title = 'Сессия',
  rightNote,
  header,
  stats,
  controls,
  listLabel,
  listRight,
  list,
  footer,
  prepBlock,
}: SessionPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      {header !== undefined ? (
        <div style={{ padding: '20px 20px 14px', flexShrink: 0 }}>
          {header}
        </div>
      ) : (
        <div style={{ padding: '20px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
          <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--ivory)' }}>{title}</span>
          {rightNote && (
            <span style={{ fontSize: 14, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {rightNote}
            </span>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div data-ui="session-stats" style={{
        display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
        margin: '0 20px',
        border: '1px solid var(--hairline)',
        borderRadius: 10, overflow: 'hidden',
        flexShrink: 0,
      }}>
        {stats.map(({ label, value, color, href }, i) => {
          const inner = (
            <>
              <b style={{ display: 'block', fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                {value}
              </b>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
            </>
          );
          return href ? (
            <a key={label} href={href} style={{
              padding: '10px 0', textAlign: 'center', display: 'block',
              borderRight: i < stats.length - 1 ? '1px solid var(--hairline)' : 'none',
              textDecoration: 'none',
            }}>
              {inner}
            </a>
          ) : (
            <div key={label} style={{
              padding: '10px 0', textAlign: 'center',
              borderRight: i < stats.length - 1 ? '1px solid var(--hairline)' : 'none',
            }}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* Controls (segmented / filters) */}
      {controls && (
        <div style={{ margin: '12px 20px 0', flexShrink: 0 }}>
          {controls}
        </div>
      )}

      {/* Prep block */}
      {prepBlock && (
        <div style={{ margin: '12px 20px 0', flexShrink: 0 }}>
          {prepBlock}
        </div>
      )}

      {/* List header */}
      {(listLabel || listRight) && (
        <div style={{ margin: '14px 20px 6px', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          {listLabel && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{listLabel}</span>}
          {listRight && <span style={{ fontSize: 13, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{listRight}</span>}
        </div>
      )}

      {/* List */}
      <div data-ui="session-list" style={{ flex: 1, overflowY: 'auto', padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
        {list}
      </div>

      {/* Footer */}
      {footer && (
        <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--hairline)', flexShrink: 0 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
