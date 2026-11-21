import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: 'calc(100vh - var(--topbar-h, 56px))',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center', gap: 20,
      color: 'var(--ivory)', fontFamily: 'var(--font-inter, Inter, sans-serif)',
    }}>
      <div style={{
        fontSize: 128, fontWeight: 800, lineHeight: 1,
        color: 'var(--muted)', opacity: 0.4,
        fontFamily: 'var(--font-inter-tight, Inter Tight, Inter, sans-serif)',
        letterSpacing: '-0.04em',
      }}>
        404
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: -10 }}>
        Страница не нашлась
      </div>
      <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.5 }}>
        Такой страницы на сайте нет. Может, ты искал один из этих разделов?
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
        {[
          { href: '/', label: 'Сегодня' },
          { href: '/openings', label: 'Дебюты' },
          { href: '/tactics', label: 'Тактика' },
          { href: '/play', label: 'Играть' },
        ].map(l => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: '8px 16px',
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-btn, 4px)',
              color: 'var(--ivory)',
              fontSize: 13, fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
