'use client';

interface TaskPanelProps {
  breadcrumb?: string;
  progress?: { current: number; total: number };
  xp?: number;
  title: string;
  titleSize?: number;
  chips?: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
  headerRight?: React.ReactNode;
  progressBar?: React.ReactNode;
}

export function TaskPanel({
  breadcrumb,
  progress,
  xp,
  title,
  titleSize,
  chips,
  children,
  actions,
  headerRight,
  progressBar,
}: TaskPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div data-ui="panel-header" style={{ padding: '20px 24px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
          {breadcrumb && <span>{breadcrumb}</span>}
          {headerRight !== undefined ? (
            <span>{headerRight}</span>
          ) : progress ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--ivory)', fontVariantNumeric: 'tabular-nums' }}>
              {progress.current} / {progress.total}
              {xp != null && xp > 0 && (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#81B64C', background: 'rgba(129,182,76,.14)', borderRadius: 6, padding: '2px 7px', fontVariantNumeric: 'tabular-nums' }}>
                  +{xp} XP
                </span>
              )}
            </span>
          ) : null}
        </div>
        {/* Progress bar */}
        {progressBar !== undefined ? (
          <div style={{ marginTop: 12 }}>{progressBar}</div>
        ) : progress && progress.total > 0 ? (
          <div style={{ height: 4, borderRadius: 4, background: '#3A3835', marginTop: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#81B64C', borderRadius: 4,
              width: `${Math.max(2, Math.min(100, (progress.current / progress.total) * 100))}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        ) : null}
        {/* Title */}
        <div data-ui="panel-title" style={{ fontSize: titleSize ?? 30, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 14, lineHeight: 1.15, color: 'var(--ivory)', fontFamily: "var(--font-inter-tight,'Inter Tight','Inter',sans-serif)" }}>
          {title}
        </div>
        {/* Chips */}
        {chips && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {chips}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>

      {/* Footer: action buttons */}
      <div data-ui="panel-actions" style={{ padding: '20px 24px', borderTop: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {actions}
      </div>
    </div>
  );
}
