'use client';
export function MoveChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: 'rgba(255,255,255,.06)', borderRadius: 6,
      padding: '2px 7px', color: '#E6E3DE', fontWeight: 500,
    }}>{children}</span>
  );
}
