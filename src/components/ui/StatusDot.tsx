'use client';
export function StatusDot({ color, children, size = 24 }: { color: string; children?: React.ReactNode; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'grid', placeItems: 'center',
      color: '#fff', fontSize: size * 0.6, fontWeight: 800, flexShrink: 0,
    }}>{children}</div>
  );
}
