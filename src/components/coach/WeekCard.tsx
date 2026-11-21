// «Неделя» (ТЗ §1.3.5): столбики за 7 дней + дисциплина за 30.
'use client';

import type { WeekDay } from '@/lib/coach/context';

export interface WeekCardProps {
  week: WeekDay[];             // 7 дней, пн-вс
  dailyPlanMin: number;        // среднее минут из плана (уровень пунктира «план»)
  discipline_30d: number;      // 0..100
}

const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function formatHm(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function weekLabel(week: WeekDay[]): string {
  if (week.length < 7) return '';
  const first = new Date(week[0].date + 'T12:00:00');
  const last = new Date(week[6].date + 'T12:00:00');
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const sameMonth = first.getMonth() === last.getMonth();
  const left = sameMonth ? `${first.getDate()}` : `${first.getDate()} ${months[first.getMonth()]}`;
  return `${left}–${last.getDate()} ${months[last.getMonth()]}`;
}

export function WeekCard({ week, dailyPlanMin, discipline_30d }: WeekCardProps) {
  const maxMin = Math.max(dailyPlanMin, ...week.map(d => d.minutes_done || 0));
  const totalMin = week.reduce((s, d) => s + d.minutes_done, 0);
  const missed = week.filter(d => !d.is_future && d.minutes_plan > 0 && d.minutes_done / d.minutes_plan < 0.6).length;
  const title = missed === 0 ? 'Без пропусков' : `Пропусков: ${missed}`;

  const planLineTop = maxMin > 0 ? (72 * (1 - dailyPlanMin / Math.max(1, maxMin))) : 40;

  return (
    <section className="coach-card" aria-labelledby="h-week" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 id="h-week" className="coach-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, lineHeight: 1.15, color: 'var(--ivory)' }}>
          {title}
        </h3>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Неделя {weekLabel(week)} · {formatHm(totalMin)}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', columnGap: 6 }}>
          {week.map((d, i) => {
            const ratio = maxMin > 0 ? Math.min(1, d.minutes_done / maxMin) : 0;
            const h = Math.round(ratio * 72);
            const ok = d.minutes_plan > 0 && d.minutes_done / d.minutes_plan >= 1;
            const partial = d.minutes_plan > 0 && d.minutes_done / d.minutes_plan >= 0.6 && !ok;
            const barColor = d.is_today ? 'var(--accent)'
              : ok ? 'var(--accent)'
              : partial ? 'color-mix(in srgb, var(--accent) 60%, var(--surface))'
              : d.is_future ? 'transparent'
              : 'color-mix(in srgb, var(--accent) 60%, var(--surface))';
            return (
              <div key={d.date} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, lineHeight: '18px', fontVariantNumeric: 'tabular-nums', color: d.is_today ? 'var(--ivory)' : 'var(--muted)' }}>
                  {formatHm(d.minutes_done)}
                </span>
                <div style={{ width: '100%', height: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid var(--hairline-2)' }}>
                  <div style={{ width: 10, height: h, background: barColor }} />
                </div>
                <span style={{
                  fontSize: 13, lineHeight: '18px',
                  fontWeight: d.is_today ? 700 : 500,
                  color: d.is_today ? 'var(--accent)' : 'var(--muted)',
                }}>
                  {DOW[i]}
                </span>
              </div>
            );
          })}
        </div>
        {dailyPlanMin > 0 && (
          <>
            <span aria-hidden="true" style={{
              position: 'absolute', left: 0, right: 0, top: planLineTop + 18,
              borderTop: '1px dashed color-mix(in srgb, var(--ivory) 35%, transparent)',
            }} />
            <span style={{
              position: 'absolute', right: 0, top: planLineTop + 2,
              fontSize: 13, lineHeight: '16px', color: 'var(--muted)',
            }}>план</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: 'var(--text-2, #A39B8A)' }}>
        <span>Дисциплина за 30 дней</span>
        <span style={{ fontWeight: 600, color: 'var(--ivory)' }}>{discipline_30d}%</span>
      </div>
    </section>
  );
}
