'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div style={{
      minHeight: 'calc(100vh - var(--topbar-h, 56px))',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center', gap: 16,
      color: 'var(--ivory)', fontFamily: 'var(--font-inter, Inter, sans-serif)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, #F08277 18%, transparent)',
        color: '#F08277', fontSize: 28, fontWeight: 700, marginBottom: 6,
      }}>
        !
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>
        Что-то сломалось
      </div>
      <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 420, lineHeight: 1.5 }}>
        На странице произошла ошибка. Попробуй обновить или вернуться на главную — если повторится, напиши в GitHub issue.
      </div>
      {error?.message && (
        <pre style={{
          fontSize: 11, color: 'var(--muted)',
          background: 'var(--surface)', border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-card, 4px)',
          padding: '10px 14px', maxWidth: 520, overflow: 'auto',
          fontFamily: 'ui-monospace, Menlo, monospace',
          whiteSpace: 'pre-wrap', textAlign: 'left',
        }}>
          {error.message}
          {error.digest ? `\ndigest: ${error.digest}` : ''}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 20px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-btn, 4px)',
            color: 'var(--accent-contrast, #fff)',
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Попробовать снова
        </button>
        <Link
          href="/"
          style={{
            padding: '10px 20px',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-btn, 4px)',
            color: 'var(--ivory)',
            fontSize: 14, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
