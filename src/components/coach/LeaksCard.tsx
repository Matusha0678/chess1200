// «Где ты теряешь очки» (ТЗ §1.3.3): причины поражений с полосами и ссылками.
'use client';

import Link from 'next/link';
import type { LeakRow } from '@/lib/coach/context';
import type { ItemKey } from '@/lib/coach/plan';

export interface LeaksCardProps {
  leaks: LeakRow[];
  totalGames: number;
  totalLosses: number;
  planKeyToNum: Map<ItemKey, string>; // key -> «NN» для ссылки «→ NN»
}

export function LeaksCard({ leaks, totalGames, totalLosses, planKeyToNum }: LeaksCardProps) {
  const max = Math.max(1, ...leaks.map(l => l.count));
  return (
    <section className="coach-card" aria-labelledby="h-leaks" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 id="h-leaks" className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, lineHeight: 1.15, color: 'var(--ivory)' }}>
          Где ты теряешь очки
        </h3>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {totalGames > 0 ? `${totalGames} партий рапид · ${totalLosses} поражений` : 'Партий пока нет'}
        </span>
      </div>

      {leaks.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-2, #A39B8A)', lineHeight: 1.5, margin: 0 }}>
          Синхронизируй партии рапид — тогда Таль увидит, где ты теряешь очки.{' '}
          <Link href="/games" className="coach-go-link">Мои партии →</Link>
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {leaks.map((l, i) => {
            const num = planKeyToNum.get(l.key);
            const width = Math.round((l.count / max) * 100);
            return (
              <div key={l.key + i} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 24px 40px',
                alignItems: 'center',
                columnGap: 12,
                padding: '11px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
              }}>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 14, color: 'var(--ivory)' }}>
                    {l.label}
                    {l.main && (
                      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                        главное
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true" style={{ position: 'relative', display: 'block', height: 3, background: 'var(--track)' }}>
                    <span style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${width}%`,
                      background: l.main ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 60%, var(--surface))',
                    }} />
                  </span>
                </div>
                <span className="coach-serif" style={{ fontSize: 20, fontStyle: 'italic', fontWeight: 500, lineHeight: 1, textAlign: 'right', color: 'var(--ivory)' }}>
                  {l.count}
                </span>
                {num ? (
                  <a className="coach-go-link" href={`#plan-${num}`} style={{ justifySelf: 'end' }}>→ {num}</a>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}

      <a className="coach-go-link" href="/stats">Вся статистика →</a>
    </section>
  );
}
