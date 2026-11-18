'use client';
export function ProgressBar({ value, max, height = 4 }: { value: number; max: number; height?: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height, borderRadius: height, background: '#3A3835', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: height }} />
    </div>
  );
}
