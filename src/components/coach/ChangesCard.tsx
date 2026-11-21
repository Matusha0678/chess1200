// «Что Таль поменял» (ТЗ §1.3.4).
'use client';

import type { PlanChange, ItemKey } from '@/lib/coach/plan';

export interface ChangesCardProps {
  changes: PlanChange[];
  planKeyToNum: Map<ItemKey, string>;
  since: string | null;  // «После вчерашних партий · 08:00»
}

function changeBadge(ch: PlanChange): { text: string; color: string } {
  if (ch.kind === 'plus')    return { text: `+${Math.abs(ch.delta_min ?? 0)}`, color: 'var(--accent)' };
  if (ch.kind === 'minus')   return { text: `−${Math.abs(ch.delta_min ?? 0)}`, color: 'var(--ivory)' };
  if (ch.kind === 'new')     return { text: 'новое',  color: 'var(--accent)' };
  return { text: 'убрано', color: 'var(--text-2, #A39B8A)' };
}

export function ChangesCard({ changes, planKeyToNum, since }: ChangesCardProps) {
  if (changes.length === 0) {
    return (
      <section className="coach-card" aria-labelledby="h-changes" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 id="h-changes" className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, lineHeight: 1.15, color: 'var(--ivory)' }}>
          Что Таль поменял
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2, #A39B8A)' }}>
          Сегодня план без изменений.
        </p>
      </section>
    );
  }

  return (
    <section className="coach-card" aria-labelledby="h-changes" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 id="h-changes" className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, lineHeight: 1.15, color: 'var(--ivory)' }}>
          Что Таль поменял
        </h3>
        {since && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{since}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {changes.map((ch, i) => {
          const b = changeBadge(ch);
          const num = ch.key ? planKeyToNum.get(ch.key) : undefined;
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '60px minmax(0, 1fr) 32px',
              alignItems: 'start',
              columnGap: 12,
              padding: '12px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="coach-serif" style={{ fontSize: 20, fontStyle: 'italic', fontWeight: 500, lineHeight: 1.1, color: b.color }}>{b.text}</span>
                {ch.kind === 'plus' || ch.kind === 'minus' ? (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>мин</span>
                ) : null}
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 14, color: 'var(--ivory)' }}>{ch.title}</span>
                <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text-2, #A39B8A)' }}>{ch.why}</span>
              </div>
              {num ? (
                <a className="coach-go-link" href={`#plan-${num}`} style={{ justifySelf: 'end' }}>{num}</a>
              ) : <span />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
