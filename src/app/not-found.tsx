import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div style={{
      minHeight: 'calc(100vh - var(--topbar-h, 56px))',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center', gap: 20,
      color: 'var(--ivory)', fontFamily: 'var(--font-inter, Inter, sans-serif)',
    }}>
      <Image
        src="/brand/pawn-gold.png"
        alt=""
        width={160}
        height={240}
        priority
        style={{ height: 180, width: 'auto', opacity: 0.85, marginBottom: -4 }}
      />
      <div style={{
        fontSize: 72, fontWeight: 500, lineHeight: 1,
        color: 'var(--accent)', opacity: 0.8,
        fontFamily: 'var(--font-serif-display, Playfair Display, Georgia, serif)',
        fontStyle: 'italic',
        letterSpacing: '-0.02em',
      }}>
        404
      </div>
      <div style={{
        fontSize: 22, fontWeight: 500, marginTop: -4,
        fontFamily: 'var(--font-serif-display, Playfair Display, Georgia, serif)',
      }}>
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
