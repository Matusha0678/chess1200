'use client';
export function Chip({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      height: 28, borderRadius: 8,
      background: 'var(--surface-2)', border: '1px solid var(--hairline-2)',
      display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
      fontSize: 13, fontWeight: 500, color: color ?? '#DCD8D3',
      flexShrink: 0, ...style,
    }}>{children}</div>
  );
}
