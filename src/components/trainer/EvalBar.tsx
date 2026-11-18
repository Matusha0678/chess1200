'use client';
export function EvalBar({ cp, orientation = 'white' }: { cp: number; orientation?: 'white' | 'black' }) {
  const pct = Math.max(5, Math.min(95, 50 + 50 * Math.tanh(cp / 500)));
  const whitePct = orientation === 'white' ? pct : 100 - pct;
  return (
    <div data-ui="eval-bar" style={{ width: 24, borderRadius: 5, overflow: 'hidden', background: '#403D3A', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#EDEBE7', height: `${whitePct}%`, transition: 'height .4s' }} />
    </div>
  );
}
