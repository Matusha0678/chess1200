'use client';
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd data-allow-small style={{
      fontSize: 12, fontWeight: 600, color: 'var(--faint)',
      border: '1px solid var(--hairline-2)', borderRadius: 6,
      padding: '1px 6px', fontFamily: 'inherit', fontStyle: 'normal',
    }}>{children}</kbd>
  );
}
