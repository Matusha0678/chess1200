// «Форма» (ТЗ §1.3.2): рейтинг + линия 14 дней + цель + серия.
'use client';

import type { FormInfo, RatingPoint } from '@/lib/coach/context';

export interface FormCardProps {
  form: FormInfo;
  streak: number;
  best_streak: number;
}

function sparkPath(points: RatingPoint[], w = 304, h = 44, pad = 2): string {
  if (points.length < 2) return '';
  const rs = points.map(p => p.r);
  const rmin = Math.min(...rs), rmax = Math.max(...rs);
  const span = Math.max(1, rmax - rmin);
  return points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - pad - ((p.r - rmin) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function pluralDays(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

export function FormCard({ form, streak, best_streak }: FormCardProps) {
  const points = sparkPath(form.rating_14d);
  const delta = form.rating_7d_delta;
  const nowRating = form.rating_now;
  const goalLeft = nowRating != null ? Math.max(0, form.goal_rating - nowRating) : null;

  return (
    <section className="coach-card" aria-labelledby="h-form" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 id="h-form" className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, lineHeight: 1.15, color: 'var(--ivory)' }}>Форма</h3>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Рапид 10+0 · chess.com</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--ivory)' }}>Рейтинг</span>
            {delta != null ? (
              <span style={{ fontSize: 13, color: 'var(--text-2, #A39B8A)' }}>
                <span style={{ fontWeight: 600, color: delta >= 0 ? 'var(--accent)' : 'var(--c-bad)' }}>
                  {delta > 0 ? '+' : ''}{delta}
                </span> за неделю
              </span>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Нет данных за неделю</span>
            )}
          </div>
          <span className="coach-serif" style={{ fontSize: 40, fontStyle: 'italic', fontWeight: 500, lineHeight: 1, color: 'var(--ivory)' }}>
            {nowRating ?? '—'}
          </span>
        </div>
        {points && (
          <svg width="100%" height="44" viewBox="0 0 304 44" preserveAspectRatio="none" fill="none" aria-hidden="true" style={{ display: 'block' }}>
            <polyline points={points} stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 14, color: 'var(--ivory)' }}>Ближайшая цель</span>
          <span style={{ fontSize: 13, color: 'var(--text-2, #A39B8A)' }}>
            {goalLeft != null ? <>Осталось {goalLeft} · дальше {form.big_goal_rating}</> : <>Цель {form.goal_rating}</>}
          </span>
        </div>
        <span className="coach-serif" style={{ fontSize: 28, fontStyle: 'italic', fontWeight: 500, lineHeight: 1, color: 'var(--ivory)' }}>
          {form.goal_rating}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 14, color: 'var(--ivory)' }}>Серия</span>
          <span style={{ fontSize: 13, color: 'var(--text-2, #A39B8A)' }}>Рекорд — {best_streak} {pluralDays(best_streak)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="coach-serif" style={{ fontSize: 28, fontStyle: 'italic', fontWeight: 500, lineHeight: 1, color: 'var(--ivory)' }}>{streak}</span>
          <span style={{ fontSize: 13, color: 'var(--text-2, #A39B8A)' }}>{pluralDays(streak)}</span>
        </div>
      </div>
    </section>
  );
}
